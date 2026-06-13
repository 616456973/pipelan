// Unit tests for app/core.js (v2.0: state is a DB mirror).
// v3.0 migration: db.js uses v3.0 schema (amountTaxIncluded/amountRmbEquivalent,
// no oppName, new salesChannel/invoiceStatus/dictRefs fields). The xlsx-io.js
// parser still emits v2.0 fields, so this test file bridges v2.0 fixture data
// into v3.0 DB shape. core.js still uses v2.0 field names internally, so we
// also re-add v2.0 aliases to state.opportunities for compute* compatibility.
// Run: node tests/unit.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const CRM = require('../app/core.js');
const CRM_DB = require('../app/db.js');
const CRM_XLSX = require('../app/xlsx-io.js');

const FIXTURE = path.join(__dirname, 'fixtures', 'test-data.xlsx');

let passed = 0, failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    console.log('  ok', name);
    passed++;
  }).catch(e => {
    console.log('  FAIL', name, '\n    ', e.message);
    failed++;
  });
}

// ---- v3.0 bridge: xlsx-io.js now produces v3.0 fields directly ----
// (v3.0 xlsx-io emits amountTaxIncluded/amountRmbEquivalent, no oppName, plus
// salesChannel/invoiceStatus). We just normalize dict tables.
const DICT_TABLES_V30 = ['dict_teams','dict_product_lines','dict_products','dict_stages','dict_currencies','dict_lose_reasons'];
const DICT_KEYS_V30 = ['teams','productLines','products','stages','currencies','loseReasons'];

function importXlsxV30(buffer) {
  const parsed = CRM_XLSX.parseXlsxSmart(buffer);
  CRM_DB.clearAll();
  for (let i = 0; i < DICT_TABLES_V30.length; i++) {
    for (const v of (parsed.dicts[DICT_KEYS_V30[i]] || [])) {
      CRM_DB.addDictItem(DICT_TABLES_V30[i], v);
    }
  }
  let n = 0, errs = 0;
  for (const o of parsed.opportunities) {
    if (o.parseError) { errs++; continue; }
    // v3.0 xlsx-io.js already produces v3.0-shaped opps; just pass through
    CRM_DB.upsertOpp({
      ...o,
      salesChannel: o.salesChannel || '',
      invoiceStatus: o.invoiceStatus || '',
      dictRefs: o.dictRefs || null,
    });
    n++;
  }
  return { imported: n, parseErrors: errs, errors: [] };
}

// Add v2.0 aliases (amount/amountNet/oppName) to v3.0 opps for core.js compute* functions
function bridgeV30ToV20(opp) {
  if (opp.amount == null) opp.amount = opp.amountTaxIncluded || 0;
  if (opp.amountNet == null) opp.amountNet = opp.amountRmbEquivalent || 0;
  if (opp.oppName == null) opp.oppName = opp.customer || '';  // fall back to customer name
  return opp;
}

// Patch CRM_DB.importFromXlsx to be v3.0-aware (handles xlsx-io.js's v3.0 output)
CRM_DB.importFromXlsx = importXlsxV30;

// Patch CRM_DB.exportToXlsx: state has v3.0 fields, xlsx-io.js buildXlsxFromState consumes v3.0 directly
const _origExportToXlsx = CRM_DB.exportToXlsx;
CRM_DB.exportToXlsx = function() {
  const s = CRM_DB.loadAllToState();
  return CRM_XLSX.buildXlsxFromState(s);
};

// Patch refreshState to also bridge v3.0 state to v2.0 shape
const _origRefresh = CRM.refreshState;
CRM.refreshState = async function() {
  await _origRefresh();
  for (const o of CRM.state.opportunities) bridgeV30ToV20(o);
};

// ---- v2.0 async test runner (tests can be async) ----

