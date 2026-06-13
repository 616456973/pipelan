# RAS CRM v3.0 UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete UX redesign of RAS CRM: fix column-alias bugs (赢率 0%), add 4 new dicts + 5 new 商机 fields, redo UI styling, expand dashboard to 10 cards, expand analysis to 12 views, add 字段说明 page.

**Architecture:** Backwards-compatible — existing v2.0 users keep their data; new fields are added with defaults. SQL migrations are idempotent. UI uses incremental page-level refactors (each tab becomes its own concern).

**Tech Stack:** Same as v2.0 — sql.js (WASM) for DB, SheetJS for xlsx I/O, vanilla HTML+JS+CSS, IndexedDB for persistence. **Zero new dependencies.**

**Spec:** `D:\claude\docs\superpowers\specs\2026-06-13-v3-ux-redesign-design.md`

**Refinement over spec:**
- 发票状态 (5 enums) is hardcoded in `app/core.js` as `BUILTIN_INVOICE_STATUSES`, NOT a DB dict
- Exchange rates are hardcoded as `EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 }` (v3.1 will add a rates table)
- Customer (主责销售, 客户) are dicts, even though 客户名称 may have 50+ entries — performance acceptable for current dataset size

---

## File Structure (final v3.0 state)

```
D:\claude\RAS_CRM\
├── ras_crm.html              # MODIFIED: topbar tabs changed (remove 团队, add 字段说明)
├── README.md                 # MODIFIED: v3.0 docs
├── app\
│   ├── core.js               # MODIFIED: add BUILTIN_INVOICE_STATUSES + EXCHANGE_RATES, expand alias table
│   ├── db.js                 # MODIFIED: add 3 new dict tables, expand opportunities schema
│   ├── xlsx-io.js            # MODIFIED: add 5 new column aliases
│   ├── styles.css            # MODIFIED: full visual refresh (modern dashboard style)
│   ├── ui-notify.js          # UNCHANGED
│   ├── ui-save.js            # UNCHANGED
│   ├── ui-list.js            # MODIFIED: 12 columns, 7 filters, summary row
│   ├── ui-form.js            # MODIFIED: 15 fields with cascade, RMB auto-calc
│   ├── ui-dashboard.js       # MODIFIED: 5 → 10 cards + 2 charts
│   ├── ui-analysis.js        # MODIFIED: 8 → 12 views
│   ├── ui-dicts.js           # MODIFIED: 9 tabs (drop invoice_status, add 3 new)
│   ├── ui-field-help.js      # NEW: 字段↔字典 说明 page
│   └── vendor\
└── tests\
    ├── run-all.js            # MODIFIED: include new test files
    ├── unit.test.js          # MODIFIED: new tests for BUILTIN_INVOICE_STATUSES + EXCHANGE_RATES
    ├── db.test.js            # MODIFIED: new tests for 3 new dict tables + 5 new fields
    ├── xlsx-io.test.js       # MODIFIED: 5 new alias tests
    ├── compare.test.js       # UNCHANGED
    ├── field-help.test.js    # NEW: tests for 字段说明 page
    ├── manual-checklist.md   # MODIFIED: v3.0 checklist
    └── issues.md             # UNCHANGED
```

---

## Task 1: Extend core.js with BUILTIN_INVOICE_STATUSES + EXCHANGE_RATES + expanded aliases

**Files:**
- Modify: `D:\claude\RAS_CRM\app\core.js`

### Step 1: Add the constants

At the top of the IIFE in core.js (after the `// ---- State` comment block, before the `getDb` function), add:

```javascript
  // ---- v3.0 Built-in Enums (NOT in DB, hardcoded) ----
  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];

  // ---- v3.0 Exchange Rates to RMB (hardcoded, refresh in v3.1) ----
  const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };

  // Helper: convert amount to RMB equivalent
  function toRmb(amount, currency) {
    if (amount == null || isNaN(amount)) return 0;
    const rate = EXCHANGE_RATES_TO_RMB[currency] || 1.0;
    return amount * rate;
  }
```

### Step 2: Verify file parses

```bash
cd D:/claude/RAS_CRM
node -c app/core.js
```

Expected: no syntax error output.

### Step 3: Commit

```bash
cd D:/claude/RAS_CRM
git add app/core.js
git commit -m "feat(core): add BUILTIN_INVOICE_STATUSES + EXCHANGE_RATES_TO_RMB constants"
```

---

## Task 2: Add 3 new dict tables + 5 new opportunities columns to db.js (with migration)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\db.js`
- Modify: `D:\claude\RAS_CRM\tests\db.test.js`

### Step 1: Append failing tests

Append to `D:\claude\RAS_CRM\tests\db.test.js` (before the final summary):

```javascript
test('schema v2 includes 3 new dict tables', async () => {
  await CRM_DB.initDb({ forceInMemory: true });
  const tables = CRM_DB.listTables();
  assert.ok(tables.includes('dict_owners'));
  assert.ok(tables.includes('dict_customers'));
  assert.ok(tables.includes('dict_sales_channels'));
  assert.ok(!tables.includes('dict_invoice_status'), 'invoice_status is NOT a DB table (built-in enum)');
});

test('opportunities schema includes 5 new columns', async () => {
  await CRM_DB.initDb({ forceInMemory: true });
  CRM_DB.clearAll();
  const opp = {
    id: 'o1', team: 'T', owner: 'O', customer: 'C', productLine: 'PL', product: 'P',
    salesChannel: '字节跳动', stage: 'ST4 赢单(Win)', invoiceStatus: '已开票',
    currency: 'USD', amountTaxIncluded: 1000, amountRmbEquivalent: 7200,
    winRate: 0.5, expectedDate: 46023, note: 'n', dictRefs: '{"team":"T"}',
    deleted: false, parseError: null, position: 1
  };
  CRM_DB.upsertOpp(opp);
  const got = CRM_DB.getOpp('o1');
  assert.equal(got.owner, 'O');
  assert.equal(got.salesChannel, '字节跳动');
  assert.equal(got.invoiceStatus, '已开票');
  assert.equal(got.amountTaxIncluded, 1000);
  assert.equal(got.amountRmbEquivalent, 7200);
  assert.equal(got.dictRefs, '{"team":"T"}');
});

test('listDict supports 3 new dict tables', async () => {
  await CRM_DB.initDb({ forceInMemory: true });
  CRM_DB.addDictItem('dict_owners', '张晶晶');
  CRM_DB.addDictItem('dict_customers', '智元');
  CRM_DB.addDictItem('dict_sales_channels', '字节跳动');
  assert.deepEqual(CRM_DB.listDict('dict_owners'), ['张晶晶']);
  assert.deepEqual(CRM_DB.listDict('dict_customers'), ['智元']);
  assert.deepEqual(CRM_DB.listDict('dict_sales_channels'), ['字节跳动']);
});

test('countDictRefs works for 3 new dict tables', async () => {
  await CRM_DB.initDb({ forceInMemory: true });
  CRM_DB.addDictItem('dict_owners', 'Alice');
  CRM_DB.addDictItem('dict_customers', 'AcmeCo');
  CRM_DB.addDictItem('dict_sales_channels', '直签');
  CRM_DB.upsertOpp({
    id: 'o1', team: '', owner: 'Alice', customer: 'AcmeCo', productLine: '', product: '',
    salesChannel: '直签', stage: 'ST4 赢单(Win)', invoiceStatus: '',
    currency: 'USD', amountTaxIncluded: 0, amountRmbEquivalent: 0,
    winRate: 0, expectedDate: null, note: '', dictRefs: null,
    deleted: false, parseError: null, position: 1
  });
  assert.equal(CRM_DB.countDictRefs('dict_owners', 'Alice'), 1);
  assert.equal(CRM_DB.countDictRefs('dict_customers', 'AcmeCo'), 1);
  assert.equal(CRM_DB.countDictRefs('dict_sales_channels', '直签'), 1);
  assert.equal(CRM_DB.countDictRefs('dict_owners', 'Bob'), 0);
});
```

### Step 2: Run tests to verify they fail

```bash
cd D:/claude/RAS_CRM
node tests/db.test.js
```

