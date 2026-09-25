const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../app/src/main/assets/state-model.js');

const rows = [
  { id: 'chapter-a-1', chapter: 'A' },
  { id: 'chapter-a-2', chapter: 'A' },
  { id: 'chapter-a-3', chapter: 'A' }
];

const baseState = () => ({
  answers: {},
  answerHistory: [],
  wrong: [],
  favorites: [],
  slashed: [],
  resume: null,
  last: null
});

test('未答题不算错误', () => {
  const state = baseState();
  state.answers['chapter-a-1'] = { selected: 'A', correct: true };
  const metrics = model.chapterMetrics(rows, state);
  assert.equal(metrics.answeredCount, 1);
  assert.equal(metrics.correctCount, 1);
  assert.equal(metrics.accuracy, 100);
});

test('正确率分母只包含实际已答题', () => {
  const state = baseState();
  state.answers['chapter-a-1'] = { selected: 'A', correct: true };
  state.answers['chapter-a-2'] = { selected: 'B', correct: false };
  assert.equal(model.chapterMetrics(rows, state).accuracy, 50);
});

test('斩题后从普通训练集合排除', () => {
  const state = baseState();
  state.slashed = ['chapter-a-2'];
  assert.deepEqual(model.trainableQuestions(rows, state).map(q => q.id), ['chapter-a-1', 'chapter-a-3']);
});

test('斩题不删除答题历史', () => {
  const state = baseState();
  state.answerHistory = [{ questionId: 'chapter-a-2', isCorrect: false }];
  model.toggleSlashed(state, 'chapter-a-2');
  assert.equal(state.answerHistory.length, 1);
});

test('斩题不清除收藏', () => {
  const state = baseState();
  state.favorites = ['chapter-a-2'];
  model.toggleSlashed(state, 'chapter-a-2');
  assert.deepEqual(state.favorites, ['chapter-a-2']);
});

test('斩题不清除错题', () => {
  const state = baseState();
  state.wrong = ['chapter-a-2'];
  model.toggleSlashed(state, 'chapter-a-2');
  assert.deepEqual(state.wrong, ['chapter-a-2']);
});

test('恢复斩题后重新进入训练集合', () => {
  const state = baseState();
  model.toggleSlashed(state, 'chapter-a-2');
  model.toggleSlashed(state, 'chapter-a-2');
  assert.deepEqual(model.trainableQuestions(rows, state).map(q => q.id), rows.map(q => q.id));
});

test('重置章节不影响 markers 或历史', () => {
  const state = baseState();
  state.answers = { 'chapter-a-1': { selected: 'A', correct: true } };
  state.wrong = ['chapter-a-1'];
  state.favorites = ['chapter-a-1'];
  state.slashed = ['chapter-a-1'];
  state.answerHistory = [{ questionId: 'chapter-a-1', isCorrect: true }];
  model.resetChapterProgress(state, ['chapter-a-1']);
  assert.equal(state.answers['chapter-a-1'], undefined);
  assert.deepEqual(state.wrong, ['chapter-a-1']);
  assert.deepEqual(state.favorites, ['chapter-a-1']);
  assert.deepEqual(state.slashed, ['chapter-a-1']);
  assert.equal(state.answerHistory.length, 1);
});

test('重置章节不影响其它章节', () => {
  const state = baseState();
  state.answers = {
    'chapter-a-1': { selected: 'A', correct: true },
    'chapter-b-1': { selected: 'B', correct: false }
  };
  model.resetChapterProgress(state, rows.map(q => q.id));
  assert.deepEqual(state.answers['chapter-b-1'], { selected: 'B', correct: false });
});

test('旧备份没有 slashed 字段时迁移为空数组', () => {
  const migrated = model.migrateMarkerState({ wrong: ['q1'], favorites: ['q2'] });
  assert.equal(migrated.stateVersion, 2);
  assert.deepEqual(migrated.slashed, []);
  assert.deepEqual(migrated.wrong, ['q1']);
  assert.deepEqual(migrated.favorites, ['q2']);
});

test('序列化后 reload 保留独立 markers 与进度', () => {
  const original = baseState();
  original.answers.q1 = { selected: 'C', correct: true };
  original.wrong = ['q1'];
  original.favorites = ['q1'];
  original.slashed = ['q1'];
  original.resume = { ids: ['q1'], cursor: 0 };
  const reloaded = model.migrateMarkerState(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(reloaded.answers.q1, original.answers.q1);
  assert.deepEqual(reloaded.wrong, ['q1']);
  assert.deepEqual(reloaded.favorites, ['q1']);
  assert.deepEqual(reloaded.slashed, ['q1']);
  assert.equal(reloaded.resume.cursor, 0);
});