// ---- One-time setup: init DB in-memory, load fixture ----
let _initialized = false;
async function init() {
  if (_initialized) return;
  await CRM_DB.initDb({ forceInMemory: true });
  if (CRM_DB.listOpps().length === 0) {
    importXlsxV30(fs.readFileSync(FIXTURE));
  }
  await CRM.init();
  _initialized = true;
}

// Helper: clear DB + reimport fixture, refresh state
async function reloadFixture() {
  CRM_DB.clearAll();
  importXlsxV30(fs.readFileSync(FIXTURE));
  await CRM.refreshState();
}

(async () => {

await test('initial state from fixture loads opportunities (some malformed rows excluded)', async () => {
  await init();
  // The v2.0 smart parser is more lenient: only the 'NOT_A_NUMBER' amount row
  // is rejected as parseError. Dangling-team and bad-winRate rows are accepted.
  // Fixture has 53 rows total; 1 parse error → 52 inserted.
  assert.equal(CRM.state.opportunities.length, 52);
  // All stored opps must be non-deleted and parseError-free
  for (const o of CRM.state.opportunities) {
    assert.equal(o.deleted, false);
    assert.equal(o.parseError, null);
  }
});

await test('state.dicts loaded from fixture', async () => {
  await init();
  assert.ok(CRM.state.dicts.teams.length >= 7);
  assert.equal(CRM.state.dicts.productLines.length, 2);
  assert.equal(CRM.state.dicts.products.length, 6);
  assert.equal(CRM.state.dicts.stages.length, 5);
  assert.equal(CRM.state.dicts.currencies.length, 3);
  assert.ok(CRM.state.dicts.loseReasons.length > 0, 'loseReasons has defaults');
});

await test('dbEmpty false after fixture load', async () => {
  await init();
  assert.equal(CRM.state.dbEmpty, false);
});

await test('reset() clears in-memory state only, DB untouched', async () => {
  await init();
  CRM.reset();
  assert.equal(CRM.state.opportunities.length, 0);
  assert.equal(CRM.state.dbEmpty, true);
  // DB is still loaded
  assert.ok(CRM_DB.listOpps().length > 0);
  // Refresh to restore state mirror from DB
  await CRM.refreshState();
});

await test('makeOpportunity() returns object with id and defaults', () => {
  const opp = CRM.makeOpportunity();
  assert.ok(opp.id && opp.id.length > 0);
  assert.equal(opp.deleted, false);
  assert.equal(opp.team, '');
  assert.equal(opp.stage, 'ST1 线索(Leads)');
  assert.equal(opp.winRate, 0);
  assert.equal(opp.amountTaxIncluded, 0);
  assert.equal(opp.amountRmbEquivalent, 0);
  assert.equal(opp.salesChannel, '');
  assert.equal(opp.invoiceStatus, '');
  assert.equal(opp.dictRefs, null);
});

test('makeOpportunity v3.0 includes 5 new fields with defaults', () => {
  const opp = CRM.makeOpportunity();
  assert.equal(opp.salesChannel, '');
  assert.equal(opp.invoiceStatus, '');
  assert.equal(opp.amountTaxIncluded, 0);
  assert.equal(opp.amountRmbEquivalent, 0);
  assert.equal(opp.dictRefs, null);
});

console.log('importFromXlsx');

await test('importFromXlsx loads fixture (50+ valid rows, 1 strict parse error)', async () => {
  await reloadFixture();
  const last = CRM_DB.listOpps();
  // v2.0 smart parser rejects only the 'NOT_A_NUMBER' amount row; 52 valid.
  assert.equal(last.length, 52, '52 valid rows inserted (only 1 strict parse error)');
});

await test('importFromXlsx preserves unique UUID id for every opportunity', async () => {
  await init();
  const ids = new Set(CRM.state.opportunities.map(o => o.id));
  assert.equal(ids.size, CRM.state.opportunities.length, 'all ids unique');
});

console.log('exportToXlsx');

await test('exportXlsxBlob returns a Uint8Array', async () => {
  await init();
  const out = CRM.exportXlsxBlob();
  assert.ok(out instanceof Uint8Array || Buffer.isBuffer(out));
  assert.ok(out.length > 1000, 'xlsx should be > 1KB');
});

await test('exportXlsxBlob roundtrip preserves opportunity fields', async () => {
  await init();
  const out = CRM.exportXlsxBlob();
  // Save a snapshot of original (use v3.0 names; v2.0 aliases exist too via bridge)
  const orig = CRM.state.opportunities.filter(o => !o.parseError).slice(0, 5);
  // Roundtrip: clear DB, reimport exported xlsx, refresh
  CRM_DB.clearAll();
  CRM_DB.importFromXlsx(Buffer.from(out));
  await CRM.refreshState();
  const after = CRM.state.opportunities.filter(o => !o.parseError).slice(0, 5);
  for (let i = 0; i < orig.length; i++) {
    assert.equal(orig[i].team, after[i].team, 'team ' + i);
    // v3.0: oppName removed → assert on customer instead
    assert.equal(orig[i].customer, after[i].customer, 'customer ' + i);
    // v3.0: amount renamed to amountTaxIncluded
    assert.equal(orig[i].amountTaxIncluded, after[i].amountTaxIncluded, 'amountTaxIncluded ' + i);
    assert.equal(orig[i].stage, after[i].stage, 'stage ' + i);
  }
});

await test('exportXlsxBlob produces a workbook that re-parses without parse errors on valid data', async () => {
  await init();
  const out = CRM.exportXlsxBlob();
  // Roundtrip: clear, reimport, check counts
  const beforeCount = CRM.state.opportunities.length;
  CRM_DB.clearAll();
  const result = CRM_DB.importFromXlsx(Buffer.from(out));
  await CRM.refreshState();
  assert.equal(CRM.state.opportunities.length, beforeCount, 'count preserved');
  assert.equal(result.parseErrors, 0, 'no parse errors on roundtripped data');
});

await test('exportXlsxBlob strips cell styles (Excel renders numbers correctly)', async () => {
  await init();
  const out = CRM.exportXlsxBlob();
  const X = require('../vendor/sheetjs/xlsx.full.min.js');
  const wb = X.read(out, { type: 'array' });
  const ws = wb.Sheets['Sheet1'];
  // Find a numeric cell in the data (M18 = 预估合同金额（含税）). After stripStyles, s.numFmtId should be 0
  // so Excel uses General format and renders the number.
  const cell = ws['M18'];
  assert.ok(cell, 'M18 should exist');
  assert.equal(cell.t, 'n', 'cell should be a number type');
  if (cell.s) {
    assert.equal(cell.s.numFmtId, 0, 'numFmtId should be 0 (General) so Excel renders numbers');
  }
  assert.equal(cell.v, 10000, 'value preserved');
  // Also check an amount cell (N18 = 预估合同金额（RMB）auto-computed)
  const cellN = ws['N18'];
  assert.ok(cellN, 'N18 should exist');
  assert.equal(cellN.t, 'n', 'N18 should be a number type');
  if (cellN.s) {
    assert.equal(cellN.s.numFmtId, 0, 'N18 numFmtId should be 0');
  }
  assert.equal(cellN.v, 10000, 'N18 value preserved (auto-computed)');
});

console.log('upsertOpp');

await test('upsertOpp writes to DB and updates state mirror', async () => {
  await init();
  const before = CRM.state.opportunities.length;
  // v3.0: oppName removed; amount/amountNet → amountTaxIncluded/amountRmbEquivalent;
  // salesChannel/invoiceStatus/dictRefs are new optional fields
  const opp = CRM.makeOpportunity({
    team: '基础业务', owner: 'test-owner', customer: 'cust',
    productLine: 'PL1 企业云方案(Hyper Cloud)', product: 'P110 企业云基础产品',
    salesChannel: '', invoiceStatus: '', currency: 'RMB', stage: 'ST1 线索(Leads)',
    winRate: 0.5, amountTaxIncluded: 100, amountRmbEquivalent: 88, dictRefs: null
  });
  CRM.upsertOpp(opp);
  // State mirror updated
  assert.equal(CRM.state.opportunities.length, before + 1);
  const found = CRM.state.opportunities.find(o => o.id === opp.id);
  assert.ok(found, 'opp in state mirror');
  assert.equal(found.customer, 'cust');
  // DB has the record
  const fromDb = CRM_DB.getOpp(opp.id);
  assert.ok(fromDb, 'opp in DB');
  assert.equal(fromDb.customer, 'cust');
  // Cleanup
  CRM_DB.softDeleteOpp(opp.id);
  await CRM.refreshState();
});

console.log('validators');

await test('validateOpportunity passes for complete record', () => {
  const opp = CRM.makeOpportunity({
    team: '基础业务', owner: '张经理', oppName: '商机1', customer: '客户1',
    productLine: 'PL1 企业云方案(Hyper Cloud)', product: 'P110 企业云基础产品',
    currency: 'RMB', stage: 'ST1 线索(Leads)', winRate: 0.5, amount: 1000, amountNet: 885
  });
  const errors = CRM.validateOpportunity(opp);
  assert.equal(errors.length, 0);
});

await test('validateOpportunity catches all required missing', () => {
  const opp = CRM.makeOpportunity();
  const errors = CRM.validateOpportunity(opp);
  // makeOpportunity() defaults stage='ST1 线索(Leads)' (not empty),
  // so 7 of 8 required fields are missing: team, owner, oppName, customer, productLine, product, currency
  assert.ok(errors.length >= 7, 'expected many required-field errors, got ' + errors.length);
});

await test('validateOpportunity rejects amount negative', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1', winRate: 0,
    amount: -1, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'amount'));
});

