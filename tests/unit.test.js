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

console.log('buildXlsx');

test('buildXlsx returns a Uint8Array', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  const out = CRM.buildXlsx();
  assert.ok(out instanceof Uint8Array || Buffer.isBuffer(out));
  assert.ok(out.length > 1000, 'xlsx should be > 1KB');
});

test('buildXlsx roundtrip preserves opportunity fields', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  const out = CRM.buildXlsx();
  CRM.reset();
  CRM.parseXlsx(Buffer.from(out), { fileName: 'rt.xlsx' });
  const after = CRM.state.opportunities.filter(o => !o.parseError).slice(0, 5);
  CRM.reset();
  CRM.parseXlsx(buffer, { fileName: 'orig.xlsx' });
  const orig = CRM.state.opportunities.filter(o => !o.parseError).slice(0, 5);
  for (let i = 0; i < orig.length; i++) {
    assert.equal(orig[i].team, after[i].team, 'team ' + i);
    assert.equal(orig[i].oppName, after[i].oppName, 'oppName ' + i);
    assert.equal(orig[i].amount, after[i].amount, 'amount ' + i);
    assert.equal(orig[i].stage, after[i].stage, 'stage ' + i);
  }
});

test('buildXlsx excludes deleted opportunities from Sheet1', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  const beforeCount = CRM.state.opportunities.length;
  const writableCount = CRM.state.opportunities.filter(o => !o.parseError).length;
  CRM.state.opportunities[0].deleted = true;
  const out = CRM.buildXlsx();
  CRM.reset();
  CRM.parseXlsx(Buffer.from(out), { fileName: 'rt.xlsx' });
  assert.equal(CRM.state.opportunities.length, writableCount - 1, 'deleted excluded');
});

test('buildXlsx preserves dict values', () => {
  CRM.reset();
  const buffer = fs.readFileSync(FIXTURE);
  CRM.parseXlsx(buffer, { fileName: 'test-data.xlsx' });
  const teamsBefore = CRM.state.dicts.teams.slice();
  const out = CRM.buildXlsx();
  CRM.reset();
  CRM.parseXlsx(Buffer.from(out), { fileName: 'rt.xlsx' });
  assert.deepEqual(CRM.state.dicts.teams, teamsBefore);
});

console.log('validators');

test('validateOpportunity passes for complete record', () => {
  const opp = CRM.makeOpportunity({
    team: '基础业务', owner: '张经理', oppName: '商机1', customer: '客户1',
    productLine: 'PL1 企业云方案(Hyper Cloud)', product: 'P110 企业云基础产品',
    currency: 'RMB', stage: 'ST1 线索(Leads)', winRate: 0.5, amount: 1000, amountNet: 885
  });
  const errors = CRM.validateOpportunity(opp);
  assert.equal(errors.length, 0);
});

test('validateOpportunity catches all required missing', () => {
  const opp = CRM.makeOpportunity();
  const errors = CRM.validateOpportunity(opp);
  // makeOpportunity() defaults stage='ST1 线索(Leads)' (not empty),
  // so 7 of 8 required fields are missing: team, owner, oppName, customer, productLine, product, currency
  assert.ok(errors.length >= 7, 'expected many required-field errors, got ' + errors.length);
});

test('validateOpportunity rejects amount negative', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1', winRate: 0,
    amount: -1, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'amount'));
});

test('validateOpportunity rejects winRate out of range', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1',
    winRate: 1.5, amount: 0, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'winRate'));
});

test('validateOpportunity rejects amount > 1e15', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1',
    winRate: 0, amount: 1e16, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'amount'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
