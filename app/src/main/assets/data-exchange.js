(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuestionBankDataExchange = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'question-bank-data-exchange';
  const SCHEMA_VERSION = 1;
  const APP_VERSION = '1.0.2';
  const EXPORT_TYPES = Object.freeze(['question_bank', 'progress', 'markers', 'settings', 'full_backup']);
  const PROGRESS_KEYS = Object.freeze(['answers', 'answerHistory', 'questionStats', 'last', 'resume', 'totals', 'dailyStats']);
  const MARKER_KEYS = Object.freeze(['favorites', 'wrong', 'slashed']);
  const SETTING_KEYS = Object.freeze(['theme', 'homeTitle', 'homeSlogan']);

  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const strings = value => Array.isArray(value) ? [...new Set(value.filter(x => typeof x === 'string' && x))] : [];
  const blocked = value => ['__proto__', 'constructor', 'prototype'].includes(value);
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\u0000-\u001F\u007F]/.test(value) && !blocked(value);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function questionFingerprint(q) {
    const core = new Set(['id', 'subjectId', 'subject', 'chapter', 'path', 'stem', 'options', 'answer', 'analysis', 'context', 'number', 'type']);
    const extra = Object.fromEntries(Object.keys(object(q)).filter(key => !core.has(key)).sort().map(key => [key, q[key]]));
    return JSON.stringify({ id: q?.id, subjectId: q?.subjectId, chapter: q?.chapter, path: q?.path, stem: q?.stem, options: q?.options, answer: q?.answer, analysis: q?.analysis || '', context: q?.context || '', number: Number(q?.number) || 0, type: q?.type || 'A1', extra });
  }
  const sameQuestion = (a, b) => questionFingerprint(a) === questionFingerprint(b);

  function manifest(exportType, options = {}) {
    if (!EXPORT_TYPES.includes(exportType)) throw new Error(`未知 exportType：${exportType}`);
    return {
      format: FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportType,
      appVersion: String(options.appVersion || APP_VERSION),
      exportedAt: options.exportedAt || new Date().toISOString()
    };
  }

  function progressFromState(state) {
    const source = object(state);
    const out = { stateVersion: Math.max(1, Number(source.stateVersion) || 1) };
    for (const key of PROGRESS_KEYS) out[key] = clone(source[key] ?? (['answers', 'questionStats', 'dailyStats'].includes(key) ? {} : key === 'answerHistory' ? [] : null));
    return out;
  }

  function markersFromState(state) {
    const source = object(state);
    return { favorites: strings(source.favorites), wrong: strings(source.wrong), slashed: strings(source.slashed) };
  }

  function settingsFromState(state) {
    const source = object(state);
    return { theme: source.theme || 'system', homeTitle: source.homeTitle || '医学题库', homeSlogan: source.homeSlogan || '按科目练习，\n把错题真正做会。' };
  }

  function questionBankFromSnapshot(snapshot) {
    return { subjects: clone(snapshot?.subjects || []), questions: clone(snapshot?.questions || []) };
  }

  function createExport(exportType, snapshot, options = {}) {
    const header = manifest(exportType, options);
    const questionBank = questionBankFromSnapshot(snapshot);
    const progress = progressFromState(snapshot?.state);
    const markers = markersFromState(snapshot?.state);
    const settings = settingsFromState(snapshot?.state);
    let payload;
    if (exportType === 'question_bank') payload = questionBank;
    else if (exportType === 'progress') payload = progress;
    else if (exportType === 'markers') payload = markers;
    else if (exportType === 'settings') payload = settings;
    else payload = { questionBank, progress, markers, settings, deletedBaseSubjects: strings(snapshot?.deletedBaseSubjects) };
    return { ...header, payload };
  }

  function parseEnvelope(raw) {
    const data = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('导入文件必须是 JSON 对象');
    if (data.format !== FORMAT) return detectLegacyFormat(data);
    const version = Number(data.schemaVersion);
    if (!Number.isInteger(version) || version < 1) throw new Error('schemaVersion 必须是正整数');
    if (version > SCHEMA_VERSION) throw new Error(`不支持 schemaVersion ${version}；当前最高支持 ${SCHEMA_VERSION}`);
    if (!EXPORT_TYPES.includes(data.exportType)) throw new Error(`未知 exportType：${String(data.exportType || '')}`);
    if (!data.payload || typeof data.payload !== 'object' || Array.isArray(data.payload)) throw new Error(`${data.exportType} 缺少 payload`);
    return { ...data, schemaVersion: version, legacy: !!data.legacy };
  }

  function legacyFullPayload(data) {
    const state = object(data.state);
    return {
      questionBank: { subjects: clone(data.bank?.subjects || []), questions: clone(data.bank?.questions || []) },
      progress: progressFromState(state),
      markers: { favorites: strings(state.favorites), wrong: strings(state.wrong), slashed: [] },
      settings: settingsFromState(state),
      deletedBaseSubjects: strings(data.deletedBaseSubjects)
    };
  }

  function detectLegacyFormat(data) {
    if (data?.format === 'medical-question-bank' && Number(data.version) === 1) {
      return { ...manifest('question_bank', { exportedAt: data.exportedAt }), payload: { subjects: clone(data.subjects || []), questions: clone(data.questions || []) }, legacy: true, legacyFormat: 'medical-question-bank v1' };
    }
    if (data?.format === 'medical-question-data' && Number(data.version) === 1) {
      return { ...manifest('full_backup', { exportedAt: data.exportedAt }), payload: legacyFullPayload(data), legacy: true, legacyFormat: 'medical-question-data v1' };
    }
    if (data?.format === 'medical-question-data') throw new Error(`不支持 Legacy medical-question-data 版本 ${String(data.version)}`);
    if (data?.format === 'medical-question-bank') throw new Error(`不支持 Legacy medical-question-bank 版本 ${String(data.version)}`);
    throw new Error(`不支持的数据格式：${String(data?.format || '缺少 format')}`);
  }

  function normalizeQuestionBank(payload) {
    const source = object(payload);
    if (!Array.isArray(source.subjects) || !Array.isArray(source.questions)) throw new Error('Question Bank 必须包含 subjects 和 questions 数组');
    const subjects = [], subjectMap = new Map();
    for (const item of source.subjects) {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || blocked(item.id) || typeof item.name !== 'string' || !item.name.trim()) throw new Error('Question Bank 包含无效科目');
      if (subjectMap.has(item.id)) throw new Error(`科目 ID 重复：${item.id}`);
      const subject = { id: item.id, name: item.name.trim(), short: typeof item.short === 'string' && item.short.trim() ? item.short.trim().slice(0, 8) : Array.from(item.name.trim())[0] };
      subjectMap.set(subject.id, subject); subjects.push(subject);
    }
    const questions = [], byId = new Map(), duplicateIds = [], conflictIds = [];
    for (let index = 0; index < source.questions.length; index++) {
      const q = source.questions[index];
      if (!q || !validId(q.id) || !subjectMap.has(q.subjectId) || typeof q.chapter !== 'string' || !q.chapter.trim() || typeof q.stem !== 'string' || !q.stem.trim() || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5 || !q.options.every(x => typeof x === 'string' && x.trim()) || typeof q.answer !== 'string' || !new RegExp(`^[A-${String.fromCharCode(64 + q.options.length)}]$`).test(q.answer)) throw new Error(`第 ${index + 1} 题格式无效`);
      const path = Array.isArray(q.path) && q.path.length >= 2 ? q.path.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()) : [subjectMap.get(q.subjectId).name, q.chapter.trim()];
      if (path.length < 2) throw new Error(`第 ${index + 1} 题来源路径无效`);
      const normalized = { ...clone(q), id: q.id, subjectId: q.subjectId, subject: subjectMap.get(q.subjectId).name, chapter: q.chapter.trim(), path, stem: q.stem, options: [...q.options], answer: q.answer, analysis: typeof q.analysis === 'string' ? q.analysis : '', context: typeof q.context === 'string' ? q.context : '', number: Number.isInteger(q.number) && q.number > 0 ? q.number : index + 1, type: typeof q.type === 'string' && q.type ? q.type : 'A1' };
      if (byId.has(q.id)) {
        (same(byId.get(q.id), normalized) ? duplicateIds : conflictIds).push(q.id);
        continue;
      }
      byId.set(q.id, normalized); questions.push(normalized);
    }
    return { subjects, questions, duplicateIds: strings(duplicateIds), conflictIds: strings(conflictIds) };
  }

  const report = (type, legacy = false) => ({ fileType: type, legacy, successCount: 0, skippedCount: 0, duplicateCount: 0, conflictCount: 0, orphanCount: 0, errorCount: 0, duplicateIds: [], conflictIds: [], orphanIds: [] });

  function filterIdMap(value, known, orphans) {
    const out = {};
    for (const [id, item] of Object.entries(object(value))) known.has(id) ? out[id] = clone(item) : orphans.add(id);
    return out;
  }

  function filterResume(value, known, orphans) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.ids)) return null;
    const ids = value.ids.filter(id => known.has(id));
    value.ids.filter(id => !known.has(id)).forEach(id => orphans.add(id));
    if (!ids.length) return null;
    const sessionAnswers = filterIdMap(value.sessionAnswers, known, orphans);
    const currentId = value.ids[Math.max(0, Number(value.cursor) || 0)];
    return { ...clone(value), ids, cursor: Math.max(0, currentId && ids.includes(currentId) ? ids.indexOf(currentId) : Math.min(Number(value.cursor) || 0, ids.length - 1)), sessionAnswers };
  }

  function applyProgress(payload, state, knownIds) {
    const source = object(payload), known = new Set(knownIds), orphans = new Set();
    const answers = filterIdMap(source.answers, known, orphans);
    const questionStats = filterIdMap(source.questionStats, known, orphans);
    const answerHistory = Array.isArray(source.answerHistory) ? source.answerHistory.filter(item => {
      if (!item || typeof item.questionId !== 'string') return false;
      if (!known.has(item.questionId)) { orphans.add(item.questionId); return false; }
      return true;
    }).map(clone) : [];
    const dailyStats = Object.fromEntries(Object.entries(object(source.dailyStats)).map(([day, value]) => {
      const entry = clone(object(value));
      if (Array.isArray(entry.questionIds)) {
        entry.questionIds.filter(id => !known.has(id)).forEach(id => orphans.add(id));
        entry.questionIds = entry.questionIds.filter(id => known.has(id));
      }
      return [day, entry];
    }));
    const next = { ...clone(state), stateVersion: Math.max(2, Number(source.stateVersion) || 2), answers, answerHistory, questionStats, resume: filterResume(source.resume, known, orphans), last: filterResume(source.last, known, orphans), totals: clone(object(source.totals)), dailyStats };
    return { state: next, orphanIds: [...orphans], successCount: Object.keys(answers).length + answerHistory.length + Object.keys(questionStats).length };
  }

  function applyMarkers(payload, state, knownIds) {
    const known = new Set(knownIds), orphans = new Set(), next = { ...clone(state) };
    for (const key of MARKER_KEYS) {
      const values = strings(payload?.[key]);
      values.filter(id => !known.has(id)).forEach(id => orphans.add(id));
      next[key] = values.filter(id => known.has(id));
    }
    return { state: next, orphanIds: [...orphans], successCount: MARKER_KEYS.reduce((sum, key) => sum + next[key].length, 0) };
  }

  function applySettings(payload, state) {
    const source = object(payload), next = { ...clone(state) };
    next.theme = ['system', 'light', 'dark'].includes(source.theme) ? source.theme : 'system';
    next.homeTitle = typeof source.homeTitle === 'string' && source.homeTitle.trim() ? source.homeTitle.trim().slice(0, 16) : '医学题库';
    next.homeSlogan = typeof source.homeSlogan === 'string' && source.homeSlogan.trim() ? source.homeSlogan.trim().slice(0, 60) : '按科目练习，\n把错题真正做会。';
    return { state: next, successCount: SETTING_KEYS.length };
  }

  function mergeQuestionBank(payload, snapshot) {
    const incoming = normalizeQuestionBank(payload), subjects = clone(snapshot.subjects || []), questions = clone(snapshot.questions || []), subjectMap = new Map(subjects.map(x => [x.id, x])), questionMap = new Map(questions.map(x => [x.id, x]));
    const duplicates = [...incoming.duplicateIds], conflicts = [...incoming.conflictIds], added = [];
    for (const subject of incoming.subjects) if (!subjectMap.has(subject.id)) { subjectMap.set(subject.id, subject); subjects.push(subject); }
    for (const q of incoming.questions) {
      if (!questionMap.has(q.id)) { questionMap.set(q.id, q); questions.push(q); added.push(q.id); }
      else (sameQuestion(questionMap.get(q.id), q) ? duplicates : conflicts).push(q.id);
    }
    return { subjects, questions, addedIds: strings(added), duplicateIds: strings(duplicates), conflictIds: strings(conflicts) };
  }

  function applyImport(raw, snapshot) {
    const doc = parseEnvelope(raw), result = { subjects: clone(snapshot.subjects || []), questions: clone(snapshot.questions || []), state: clone(snapshot.state || {}), deletedBaseSubjects: strings(snapshot.deletedBaseSubjects) }, summary = report(doc.exportType, !!doc.legacy);
    if (doc.exportType === 'question_bank') {
      const merged = mergeQuestionBank(doc.payload, result); Object.assign(result, { subjects: merged.subjects, questions: merged.questions });
      summary.successCount = merged.addedIds.length; summary.duplicateIds = merged.duplicateIds; summary.conflictIds = merged.conflictIds;
    } else if (doc.exportType === 'progress') {
      const applied = applyProgress(doc.payload, result.state, result.questions.map(q => q.id)); result.state = applied.state; summary.successCount = applied.successCount; summary.orphanIds = applied.orphanIds;
    } else if (doc.exportType === 'markers') {
      const applied = applyMarkers(doc.payload, result.state, result.questions.map(q => q.id)); result.state = applied.state; summary.successCount = applied.successCount; summary.orphanIds = applied.orphanIds;
    } else if (doc.exportType === 'settings') {
      const applied = applySettings(doc.payload, result.state); result.state = applied.state; summary.successCount = applied.successCount;
    } else {
      const bank = normalizeQuestionBank(doc.payload.questionBank), ids = bank.questions.map(q => q.id);
      result.subjects = bank.subjects; result.questions = bank.questions; result.deletedBaseSubjects = strings(doc.payload.deletedBaseSubjects);
      const progress = applyProgress(doc.payload.progress, result.state, ids), markers = applyMarkers(doc.payload.markers, progress.state, ids), settings = applySettings(doc.payload.settings, markers.state);
      result.state = settings.state; summary.successCount = ids.length + progress.successCount + markers.successCount + settings.successCount; summary.orphanIds = strings([...progress.orphanIds, ...markers.orphanIds]); summary.duplicateIds = bank.duplicateIds; summary.conflictIds = bank.conflictIds;
    }
    summary.duplicateCount = summary.duplicateIds.length; summary.conflictCount = summary.conflictIds.length; summary.orphanCount = summary.orphanIds.length; summary.skippedCount = summary.duplicateCount + summary.conflictCount + summary.orphanCount;
    return { document: doc, snapshot: result, report: summary };
  }

  return { APP_VERSION, EXPORT_TYPES, FORMAT, MARKER_KEYS, PROGRESS_KEYS, SCHEMA_VERSION, SETTING_KEYS, applyImport, applyMarkers, applyProgress, applySettings, createExport, detectLegacyFormat, manifest, mergeQuestionBank, normalizeQuestionBank, parseEnvelope };
});
