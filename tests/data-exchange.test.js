const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const exchange = require('../app/src/main/assets/data-exchange.js');

const subjects = [{ id: 'medicine', name: '医学', short: '医' }];
const question = (id, stem = `题干 ${id}`) => ({ id, subjectId: 'medicine', subject: '医学', chapter: '第一章', path: ['来源', '医学'], type: 'A1', number: Number(id.replace(/\D/g, '')) || 1, stem, options: ['选项 A', '选项 B'], answer: 'A', analysis: '解析', context: '' });
const makeSnapshot = () => ({
  subjects: structuredClone(subjects),
  questions: [question('q1'), question('q2')],
  deletedBaseSubjects: [],
  state: {
    stateVersion: 2,
    answers: { q1: { selected: 'A', correct: true, at: 1 } },
    answerHistory: [{ timestamp: 1, questionId: 'q1', isCorrect: true, duration: 10, attempt: 1 }],
    questionStats: { q1: { attempts: 1, wrong: 0 } },
    resume: { ids: ['q1', 'q2'], cursor: 1, sessionAnswers: {} },
    last: { ids: ['q1', 'q2'], cursor: 1 },
    totals: { attempts: 1, correct: 1, studyMs: 10 },
    dailyStats: { '2026-09-25': { attempts: 1, correct: 1, studyMs: 10, questionIds: ['q1'] } },
    favorites: ['q1'], wrong: ['q2'], slashed: ['q1'],
    theme: 'dark', homeTitle: '我的题库', homeSlogan: '继续学习'
  }
});
const keys = value => new Set(Object.keys(value));

test('Question Bank export 不包含 progress', () => {
  const out = exchange.createExport('question_bank', makeSnapshot(), { exportedAt: '2026-01-01T00:00:00.000Z' });
  assert.equal(out.exportType, 'question_bank');
  assert.equal('answers' in out.payload, false);
  assert.equal('progress' in out.payload, false);
});

test('Question Bank export 不包含 favorites 或 slashed', () => {
  const payload = exchange.createExport('question_bank', makeSnapshot()).payload;
  assert.equal('favorites' in payload, false); assert.equal('slashed' in payload, false);
});

test('Question Bank export 不包含 settings', () => {
  const payload = exchange.createExport('question_bank', makeSnapshot()).payload;
  assert.equal('theme' in payload, false); assert.equal('homeTitle' in payload, false);
});

test('Progress export 不包含完整题库正文', () => {
  const payload = exchange.createExport('progress', makeSnapshot()).payload;
  assert.equal('questions' in payload, false); assert.equal(JSON.stringify(payload).includes('题干 q1'), false);
});

test('Markers export 正确保留 favorites wrong slashed', () => {
  assert.deepEqual(exchange.createExport('markers', makeSnapshot()).payload, { favorites: ['q1'], wrong: ['q2'], slashed: ['q1'] });
});

test('Settings export 不包含题库或进度', () => {
  const payload = exchange.createExport('settings', makeSnapshot()).payload;
  assert.deepEqual(keys(payload), new Set(['theme', 'homeTitle', 'homeSlogan']));
});

test('Full Backup 包含全部必要数据域', () => {
  const payload = exchange.createExport('full_backup', makeSnapshot()).payload;
  assert.deepEqual(keys(payload), new Set(['questionBank', 'progress', 'markers', 'settings', 'deletedBaseSubjects']));
});

for (const type of exchange.EXPORT_TYPES) test(`${type} 可解析并 round-trip`, () => {
  const out = exchange.createExport(type, makeSnapshot(), { exportedAt: '2026-01-01T00:00:00.000Z' });
  const parsed = exchange.parseEnvelope(JSON.stringify(out));
  assert.equal(parsed.exportType, type); assert.equal(parsed.schemaVersion, 1); assert.deepEqual(parsed.payload, out.payload);
});

