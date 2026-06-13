// Tests for app/ui-field-help.js (字段说明 page).
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

test('ui-field-help.js references all 9 dict-backed fields', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  const fields = ['team', 'owner', 'customer', 'product_line', 'product', 'sales_channel', 'stage', 'invoice_status', 'currency'];
  for (const f of fields) {
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

test('ui-field-help.js documents EXCHANGE_RATES (3 currencies)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  for (const cur of ['USD', 'SGD', 'RMB']) {
    assert.ok(src.includes(cur), 'expected currency ' + cur);
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