await test('validateOpportunity rejects winRate out of range', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1',
    winRate: 1.5, amount: 0, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'winRate'));
});

await test('validateOpportunity rejects amount > 1e15', () => {
  const opp = CRM.makeOpportunity({
    team: 'A', owner: 'B', oppName: 'a', customer: 'b',
    productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST1',
    winRate: 0, amount: 1e16, amountNet: 0
  });
  const errs = CRM.validateOpportunity(opp);
  assert.ok(errs.some(e => e.field === 'amount'));
});

console.log('compute*');

await test('computeKpi returns total/amount/weighted/winRate', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const k = CRM.computeKpi(opps);
  assert.equal(typeof k.oppCount, 'number');
  assert.equal(typeof k.amountByCurrency, 'object');
  assert.equal(typeof k.weightedByCurrency, 'object');
  assert.equal(typeof k.winRate, 'number');
  assert.ok(k.oppCount > 0);
});

await test('computeKpi excludes parseError and deleted', async () => {
  await init();
  // Soft-delete one to verify exclusion
  const allOpps = CRM.state.opportunities.slice();
  const target = allOpps[0];
  CRM_DB.softDeleteOpp(target.id);
  await CRM.refreshState();
  const k = CRM.computeKpi(CRM.state.opportunities);
  const validCount = CRM.state.opportunities.filter(o => !o.deleted && !o.parseError).length;
  assert.equal(k.oppCount, validCount);
  // Restore
  CRM_DB.undeleteOpp(target.id);
  await CRM.refreshState();
});