test('Question Bank import 不破坏 progress', () => {
  const before = makeSnapshot(), incoming = exchange.createExport('question_bank', { subjects, questions: [question('q3')], state: {} });
  const result = exchange.applyImport(incoming, before);
  assert.deepEqual(result.snapshot.state, before.state); assert.equal(result.snapshot.questions.length, 3);
});

test('Progress import 不破坏 question bank 或 markers/settings', () => {
  const before = makeSnapshot(), donor = makeSnapshot(); donor.state.answers = { q2: { selected: 'B', correct: false } };
  const result = exchange.applyImport(exchange.createExport('progress', donor), before);
  assert.deepEqual(result.snapshot.questions, before.questions); assert.deepEqual(result.snapshot.state.favorites, ['q1']); assert.equal(result.snapshot.state.theme, 'dark');
});

test('Markers import 不破坏 answers', () => {
  const before = makeSnapshot(), donor = makeSnapshot(); donor.state.favorites = ['q2']; donor.state.slashed = ['q2'];
  const result = exchange.applyImport(exchange.createExport('markers', donor), before);
  assert.deepEqual(result.snapshot.state.answers, before.state.answers); assert.deepEqual(result.snapshot.state.favorites, ['q2']); assert.deepEqual(result.snapshot.state.slashed, ['q2']);
});

test('Settings import 不破坏题库或 answers', () => {
  const before = makeSnapshot(), donor = makeSnapshot(); donor.state.theme = 'light';
  const result = exchange.applyImport(exchange.createExport('settings', donor), before);
  assert.deepEqual(result.snapshot.questions, before.questions); assert.deepEqual(result.snapshot.state.answers, before.state.answers); assert.equal(result.snapshot.state.theme, 'light');
});

test('orphan question ID 被跳过并报告', () => {
  const doc = exchange.createExport('progress', makeSnapshot()); doc.payload.answers.orphan = { selected: 'A', correct: true }; doc.payload.answerHistory.push({ questionId: 'orphan', isCorrect: true });
  const result = exchange.applyImport(doc, makeSnapshot());
  assert.equal(result.report.orphanCount, 1); assert.deepEqual(result.report.orphanIds, ['orphan']); assert.equal(result.snapshot.state.answers.orphan, undefined);
});

test('Markers orphan 被跳过且三个 marker 互不覆盖', () => {
  const doc = exchange.createExport('markers', makeSnapshot()); doc.payload = { favorites: ['q1', 'orphan'], wrong: ['q1'], slashed: ['q1'] };
  const result = exchange.applyImport(doc, makeSnapshot());
  assert.equal(result.report.orphanCount, 1); assert.deepEqual(result.snapshot.state.favorites, ['q1']); assert.deepEqual(result.snapshot.state.wrong, ['q1']); assert.deepEqual(result.snapshot.state.slashed, ['q1']);
});

test('duplicate 和 conflict question ID 均跳过并分别报告', () => {
  const duplicate = question('q3'), conflict = question('q3', '冲突题干');
  const doc = exchange.createExport('question_bank', { subjects, questions: [duplicate, structuredClone(duplicate), conflict], state: {} });
  const result = exchange.applyImport(doc, makeSnapshot());
  assert.equal(result.report.successCount, 1); assert.equal(result.report.duplicateCount, 1); assert.equal(result.report.conflictCount, 1);
});

test('已有 question ID 内容相同为 duplicate，内容不同为 conflict，均不覆盖', () => {
  const before = makeSnapshot();
  const doc = exchange.createExport('question_bank', { subjects, questions: [question('q1'), question('q2', '不同题干')], state: {} });
  const result = exchange.applyImport(doc, before);
  assert.equal(result.report.duplicateCount, 1); assert.equal(result.report.conflictCount, 1); assert.deepEqual(result.snapshot.questions, before.questions);
});

