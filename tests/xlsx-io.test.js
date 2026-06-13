// Tests for app/xlsx-io.js (smart xlsx parser + builder).
// Run: node tests/xlsx-io.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const XLSX = require('../vendor/sheetjs/xlsx.full.min.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok', name); passed++; }
  catch (e) { console.log('  FAIL', name, '\n    ', e.message, '\n', e.stack); failed++; }
}

console.log('xlsx-io');

// Helper: build a synthetic xlsx in memory with custom header row
function buildXlsx(opts) {
  // opts: { headers: [...], rows: [[...]], sheet2: [[...]] }
  const wb = XLSX.utils.book_new();
  const ws1Data = [];
  for (let i = 0; i < 16; i++) ws1Data.push(new Array(opts.headers.length).fill(''));
  ws1Data.push(opts.headers);
  for (const r of opts.rows) ws1Data.push(r);
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  if (opts.sheet2) {
    const ws2 = XLSX.utils.aoa_to_sheet(opts.sheet2);
    XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
  }
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(bytes);
}

test('column name alias: 主责销售 → owner', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '销售团队', '主责销售', '商机名称', '客户名称',
    '业务线', '业务/产品', '币种', '阶段', '赢率',
    '含税金额', '不含税金额', '预计成交时间', '备注'];
  const rows = [[1, '基础业务', '李经理', '项目A', '客户A',
    'PL1', 'P110', 'RMB', 'ST4 赢单(Win)', 1, 1000, 885, 46023, 'note']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].owner, '李经理');
});

test('column name alias: Sales Rep → owner', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', 'Team', 'Sales Rep', 'Opp Name', 'Customer',
    'Product Line', 'Product', 'Currency', 'Stage', 'Win Rate',
    'Amount', 'Amount Net', 'Expected Date', 'Notes'];
  const rows = [[1, 'Team A', 'John Doe', 'Project X', 'Customer Y',
    'PL1', 'P110', 'USD', 'ST4 Win', 1, 5000, 4500, 46023, '']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].owner, 'John Doe');
});

test('amount alias: 含税金额 → amount', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '负责人', '商机', '客户',
    '业务线', '产品', '币种', '阶段', '赢率',
    '含税金额', '不含税金额', '时间', '备注'];
  const rows = [[1, 'T', 'O', 'N', 'C',
    'PL', 'P', 'RMB', 'ST1', 0.5, 12345.67, 11000, 46023, '']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].amount, 12345.67);
  assert.equal(result.opportunities[0].amountNet, 11000);
});

test('smart dict parsing: classifies by value patterns when header is unknown', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  // Headers that don't match standard patterns
  const headers = ['#', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'];
  // First 5 rows have ST1-ST5, USD, etc. (recognizable values)
  const rows = [
    [1, '', '', '', '', '', '', 'USD', 'ST1 线索(Leads)', 0.1, 100, 90, 46023, ''],
    [2, '', '', '', '', '', '', 'SGD', 'ST2 商机(Pipeline)', 0.2, 200, 180, 46023, ''],
    [3, '', '', '', '', '', '', 'RMB', 'ST3 投标(Proposal)', 0.3, 300, 270, 46023, '']
  ];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  // Some dictionary should have ST1, ST2, ST3
  assert.ok(result.dicts.stages.length >= 3, 'expected stages dict populated');
  assert.ok(result.dicts.stages.includes('ST1 线索(Leads)'));
  // Some dict should have USD, SGD, RMB
  assert.ok(result.dicts.currencies.length >= 3);
  assert.ok(result.dicts.currencies.includes('USD'));
});

test('smart dict parsing: handles values-only P1xx + P2xx in multiple columns', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '负责人', '商机', '客户',
    '业务线', '产品A', '产品B', '币种', '阶段', '赢率', '金额1', '金额2', '时间'];
  const rows = [
    [1, 'T', 'O', 'N', 'C', 'PL1', 'P110', 'P210', 'RMB', 'ST1', 0.1, 100, 90, 46023],
    [2, 'T', 'O', 'N', 'C', 'PL2', 'P120', 'P220', 'USD', 'ST2', 0.2, 200, 180, 46023]
  ];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  // All 4 products should be in the products dict
  const products = result.dicts.products;
  assert.ok(products.includes('P110'));
  assert.ok(products.includes('P210'));
  assert.ok(products.includes('P120'));
  assert.ok(products.includes('P220'));
});

test('default dicts provided if Sheet2 missing', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  // No Sheet2
  const headers = ['#', '团队', '负责人', '商机', '客户', '业务线', '产品', '币种', '阶段', '赢率', '含税金额', '不含税金额', '时间', '备注'];
  const rows = [[1, 'T', 'O', 'N', 'C', 'PL1', 'P110', 'USD', 'ST1', 0.1, 100, 90, 46023, '']];
  const bytes = buildXlsx({ headers, rows });  // no sheet2
  const result = XLSX_IO.parseXlsxSmart(bytes);
  // Defaults should include 7 loseReasons
  assert.ok(result.dicts.loseReasons.length >= 7);
});

test('buildXlsxFromState roundtrips back to similar parseXlsxSmart output', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const state = {
    opportunities: [
      { id: 'o1', team: '基础业务', owner: '李经理', oppName: '项目A', customer: '客户A',
        productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST4 赢单(Win)',
        winRate: 1, amount: 1000, amountNet: 885, expectedDate: 46023,
        note: 'note', loseReason: '', deleted: false, parseError: null, position: 1 }
    ],
    dicts: {
      teams: ['基础业务'],
      productLines: ['PL1'],
      products: ['P110'],
      stages: ['ST4 赢单(Win)'],
      currencies: ['RMB'],
      loseReasons: ['价格过高']
    }
  };
  const bytes = XLSX_IO.buildXlsxFromState(state);
  const reparsed = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(reparsed.opportunities.length, 1);
  assert.equal(reparsed.opportunities[0].owner, '李经理');
  assert.equal(reparsed.opportunities[0].amount, 1000);
  assert.equal(reparsed.dicts.teams[0], '基础业务');
});

test('parseXlsxSmart assigns UUID id to every opportunity', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '负责人', '商机', '客户',
    '业务线', '产品', '币种', '阶段', '赢率', '含税', '不含税', '时间', '备注'];
  const rows = [
    [1, 'T', 'O', 'N1', 'C', 'PL', 'P', 'USD', 'ST1', 0.1, 100, 90, 46023, ''],
    [2, 'T', 'O', 'N2', 'C', 'PL', 'P', 'USD', 'ST1', 0.1, 200, 180, 46023, '']
  ];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  const ids = new Set(result.opportunities.map(o => o.id));
  assert.equal(ids.size, 2);
  for (const id of ids) assert.ok(id.length > 0);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