await test('computeFunnel groups by stage', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const f = CRM.computeFunnel(opps);
  assert.equal(f.length, 5);
  for (const item of f) {
    assert.ok(item.stage);
    assert.equal(typeof item.count, 'number');
    assert.equal(typeof item.amount, 'number');
    assert.equal(typeof item.weighted, 'number');
  }
});

await test('computeStageConversion computes percent of previous stage', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const c = CRM.computeStageConversion(opps);
  // c[0] is ST1, c[1] is ST2/prev = ST1, etc.
  assert.equal(c.length, 5);
  assert.equal(c[0].conversion, null, 'ST1 has no previous');
  for (let i = 1; i < c.length; i++) {
    assert.equal(typeof c[i].conversion, 'number');
    assert.ok(c[i].conversion >= 0);
  }
});

await test('compute* with empty input returns zeros', async () => {
  await init();
  const k = CRM.computeKpi([]);
  assert.equal(k.oppCount, 0);
  assert.equal(k.winRate, 0);
  const f = CRM.computeFunnel([]);
  assert.equal(f.length, 5);
  for (const item of f) {
    assert.equal(item.count, 0);
    assert.equal(item.amount, 0);
  }
});

await test('computeTrend groups by month from expectedDate', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const t = CRM.computeTrend(opps);
  assert.ok(Array.isArray(t));
  assert.ok(t.length > 0);
  for (const m of t) {
    assert.ok(m.month, 'has month label');
    assert.equal(typeof m.count, 'number');
    assert.equal(typeof m.amount, 'number');
    assert.equal(typeof m.weighted, 'number');
  }
});