test('Legacy medical-question-data v1 被识别', () => {
  const legacy = { format: 'medical-question-data', version: 1, bank: { subjects, questions: [question('q1')] }, state: makeSnapshot().state };
  const parsed = exchange.parseEnvelope(legacy);
  assert.equal(parsed.exportType, 'full_backup'); assert.equal(parsed.legacy, true); assert.equal(parsed.legacyFormat, 'medical-question-data v1');
});

test('Legacy 缺少 slashed 时迁移为 []', () => {
  const legacy = { format: 'medical-question-data', version: 1, bank: { subjects, questions: [question('q1')] }, state: { favorites: ['q1'], wrong: ['q1'] } };
  assert.deepEqual(exchange.parseEnvelope(legacy).payload.markers.slashed, []);
});

test('Legacy medical-question-bank v1 保持追加语义', () => {
  const legacy = { format: 'medical-question-bank', version: 1, subjects, questions: [question('q3')] };
  const result = exchange.applyImport(legacy, makeSnapshot());
  assert.equal(result.document.exportType, 'question_bank'); assert.equal(result.snapshot.questions.length, 3); assert.equal(result.report.successCount, 1);
});

const realLegacyBackup = path.resolve(__dirname, '../../题库软件数据备份.json');

test('真实 Legacy 备份识别为 3243 题并保留既有状态', { skip: !fs.existsSync(realLegacyBackup) }, () => {
  const file = realLegacyBackup;
  const legacy = JSON.parse(fs.readFileSync(file, 'utf8'));
  const parsed = exchange.parseEnvelope(legacy);
  assert.equal(parsed.payload.questionBank.questions.length, 3243); assert.equal(parsed.payload.progress.answerHistory.length, 12); assert.equal(Object.keys(parsed.payload.progress.answers).length, 10); assert.equal(parsed.payload.markers.wrong.length, 6); assert.deepEqual(parsed.payload.markers.slashed, []);
});

test('真实 Legacy 备份完整导入后仍为 3243 题', { skip: !fs.existsSync(realLegacyBackup) }, () => {
  const legacy = JSON.parse(fs.readFileSync(realLegacyBackup, 'utf8'));
  const result = exchange.applyImport(legacy, makeSnapshot());
  assert.equal(result.snapshot.questions.length, 3243); assert.equal(result.snapshot.state.answerHistory.length, 12); assert.equal(result.snapshot.state.resume.ids.length, 9);
});

test('Full Backup 恢复断点 markers progress settings', () => {
  const donor = makeSnapshot(), target = makeSnapshot(); target.state = { answers: {}, answerHistory: [], questionStats: {}, favorites: [], wrong: [], slashed: [], theme: 'system' };
  const result = exchange.applyImport(exchange.createExport('full_backup', donor), target).snapshot;
  assert.deepEqual(result.state.answers, donor.state.answers); assert.deepEqual(result.state.resume, donor.state.resume); assert.deepEqual(result.state.favorites, donor.state.favorites); assert.deepEqual(result.state.slashed, donor.state.slashed); assert.equal(result.state.theme, 'dark');
});

test('错误或未知 exportType 有明确报错', () => {
  assert.throws(() => exchange.parseEnvelope({ format: exchange.FORMAT, schemaVersion: 1, exportType: 'mystery', payload: {} }), /未知 exportType/);
});

test('不支持的 schemaVersion 有明确报错', () => {
  assert.throws(() => exchange.parseEnvelope({ format: exchange.FORMAT, schemaVersion: 99, exportType: 'settings', payload: {} }), /不支持 schemaVersion 99/);
});

test('跨域映射只使用 stable question ID', () => {
  const before = makeSnapshot(), doc = exchange.createExport('progress', before); doc.payload.answers = { q2: { selected: 'B', correct: false } };
  const result = exchange.applyImport(doc, { ...before, questions: [...before.questions].reverse() });
  assert.deepEqual(result.snapshot.state.answers, { q2: { selected: 'B', correct: false } });
});