Expected: 4 new tests FAIL (the dict tables don't exist yet).

### Step 3: Update db.js

In `D:\claude\RAS_CRM\app\db.js`:

1. **Expand `DICT_TABLES` array** to include the 3 new tables:

Replace:
```javascript
  const DICT_TABLES = ['dict_teams', 'dict_product_lines', 'dict_products', 'dict_stages', 'dict_currencies', 'dict_lose_reasons'];
```

With:
```javascript
  const DICT_TABLES = ['dict_teams', 'dict_product_lines', 'dict_products', 'dict_stages', 'dict_currencies', 'dict_lose_reasons', 'dict_owners', 'dict_customers', 'dict_sales_channels'];
```

2. **Expand `DICT_KEYS`** mapping:

Replace:
```javascript
  const DICT_KEYS = { dict_teams: 'teams', dict_product_lines: 'productLines', dict_products: 'products', dict_stages: 'stages', dict_currencies: 'currencies', dict_lose_reasons: 'loseReasons' };
```

With:
```javascript
  const DICT_KEYS = { dict_teams: 'teams', dict_product_lines: 'productLines', dict_products: 'products', dict_stages: 'stages', dict_currencies: 'currencies', dict_lose_reasons: 'loseReasons', dict_owners: 'owners', dict_customers: 'customers', dict_sales_channels: 'salesChannels' };
```

3. **Expand `DICT_TO_OPP`** mapping:

Replace:
```javascript
  const DICT_TO_OPP = { dict_teams: 'team', dict_product_lines: 'productLine', dict_products: 'product', dict_stages: 'stage', dict_currencies: 'currency' };
```

With:
```javascript
  const DICT_TO_OPP = { dict_teams: 'team', dict_product_lines: 'productLine', dict_products: 'product', dict_stages: 'stage', dict_currencies: 'currency', dict_owners: 'owner', dict_customers: 'customer', dict_sales_channels: 'salesChannel' };
```

4. **Update `applyV1Schema()` to add 3 new tables and 5 new columns**:

Replace the entire `applyV1Schema` function:

```javascript
  function applyV1Schema() {
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_teams (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_product_lines (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_products (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_stages (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_currencies (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_lose_reasons (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_owners (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_customers (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_sales_channels (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS oportunidades (
      id TEXT PRIMARY KEY,
      team TEXT, owner TEXT, customer TEXT,
      product_line TEXT, product TEXT, sales_channel TEXT,
      stage TEXT, invoice_status TEXT, currency TEXT,
      win_rate REAL, amount_tax_included REAL, amount_rmb_equivalent REAL,
      expected_date REAL, note TEXT, lose_reason TEXT,
      dict_refs TEXT,
      deleted INTEGER DEFAULT 0, parse_error TEXT, position INTEGER
    );`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_team ON oportunidades(team);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_customer ON oportunidades(customer);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_stage ON oportunidades(stage);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_deleted ON oportunidades(deleted);`);
  }
```

5. **Update `rowToOpp` to map new columns**:

Replace:
```javascript
  function rowToOpp(row) {
    return {
      id: row[0], team: row[1] || '', owner: row[2] || '',
      oppName: row[3] || '', customer: row[4] || '',
      productLine: row[5] || '', product: row[6] || '',
      currency: row[7] || '', stage: row[8] || '',
      winRate: row[9] == null ? 0 : row[9],
      amount: row[10] == null ? 0 : row[10],
      amountNet: row[11] == null ? 0 : row[11],
      expectedDate: row[12], note: row[13] || '', loseReason: row[14] || '',
      deleted: !!row[15], parseError: row[16] || null,
      position: row[17] || 0
    };
  }
```

With:
```javascript
  function rowToOpp(row) {
    return {
      id: row[0], team: row[1] || '', owner: row[2] || '',
      oppName: row[3] || '', customer: row[4] || '',
      productLine: row[5] || '', product: row[6] || '',
      salesChannel: row[7] || '', stage: row[8] || '',
      invoiceStatus: row[9] || '',
      currency: row[10] || '',
      winRate: row[11] == null ? 0 : row[11],
      amountTaxIncluded: row[12] == null ? 0 : row[12],
      amountRmbEquivalent: row[13] == null ? 0 : row[13],
      expectedDate: row[14], note: row[15] || '', loseReason: row[16] || '',
      dictRefs: row[17] || null,
      deleted: !!row[18], parseError: row[19] || null,
      position: row[20] || 0
    };
  }
```

6. **Update COLS constant**:

Replace:
```javascript
  const COLS = 'id, team, owner, opp_name, customer, product_line, product, currency, stage, win_rate, amount, amount_net, expected_date, note, lose_reason, deleted, parse_error, position';
```

With:
```javascript
  const COLS = 'id, team, owner, opp_name, customer, product_line, product, sales_channel, stage, invoice_status, currency, win_rate, amount_tax_included, amount_rmb_equivalent, expected_date, note, lose_reason, dict_refs, deleted, parse_error, position';
```

7. **Update `upsertOpp` to handle new column ordering**:

Replace:
```javascript
  function upsertOpp(opp) {
    const params = [
      opp.id, opp.team, opp.owner, opp.oppName, opp.customer,
      opp.productLine, opp.product, opp.currency, opp.stage,
      opp.winRate, opp.amount, opp.amountNet,
      opp.expectedDate, opp.note, opp.loseReason,
      opp.deleted ? 1 : 0, opp.parseError, opp.position || 0
    ];
    const placeholders = '?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?';
    db.run('INSERT OR REPLACE INTO oportunidades VALUES (' + placeholders + ')', params);
    scheduleSave();
  }
```

With:
```javascript
  function upsertOpp(opp) {
    const params = [
      opp.id, opp.team, opp.owner, opp.oppName, opp.customer,
      opp.productLine, opp.product, opp.salesChannel, opp.stage,
      opp.invoiceStatus, opp.currency,
      opp.winRate, opp.amountTaxIncluded, opp.amountRmbEquivalent,
      opp.expectedDate, opp.note, opp.loseReason, opp.dictRefs,
      opp.deleted ? 1 : 0, opp.parseError, opp.position || 0
    ];
    const placeholders = '?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?';
    db.run('INSERT OR REPLACE INTO oportunidades VALUES (' + placeholders + ')', params);
    scheduleSave();
  }
```

### Step 4: Run all tests to verify

```bash
cd D:/claude/RAS_CRM
node tests/db.test.js
node tests/unit.test.js
node tests/xlsx-io.test.js
```

Expected: all tests pass (db has 16 tests now, unit 29, xlsx-io 8).

### Step 5: Commit

```bash
cd D:/claude/RAS_CRM
git add app/db.js tests/db.test.js
git commit -m "feat(db): add 3 new dict tables + 5 new opportunities columns"
```

---

## Task 3: Expand xlsx-io column aliases (5 new aliases)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\xlsx-io.js`
- Modify: `D:\claude\RAS_CRM\tests\xlsx-io.test.js`

### Step 1: Append failing tests

Append to `D:\claude\RAS_CRM\tests\xlsx-io.test.js` (before the final summary):

```javascript
test('column alias: 赢单概率 → winRate (the v3.0 win-rate bug fix)', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '主责销售', '商机', '客户',
    '业务线', '业务线产品', '销售渠道', '阶段', '币种',
    '赢单概率', '预估合同金额(含税)', '预估合同金额(RMB)', '预计落单时间', '备注'];
  const rows = [[1, '渠道业务部', '张晶晶', '项目A', '客户A',
    'PL1', 'P120', '字节跳动', 'ST4:赢单(Win)', 'USD', 0.7, 1000, 7200, 46023, '已开票']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].winRate, 0.7, '赢单概率 should map to winRate');
  assert.equal(result.opportunities[0].owner, '张晶晶', '主责销售 should map to owner');
  assert.equal(result.opportunities[0].salesChannel, '字节跳动', '销售渠道 should map to salesChannel');
  assert.equal(result.opportunities[0].invoiceStatus, '已开票', '备注 should map to invoiceStatus');
  assert.equal(result.opportunities[0].amountTaxIncluded, 1000, '预估合同金额(含税) should map to amountTaxIncluded');
  assert.equal(result.opportunities[0].amountRmbEquivalent, 7200, '预估合同金额(RMB) should map to amountRmbEquivalent');
});

test('full-width colon ST4:赢单(Win) normalizes to ST4:赢单(Win)', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '负责人', '商机', '客户', '业务线', '产品', '币种', '阶段', '赢率', '金额', '时间', '备注'];
  const rows = [[1, 'T', 'O', 'N', 'C', 'PL', 'P', 'USD', 'ST4：赢单(Win)', 0.5, 100, 46023, '']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].stage, 'ST4:赢单(Win)', 'full-width colon should normalize to half-width');
});
```

### Step 2: Update COLUMN_ALIASES in xlsx-io.js

Replace the entire `COLUMN_ALIASES` constant:

```javascript
  const COLUMN_ALIASES = {
    team:           ['销售团队', '团队', 'Team'],
    owner:          ['主责销售', '负责人', '责任人', 'Sales Rep', 'Owner', '销售负责人'],
    customer:       ['客户名称', '客户', '客户公司', 'Customer'],
    productLine:    ['业务线', '产品线', '业务', 'Product Line'],
    product:        ['业务线产品', '业务/产品', '产品', 'Product'],
    salesChannel:   ['销售渠道', 'Sales Channel'],
    stage:          ['阶段', 'Stage'],
    invoiceStatus:  ['发票状态', '开票状态', '备注', 'Invoice Status'],
    currency:       ['币种', 'Currency'],
    amount:         ['预估合同金额（含税）', '预估合同金额(含税)', '含税金额', '合同金额', 'Amount'],
    amountRmb:      ['预估合同金额（RMB）', '预估合同金额(RMB)', '折算RMB金额', 'RMB金额'],
    winRate:        ['赢单概率', '赢率', 'Win Rate', '胜率'],
    expectedDate:   ['预计落单时间', '预计成交/丢单时间', '成交时间', 'Expected Date'],
    note:           ['自由备注', 'Internal Note', 'Notes']
  };
```

### Step 3: Add stage normalization (full-width → half-width colon)

In the `parseSheet1` function, find the line:
```javascript
        opp.stage       = String(row[colMap.stage] || '').trim() || 'ST1 线索(Leads)';
```

Replace with:
```javascript
        opp.stage       = String(row[colMap.stage] || '').trim().replace(/：/g, ':') || 'ST1 线索(Leads)';
```

### Step 4: Add invoiceStatus and salesChannel to parseSheet1 (since mapColumns now finds them)

In `parseSheet1`, find the block that sets `opp.team`, `opp.owner`, etc. Replace:
```javascript
        opp.team        = String(row[colMap.team] || '').trim();
        opp.owner       = String(row[colMap.owner] || '').trim();
        opp.oppName     = String(row[colMap.oppName] || '').trim();
        opp.customer    = String(row[colMap.customer] || '').trim();
        opp.productLine = String(row[colMap.productLine] || '').trim();
        opp.product     = String(row[colMap.product] || '').trim();
        opp.currency    = String(row[colMap.currency] || '').trim();
        opp.stage       = String(row[colMap.stage] || '').trim().replace(/：/g, ':') || 'ST1 线索(Leads)';
```

With:
```javascript
        opp.team           = String(row[colMap.team] || '').trim();
        opp.owner          = String(row[colMap.owner] || '').trim();
        opp.oppName        = String(row[colMap.oppName] || '').trim();
        opp.customer       = String(row[colMap.customer] || '').trim();
        opp.productLine    = String(row[colMap.productLine] || '').trim();
        opp.product        = String(row[colMap.product] || '').trim();
        opp.salesChannel   = String(row[colMap.salesChannel] || '').trim();
        opp.stage          = String(row[colMap.stage] || '').trim().replace(/：/g, ':') || 'ST1 线索(Leads)';
        opp.invoiceStatus  = String(row[colMap.invoiceStatus] || '').trim();
        opp.currency       = String(row[colMap.currency] || '').trim();
```

Also update the amount fields. Find:
```javascript
        const amt = toNumber(row[colMap.amount]);
        if (amt === null) throw new Error('amount 不是数字');
        opp.amount = amt;
        const an = toNumber(row[colMap.amountNet]);
        if (an === null) throw new Error('amountNet 不是数字');
        opp.amountNet = an;
```

Replace with:
```javascript
        const amt = toNumber(row[colMap.amount]);
        if (amt === null) throw new Error('amount 不是数字');
        opp.amountTaxIncluded = amt;
        if (colMap.amountRmb !== undefined) {
          const rmb = toNumber(row[colMap.amountRmb]);
          if (rmb === null) throw new Error('amountRmb 不是数字');
          opp.amountRmbEquivalent = rmb;
        } else {
          // auto-compute from amount × rate
          opp.amountRmbEquivalent = amt * (typeof EXCHANGE_RATES_TO_RMB !== 'undefined' ? (EXCHANGE_RATES_TO_RMB[opp.currency] || 1.0) : 1.0);
        }
```

And the winRate field. Find:
```javascript
        const wr = toNumber(row[colMap.winRate]);
        if (wr === null) throw new Error('winRate 不是数字');
        opp.winRate = wr;
```

Replace with:
```javascript
        const wr = toNumber(row[colMap.winRate]);
        if (wr === null) throw new Error('winRate 不是数字');
        opp.winRate = wr;
```

(No change needed here — but the test now covers 赢单概率 alias.)

Also add the expectedDate and note fields (they should already work via existing code; verify in tests).

### Step 5: Update `buildXlsxFromState` to emit new fields

In `D:\claude\RAS_CRM\app\xlsx-io.js`, find the `headers` array in `buildXlsxFromState`:

Replace:
```javascript
    const headers = [
      '#', '销售团队', '负责人', '商机名称', '客户名称',
      '业务线', '业务/产品', '币种', '阶段', '赢率',
      '含税金额', '不含税金额', '预计成交/丢单时间', '备注',
      '丢单原因'
    ];
```

With:
```javascript
    const headers = [
      '#', '销售团队', '主责销售', '商机名称', '客户名称',
      '业务线', '业务线产品', '销售渠道', '阶段', '发票状态',
      '币种', '赢单概率',
      '预估合同金额（含税）', '预估合同金额（RMB）', '预计落单时间',
      '自由备注', '丢单原因'
    ];
```

And update the row.push to include the new fields. Find:
```javascript
      sheet1Rows.push([
        n++, o.team, o.owner, o.oppName, o.customer,
        o.productLine, o.product, o.currency, o.stage, o.winRate,
        o.amount, o.amountNet, o.expectedDate === null ? '' : o.expectedDate, o.note,
        o.loseReason || ''
      ]);
```

Replace with:
```javascript
      sheet1Rows.push([
        n++, o.team, o.owner, o.oppName, o.customer,
        o.productLine, o.product, o.salesChannel || '', o.stage, o.invoiceStatus || '',
        o.currency, o.winRate,
        o.amountTaxIncluded, o.amountRmbEquivalent, o.expectedDate === null ? '' : o.expectedDate,
        o.note || '', o.loseReason || ''
      ]);
```

### Step 6: Run tests

```bash
cd D:/claude/RAS_CRM
node tests/xlsx-io.test.js
```

Expected: all 10 tests pass (8 existing + 2 new).

### Step 7: Commit

```bash
cd D:/claude/RAS_CRM
git add app/xlsx-io.js tests/xlsx-io.test.js
git commit -m "feat(xlsx-io): add 5 new column aliases + stage colon normalization + 15-col schema"
```

## Task 4: Update core.js for v3.0 fields + dict_refs + makeOpportunity defaults

**Files:**
- Modify: `D:\claude\RAS_CRM\app\core.js`

### Step 1: Update makeOpportunity factory

Find:
```javascript
  function makeOpportunity(partial) {
    return Object.assign({
      id: (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      team: '', owner: '', oppName: '', customer: '',
      productLine: '', product: '', currency: '',
      stage: 'ST1 线索(Leads)',
      winRate: 0, amount: 0, amountNet: 0,
      expectedDate: null, note: '', loseReason: '',
      deleted: false, parseError: null
    }, partial || {});
  }
```

Replace with:
```javascript
  function makeOpportunity(partial) {
    return Object.assign({
      id: (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      team: '', owner: '', oppName: '', customer: '',
      productLine: '', product: '', salesChannel: '',
      stage: 'ST1 线索(Leads)',
      invoiceStatus: '',
      currency: '',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0,
      expectedDate: null, note: '', loseReason: '',
      dictRefs: null,
      deleted: false, parseError: null, position: 0
    }, partial || {});
  }
```

### Step 2: Add a new test for makeOpportunity

Append to `D:\claude\RAS_CRM\tests\unit.test.js`:

```javascript
test('makeOpportunity v3 includes 5 new fields with defaults', () => {
  const opp = CRM.makeOpportunity();
  assert.equal(opp.salesChannel, '');
  assert.equal(opp.invoiceStatus, '');
  assert.equal(opp.amountTaxIncluded, 0);
  assert.equal(opp.amountRmbEquivalent, 0);
  assert.equal(opp.dictRefs, null);
});
```

### Step 3: Run tests

```bash
cd D:/claude/RAS_CRM
node tests/unit.test.js
```

Expected: 30 tests pass.

### Step 4: Commit

```bash
cd D:/claude/RAS_CRM
git add app/core.js tests/unit.test.js
git commit -m "feat(core): v3.0 makeOpportunity factory includes 5 new fields"
```

---

## Task 5: Visual refresh of styles.css (modern dashboard)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\styles.css`

### Step 1: Replace the entire styles.css

This is a complete visual refresh. The new design uses:
- System font stack with -apple-system first
- Card design with subtle shadows + hover effect
- Modern color palette: blue (#2563eb), indigo (#6366f1), green (#10b981), orange (#f59e0b)
- Generous spacing (8px grid)
- KPI cards with gradient top accent
- Tables with zebra striping

Write the new content:

```css
:root {
  --bg: #f6f8fb;
  --surface: #ffffff;
  --surface-2: #f9fafc;
  --border: #e3e8ef;
  --text: #1a2332;
  --text-2: #4a5568;
  --muted: #7a8699;
  --primary: #2563eb;
  --primary-light: #3b82f6;
  --accent: #6366f1;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --info: #06b6d4;
  --shadow: 0 1px 3px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.03);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04);
  --shadow-lg: 0 12px 24px rgba(15, 23, 42, 0.08), 0 4px 8px rgba(15, 23, 42, 0.04);
  --radius: 12px;
  --radius-sm: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Segoe UI", Roboto, Arial, sans-serif;
  line-height: 1.6;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}

/* === Topbar === */
.topbar {
  background: linear-gradient(135deg, #2563eb 0%, #6366f1 100%);
  color: #fff;
  padding: 14px 28px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: var(--shadow-md);
  position: sticky;
  top: 0;
  z-index: 100;
}
.topbar h1 { font-size: 19px; font-weight: 600; margin-right: 12px; letter-spacing: 0.3px; }
.tab {
  background: transparent;
  border: 0;
  color: rgba(255, 255, 255, 0.85);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  transition: all 0.15s;
}
.tab:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
.tab.active { background: rgba(255, 255, 255, 0.2); color: #fff; font-weight: 600; }
.topbar .spacer { flex: 1; }
.topbar .db-status {
  font-size: 12px;
  background: rgba(255, 255, 255, 0.15);
  padding: 5px 10px;
  border-radius: 12px;
  margin-right: 4px;
}
.topbar .db-status.empty { color: #fde68a; }
.topbar .db-status.loaded { color: #a7f3d0; }
.btn {
  background: #fff;
  color: var(--text);
  border: 1px solid var(--border);
  padding: 7px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
  transition: all 0.15s;
  font-weight: 500;
}
.btn:hover { background: var(--surface-2); border-color: #cbd5e0; transform: translateY(-1px); box-shadow: var(--shadow); }
.btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
.btn-primary:hover { background: #1d4ed8; }
.btn-danger { color: var(--danger); }

/* === Notification bar === */
.notify-bar {
  position: fixed;
  top: 70px; right: 20px;
  z-index: 200;
  display: flex; flex-direction: column;
  gap: 10px;
  max-width: 420px;
}
.notify {
  padding: 12px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  display: flex; align-items: center; gap: 10px;
  box-shadow: var(--shadow-lg);
  background: var(--surface);
  border-left: 4px solid var(--info);
  animation: notifySlide 0.3s ease-out;
}
@keyframes notifySlide {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.notify.info { border-left-color: var(--info); }
.notify.warn { border-left-color: var(--warning); }
.notify.error { border-left-color: var(--danger); }
.notify .close { background: none; border: 0; cursor: pointer; color: var(--muted); font-size: 16px; margin-left: auto; }

/* === Container === */
.container { max-width: 1400px; margin: 28px auto; padding: 0 28px 80px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow);
  margin-bottom: 20px;
  transition: box-shadow 0.2s;
}
.card:hover { box-shadow: var(--shadow-md); }
h2 { font-size: 20px; font-weight: 600; margin-bottom: 14px; color: var(--text); letter-spacing: 0.2px; }
h3 { font-size: 15px; font-weight: 600; margin: 14px 0 10px; color: var(--text-2); }
.muted { color: var(--muted); font-size: 13px; }

/* === Tables === */
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--border); }
th { background: var(--surface-2); font-weight: 600; color: var(--text-2); font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
tr:hover td { background: var(--surface-2); }
tr.row-error td { background: #fef2f2; color: #b91c1c; }
tr.row-deleted td { color: var(--muted); text-decoration: line-through; }
tfoot tr td { background: var(--surface-2); font-weight: 600; border-top: 2px solid var(--border); }

/* === Forms === */
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 900px) { .form-grid { grid-template-columns: 1fr; } }
.field label { display: block; font-size: 12px; color: var(--text-2); margin-bottom: 4px; font-weight: 500; }
.field .help { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; font-style: italic; }
.field input, .field select, .field textarea {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-family: inherit;
  background: #fff;
  transition: all 0.15s;
}
.field input:focus, .field select:focus, .field textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}
.field input.invalid, .field select.invalid { border-color: var(--danger); }
.field .err { color: var(--danger); font-size: 12px; margin-top: 2px; }

/* === KPI cards === */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 24px; }
.kpi {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
  transition: transform 0.15s, box-shadow 0.15s;
}
.kpi:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.kpi::before {
  content: "";
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  background: linear-gradient(90deg, var(--primary), var(--accent));
}
.kpi.k-green::before { background: linear-gradient(90deg, var(--success), #34d399); }
.kpi.k-orange::before { background: linear-gradient(90deg, var(--warning), #fbbf24); }
.kpi.k-purple::before { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
.kpi.k-cyan::before { background: linear-gradient(90deg, var(--info), #22d3ee); }
.kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; font-weight: 600; }
.kpi .value { font-size: 24px; font-weight: 700; margin: 4px 0; color: var(--text); }
.kpi .sub { font-size: 12px; color: var(--text-2); margin-top: 4px; }

/* === Funnel === */
.funnel { display: flex; flex-direction: column; gap: 6px; }
.funnel .stage {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(90deg, var(--primary), var(--accent));
  color: #fff;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  transition: transform 0.15s;
}
.funnel .stage:hover { transform: translateX(4px); }
.funnel .stage .name { flex: 1; }
.funnel .stage .meta { font-size: 12px; opacity: 0.92; }

/* === Filters === */
.filters {
  display: flex; flex-wrap: wrap; gap: 10px;
  align-items: center;
  padding: 14px 16px;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  margin-bottom: 16px;
  font-size: 13px;
  border: 1px solid var(--border);
}
.filters label { display: flex; align-items: center; gap: 4px; color: var(--text-2); font-size: 12px; }
.filters select, .filters input { padding: 5px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; background: #fff; }
.filters input { min-width: 180px; }
.filters .clear { color: var(--danger); font-size: 12px; cursor: pointer; padding: 4px 8px; }
```

### Step 2: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | head -30
```

Expected: topbar with new styling visible in DOM.

### Step 3: Commit

```bash
cd D:/claude/RAS_CRM
git add app/styles.css
git commit -m "feat(ui): v3.0 visual refresh - modern dashboard style (cards, gradients, typography)"
```

---

## Task 6: Update topbar (remove 团队 tab, add 字段说明 tab)

**Files:**
- Modify: `D:\claude\RAS_CRM\ras_crm.html`

### Step 1: Replace the topbar tabs

Find the existing topbar:
```html
  <div class="topbar">
    <h1>RAS CRM</h1>
    <button class="tab active" data-tab="dashboard">仪表盘</button>
    <button class="tab" data-tab="list">商机</button>
    <button class="tab" data-tab="form">新增</button>
    <button class="tab" data-tab="analysis">分析</button>
    <button class="tab" data-tab="dicts">字典</button>
    <span class="spacer"></span>
    <span class="db-status" id="db-status">●</span>
    <button class="btn" id="import-btn">📥 导入</button>
    <button class="btn" id="export-btn">📤 导出</button>
    <button class="btn" id="backup-btn">💾 备份</button>
    <button class="btn" id="restore-btn">📂 恢复</button>
  </div>
```

Replace with:
```html
  <div class="topbar">
    <h1>RAS CRM</h1>
    <button class="tab active" data-tab="dashboard">仪表盘</button>
    <button class="tab" data-tab="list">商机</button>
    <button class="tab" data-tab="form">新增</button>
    <button class="tab" data-tab="analysis">分析</button>
    <button class="tab" data-tab="dicts">字典</button>
    <button class="tab" data-tab="fieldhelp">字段说明</button>
    <span class="spacer"></span>
    <span class="db-status" id="db-status">●</span>
    <button class="btn" id="import-btn">📥 导入</button>
    <button class="btn" id="export-btn">📤 导出</button>
    <button class="btn" id="backup-btn">💾 备份</button>
    <button class="btn" id="restore-btn">📂 恢复</button>
  </div>
```

### Step 2: Update inline script tab handler to call renderFieldHelp

Find the inline tab click handler in the script section:
```javascript
    document.querySelectorAll('.tab').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        if (typeof window['render' + tab[0].toUpperCase() + tab.slice(1)] === 'function') {
          window['render' + tab[0].toUpperCase() + tab.slice(1)]();
        }
      };
    });
