const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../app/src/main/assets/state-model.js');
const exchange = require('../app/src/main/assets/data-exchange.js');

const questions = [
  { id: 'question-a', subjectId: 'medicine', subject: '医学', chapter: '第一章', path: ['来源', '医学'], type: 'A1', number: 1, stem: '题目 A', options: ['A', 'B'], answer: 'A', analysis: '' },
  { id: 'question-b', subjectId: 'medicine', subject: '医学', chapter: '第一章', path: ['来源', '医学'], type: 'A1', number: 2, stem: '题目 B', options: ['A', 'B'], answer: 'B', analysis: '' }
];
const subjects = [{ id: 'medicine', name: '医学', short: '医' }];
const freshState = () => ({ stateVersion: 2, answers: {}, answerHistory: [], questionStats: {}, wrong: [], favorites: [], slashed: [], resume: null, last: null, totals: {}, dailyStats: {}, theme: 'system' });

test('斩题完整链路：持久化、reload、普通题池排除、已斩题池可见和 Full Backup round-trip', () => {
  const state = freshState();
  state.answerHistory = [{ questionId: 'question-a', isCorrect: false }];
  state.wrong = ['question-a'];
  state.favorites = ['question-a'];
  assert.deepEqual(state.slashed, []);

  model.toggleSlashed(state, questions[0].id, true);
  assert.deepEqual(state.slashed, ['question-a']);

  const persisted = JSON.stringify(state);
  const reloaded = model.migrateMarkerState(JSON.parse(persisted));
  assert.deepEqual(reloaded.slashed, ['question-a']);
  assert.deepEqual(model.trainableQuestions(questions, reloaded).map(q => q.id), ['question-b']);
  assert.deepEqual(model.slashedQuestions(questions, reloaded).map(q => q.id), ['question-a']);
  assert.deepEqual(reloaded.answerHistory, state.answerHistory);
  assert.deepEqual(reloaded.wrong, ['question-a']);
  assert.deepEqual(reloaded.favorites, ['question-a']);

  const snapshot = { subjects, questions, deletedBaseSubjects: [], state: reloaded };
  const backup = exchange.createExport('full_backup', snapshot, { exportedAt: '2026-09-25T00:00:00.000Z' });
  const restored = exchange.applyImport(JSON.stringify(backup), { subjects, questions, deletedBaseSubjects: [], state: freshState() }).snapshot.state;
  assert.deepEqual(restored.slashed, ['question-a']);
  assert.deepEqual(model.trainableQuestions(questions, restored).map(q => q.id), ['question-b']);
  assert.deepEqual(model.slashedQuestions(questions, restored).map(q => q.id), ['question-a']);
});

test('Markers 备份 round-trip 保留同一 slashed 字段', () => {
  const state = freshState();
  model.toggleSlashed(state, 'question-a', true);
  const snapshot = { subjects, questions, state };
  const restored = exchange.applyImport(exchange.createExport('markers', snapshot), { subjects, questions, state: freshState() }).snapshot.state;
  assert.deepEqual(restored.slashed, ['question-a']);
  assert.equal('archived' in restored, false);
});

test('稳定 ID 比较兼容数字状态值与字符串题目 ID', () => {
  const state = freshState();
  state.slashed = [101];
  const rows = [{ id: '101' }, { id: '102' }];
  const migrated = model.migrateMarkerState(state);
  assert.deepEqual(migrated.slashed, ['101']);
  assert.deepEqual(model.trainableQuestions(rows, migrated).map(q => q.id), ['102']);
  assert.deepEqual(model.slashedQuestions(rows, migrated).map(q => q.id), ['101']);
});

test('旧备份缺失 slashed 时仍迁移为空数组', () => {
  assert.deepEqual(model.migrateMarkerState({ wrong: ['question-a'] }).slashed, []);
  const legacy = { format: 'medical-question-data', version: 1, bank: { subjects, questions }, state: { wrong: ['question-a'] } };
  assert.deepEqual(exchange.parseEnvelope(legacy).payload.markers.slashed, []);
});
