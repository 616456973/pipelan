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

const path = require('node:path');
const fs = require('node:fs');

console.log('parseXlsx');
const FIXTURE = path.join(__dirname, 'fixtures', 'test-data.xlsx');

test('parseXlsx loads fixture and finds 50 valid + 3 malformed rows', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  const result = CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  assert.equal(result.opportunities.length, 53, 'expected 53 rows total');
  const valid = result.opportunities.filter(o => !o.parseError);
  const malformed = result.opportunities.filter(o => o.parseError);
  assert.equal(valid.length, 50, 'expected 50 valid rows');
  assert.equal(malformed.length, 3, 'expected 3 malformed rows');
});

test('parseXlsx loads dicts from Sheet2', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  assert.ok(CRM.state.dicts.teams.length >= 7);
  assert.equal(CRM.state.dicts.productLines.length, 2);
  assert.equal(CRM.state.dicts.products.length, 6);
  assert.equal(CRM.state.dicts.stages.length, 5);
  assert.equal(CRM.state.dicts.currencies.length, 3);
  assert.ok(CRM.state.dicts.loseReasons.length > 0, 'loseReasons has defaults');
});

test('parseXlsx marks state as loaded and unmodified', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'foo.xlsx' });
  assert.equal(CRM.state.fileLoaded, true);
  assert.equal(CRM.state.modified, false);
  assert.equal(CRM.state.fileName, 'foo.xlsx');
});

test('parseXlsx assigns unique UUID id to every opportunity', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  const ids = new Set(CRM.state.opportunities.map(o => o.id));
  assert.equal(ids.size, CRM.state.opportunities.length, 'all ids unique');
});

test('parseXlsx on empty buffer throws', () => {
  CRM.reset();
  assert.throws(() => CRM.parseXlsx(Buffer.alloc(0), { fileName: 'bad.xlsx' }));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