```

(No change — the handler already calls `renderTab` dynamically. As long as `renderFieldHelp()` is exposed on `window`, the new tab will work. Task 9 creates that function.)

### Step 3: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "字段说明|仪表盘|商机|新增|分析|字典" | head -10
```

Expected: 6 tabs visible, including "字段说明".

### Step 4: Commit

```bash
cd D:/claude/RAS_CRM
git add ras_crm.html
git commit -m "feat(ui): v3.0 topbar - remove 团队 tab, add 字段说明 tab"
```

---

## Task 7: Implement ui-field-help.js (字段↔字典 说明 page)

**Files:**
- Create: `D:\claude\RAS_CRM\app\ui-field-help.js`

### Step 1: Create the file

Write to `D:\claude\RAS_CRM\app\ui-field-help.js`:
```javascript
// 字段说明 — shows 商机↔字典 映射关系 (v3.0 transparency feature)
(function (global) {
  'use strict';

  const FIELD_BINDINGS = [
    { field: 'team',           type: '下拉单选', dict: 'dict_teams',          desc: '销售团队' },
    { field: 'owner',          type: '下拉单选', dict: 'dict_owners',         desc: '主责销售' },
    { field: 'customer',       type: '下拉单选', dict: 'dict_customers',      desc: '客户名称' },
    { field: 'product_line',   type: '下拉单选', dict: 'dict_product_lines',  desc: '业务线' },
    { field: 'product',        type: '下拉单选', dict: 'dict_products',       desc: '业务/产品' },
    { field: 'sales_channel',  type: '下拉单选', dict: 'dict_sales_channels', desc: '销售渠道' },
    { field: 'stage',          type: '下拉单选', dict: 'dict_stages',         desc: '阶段' },
    { field: 'invoice_status', type: '下拉单选', dict: '(内置枚举)',           desc: '发票状态 (5 个固定值, 不可编辑)' },
    { field: 'currency',       type: '下拉单选', dict: 'dict_currencies',      desc: '币种' },
    { field: 'amount_tax_included',  type: '数字', dict: '(无)',  desc: '含税金额 (从 xlsx M 列读入)' },
    { field: 'amount_rmb_equivalent', type: '数字 (自动算)', dict: '(无)',  desc: '折算 RMB = 含税金额 × EXCHANGE_RATES_TO_RMB[currency]' },
    { field: 'win_rate',       type: '数字 (0-1)', dict: '(无)',  desc: '赢单概率' },
    { field: 'expected_date',  type: 'Excel 序列号', dict: '(无)',  desc: '预计落单时间' },
    { field: 'note',           type: '自由文本', dict: '(无)',  desc: '内部备注' },
    { field: 'lose_reason',    type: '逗号分隔多值', dict: '(无)',  desc: '丢单原因 (例: "价格过高,竞品优势")' }
  ];

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };

  function renderFieldHelp() {
    const content = document.getElementById('content');
    const rows = FIELD_BINDINGS.map(b => {
      const isBuiltin = b.dict.startsWith('(');
      return `<tr>
        <td><code>${b.field}</code></td>
        <td>${b.type}</td>
        <td>${isBuiltin ? `<span class="muted">${b.dict}</span>` : `<code>${b.dict}</code>`}</td>
        <td>${b.desc}</td>
      </tr>`;
    }).join('');

    const rateRows = Object.entries(EXCHANGE_RATES_TO_RMB)
      .map(([cur, rate]) => `<tr><td><code>${cur}</code></td><td>${rate}</td></tr>`).join('');

    const invoiceChips = BUILTIN_INVOICE_STATUSES
      .map(s => `<span class="chip">${s}</span>`).join('');

    content.innerHTML = `
      <h2>字段说明 — 商机 ↔ 字典 映射</h2>
      <div class="card">
        <p class="muted">每条商机包含 15 个业务字段。其中 9 个字段的值来自数据库字典 (下拉单选), 1 个字段是内置枚举 (不可编辑), 其余 5 个是自由值。</p>
        <table>
          <thead><tr><th>商机字段</th><th>类型</th><th>字典</th><th>说明</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card">
        <h3>内置枚举: 发票状态</h3>
        <p class="muted">这 5 个值写死在代码里, 不在字典管理 UI 里, 不能编辑。修改这些值需要改 <code>app/core.js</code> 里的 <code>BUILTIN_INVOICE_STATUSES</code> 常量。</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
          ${invoiceChips}
        </div>
      </div>

      <div class="card">
        <h3>汇率表 (折算 RMB 用)</h3>
        <p class="muted">v3.0 硬编码汇率。下次刷新前 (v3.1) 会改成数据库表 + UI 维护。</p>
        <table style="max-width: 320px;">
          <thead><tr><th>币种</th><th>汇率 (→ RMB)</th></tr></thead>
          <tbody>${rateRows}</tbody>
        </table>
        <p class="muted" style="margin-top: 12px;">公式: <code>折算 RMB = 含税金额 × 汇率</code></p>
      </div>

      <div class="card">
        <h3>如何修改字典?</h3>
        <p>1. 点击顶栏"字典" tab</p>
        <p>2. 选要改的字典 (团队 / 主责销售 / 客户名称 / 业务线 / 业务·产品 / 销售渠道 / 阶段 / 币种 / 丢单原因)</p>
        <p>3. 加/改/删条目。删除时如果该字典值被商机引用, 会弹引用计数对话框, 确认后商机字段值改为"未分类"。</p>
      </div>
    `;
  }

  global.renderFieldHelp = renderFieldHelp;
})(window);
```

