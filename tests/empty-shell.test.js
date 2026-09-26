const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const exchange = require('../app/src/main/assets/data-exchange.js');
const assets = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const index = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');

test('正式资源不包含内置题库文件或加载入口', () => {
  for (const name of ['questions.js', 'supplemental-questions.js', 'questions.json']) {
    assert.equal(fs.existsSync(path.join(assets, name)), false, `${name} 不应进入正式资源`);
    assert.equal(index.includes(name), false, `${name} 不应被 index.html 引用`);
  }
  assert.match(index, /const BASE_SUBJECTS=\[\];/);
  assert.match(index, /const BASE_QUESTIONS=\[\];/);
  assert.match(index, /initBankSettings\(\);\s*renderHome\(\);/);
});

test('空壳状态仍可导入 medical-question-bank v1', () => {
  const empty = {
    subjects: [],
    questions: [],
    deletedBaseSubjects: [],
    state: { answers: {}, answerHistory: [], questionStats: {}, favorites: [], wrong: [], slashed: [] }
  };
  const bank = {
    format: 'medical-question-bank',
    version: 1,
    subjects: [{ id: 'medicine', name: '医学', short: '医' }],
    questions: [{
      id: 'medicine-q1', subjectId: 'medicine', chapter: '第一章', path: ['来源', '医学', '第一章'],
      stem: '示例题干', options: ['选项 A', '选项 B'], answer: 'A', analysis: '本题考查：示例考点\n考点还原：示例说明\n全选项解析：\nA. 正确。\nB. 错误。\n结论：选择 A。', context: '', number: 1, type: 'A1'
    }]
  };
  const result = exchange.applyImport(bank, empty);
  assert.equal(result.report.fileType, 'question_bank');
  assert.equal(result.report.successCount, 1);
  assert.deepEqual(result.snapshot.questions.map(q => q.id), ['medicine-q1']);
});
