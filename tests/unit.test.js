// Unit tests for app/core.js
// Run: node tests/unit.test.js
const assert = require('node:assert/strict');
const CRM = require('../app/core.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log('  ok', name);
    passed++;
  } catch (e) {
    console.log('  FAIL', name, '\n    ', e.message);
    failed++;
  }
}

console.log('state');
test('initial state is empty and unmodified', () => {
  assert.equal(CRM.state.opportunities.length, 0);
  assert.equal(CRM.state.fileName, '');
  assert.equal(CRM.state.modified, false);
  assert.equal(CRM.state.fileLoaded, false);
});
test('reset() clears state', () => {
  CRM.state.opportunities.push({ id: 'x' });
  CRM.state.modified = true;
  CRM.reset();
  assert.equal(CRM.state.opportunities.length, 0);
  assert.equal(CRM.state.modified, false);
});
test('makeOpportunity() returns object with id and defaults', () => {
  const opp = CRM.makeOpportunity();
  assert.ok(opp.id && opp.id.length > 0);
  assert.equal(opp.deleted, false);
  assert.equal(opp.team, '');
  assert.equal(opp.stage, 'ST1 线索(Leads)');
  assert.equal(opp.winRate, 0);
  assert.equal(opp.amount, 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