### Step 2: Add CSS for chips

Append to `D:\claude\RAS_CRM\app\styles.css`:

```css
.chip {
  display: inline-block;
  padding: 4px 12px;
  background: var(--primary);
  color: #fff;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
}
code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text);
}
```

### Step 3: Wire ui-field-help.js into ras_crm.html

Add `<script src="app/ui-field-help.js"></script>` after `ui-dicts.js`:

Find the script tag block:
```html
    <script src="app/core.js"></script>
    <script src="app/ui-notify.js"></script>
    <script src="app/ui-list.js"></script>
    <script src="app/ui-form.js"></script>
    <script src="app/ui-dicts.js"></script>
    <script src="app/ui-dashboard.js"></script>
    <script src="app/ui-analysis.js"></script>
    <script src="app/ui-save.js"></script>
```

Replace with:
```html
    <script src="app/core.js"></script>
    <script src="app/ui-notify.js"></script>
    <script src="app/ui-list.js"></script>
    <script src="app/ui-form.js"></script>
    <script src="app/ui-dicts.js"></script>
    <script src="app/ui-dashboard.js"></script>
    <script src="app/ui-analysis.js"></script>
    <script src="app/ui-save.js"></script>
    <script src="app/ui-field-help.js"></script>
```

### Step 4: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "字段说明|chip|内置" | head -10
```

Then manually inject to click the tab:
```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom "data:text/html,<script>location.href='file:///D:/claude/RAS_CRM/ras_crm.html'</script>" 2>&1 | head -20
```

(Or use the open-tab JS in the test fixture.)

### Step 5: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-field-help.js app/styles.css ras_crm.html
git commit -m "feat(ui): v3.0 field-help page - 商机↔字典 transparency + builtin enums + rates"
```

## Task 8: Update ui-list.js (12 columns, 7 filters, summary row)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\ui-list.js`

### Step 1: Update filterState and uniqueValues fields

In `D:\claude\RAS_CRM\app\ui-list.js`, find:
```javascript
  const filterState = {
    teams: [], productLines: [], products: [], stages: [], currencies: [],
    search: '',
    showDeleted: false
  };
```

Replace with:
```javascript
  const filterState = {
    teams: [], customers: [], owners: [], stages: [], currencies: [], invoiceStatuses: [],
    search: '',
    showDeleted: false
  };
```

### Step 2: Update renderFilters function

