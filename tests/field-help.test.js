// Tests for app/ui-field-help.js (字段说明 page).
// v3.0.1: rewritten in plain language for sales team. No more snake_case dict names.
// Run: node tests/field-help.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok', name); passed++; }
  catch (e) { console.log('  FAIL', name, '\n    ', e.message); failed++; }
}

console.log('field-help');

test('ui-field-help.js exposes renderFieldHelp on window', () => {
  global.window = global;
  require('../app/ui-field-help.js');
  assert.equal(typeof global.renderFieldHelp, 'function');
});

test('ui-field-help.js documents all 9 dict-backed fields in plain language', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  // Sales-friendly Chinese labels for each dict-backed field
  const expectedLabels = ['销售团队', '主责销售', '客户名称', '业务线', '业务', '销售渠道', '阶段', '发票状态', '币种'];
  for (const f of expectedLabels) {
    assert.ok(src.includes(f), 'expected field ' + f + ' to be in field-help source');
  }
});

test('ui-field-help.js documents BUILTIN_INVOICE_STATUSES (5 values)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  const expected = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  for (const s of expected) {
    assert.ok(src.includes(s), 'expected invoice status ' + s);
  }
});

test('ui-field-help.js documents the 3 exchange rates (USD/SGD/RMB)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  for (const cur of ['USD', 'SGD', 'RMB']) {
    assert.ok(src.includes(cur), 'expected currency ' + cur);
  }
});

test('ui-field-help.js has plain-language quick-start and FAQ sections', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  // Should have a quick-start / onboarding callout
  assert.ok(src.includes('快速上手'), 'should have a 快速上手 quick-start callout');
  // Should explain dictionaries
  assert.ok(src.includes('字典'), 'should explain 字典');
  // Should explain win rate (a confusing term)
  assert.ok(src.includes('赢单概率') || src.includes('赢率'), 'should explain win rate');
  // Should mention 仪表盘 and 分析 since they're common references
  assert.ok(src.includes('仪表盘') || src.includes('分析'), 'should reference 仪表盘 or 分析');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
