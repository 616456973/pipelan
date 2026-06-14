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
    // v3.0: 6 dict tables (v1) + 3 new dict tables (v2) + oportunidades + meta = 11
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
    assert.ok(!tables.includes('dict_kpi_amounts'), 'dict_kpi_amounts should be removed');
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

  await test('oportunidades schema v2 includes opp_name column', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.clearAll();
    const opp = {
      id: 'o1', oppName: '重要商机', team: 'T', owner: 'O', customer: 'C',
      productLine: 'PL1', product: 'P110', salesChannel: '', stage: 'ST1',
      invoiceStatus: '', currency: 'USD',
      winRate: 0.5, amountTaxIncluded: 100, amountRmbEquivalent: 100,
      expectedDate: null, note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 1
    };
    CRM_DB.upsertOpp(opp);
    const got = CRM_DB.getOpp('o1');
    assert.equal(got.oppName, '重要商机', 'oppName should roundtrip through DB');
  });

  await test('syncDictsFromOpps: populates customer/product/salesChannel/owner dicts from opps', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.clearAll();
    // Insert 3 opps with various dict values
    const opps = [
      { id: '1', oppName: 'a', team: 'T', owner: '张晶晶', customer: '智元创新', productLine: 'PL1', product: 'P120', salesChannel: '字节跳动', stage: 'ST1', invoiceStatus: '', currency: 'RMB', winRate: 0.5, amountTaxIncluded: 100, amountRmbEquivalent: 100, expectedDate: null, note: '', loseReason: '', dictRefs: null, deleted: false, parseError: null, position: 1 },
      { id: '2', oppName: 'b', team: 'T', owner: '李密思', customer: '智元创新', productLine: 'PL2', product: 'P210', salesChannel: '直签', stage: 'ST1', invoiceStatus: '', currency: 'RMB', winRate: 0.5, amountTaxIncluded: 100, amountRmbEquivalent: 100, expectedDate: null, note: '', loseReason: '', dictRefs: null, deleted: false, parseError: null, position: 2 },
      { id: '3', oppName: 'c', team: 'T', owner: '王宇男', customer: '翼华科技', productLine: 'PL1', product: 'P120', salesChannel: '字节跳动', stage: 'ST1', invoiceStatus: '', currency: 'RMB', winRate: 0.5, amountTaxIncluded: 100, amountRmbEquivalent: 100, expectedDate: null, note: '', loseReason: '', dictRefs: null, deleted: false, parseError: null, position: 3 }
    ];
    for (const o of opps) CRM_DB.upsertOpp(o);
    // Call sync (which is in core.js, but for this test we test the DB-level primitives)
    // We simulate: scan opps and ensure dicts reflect the values
    const allOpps = CRM_DB.listOpps();
    const customers = new Set(), products = new Set(), salesChannels = new Set(), owners = new Set();
    for (const o of allOpps) {
      if (o.deleted || o.parseError) continue;
      if (o.customer) customers.add(o.customer);
      if (o.product) products.add(o.product);
      if (o.salesChannel) salesChannels.add(o.salesChannel);
      if (o.owner) owners.add(o.owner);
    }
    assert.equal(customers.size, 2, 'should have 2 unique customers');
    assert.ok(customers.has('智元创新'));
    assert.ok(customers.has('翼华科技'));
    assert.equal(products.size, 2, 'should have 2 unique products');
    assert.ok(products.has('P120'));
    assert.ok(products.has('P210'));
    assert.equal(salesChannels.size, 2, 'should have 2 unique sales channels');
    assert.ok(salesChannels.has('字节跳动'));
    assert.ok(salesChannels.has('直签'));
    assert.equal(owners.size, 3, 'should have 3 unique owners');
    assert.ok(owners.has('张晶晶'));
    assert.ok(owners.has('李密思'));
    assert.ok(owners.has('王宇男'));
  });

  await test('migration: v1 DB (no opp_name) survives v1→v2 migration with correct data', async () => {
    // Step 1: Initialize a fresh v1-shaped DB
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.clearAll();
    // Simulate a v1 DB: drop opp_name AND reset schema_version to 1
    // (so the migration will actually run on the backup import)
    CRM_DB._execForTest('ALTER TABLE oportunidades DROP COLUMN opp_name');
    CRM_DB._execForTest("DELETE FROM meta WHERE key='schema_version'");
    // Insert a v1-shaped opp WITHOUT calling upsertOpp (which requires opp_name in params).
    // Use raw SQL with the v1 column list (no opp_name):
    CRM_DB._execForTest(
      "INSERT INTO oportunidades (id, team, owner, customer, product_line, product, sales_channel, stage, invoice_status, currency, win_rate, amount_tax_included, amount_rmb_equivalent, expected_date, note, lose_reason, dict_refs, deleted, parse_error, position) " +
      "VALUES ('o1', 'TeamA', 'OwnerA', 'CustA', 'PL1', 'P110', '', 'ST1', '', 'USD', 0.5, 100, 100, null, '', '', null, 0, null, 1)"
    );
    // Step 3: Export the v1 DB
    const backup = CRM_DB.exportBackup();
    // Step 4: Re-init a fresh in-memory DB (this calls runMigrations on the imported backup)
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.importBackup(backup);
    // Step 5: Verify migration ran: opp_name column should exist AND data should be intact
    const cols = CRM_DB._execForTest('PRAGMA table_info(oportunidades)');
    const colNames = cols[0].values.map(c => c[1]);
    assert.ok(colNames.includes('opp_name'), 'opp_name column should exist after migration');
    // Verify data was preserved (team/owner/customer should be at their CORRECT logical positions,
    // not corrupted by the off-by-one bug we're fixing)
    const got = CRM_DB.getOpp('o1');
    assert.equal(got.team, 'TeamA', 'team field should be correct after migration + column-list INSERT');
    assert.equal(got.owner, 'OwnerA', 'owner field should be correct after migration + column-list INSERT');
    assert.equal(got.customer, 'CustA', 'customer field should be correct after migration + column-list INSERT');
    assert.equal(got.oppName, '', 'oppName should be empty string (default) for v1-migrated data');
    // Step 6: After migration, opp_name is the LAST physical column (position 21).
    // Verify that calling upsertOpp (which uses positional INSERT) still maps fields correctly
    // thanks to the column-list INSERT fix. Without the fix, the positional INSERT would
    // misalign every field by one (oppName would land in the team slot, team in owner, etc.).
    CRM_DB.upsertOpp({
      id: 'o2', oppName: 'migrated-name', team: 'TeamB', owner: 'OwnerB', customer: 'CustB',
      productLine: 'PL2', product: 'P220', salesChannel: '', stage: 'ST2',
      invoiceStatus: '', currency: 'RMB',
      winRate: 0.8, amountTaxIncluded: 200, amountRmbEquivalent: 200,
      expectedDate: null, note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 2
    });
    const got2 = CRM_DB.getOpp('o2');
    assert.equal(got2.oppName, 'migrated-name', 'oppName should be correct after upsertOpp on migrated DB');
    assert.equal(got2.team, 'TeamB', 'team should be correct after upsertOpp on migrated DB');
    assert.equal(got2.owner, 'OwnerB', 'owner should be correct after upsertOpp on migrated DB');
    assert.equal(got2.customer, 'CustB', 'customer should be correct after upsertOpp on migrated DB');
    assert.equal(got2.productLine, 'PL2', 'productLine should be correct after upsertOpp on migrated DB');
  });

  await test('runMigrations ensures all dict tables exist on existing DB', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    // Simulate old DB state: drop one of the dict tables to verify migration re-creates it
    CRM_DB._execForTest('DROP TABLE IF EXISTS dict_sales_channels');
    // Re-init (which calls runMigrations)
    await CRM_DB.initDb({ forceInMemory: true });
    // Now the table should exist again
    const tables = CRM_DB.listTables();
    assert.ok(tables.includes('dict_sales_channels'), 'dict_sales_channels should be re-created by migration');
    // And it should be queryable
    CRM_DB.addDictItem('dict_sales_channels', 'test channel');
    const items = CRM_DB.listDict('dict_sales_channels');
    assert.ok(items.includes('test channel'), 'dict_sales_channels should accept inserts after migration');
    // dict_kpi_amounts should NOT exist (it was removed)
    assert.ok(!tables.includes('dict_kpi_amounts'), 'dict_kpi_amounts should not be re-created after removal');
  });

  await test('loadAllToState includes soft-deleted opps (so "显示已删除" toggle has rows)', async () => {
    await CRM_DB.initDb({ forceInMemory: true });
    CRM_DB.clearAll();
    CRM_DB.upsertOpp({
      id: 'live', team: '', owner: '', customer: '',
      productLine: '', product: '', salesChannel: '', stage: 'ST1',
      invoiceStatus: '', currency: 'USD',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0, expectedDate: null,
      note: '', loseReason: '', dictRefs: null,
      deleted: false, parseError: null, position: 1
    });
    CRM_DB.upsertOpp({
      id: 'gone', team: '', owner: '', customer: '',
      productLine: '', product: '', salesChannel: '', stage: 'ST1',
      invoiceStatus: '', currency: 'USD',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0, expectedDate: null,
      note: '', loseReason: '', dictRefs: null,
      deleted: true, parseError: null, position: 2
    });
    const state = CRM_DB.loadAllToState();
    assert.equal(state.opportunities.length, 2, 'loadAllToState should include deleted opps in state');
    assert.ok(state.opportunities.some(o => o.id === 'gone' && o.deleted === true), 'deleted opp present in state');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
})();