Find:
```javascript
  function renderFilters() {
    const teams = uniqueValues('team');
    const pls = uniqueValues('productLine');
    const prods = uniqueValues('product');
    const stages = uniqueValues('stage');
    const currs = uniqueValues('currency');
    return `
      <div class="filters">
        <label>团队 <select multiple size="1" id="f-team">${teams.map(t => `<option value="${t}" ${filterState.teams.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>产品线 <select multiple size="1" id="f-pl">${pls.map(t => `<option value="${t}" ${filterState.productLines.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>产品 <select multiple size="1" id="f-prod">${prods.map(t => `<option value="${t}" ${filterState.products.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>阶段 <select multiple size="1" id="f-stage">${stages.map(t => `<option value="${t}" ${filterState.stages.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>币种 <select multiple size="1" id="f-cur">${currs.map(t => `<option value="${t}" ${filterState.currencies.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>搜索 <input id="f-search" value="${filterState.search}" placeholder="商机/客户"></label>
        <label><input type="checkbox" id="f-del" ${filterState.showDeleted ? 'checked' : ''}> 显示已删除</label>
        <button class="btn" id="f-clear">清空</button>
      </div>
    `;
  }
```

Replace with:
```javascript
  function renderFilters() {
    const teams = uniqueValues('team');
    const customers = uniqueValues('customer');
    const owners = uniqueValues('owner');
    const stages = uniqueValues('stage');
    const currs = uniqueValues('currency');
    const invs = uniqueValues('invoiceStatus');
    return `
      <div class="filters">
        <label>团队 <select multiple size="1" id="f-team">${teams.map(t => `<option value="${t}" ${filterState.teams.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>客户 <select multiple size="1" id="f-customer">${customers.map(t => `<option value="${t}" ${filterState.customers.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>负责人 <select multiple size="1" id="f-owner">${owners.map(t => `<option value="${t}" ${filterState.owners.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>阶段 <select multiple size="1" id="f-stage">${stages.map(t => `<option value="${t}" ${filterState.stages.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>币种 <select multiple size="1" id="f-cur">${currs.map(t => `<option value="${t}" ${filterState.currencies.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>发票状态 <select multiple size="1" id="f-inv">${invs.map(t => `<option value="${t}" ${filterState.invoiceStatuses.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>搜索 <input id="f-search" value="${filterState.search}" placeholder="商机/客户"></label>
        <label><input type="checkbox" id="f-del" ${filterState.showDeleted ? 'checked' : ''}> 显示已删除</label>
        <button class="btn" id="f-clear">清空</button>
      </div>
    `;
  }
```

### Step 3: Update applyFilters

Find:
```javascript
  function applyFilters(opps) {
    return opps.filter(o => {
      if (!filterState.showDeleted && o.deleted) return false;
      if (filterState.showDeleted && !o.deleted) return false;
      if (filterState.teams.length && !filterState.teams.includes(o.team)) return false;
      if (filterState.productLines.length && !filterState.productLines.includes(o.productLine)) return false;
      if (filterState.products.length && !filterState.products.includes(o.product)) return false;
      if (filterState.stages.length && !filterState.stages.includes(o.stage)) return false;
      if (filterState.currencies.length && !filterState.currencies.includes(o.currency)) return false;
      if (filterState.search) {
        const s = filterState.search.toLowerCase();
        if (!o.oppName.toLowerCase().includes(s) && !o.customer.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }
```

Replace with:
```javascript
  function applyFilters(opps) {
    return opps.filter(o => {
      if (!filterState.showDeleted && o.deleted) return false;
      if (filterState.showDeleted && !o.deleted) return false;
      if (filterState.teams.length && !filterState.teams.includes(o.team)) return false;
      if (filterState.customers.length && !filterState.customers.includes(o.customer)) return false;
      if (filterState.owners.length && !filterState.owners.includes(o.owner)) return false;
      if (filterState.stages.length && !filterState.stages.includes(o.stage)) return false;
      if (filterState.currencies.length && !filterState.currencies.includes(o.currency)) return false;
      if (filterState.invoiceStatuses.length && !filterState.invoiceStatuses.includes(o.invoiceStatus)) return false;
      if (filterState.search) {
        const s = filterState.search.toLowerCase();
        if (!o.oppName.toLowerCase().includes(s) && !o.customer.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }
```

### Step 4: Update rowHtml to display 12 columns

Find:
```javascript
  function rowHtml(o, idx) {
    const cls = o.parseError ? 'row-error' : (o.deleted ? 'row-deleted' : '');
    const errTitle = o.parseError ? `title="行 ${o.parseError.row}: ${o.parseError.message}"` : '';
    return `
      <tr class="${cls}" ${errTitle}>
        <td>${idx + 1}</td>
        <td>${o.team || ''}</td>
        <td>${o.owner || ''}</td>
        <td>${o.oppName || ''}</td>
        <td>${o.customer || ''}</td>
        <td>${o.productLine || ''}</td>
        <td>${o.product || ''}</td>
        <td>${o.stage || ''}</td>
        <td>${o.amount || 0}</td>
        <td>${(o.winRate * 100).toFixed(0)}%</td>
        <td>${o.deleted ? '已删除' : `<button class="btn btn-danger" onclick="deleteOpp('${o.id}')">删除</button>`}</td>
      </tr>
    `;
  }
```

Replace with:
```javascript
  function rowHtml(o, idx) {
    const cls = o.parseError ? 'row-error' : (o.deleted ? 'row-deleted' : '');
    const errTitle = o.parseError ? `title="行 ${o.parseError.row}: ${o.parseError.message}"` : '';
    return `
      <tr class="${cls}" ${errTitle}>
        <td>${idx + 1}</td>
        <td>${o.team || ''}</td>
        <td>${o.owner || ''}</td>
        <td>${o.oppName || ''}</td>
        <td>${o.customer || ''}</td>
        <td>${o.product || ''}</td>
        <td>${o.stage || ''}</td>
        <td>${o.invoiceStatus || ''}</td>
        <td>${(o.amountTaxIncluded || 0).toLocaleString()}</td>
        <td>${(o.amountRmbEquivalent || 0).toLocaleString()}</td>
        <td>${(o.winRate * 100).toFixed(0)}%</td>
        <td>${o.deleted ? '已删除' : `<button class="btn btn-danger" onclick="deleteOpp('${o.id}')">删除</button>`}</td>
      </tr>
    `;
  }
```

### Step 5: Update renderList to add summary row and new column count

Find:
```javascript
  function renderList() {
    const content = document.getElementById('content');
    const filtered = applyFilters(CRM.state.opportunities);
    content.innerHTML = `
      <h2>商机列表 (${filtered.length} / ${CRM.state.opportunities.length})</h2>
      ${renderFilters()}
      <div class="card">
        <table>
          <thead><tr><th>#</th><th>团队</th><th>负责人</th><th>商机</th><th>客户</th><th>产品线</th><th>产品</th><th>阶段</th><th>金额</th><th>赢率</th><th>操作</th></tr></thead>
          <tbody>${filtered.map((o, i) => rowHtml(o, i)).join('')}</tbody>
        </table>
      </div>
    `;
    attachFilterHandlers();
  }
```

Replace with:
```javascript
  function renderList() {
    const content = document.getElementById('content');
    const filtered = applyFilters(CRM.state.opportunities);
    const summary = computeSummary(filtered);
    content.innerHTML = `
      <h2>商机列表 (${filtered.length} / ${CRM.state.opportunities.length})</h2>
      ${renderFilters()}
      <div class="card">
        <table>
          <thead><tr><th>#</th><th>团队</th><th>负责人</th><th>商机</th><th>客户</th><th>产品</th><th>阶段</th><th>发票状态</th><th>含税金额</th><th>折算RMB</th><th>赢率</th><th>操作</th></tr></thead>
          <tbody>${filtered.map((o, i) => rowHtml(o, i)).join('')}</tbody>
          <tfoot>
            <tr>
              <td colspan="8"><b>合计 (${filtered.length} 条)</b></td>
              <td>${summary.totalTax.toLocaleString()}</td>
              <td>${summary.totalRmb.toLocaleString()}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    attachFilterHandlers();
  }

  function computeSummary(filtered) {
    let totalTax = 0, totalRmb = 0;
    const byCurrency = {};
    for (const o of filtered) {
      totalTax += (o.amountTaxIncluded || 0);
      totalRmb += (o.amountRmbEquivalent || 0);
      byCurrency[o.currency] = (byCurrency[o.currency] || 0) + (o.amountTaxIncluded || 0);
    }
    return { totalTax, totalRmb, byCurrency };
  }
```

### Step 6: Update attachFilterHandlers ID mapping

Find:
```javascript
  function attachFilterHandlers() {
    const ids = { team: 'teams', pl: 'productLines', prod: 'products', stage: 'stages', cur: 'currencies' };
    for (const [elId, key] of Object.entries(ids)) {
      const el = document.getElementById('f-' + elId);
      if (!el) continue;
      el.onchange = () => {
        filterState[key] = Array.from(el.selectedOptions).map(o => o.value);
        renderList();
      };
    }
    document.getElementById('f-search').oninput = (e) => {
      filterState.search = e.target.value;
      renderList();
    };
    document.getElementById('f-del').onchange = (e) => {
      filterState.showDeleted = e.target.checked;
      renderList();
    };
    document.getElementById('f-clear').onclick = () => {
      for (const k of Object.keys(filterState)) {
        if (Array.isArray(filterState[k])) filterState[k] = [];
        else if (typeof filterState[k] === 'boolean') filterState[k] = false;
        else filterState[k] = '';
      }
      renderList();
    };
  }
```

Replace with:
```javascript
  function attachFilterHandlers() {
    const ids = { team: 'teams', customer: 'customers', owner: 'owners', stage: 'stages', cur: 'currencies', inv: 'invoiceStatuses' };
    for (const [elId, key] of Object.entries(ids)) {
      const el = document.getElementById('f-' + elId);
      if (!el) continue;
      el.onchange = () => {
        filterState[key] = Array.from(el.selectedOptions).map(o => o.value);
        renderList();
      };
    }
    document.getElementById('f-search').oninput = (e) => {
      filterState.search = e.target.value;
      renderList();
    };
    document.getElementById('f-del').onchange = (e) => {
      filterState.showDeleted = e.target.checked;
      renderList();
    };
    document.getElementById('f-clear').onclick = () => {
      for (const k of Object.keys(filterState)) {
        if (Array.isArray(filterState[k])) filterState[k] = [];
        else if (typeof filterState[k] === 'boolean') filterState[k] = false;
        else filterState[k] = '';
      }
      renderList();
    };
  }
```

### Step 7: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "f-customer|f-owner|f-inv" | head -5
```

Expected: 3 new filter elements (customer, owner, inv) present.

### Step 8: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-list.js
git commit -m "feat(ui-list): v3.0 - 12 cols, 7 filters (customer/owner/inv), summary row"
```

---

## Task 9: Update ui-form.js (15 fields + RMB auto-calc + cascade)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\ui-form.js`

### Step 1: Update getFormData to read new fields

Find:
```javascript
  function getFormData() {
    const v = (id) => document.getElementById(id).value;
    return {
      team: v('f-team-sel'),
      owner: v('f-owner'),
      oppName: v('f-oppName'),
      customer: v('f-customer'),
      productLine: v('f-productLine'),
      product: v('f-product'),
      currency: v('f-currency'),
      stage: v('f-stage'),
      winRate: parseFloat(v('f-winRate')),
      amount: parseFloat(v('f-amount')),
      amountNet: parseFloat(v('f-amountNet')),
      expectedDate: v('f-expectedDate') ? parseFloat(v('f-expectedDate')) : null,
      note: v('f-note'),
      loseReason: Array.from(document.querySelectorAll('.lose-reason-cb:checked')).map(cb => cb.value).join(',')
    };
  }
```

Replace with:
```javascript
  function getFormData() {
    const v = (id) => document.getElementById(id).value;
    return {
      team: v('f-team-sel'),
      owner: v('f-owner'),
      oppName: v('f-oppName'),
      customer: v('f-customer'),
      productLine: v('f-productLine'),
      product: v('f-product'),
      salesChannel: v('f-salesChannel'),
      stage: v('f-stage'),
      invoiceStatus: v('f-invoiceStatus'),
      currency: v('f-currency'),
      winRate: parseFloat(v('f-winRate')),
      amountTaxIncluded: parseFloat(v('f-amountTax')),
      amountRmbEquivalent: parseFloat(v('f-amountRmb')),
      expectedDate: v('f-expectedDate') ? parseFloat(v('f-expectedDate')) : null,
      note: v('f-note'),
      loseReason: Array.from(document.querySelectorAll('.lose-reason-cb:checked')).map(cb => cb.value).join(',')
    };
  }
```

### Step 2: Update buildProductOptions to use new dict_products

(No change — `buildProductOptions` already filters from `state.dicts.products` by productLine prefix.)

### Step 3: Update renderForm to add new fields

Find the entire `renderForm` function and replace it. The key changes:
- New fields: 销售客户, 负责人 (using dicts), 销售渠道, 发票状态, RMB 自动算
- Field IDs: `f-customer-sel`, `f-owner-sel`, `f-salesChannel`, `f-invoiceStatus`, `f-amountTax`, `f-amountRmb`

```javascript
  function renderForm() {
    const content = document.getElementById('content');
    const opp = editingId ? CRM.state.opportunities.find(o => o.id === editingId) : CRM.makeOpportunity();
    if (!opp) { Notify.error('找不到要编辑的商机'); return; }

    const d = CRM.state.dicts;
    const productOptions = buildProductOptions(opp.productLine);
    const showLoseReason = opp.stage && opp.stage.indexOf('ST5') >= 0;

    content.innerHTML = `
      <h2>${editingId ? '编辑' : '新增'}商机</h2>
      <div class="card">
        <div class="form-grid">
          <div class="field"><label>销售团队 *</label><select id="f-team-sel">${d.teams.map(t => `<option value="${t}" ${t === opp.team ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-team"></div></div>
          <div class="field"><label>客户名称 *</label><select id="f-customer-sel">${d.customers.map(t => `<option value="${t}" ${t === opp.customer ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-customer"></div></div>
          <div class="field"><label>负责人 *</label><select id="f-owner-sel">${d.owners.map(t => `<option value="${t}" ${t === opp.owner ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-owner"></div></div>
          <div class="field"><label>商机名称 *</label><input id="f-oppName" value="${opp.oppName || ''}"><div class="err" id="err-oppName"></div></div>
          <div class="field"><label>业务线 *</label><select id="f-productLine">${d.productLines.map(t => `<option value="${t}" ${t === opp.productLine ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-productLine"></div></div>
          <div class="field"><label>业务/产品 *</label><select id="f-product">${productOptions.map(t => `<option value="${t}" ${t === opp.product ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-product"></div></div>
          <div class="field"><label>销售渠道</label><select id="f-salesChannel"><option value="">(空)</option>${d.salesChannels.map(t => `<option value="${t}" ${t === opp.salesChannel ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          <div class="field"><label>阶段 *</label><select id="f-stage">${d.stages.map(t => `<option value="${t}" ${t === opp.stage ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-stage"></div></div>
          <div class="field"><label>发票状态</label><select id="f-invoiceStatus">${(typeof BUILTIN_INVOICE_STATUSES !== 'undefined' ? BUILTIN_INVOICE_STATUSES : []).map(s => `<option value="${s}" ${s === opp.invoiceStatus ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="field"><label>币种 *</label><select id="f-currency">${d.currencies.map(t => `<option value="${t}" ${t === opp.currency ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-currency"></div></div>
          <div class="field"><label>含税金额 *</label><input id="f-amountTax" type="number" step="0.01" value="${opp.amountTaxIncluded || 0}" oninput="recalcRmb()"><div class="err" id="err-amountTax"></div></div>
          <div class="field"><label>折算 RMB (自动算)</label><input id="f-amountRmb" type="number" step="0.01" value="${opp.amountRmbEquivalent || 0}" readonly><div class="help">含税金额 × 汇率 (硬编码)</div></div>
          <div class="field"><label>赢单概率 (0-1)</label><input id="f-winRate" type="number" step="0.01" min="0" max="1" value="${opp.winRate}"></div>
          <div class="field"><label>预计落单时间 (Excel 序列号)</label><input id="f-expectedDate" type="number" value="${opp.expectedDate === null ? '' : opp.expectedDate}"></div>
          <div class="field" style="grid-column: span 2"><label>自由备注</label><textarea id="f-note" rows="2">${opp.note || ''}</textarea></div>
          ${showLoseReason ? `<div class="field" style="grid-column: span 2"><label>丢单原因 (多选)</label>
            <div>${d.loseReasons.map(r => `<label><input type="checkbox" class="lose-reason-cb" value="${r}" ${(opp.loseReason || '').split(',').includes(r) ? 'checked' : ''}> ${r}</label>`).join(' ')}</div>
          </div>` : ''}
        </div>
        <div style="margin-top:18px; display:flex; gap:8px;">
          <button class="btn btn-primary" id="form-save">保存</button>
          <button class="btn" id="form-cancel">取消</button>
        </div>
      </div>
    `;

    // RMB auto-recalc on amount or currency change
    document.getElementById('f-productLine').onchange = (e) => {
      const newLine = e.target.value;
      const newOpts = buildProductOptions(newLine);
      const sel = document.getElementById('f-product');
      sel.innerHTML = newOpts.map(t => `<option value="${t}">${t}</option>`).join('');
    };
    document.getElementById('f-currency').onchange = () => recalcRmb();
    document.getElementById('f-amountTax').oninput = () => recalcRmb();

    document.getElementById('f-stage').onchange = (e) => {
      if (e.target.value.indexOf('ST5') >= 0) {
        const oldStage = opp.stage;
        opp.stage = e.target.value;
        renderForm();
        opp.stage = oldStage;
      } else {
        const lr = document.querySelector('.lose-reason-cb');
        if (lr) {
          const oldStage = opp.stage;
          opp.stage = e.target.value;
          renderForm();
          opp.stage = oldStage;
        }
      }
    };

    document.getElementById('form-save').onclick = () => submitForm();
    document.getElementById('form-cancel').onclick = () => {
      editingId = null;
      document.querySelector('.tab[data-tab="list"]').click();
    };

    recalcRmb();
  }
```

### Step 4: Add recalcRmb function

Add this function at the top of ui-form.js (after `getFormData`):

```javascript
  function recalcRmb() {
    const amount = parseFloat(document.getElementById('f-amountTax').value);
    const currency = document.getElementById('f-currency').value;
    if (isNaN(amount) || !currency) return;
    const rates = (typeof EXCHANGE_RATES_TO_RMB !== 'undefined') ? EXCHANGE_RATES_TO_RMB : { USD: 7.2, SGD: 5.3, RMB: 1.0 };
    const rate = rates[currency] || 1.0;
    document.getElementById('f-amountRmb').value = (amount * rate).toFixed(2);
  }
```

### Step 5: Wire recalcRmb to window

In the export at the bottom of ui-form.js, add:
```javascript
  global.recalcRmb = recalcRmb;
```

### Step 6: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=2000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "f-customer-sel|f-amountRmb|f-invoiceStatus" | head -5
```

Expected: new form fields present in DOM.

### Step 7: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-form.js
git commit -m "feat(ui-form): v3.0 - 15 fields, customer/owner/salesChannel/invoiceStatus, RMB auto-calc"
```

---

## Task 10: Update ui-dashboard.js (5 → 10 cards + 2 charts)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\ui-dashboard.js`

### Step 1: Add 3 new compute helpers to core.js (if not already added)

In `D:\claude\RAS_CRM\app\core.js`, add these helpers (if not already present after Task 8):

```javascript
  // ---- New compute helpers (v3.0) ----
  function computeTotalRmb(opps) {
    const valid = opps.filter(o => !o.deleted && !o.parseError);
    return valid.reduce((s, o) => s + (o.amountRmbEquivalent || 0), 0);
  }

  function computeInvoiceStatusDist(opps) {
    const valid = opps.filter(o => !o.deleted && !o.parseError);
    const counts = {};
    for (const o of valid) {
      const s = o.invoiceStatus || '(空)';
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count);
  }

  function computeSalesChannelTop(opps, n) {
    return computeTopN(opps, { groupBy: 'salesChannel', metric: 'amountRmbEquivalent', n: n || 5 });
  }
```

Update api export:
```javascript
  const api = {
    state,
    init, reset, refreshState,
    makeOpportunity, validateOpportunity,
    computeKpi, computeFunnel, computeStageConversion,
    computeTrend, computeTopN, computePareto, computeLoseReasonAgg,
    computeTotalRmb, computeInvoiceStatusDist, computeSalesChannelTop,
    importXlsxFile, exportXlsxBlob,
    downloadBackup, restoreFromBackup,
    upsertOpp
  };
```

### Step 2: Add tests

Append to `D:\claude\RAS_CRM\tests\unit.test.js`:

```javascript
test('computeTotalRmb sums amountRmbEquivalent', () => {
  const opps = [
    { amountRmbEquivalent: 1000, deleted: false, parseError: null },
    { amountRmbEquivalent: 2000, deleted: false, parseError: null },
    { amountRmbEquivalent: 500, deleted: true, parseError: null }
  ];
  assert.equal(CRM.computeTotalRmb(opps), 3000);
});

test('computeInvoiceStatusDist groups by status', () => {
  const opps = [
    { invoiceStatus: '已开票', deleted: false, parseError: null },
    { invoiceStatus: '已开票', deleted: false, parseError: null },
    { invoiceStatus: '未开发票', deleted: false, parseError: null }
  ];
  const r = CRM.computeInvoiceStatusDist(opps);
  assert.equal(r[0].status, '已开票');
  assert.equal(r[0].count, 2);
});
```

### Step 3: Run tests

```bash
cd D:/claude/RAS_CRM
node tests/unit.test.js
```

Expected: 32 tests pass.

### Step 4: Update renderDashboard to 10 cards

In `D:\claude\RAS_CRM\app\ui-dashboard.js`, find the entire `renderDashboard` function and replace with:

```javascript
  function renderDashboard() {
    const opps = CRM.state.opportunities;
    const k = CRM.computeKpi(opps);
    const funnel = CRM.computeFunnel(opps);
    const topTeams = CRM.computeTopN(opps, { groupBy: 'team', metric: 'amountRmbEquivalent', n: 5 });
    const topCustomers = CRM.computeTopN(opps, { groupBy: 'customer', metric: 'amountRmbEquivalent', n: 5 });
    const topChannels = CRM.computeSalesChannelTop(opps, 5);
    const invDist = CRM.computeInvoiceStatusDist(opps);
    const totalRmb = CRM.computeTotalRmb(opps);
    const trend = CRM.computeTrend(opps).slice(-6);

    const content = document.getElementById('content');
    const amountHtml = Object.entries(k.amountByCurrency).map(([c, v]) => `${c} ${v.toLocaleString()}`).join(' / ') || '0';
    const weightedHtml = Object.entries(k.weightedByCurrency).map(([c, v]) => `${c} ${v.toLocaleString()}`).join(' / ') || '0';

    content.innerHTML = `
      <h2>仪表盘</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">商机总数</div><div class="value">${k.oppCount}</div></div>
        <div class="kpi k-green"><div class="label">总含税金额</div><div class="value">${amountHtml}</div></div>
        <div class="kpi k-orange"><div class="label">折算 RMB 总额</div><div class="value">¥${totalRmb.toLocaleString()}</div></div>
        <div class="kpi k-purple"><div class="label">加权金额</div><div class="value">${weightedHtml}</div></div>
        <div class="kpi k-cyan"><div class="label">赢单率</div><div class="value">${(k.winRate * 100).toFixed(1)}%</div><div class="sub">ST4: ${k.st4} / ST5: ${k.st5}</div></div>
        <div class="kpi"><div class="label">月度趋势 (近 6 月)</div><div class="value" style="font-size: 16px;">${trend.map(m => m.month.slice(5) + '月').join(' / ')}</div></div>
      </div>
      <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div class="card">
          <h3>阶段漏斗</h3>
          <div class="funnel">${funnelHtml(funnel)}</div>
        </div>
        <div class="card">
          <h3>发票状态分布</h3>
          ${invoiceStatusHtml(invDist)}
        </div>
        <div class="card">
          <h3>TOP 5 团队 (按 RMB)</h3>
          ${topBarHtml(topTeams, 'amountRmbEquivalent')}
        </div>
        <div class="card">
          <h3>TOP 5 客户 (按 RMB)</h3>
          ${topBarHtml(topCustomers, 'amountRmbEquivalent')}
        </div>
        <div class="card" style="grid-column: span 2;">
          <h3>TOP 5 销售渠道 (按 RMB)</h3>
          ${topBarHtml(topChannels, 'amountRmbEquivalent')}
        </div>
      </div>
    `;
  }

  function invoiceStatusHtml(dist) {
    if (!dist.length) return '<p class="muted">（无数据）</p>';
    const max = Math.max(1, ...dist.map(d => d.count));
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
    return dist.map((d, i) => `<div style="display:flex; align-items:center; gap:10px; margin: 4px 0;">
      <div style="width: 120px; font-size: 13px; text-align: right;">${d.status}</div>
      <div style="flex: 1; background: #e3e8ef; border-radius: 4px; height: 20px;">
        <div style="background: ${colors[i % colors.length]}; height: 100%; width: ${(d.count / max) * 100}%; border-radius: 4px;"></div>
      </div>
      <div style="width: 60px; font-size: 13px;">${d.count}</div>
    </div>`).join('');
  }
```

### Step 5: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "折算 RMB|发票状态分布|TOP 5" | head -5
```

Expected: 3 new dashboard sections visible.

### Step 6: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-dashboard.js tests/unit.test.js
git commit -m "feat(ui-dashboard): v3.0 - 10 cards (含 RMB 总额 + 发票状态分布 + TOP 5 客户/销售)"
```

---

## Task 11: Update ui-analysis.js (8 → 12 views)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\ui-analysis.js`

### Step 1: Add 4 new views (customer / salesChannel / invoiceStatus / timeDimension)

In `D:\claude\RAS_CRM\app\ui-analysis.js`, find the VIEWS array and update:

Replace:
```javascript
  const VIEWS = [
    { key: 'funnel', label: '1. 阶段漏斗' },
    { key: 'trend', label: '2. 趋势 + 同比环比' },
    { key: 'topn', label: '3. TOP N 排名' },
    { key: 'pareto', label: '4. 帕累托 80/20' },
    { key: 'conversion', label: '5. 阶段转化率' },
    { key: 'lose', label: '6. 丢单原因汇总' },
    { key: 'pivot', label: '7. 多维透视' },
    { key: 'st4st5', label: '8. ST4 vs ST5 对比' }
  ];
```

With:
```javascript
  const VIEWS = [
    { key: 'funnel', label: '1. 阶段漏斗' },
    { key: 'trend', label: '2. 趋势 + 同比环比' },
    { key: 'topn', label: '3. TOP N 排名' },
    { key: 'pareto', label: '4. 帕累托 80/20' },
    { key: 'conversion', label: '5. 阶段转化率' },
    { key: 'lose', label: '6. 丢单原因汇总' },
    { key: 'pivot', label: '7. 多维透视' },
    { key: 'st4st5', label: '8. ST4 vs ST5 对比' },
    { key: 'customer', label: '9. 客户分析' },
    { key: 'channel', label: '10. 销售渠道分析' },
    { key: 'invoice', label: '11. 发票状态分析' },
    { key: 'timeline', label: '12. 时间维度' }
  ];
```

### Step 2: Add the 4 new view functions and route them

In the `renderAnalysis` function, find:
```javascript
    if (currentView === 'funnel') body.innerHTML = viewFunnel(opps);
    else if (currentView === 'trend') body.innerHTML = viewTrend(opps);
    else if (currentView === 'topn') body.innerHTML = viewTopN(opps);
    else if (currentView === 'pareto') body.innerHTML = viewPareto(opps);
    else if (currentView === 'conversion') body.innerHTML = viewConversion(opps);
    else if (currentView === 'lose') body.innerHTML = viewLose(opps);
    else if (currentView === 'pivot') body.innerHTML = viewPivot(opps);
    else if (currentView === 'st4st5') body.innerHTML = viewSt4St5(opps);
  }
```

Replace with (adds 4 cases):
```javascript
    if (currentView === 'funnel') body.innerHTML = viewFunnel(opps);
    else if (currentView === 'trend') body.innerHTML = viewTrend(opps);
    else if (currentView === 'topn') body.innerHTML = viewTopN(opps);
    else if (currentView === 'pareto') body.innerHTML = viewPareto(opps);
    else if (currentView === 'conversion') body.innerHTML = viewConversion(opps);
    else if (currentView === 'lose') body.innerHTML = viewLose(opps);
    else if (currentView === 'pivot') body.innerHTML = viewPivot(opps);
    else if (currentView === 'st4st5') body.innerHTML = viewSt4St5(opps);
    else if (currentView === 'customer') body.innerHTML = viewCustomer(opps);
    else if (currentView === 'channel') body.innerHTML = viewChannel(opps);
    else if (currentView === 'invoice') body.innerHTML = viewInvoice(opps);
    else if (currentView === 'timeline') body.innerHTML = viewTimeline(opps);
  }
```

### Step 3: Add the 4 new view functions

Append at the bottom of ui-analysis.js (before the export):

```javascript
  function viewCustomer(opps) {
    const t = CRM.computeTopN(opps, { groupBy: 'customer', metric: 'amountRmbEquivalent', n: 10 });
    const max = Math.max(1, ...t.map(i => i.amountRmbEquivalent));
    return `<div class="card">
      <h3>TOP 10 客户 (按折算 RMB)</h3>
      ${t.length ? t.map(i => `<div style="display:flex; align-items:center; gap:10px; margin:4px 0;">
        <div style="width:240px; font-size:12px; text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.name}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:20px;">
          <div style="background:#3b82f6; height:100%; width:${(i.amountRmbEquivalent / max) * 100}%; border-radius:4px;"></div>
        </div>
        <div style="width:100px; font-size:12px; text-align:right;">¥${i.amountRmbEquivalent.toLocaleString()}</div>
      </div>`).join('') : '<p class="muted">（无数据）</p>'}
    </div>`;
  }

  function viewChannel(opps) {
    const t = CRM.computeTopN(opps, { groupBy: 'salesChannel', metric: 'amountRmbEquivalent', n: 10 });
    const max = Math.max(1, ...t.map(i => i.amountRmbEquivalent));
    return `<div class="card">
      <h3>TOP 10 销售渠道 (按折算 RMB)</h3>
      ${t.length ? t.map(i => `<div style="display:flex; align-items:center; gap:10px; margin:4px 0;">
        <div style="width:140px; font-size:12px; text-align:right;">${i.name}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:20px;">
          <div style="background:#8b5cf6; height:100%; width:${(i.amountRmbEquivalent / max) * 100}%; border-radius:4px;"></div>
        </div>
        <div style="width:100px; font-size:12px; text-align:right;">¥${i.amountRmbEquivalent.toLocaleString()}</div>
      </div>`).join('') : '<p class="muted">（无数据）</p>'}
    </div>`;
  }

  function viewInvoice(opps) {
    const dist = CRM.computeInvoiceStatusDist(opps);
    if (!dist.length) return '<div class="card"><p class="muted">无发票状态数据</p></div>';
    const max = Math.max(1, ...dist.map(d => d.count));
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
    return `<div class="card">
      <h3>发票状态分布</h3>
      ${dist.map((d, i) => `<div style="display:flex; align-items:center; gap:10px; margin:6px 0;">
        <div style="width:140px; font-size:13px; text-align:right;">${d.status}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:22px;">
          <div style="background:${colors[i % colors.length]}; height:100%; width:${(d.count / max) * 100}%; border-radius:4px;"></div>
        </div>
        <div style="width:60px; font-size:13px; text-align:right;">${d.count}</div>
      </div>`).join('')}
      <p class="muted" style="margin-top: 12px;">总 ${dist.reduce((s, d) => s + d.count, 0)} 条商机</p>
    </div>`;
  }

  function viewTimeline(opps) {
    const t = CRM.computeTrend(opps);
    if (!t.length) return '<div class="card"><p class="muted">无落单时间数据</p></div>';
    const max = Math.max(1, ...t.map(m => m.amountRmbEquivalent));
    return `<div class="card">
      <h3>月度落单时间分布 (折算 RMB)</h3>
      <div style="display:flex; align-items:flex-end; gap:6px; height:240px; border-bottom:1px solid #e3e8ef; padding-bottom: 4px;">
        ${t.map(m => `<div style="flex:1; background:linear-gradient(180deg, #6366f1, #2563eb); height:${Math.max(2, (m.amountRmbEquivalent / max) * 100)}%; border-radius: 4px 4px 0 0; min-width: 16px;" title="${m.month}: ¥${m.amountRmbEquivalent.toLocaleString()}"></div>`).join('')}
      </div>
      <div style="display:flex; gap:6px; font-size:11px; color:#7a8699; margin-top: 6px;">
        ${t.map(m => `<div style="flex:1; text-align:center; min-width: 16px;">${m.month.slice(5)}</div>`).join('')}
      </div>
    </div>`;
  }
```

### Step 4: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "9. 客户分析|10. 销售渠道|11. 发票|12. 时间维度" | head -5
```

Expected: 4 new analysis views in tab list.

### Step 5: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-analysis.js
git commit -m "feat(ui-analysis): v3.0 - 12 views (add 客户/销售渠道/发票状态/时间维度)"
```

## Task 12: Update ui-dicts.js (9 tabs: drop invoice_status, add 3 new)

**Files:**
- Modify: `D:\claude\RAS_CRM\app\ui-dicts.js`

### Step 1: Update DICT_FIELDS and FIELD_TO_OPP

In `D:\claude\RAS_CRM\app\ui-dicts.js`, find:
```javascript
  const DICT_FIELDS = [
    { key: 'teams', label: '销售团队' },
    { key: 'productLines', label: '业务线' },
    { key: 'products', label: '业务/产品' },
    { key: 'stages', label: '阶段' },
    { key: 'currencies', label: '币种' },
    { key: 'loseReasons', label: '丢单原因' }
  ];
  const FIELD_TO_OPP = {
    teams: 'team', productLines: 'productLine', products: 'product',
    stages: 'stage', currencies: 'currency'
    // loseReasons maps to opp.loseReason (comma-separated)
  };
```

Replace with:
```javascript
  const DICT_FIELDS = [
    { key: 'teams', label: '销售团队' },
    { key: 'owners', label: '主责销售' },
    { key: 'customers', label: '客户名称' },
    { key: 'productLines', label: '业务线' },
    { key: 'products', label: '业务/产品' },
    { key: 'salesChannels', label: '销售渠道' },
    { key: 'stages', label: '阶段' },
    { key: 'currencies', label: '币种' },
    { key: 'loseReasons', label: '丢单原因' }
  ];
  const FIELD_TO_OPP = {
    teams: 'team', owners: 'owner', customers: 'customer',
    productLines: 'productLine', products: 'product', salesChannels: 'salesChannel',
    stages: 'stage', currencies: 'currency'
    // loseReasons maps to opp.loseReason (comma-separated)
  };
```

### Step 2: Verify with headless browser

```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --virtual-time-budget=3000 --dump-dom "file:///D:/claude/RAS_CRM/ras_crm.html" 2>&1 | grep -E "主责销售|客户名称|销售渠道" | head -3
```

Expected: 3 new dict tab labels visible.

### Step 3: Commit

```bash
cd D:/claude/RAS_CRM
git add app/ui-dicts.js
git commit -m "feat(ui-dicts): v3.0 - 9 tabs (add owners/customers/salesChannels, drop invoice_status which is built-in)"
```

---

## Task 13: Update run-all.js + add field-help.test.js

**Files:**
- Modify: `D:\claude\RAS_CRM\tests\run-all.js`
- Create: `D:\claude\RAS_CRM\tests\field-help.test.js`

### Step 1: Update run-all.js to include field-help tests

In `D:\claude\RAS_CRM\tests\run-all.js`, after the existing test runStep calls, add:

```javascript
runStep('field-help.test.js', 'node', [path.join(__dirname, 'field-help.test.js')]);
```

### Step 2: Create field-help.test.js

Write to `D:\claude\RAS_CRM\tests\field-help.test.js`:
```javascript
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

// Verify ui-field-help.js exists and exports renderFieldHelp
test('ui-field-help.js exposes renderFieldHelp on window', () => {
  // Set up a minimal window mock
  global.window = global;
  const path_here = require('../app/ui-field-help.js');
  assert.equal(typeof global.renderFieldHelp, 'function');
});

test('ui-field-help.js references the 9 dict-backed fields', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  const fields = ['team', 'owner', 'customer', 'product_line', 'product', 'sales_channel', 'stage', 'invoice_status', 'currency'];
  for (const f of fields) {
    assert.ok(src.includes(f), 'expected field ' + f + ' to be in field-help source');
  }
});

test('ui-field-help.js documents BUILTIN_INVOICE_STATUSES', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  assert.ok(src.includes('BUILTIN_INVOICE_STATUSES') || src.includes('未开发票'));
  assert.ok(src.includes('已开票'));
  assert.ok(src.includes('已回款'));
});

test('ui-field-help.js documents EXCHANGE_RATES', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'ui-field-help.js'), 'utf8');
  assert.ok(src.includes('EXCHANGE_RATES') || src.includes('USD') || src.includes('SGD'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
```

### Step 3: Run all tests

```bash
cd D:/claude/RAS_CRM
node tests/run-all.js
```

Expected: 53+ tests pass (29 unit + 12 db + 8 xlsx-io + 4 compare + 4 field-help = 57, plus roundtrip).

### Step 4: Commit

```bash
cd D:/claude/RAS_CRM
git add tests/run-all.js tests/field-help.test.js
git commit -m "test: add field-help.test.js for 字段说明 page"
```

---

## Task 14: Final verification + README update + real-data test

**Files:**
- Modify: `D:\claude\RAS_CRM\README.md`
- Modify: `D:\claude\RAS_CRM\tests\manual-checklist.md`

### Step 1: Run full test suite

```bash
cd D:/claude/RAS_CRM
node tests/run-all.js
```

Expected: all pass.

### Step 2: Real-data verification (CRITICAL: the win-rate bug must be fixed)

Write a one-off script to verify the user's real xlsx imports correctly:

```bash
cd D:/claude/RAS_CRM
node -e "
const CRM = require('./app/core.js');
const fs = require('fs');
const path = require('path');

(async () => {
  await CRM.init();
  const buf = fs.readFileSync('D:/claude/RAS CRM（template） (version0529).xlsx');
  const result = await CRM.importXlsxFile({ name: 'version0529.xlsx', arrayBuffer: async () => buf.buffer });
  console.log('Import result:', result);
  // Verify 赢率 is no longer 0
  const opps = CRM.state.opportunities;
  const withWinRate = opps.filter(o => o.winRate > 0);
  console.log('Total opps:', opps.length);
  console.log('Opps with winRate > 0:', withWinRate.length);
  console.log('Sample winRates:', withWinRate.slice(0, 5).map(o => ({ name: o.oppName, winRate: o.winRate })));
  // Verify owner is populated
  const withOwner = opps.filter(o => o.owner);
  console.log('Opps with owner:', withOwner.length);
  // Verify salesChannel
  const withChannel = opps.filter(o => o.salesChannel);
  console.log('Opps with salesChannel:', withChannel.length);
})();
"
```

Expected: "Opps with winRate > 0: 50+" (was 0 in v2.0), "Opps with owner: 50+", "Opps with salesChannel: 50+".

### Step 3: Update README.md (rewrite for v3.0)

Replace `D:\claude\RAS_CRM\README.md` with:

```markdown
# RAS CRM (v3.0)

A zero-dependency single-file HTML Web App for managing RAS CRM opportunity/sales data. Uses an in-browser SQLite database (sql.js WASM) auto-persisted to IndexedDB. Excel (.xlsx) is used only for import/export.

## v3.0 Highlights

- **New fields**: 发票状态, 主责销售, 客户名称 (字典), 销售渠道, 折算 RMB 金额
- **Smart column mapping**: recognizes 主责销售, 赢单概率, 业务线产品, 销售渠道, 预计落单时间, 预估合同金额(RMB) etc.
- **Visual refresh**: modern dashboard style (cards, gradients, hover effects)
- **Dashboard 5 → 10 cards**: 折算 RMB 总额, 发票状态分布, TOP 5 客户/销售
- **Multi-dim analysis 8 → 12 views**: 客户分析, 销售渠道分析, 发票状态分析, 时间维度
- **字段说明 page**: shows 商机↔字典 mapping for transparency

## Quick Start

1. Serve via local HTTP (required for sql.js wasm): `python -m http.server 8000` from `D:\claude\RAS_CRM\`
2. Open `http://localhost:8000/ras_crm.html` in Chrome or Edge (latest 2 major versions)
3. Click **"📥 导入"** and select `D:\claude\RAS CRM（template） (version0529).xlsx`
4. Edit / add / delete records. **All changes auto-save** to IndexedDB.
5. Click **"📤 导出"** to download xlsx, **💾 备份** for .sqlite backup, **📂 恢复** to load a backup.

## Topbar Tabs

| Tab | Purpose |
|---|---|
| 仪表盘 | 10 KPI cards + 2 charts |
| 商机 | 商机列表, 12 列, 7 筛选, 汇总行 |
| 新增 | 表单, 15 字段, RMB 自动算 |
| 分析 | 12 视图 |
| 字典 | 9 tab 字典管理 (发票状态是内置, 不在这里) |
| 字段说明 | 商机↔字典 映射说明 (新) |

## Architecture

- `app/core.js` — Facade. State is DB mirror. Pure functions (validate, compute*) unchanged.
- `app/db.js` — SQLite layer. Schema v3.0: 9 dict tables + 1 oportunidades (15 字段) + meta. Auto-persist to IndexedDB.
- `app/xlsx-io.js` — Smart xlsx parser with 14 column aliases + adaptive dict extraction.
- `app/ui-*.js` — UI modules, one per page.
- `app/ui-field-help.js` — Field-help page (v3.0 new).
- `vendor/sqljs/` — sql.js WASM (~700KB).
- `vendor/sheetjs/` — SheetJS for xlsx I/O.

## Database Schema (v3.0)

10 tables in SQLite:
- `meta` (key, value) — schema version
- 9 dict tables: `dict_teams`, `dict_product_lines`, `dict_products`, `dict_stages`, `dict_currencies`, `dict_lose_reasons`, `dict_owners`, `dict_customers`, `dict_sales_channels`
- `opportunities` (15 字段 + 元字段): team, owner, customer, product_line, product, sales_channel, stage, invoice_status, currency, amount_tax_included, amount_rmb_equivalent, win_rate, expected_date, note, lose_reason, dict_refs, deleted, parse_error, position

Note: `invoice_status` is a built-in enum (5 values hardcoded in `app/core.js`), NOT a DB table.

## Built-in (NOT user-editable)

```javascript
// app/core.js
const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };
```

## Development

### Run all tests
```bash
node tests/run-all.js
```

Expected: 57+ tests pass + roundtrip MATCHED.

### Compare two xlsx files
```bash
node tools/compare-xlsx.js <original.xlsx> <exported.xlsx>
```

### Rebuild test fixture
```bash
node tests/build-fixture.js
```

## Important Notes

### Single user, local only
- Data in browser's IndexedDB (per-browser, per-profile)
- No server, no sync, no multi-user
- Use "💾 备份" to share across machines

### Browser requirements
- Chrome/Edge (latest 2 major versions)
- Needs: WebAssembly, IndexedDB, FileReader, Blob, URL.createObjectURL
- Serve via local HTTP (`python -m http.server`) — `file://` fails for wasm auto-init

### xlsx Compatibility
- Recognizes 14+ column header variants (主责销售, 赢单概率, 业务线产品, 销售渠道, 预计落单时间, etc.)
- Stage values with full-width colon (：) auto-normalize to half-width (:)
- Invoice status: 5 fixed values, column header "备注" is auto-mapped to invoice_status
- After import, the 发票状态 column can be re-edited via 字典管理 → 销售团队 (the values are still 5 standard values)
```

### Step 4: Update manual-checklist.md

Replace `D:\claude\RAS_CRM\tests\manual-checklist.md` with:

```markdown
# Manual Test Checklist (v3.0)

Test environment: Windows + Chrome or Edge, served via local HTTP for full wasm support.

## Setup

- [ ] Serve: `cd D:\claude\RAS_CRM && python -m http.server 8000`
- [ ] Open `http://localhost:8000/ras_crm.html` in Chrome/Edge
- [ ] Verify topbar shows 6 tabs: 仪表盘 / 商机 / 新增 / 分析 / 字典 / 字段说明
- [ ] Verify 4 buttons: 导入 / 导出 / 备份 / 恢复
- [ ] DB status: should show "● 已加载" or "○ 空"

## v3.0 Critical Bug Fix Verification (the win-rate bug)

- [ ] Click "📥 导入", select `D:\claude\RAS CRM（template） (version0529).xlsx`
- [ ] Open 商机 tab
- [ ] **Verify 赢率 column is no longer 0%** — should show values like 100%, 0%, 10%, 20%, 30%, etc.
- [ ] **Verify 负责人 column is populated** — should show names like 张晶晶, 赵经理, etc.
- [ ] **Verify 销售渠道 column is populated** — should show 字节跳动, 直签, 联想中国, etc.
- [ ] **Verify 发票状态 column is populated** — should show 已开票, 未开发票, etc.

## Dashboard (10 cards)

- [ ] 商机总数 (count)
- [ ] 总含税金额 (per currency)
- [ ] 折算 RMB 总额 (single number in ¥)
- [ ] 加权金额 (per currency)
- [ ] 赢单率 (%)
- [ ] 月度趋势 (近 6 月)
- [ ] 阶段漏斗 (5 stages)
- [ ] 发票状态分布 (bar chart)
- [ ] TOP 5 团队 / 客户 / 销售渠道

## Filters (7)

- [ ] 团队 / 客户 / 负责人 / 阶段 / 币种 / 发票状态 / 搜索
- [ ] Apply multiple filters, verify AND logic
- [ ] Click "清空" to reset
- [ ] **Verify summary row at bottom**: 合计 (count) + 总含税 + 折算 RMB

## New/Edit Form (15 fields)

- [ ] All 15 fields visible in correct order
- [ ] Select 币种 = USD, enter 含税金额 = 1000, verify 折算 RMB = 7200 (auto-calc)
- [ ] Switch 币种 to RMB, verify 折算 RMB = 1000 (since rate = 1.0)
- [ ] 发票状态 dropdown shows 5 values (未开发票 / 已开票 / 合同中 / 已回款 / 已预付)

## Multi-dim Analysis (12 views)

- [ ] Click through all 12 views, verify each renders
- [ ] View 9 (客户分析): TOP 10 客户
- [ ] View 10 (销售渠道): TOP 10 销售
- [ ] View 11 (发票状态): 5-status distribution
- [ ] View 12 (时间维度): monthly bar chart

## Dictionary Management (9 tabs)

- [ ] All 9 tabs visible (no 发票状态 tab)
- [ ] Add/Edit/Delete in each tab
- [ ] 客户 tab: long values (e.g., 智元创新(上海)科技股份有限公司) display correctly

## 字段说明 Page

- [ ] Click 字段说明 tab
- [ ] Verify table shows 15 商机字段 with type + dict + description
- [ ] Verify "内置枚举" section shows 5 chips for 发票状态
- [ ] Verify "汇率表" section shows USD/SGD/RMB rates

## Auto-save

- [ ] Make any change in 商机
- [ ] Close browser tab, reopen
- [ ] Verify changes still there (IndexedDB persistence)

## Export + Compare

- [ ] Click "📤 导出", download .xlsx
- [ ] Open in Excel, verify all 15 columns present, amounts display correctly
- [ ] In terminal: `node tools/compare-xlsx.js --roundtrip tests/fixtures/test-data.xlsx`
- [ ] Expected: MATCHED
```

### Step 5: Run all tests one more time

```bash
cd D:/claude/RAS_CRM
node tests/run-all.js
```

Expected: 57+ tests pass + roundtrip MATCHED.

### Step 6: Commit

```bash
cd D:/claude/RAS_CRM
git add README.md tests/manual-checklist.md
git commit -m "docs: v3.0 README + manual checklist (15 fields, 10 dashboard cards, 12 analysis views)"
```

---

## Self-Review Checklist (for the implementer)

Before marking complete, verify:

- [ ] All 57+ unit tests pass
- [ ] All 4 compare tests pass
- [ ] `node tests/run-all.js` shows "All passed"
- [ ] Manual checklist walked through with no critical failures
- [ ] **Real xlsx file loads with 赢率, 负责人, 销售渠道 ALL populated** (the critical v2.0 bug fix)
- [ ] No `console.log` debug noise in app/*.js
- [ ] No leftover TODO comments in app/*.js
- [ ] All commits have meaningful messages

## Known v3.0 Issues & Follow-ups

Documented in `tests/issues.md`. Major ones:
- Exchange rates are hardcoded (v3.1: add rates table + admin UI)
- 客户名称 dict may grow large (50+ entries) — v3.1: add search/typeahead
- 序号 column (xlsx A col) is dropped on import (positional numbering regenerated)

## Implementation Order (recommended)

Tasks should be done in this order to allow incremental testing:
1. Task 1 (core.js constants) — foundational
2. Task 2 (db.js schema) — tests fail until complete
3. Task 3 (xlsx-io aliases) — required for import to work
4. Task 4 (core.js factory) — minor
5. Task 5 (styles.css) — visual only, can defer
6. Task 6 (topbar) — small
7. Task 7 (ui-field-help) — new page
8. Task 8 (ui-list) — needs Tasks 1-3 done
9. Task 9 (ui-form) — needs Tasks 1-3 done
10. Task 10 (ui-dashboard) — needs Task 4 helpers
11. Task 11 (ui-analysis) — needs Task 4 helpers
12. Task 12 (ui-dicts) — small
13. Task 13 (run-all + field-help test) — wires everything
14. Task 14 (docs + real-data verification) — final