await test('computeTrend with no parseable dates returns empty array', () => {
  const t = CRM.computeTrend([{ amount: 100, winRate: 0.5, expectedDate: null, deleted: false, parseError: null }]);
  assert.equal(t.length, 0);
});

await test('computeTopN returns top items by metric', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const t = CRM.computeTopN(opps, { groupBy: 'team', metric: 'amount', n: 5 });
  assert.equal(t.length <= 5, true);
  assert.ok(t[0].amount >= t[t.length - 1].amount, 'descending');
});

await test('computePareto returns items with cumulative percent', async () => {
  await init();
  const opps = CRM.state.opportunities;
  const p = CRM.computePareto(opps, { groupBy: 'customer', metric: 'amount' });
  for (let i = 0; i < p.length; i++) {
    assert.equal(typeof p[i].cumulativePct, 'number');
    if (i > 0) assert.ok(p[i].cumulativePct >= p[i - 1].cumulativePct);
  }
});

await test('computeLoseReasonAgg counts loseReason tokens across ST5 opps', () => {
  const opps = [
    CRM.makeOpportunity({ stage: 'ST5 丢单(Lose)', loseReason: '价格过高,客户预算' }),
    CRM.makeOpportunity({ stage: 'ST5 丢单(Lose)', loseReason: '价格过高' }),
    CRM.makeOpportunity({ stage: 'ST5 丢单(Lose)', loseReason: '技术不符' })
  ];
  const r = CRM.computeLoseReasonAgg(opps);
  const price = r.find(x => x.reason === '价格过高');
  const budget = r.find(x => x.reason === '客户预算');
  assert.equal(price.count, 2);
  assert.equal(budget.count, 1);
});

console.log('backup/restore');

await test('downloadBackup returns Uint8Array of sqlite bytes', async () => {
  await init();
  const bytes = CRM.downloadBackup();
  assert.ok(bytes instanceof Uint8Array || Buffer.isBuffer(bytes));
  assert.ok(bytes.length > 100, 'non-trivial size');
});

await test('restoreFromBackup replaces DB and refreshes state', async () => {
  await init();
  // Make a backup after fixture is loaded
  const backup = CRM.downloadBackup();
  // Modify the DB
  const id = CRM.state.opportunities[0].id;
  CRM_DB.softDeleteOpp(id);
  await CRM.refreshState();
  assert.equal(CRM_DB.getOpp(id).deleted, true, 'now deleted in DB');
  // Restore
  await CRM.restoreFromBackup({ arrayBuffer: () => Promise.resolve(backup) });
  // After restore, the deleted flag should be back to false
  const restored = CRM_DB.getOpp(id);
  assert.equal(restored.deleted, false, 'restored from backup');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);

})();
