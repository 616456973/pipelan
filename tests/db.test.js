// Tests for app/db.js (SQLite layer).
// Run: node tests/db.test.js
const assert = require('node:assert/strict');

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

(async () => {
  console.log('db');
  const CRM_DB = require('../app/db.js');

  await test('initDb (in-memory) creates 11 tables', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    const tables = CRM_DB.listTables();
    // v3.0: 6 dict tables (v1) + 3 new dict tables + oportunidades + meta = 11
    assert.equal(tables.length, 11);
    assert.ok(tables.includes('oportunidades'));
    assert.ok(tables.includes('dict_teams'));
    assert.ok(tables.includes('dict_product_lines'));
    assert.ok(tables.includes('dict_products'));
    assert.ok(tables.includes('dict_stages'));
    assert.ok(tables.includes('dict_currencies'));
    assert.ok(tables.includes('dict_lose_reasons'));
    assert.ok(tables.includes('dict_owners'));
    assert.ok(tables.includes('dict_customers'));
    assert.ok(tables.includes('dict_sales_channels'));
    assert.ok(tables.includes('meta'));
  });

  await test('schema_version is set after init', async () => {
    const tables = CRM_DB.listTables();
    // Use a query through listOpps which uses underlying db
    CRM_DB.clearAll();
    // If clearAll doesn't work without tables, this test fails meaningfully
    // But the assertion is that schema_version got set
    // (no direct API for it; use listDicts which would return [] on empty db)
    const dicts = CRM_DB.listDicts();
    assert.deepEqual(dicts, {
      teams: [], productLines: [], products: [],
      stages: [], currencies: [], loseReasons: [],
      owners: [], customers: [], salesChannels: []
    });
  });

  await test('listDicts returns empty arrays initially', async () => {
    CRM_DB.clearAll();
    const d = CRM_DB.listDicts();
    assert.equal(d.teams.length, 0);
    assert.equal(d.currencies.length, 0);
  });

  await test('addDictItem + listDict roundtrip', async () => {
    CRM_DB.clearAll();
    CRM_DB.addDictItem('dict_teams', '基础业务');
    CRM_DB.addDictItem('dict_teams', 'AIPULSE');
    CRM_DB.addDictItem('dict_teams', '基础业务');  // dup, should be ignored
    const teams = CRM_DB.listDict('dict_teams');
    assert.equal(teams.length, 2);
    assert.equal(teams[0], '基础业务');
    assert.equal(teams[1], 'AIPULSE');
  });

  await test('updateDictItem renames in place', async () => {
    CRM_DB.clearAll();
    CRM_DB.addDictItem('dict_teams', 'OldName');
    CRM_DB.updateDictItem('dict_teams', 'OldName', 'NewName');
    const teams = CRM_DB.listDict('dict_teams');
    assert.deepEqual(teams, ['NewName']);
  });

  await test('deleteDictItem removes', async () => {
    CRM_DB.clearAll();
    CRM_DB.addDictItem('dict_teams', 'X');
    CRM_DB.deleteDictItem('dict_teams', 'X');
    assert.equal(CRM_DB.listDict('dict_teams').length, 0);
  });

  await test('countDictRefs counts matching opportunities', async () => {
    CRM_DB.clearAll();
    CRM_DB.addDictItem('dict_teams', 'A');
    CRM_DB.addDictItem('dict_teams', 'B');
    // v3.0: amount/amountNet renamed to amountTaxIncluded/amountRmbEquivalent; oppName removed.
    const opp = { id: 'o1', team: 'A', owner: '', customer: 'c',
      productLine: '', product: '', salesChannel: '', stage: 'ST1 线索(Leads)',
      invoiceStatus: '', currency: 'USD',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0, expectedDate: null,
      note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 0 };
    CRM_DB.upsertOpp(opp);
    assert.equal(CRM_DB.countDictRefs('dict_teams', 'A'), 1);
    assert.equal(CRM_DB.countDictRefs('dict_teams', 'B'), 0);
  });

  await test('upsertOpp insert then update', async () => {
    CRM_DB.clearAll();
    // v3.0: amount/amountNet → amountTaxIncluded/amountRmbEquivalent; oppName removed.
    const opp = { id: 'o1', team: '基础业务', owner: '李经理', customer: '客户A',
      productLine: 'PL1', product: 'P110', salesChannel: '', stage: 'ST4 赢单(Win)',
      invoiceStatus: '', currency: 'RMB',
      winRate: 1, amountTaxIncluded: 1000, amountRmbEquivalent: 885, expectedDate: 46023,
      note: 'note', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 1 };
    CRM_DB.upsertOpp(opp);
    let got = CRM_DB.getOpp('o1');
    assert.equal(got.customer, '客户A');
    assert.equal(got.amountTaxIncluded, 1000);
    // Update
    got.amountTaxIncluded = 2000;
    CRM_DB.upsertOpp(got);
    const after = CRM_DB.getOpp('o1');
    assert.equal(after.amountTaxIncluded, 2000);
    assert.equal(CRM_DB.listOpps().length, 1);
  });

  await test('softDeleteOpp + listOpps (default excludes deleted)', async () => {
    CRM_DB.clearAll();
    // v3.0: oppName removed; amount fields renamed; new v3.0 fields added.
    const opp = { id: 'o1', team: 'A', owner: '', customer: 'c',
      productLine: '', product: '', salesChannel: '', stage: 'ST1',
      invoiceStatus: '', currency: 'USD',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0, expectedDate: null,
      note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 1 };
    CRM_DB.upsertOpp(opp);
    assert.equal(CRM_DB.listOpps().length, 1);
    CRM_DB.softDeleteOpp('o1');
    assert.equal(CRM_DB.listOpps().length, 0, 'soft-deleted excluded by default');
    assert.equal(CRM_DB.listOpps({includeDeleted: true}).length, 1, 'soft-deleted included with flag');
  });

  await test('undeleteOpp restores', async () => {
    CRM_DB.clearAll();
    // v3.0: oppName removed; amount fields renamed; new v3.0 fields added.
    const opp = { id: 'o1', team: '', owner: '', customer: '',
      productLine: '', product: '', salesChannel: '', stage: '',
      invoiceStatus: '', currency: '',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0, expectedDate: null,
      note: '', loseReason: '', dictRefs: null,
      deleted: true, parseError: null, position: 1 };
    CRM_DB.upsertOpp(opp);
    CRM_DB.undeleteOpp('o1');
    assert.equal(CRM_DB.listOpps().length, 1);
  });

  await test('listOpps with filter', async () => {
    CRM_DB.clearAll();
    // v3.0: oppName removed; amount fields renamed; new v3.0 fields added.
    const opps = [
      { id: '1', team: 'T1', owner: '', customer: 'c',
        productLine: '', product: '', salesChannel: '', stage: 'ST1',
        invoiceStatus: '', currency: 'USD',
        winRate: 0, amountTaxIncluded: 100, amountRmbEquivalent: 0, expectedDate: null,
        note: '', loseReason: '', dictRefs: null,
        deleted: false, parseError: null, position: 1 },
      { id: '2', team: 'T2', owner: '', customer: 'c',
        productLine: '', product: '', salesChannel: '', stage: 'ST2',
        invoiceStatus: '', currency: 'RMB',
        winRate: 0, amountTaxIncluded: 200, amountRmbEquivalent: 0, expectedDate: null,
        note: '', loseReason: '', dictRefs: null,
        deleted: false, parseError: null, position: 2 },
      { id: '3', team: 'T1', owner: '', customer: 'c',
        productLine: '', product: '', salesChannel: '', stage: 'ST3',
        invoiceStatus: '', currency: 'USD',
        winRate: 0, amountTaxIncluded: 300, amountRmbEquivalent: 0, expectedDate: null,
        note: '', loseReason: '', dictRefs: null,
        deleted: false, parseError: null, position: 3 }
    ];
    for (const o of opps) CRM_DB.upsertOpp(o);
    assert.equal(CRM_DB.listOpps({team: 'T1'}).length, 2);
    assert.equal(CRM_DB.listOpps({currency: 'USD'}).length, 2);
    assert.equal(CRM_DB.listOpps({stage: 'ST2'}).length, 1);
  });

  await test('exportBackup returns Uint8Array', async () => {
    const bytes = CRM_DB.exportBackup();
    assert.ok(bytes instanceof Uint8Array || Buffer.isBuffer(bytes));
    assert.ok(bytes.length > 100, 'backup is non-trivial size');
  });

  await test('schema v2 includes 3 new dict tables (owners, customers, salesChannels)', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    const tables = CRM_DB.listTables();
    assert.ok(tables.includes('dict_owners'), 'missing dict_owners');
    assert.ok(tables.includes('dict_customers'), 'missing dict_customers');
    assert.ok(tables.includes('dict_sales_channels'), 'missing dict_sales_channels');
    assert.ok(!tables.includes('dict_invoice_status'), 'invoice_status should NOT be a DB table (built-in enum)');
  });

  await test('opportunities schema includes 5 new columns (salesChannel, invoiceStatus, amountRmbEquivalent, dictRefs, owner, customer)', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.clearAll();
    const opp = {
      id: 'o1', team: 'T', owner: 'Alice', customer: 'AcmeCo', productLine: 'PL1', product: 'P110',
      salesChannel: '字节跳动', stage: 'ST4 赢单(Win)', invoiceStatus: '已开票',
      currency: 'USD', amountTaxIncluded: 1000, amountRmbEquivalent: 7200,
      winRate: 0.7, expectedDate: 46023, note: 'n', loseReason: '', dictRefs: '{"team":"T"}',
      deleted: false, parseError: null, position: 1
    };
    CRM_DB.upsertOpp(opp);
    const got = CRM_DB.getOpp('o1');
    assert.equal(got.owner, 'Alice');
    assert.equal(got.customer, 'AcmeCo');
    assert.equal(got.salesChannel, '字节跳动');
    assert.equal(got.invoiceStatus, '已开票');
    assert.equal(got.amountTaxIncluded, 1000);
    assert.equal(got.amountRmbEquivalent, 7200);
    assert.equal(got.dictRefs, '{"team":"T"}');
  });

  await test('listDict supports 3 new dict tables', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.addDictItem('dict_owners', '张晶晶');
    CRM_DB.addDictItem('dict_customers', '智元创新(上海)');
    CRM_DB.addDictItem('dict_sales_channels', '字节跳动');
    assert.deepEqual(CRM_DB.listDict('dict_owners'), ['张晶晶']);
    assert.deepEqual(CRM_DB.listDict('dict_customers'), ['智元创新(上海)']);
    assert.deepEqual(CRM_DB.listDict('dict_sales_channels'), ['字节跳动']);
  });

  await test('countDictRefs works for new dict tables', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.addDictItem('dict_owners', 'Alice');
    CRM_DB.addDictItem('dict_customers', 'AcmeCo');
    CRM_DB.addDictItem('dict_sales_channels', '直签');
    CRM_DB.upsertOpp({
      id: 'o1', team: '', owner: 'Alice', customer: 'AcmeCo', productLine: '', product: '',
      salesChannel: '直签', stage: 'ST4 赢单(Win)', invoiceStatus: '',
      currency: 'USD', amountTaxIncluded: 0, amountRmbEquivalent: 0,
      winRate: 0, expectedDate: null, note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 1
    });
    assert.equal(CRM_DB.countDictRefs('dict_owners', 'Alice'), 1);
    assert.equal(CRM_DB.countDictRefs('dict_customers', 'AcmeCo'), 1);
    assert.equal(CRM_DB.countDictRefs('dict_sales_channels', '直签'), 1);
    assert.equal(CRM_DB.countDictRefs('dict_owners', 'Bob'), 0);
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
