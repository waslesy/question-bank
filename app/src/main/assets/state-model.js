(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QuestionBankStateModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const stableQuestionId = value => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
  };

  const uniqueStrings = value => Array.isArray(value)
    ? [...new Set(value.map(stableQuestionId).filter(Boolean))]
    : [];

  function migrateMarkerState(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      ...source,
      stateVersion: 2,
      wrong: uniqueStrings(source.wrong),
      favorites: uniqueStrings(source.favorites),
      slashed: uniqueStrings(source.slashed)
    };
  }

  function isAnswered(answer) {
    return !!answer
      && typeof answer === 'object'
      && typeof answer.selected === 'string'
      && /^[A-E]$/.test(answer.selected)
      && typeof answer.correct === 'boolean';
  }

  function isSlashed(state, questionId) {
    const id = stableQuestionId(questionId);
    return !!id && uniqueStrings(state?.slashed).includes(id);
  }

  function trainableQuestions(rows, state) {
    return (Array.isArray(rows) ? rows : []).filter(q => q && !isSlashed(state, q.id));
  }

  function slashedQuestions(rows, state) {
    return (Array.isArray(rows) ? rows : []).filter(q => q && isSlashed(state, q.id));
  }

  function chapterMetrics(rows, state) {
    const questions = Array.isArray(rows) ? rows.filter(Boolean) : [];
    const answers = state?.answers && typeof state.answers === 'object' ? state.answers : {};
    const slashed = new Set(uniqueStrings(state?.slashed));
    const answeredRows = questions.filter(q => isAnswered(answers[q.id]));
    const correctCount = answeredRows.filter(q => answers[q.id].correct === true).length;
    const slashedCount = questions.filter(q => slashed.has(stableQuestionId(q.id))).length;
    const trainableCount = questions.length - slashedCount;
    const answeredTrainableCount = answeredRows.filter(q => !slashed.has(stableQuestionId(q.id))).length;
    const answeredCount = answeredRows.length;
    const accuracy = answeredCount ? Math.round(correctCount / answeredCount * 100) : null;
    const completionPercent = trainableCount ? Math.round(answeredTrainableCount / trainableCount * 100) : 100;
    const completed = trainableCount === 0 || answeredTrainableCount >= trainableCount;
    return {
      chapterTotal: questions.length,
      slashedCount,
      trainableCount,
      completionPercent,
      answeredCount,
      answeredTrainableCount,
      correctCount,
      accuracy,
      status: completed ? 'completed' : answeredTrainableCount === 0 ? 'unanswered' : 'started'
    };
  }

  function toggleSlashed(state, questionId, shouldSlash) {
    const id = stableQuestionId(questionId);
    if (!id) return false;
    const next = uniqueStrings(state?.slashed);
    const index = next.indexOf(id);
    const add = typeof shouldSlash === 'boolean' ? shouldSlash : index < 0;
    if (add && index < 0) next.push(id);
    if (!add && index >= 0) next.splice(index, 1);
    state.slashed = next;
    return add;
  }

  function resetChapterProgress(state, questionIds) {
    const ids = new Set(uniqueStrings(questionIds));
    if (!state.answers || typeof state.answers !== 'object' || Array.isArray(state.answers)) state.answers = {};
    for (const id of ids) delete state.answers[id];
    if (state.resume?.ids?.some(id => ids.has(id))) state.resume = null;
    if (state.last?.ids?.some(id => ids.has(id))) state.last = null;
    return state;
  }

  return {
    chapterMetrics,
    isAnswered,
    isSlashed,
    migrateMarkerState,
    resetChapterProgress,
    slashedQuestions,
    stableQuestionId,
    toggleSlashed,
    trainableQuestions,
    uniqueStrings
  };
});
