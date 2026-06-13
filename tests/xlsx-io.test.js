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

test('amount alias: 含税金额 → amountTaxIncluded', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '团队', '负责人', '商机', '客户',
    '业务线', '产品', '币种', '阶段', '赢率',
    '含税金额', '不含税金额', '时间', '备注'];
  const rows = [[1, 'T', 'O', 'N', 'C',
    'PL', 'P', 'RMB', 'ST1', 0.5, 12345.67, 11000, 46023, '']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].amountTaxIncluded, 12345.67);
  // Without amountRmb column, auto-computes from amount × rate (RMB rate = 1.0)
  assert.equal(result.opportunities[0].amountRmbEquivalent, 12345.67);
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
      { id: 'o1', team: '基础业务', owner: '李经理', customer: '客户A',
        productLine: 'PL1', product: 'P110', currency: 'RMB', stage: 'ST4 赢单(Win)',
        winRate: 1, amountTaxIncluded: 1000, amountRmbEquivalent: 885, expectedDate: 46023,
        note: 'note', loseReason: '', salesChannel: '', invoiceStatus: '',
        deleted: false, parseError: null, position: 1 }
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
  assert.equal(reparsed.opportunities[0].amountTaxIncluded, 1000);
  assert.equal(reparsed.dicts.teams[0], '基础业务');
});

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
  const rows = [[1, 'T', 'O', 'N', 'C', 'PL', 'P', 'USD', 'ST4:赢单(Win)', 0.5, 100, 46023, '']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].stage, 'ST4:赢单(Win)', 'full-width colon should normalize to half-width');
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

test('dict parsing: full-width colon in ST1:线索(Leads) is normalized to half-width', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  // Sheet1 with minimal data, Sheet2 with full-width colon stages
  const wb = XLSX.utils.book_new();
  const ws1Data = [
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['#', '团队', '负责人', '商机', '客户', '业务线', '产品', '币种', '阶段', '赢率', '金额', '时间', '备注'],
    [1, 'T', 'O', 'N', 'C', 'PL', 'P', 'USD', 'ST4：赢单(Win)', 1, 100, 46023, '']
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  // Sheet2 with full-width colon in stages
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['销售团队', '业务线', '业务/产品', '阶段', '币种'],
    ['基础业务', 'PL1', 'P110', 'ST4：赢单(Win)', 'USD']
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const result = XLSX_IO.parseXlsxSmart(bytes);
  // Dict stages should have half-width colon
  assert.ok(result.dicts.stages.includes('ST4:赢单(Win)'),
    'expected normalized ST4:赢单(Win) in stages, got: ' + JSON.stringify(result.dicts.stages));
  assert.ok(!result.dicts.stages.some(s => s.includes('：')),
    'stages should not contain full-width colon');
  // Opps stage should also be normalized
  assert.equal(result.opportunities[0].stage, 'ST4:赢单(Win)');
});

test('parse: 商机名称 column is read into oppName field', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  const headers = ['#', '销售团队', '主责销售', '商机名称', '客户名称',
    '业务线', '业务线产品', '币种', '阶段', '赢单概率',
    '含税金额', '不含税金额', '预计落单时间', '备注'];
  const rows = [[1, '基础业务', '李经理', '重要商机XYZ', '客户A',
    'PL1', 'P110', 'RMB', 'ST4:赢单(Win)', 1, 1000, 885, 46023, '已开票']];
  const bytes = buildXlsx({ headers, rows });
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.equal(result.opportunities[0].oppName, '重要商机XYZ',
    'oppName should be populated from 商机名称 column');
});

test('parse: expectedDate Date object from xlsx is converted to Excel serial', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  // Build xlsx with a real Date object in the date column
  const wb = XLSX.utils.book_new();
  const ws1Data = [];
  for (let i = 0; i < 16; i++) ws1Data.push(new Array(15).fill(''));
  ws1Data.push(['#', '团队', '负责人', '商机', '客户', '业务线', '产品', '币种', '阶段', '赢率', '含税', '不含税', '预计落单时间', '备注']);
  // 2026-01-12 UTC = Excel serial 46034 (depending on TZ, may vary by 1)
  ws1Data.push([1, 'T', 'O', 'N', 'C', 'PL', 'P', 'RMB', 'ST1', 0.5, 100, 90, new Date('2026-01-12T00:00:00Z'), '']);
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  // Mark the data date cell as date-formatted (so SheetJS returns Date despite cellDates:false)
  // Header is at r=16, data row is at r=17
  const cellRef = XLSX.utils.encode_cell({ r: 17, c: 12 });
  ws1[cellRef].z = 'yyyy-mm-dd';
  ws1[cellRef].t = 'd';
  ws1[cellRef].v = new Date('2026-01-12T00:00:00Z');
  ws1['!ref'] = 'A1:O18';
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const result = XLSX_IO.parseXlsxSmart(bytes);
  const ed = result.opportunities[0].expectedDate;
  assert.equal(typeof ed, 'number', 'expectedDate should be a number, not a Date');
  // 46034 = 2026-01-12. Allow ±1 day for timezone interpretation.
  assert.ok(ed >= 46033 && ed <= 46035, 'expectedDate should be around 46034 (Jan 12 2026), got: ' + ed);
});

test('parse: owners/customers/salesChannels extracted from Sheet1 even when Sheet2 has the 5 standard dicts', () => {
  const XLSX_IO = require('../app/xlsx-io.js');
  // Use the existing buildXlsx helper, but we need both Sheet1 (with full headers) and Sheet2
  const wb = XLSX.utils.book_new();
  const ws1Data = [];
  for (let i = 0; i < 16; i++) ws1Data.push(new Array(10).fill(''));
  ws1Data.push(['#', '销售团队', '主责销售', '商机名称', '客户名称', '业务线', '业务线产品', '销售渠道', '阶段', '赢单概率']);
  ws1Data.push([1, '渠道业务部', '张晶晶', '项目A', '智元创新', 'PL1', 'P120 企业数字化解决方案', '字节跳动', 'ST4:赢单(Win)', 1]);
  ws1Data.push([2, '渠道业务部', '李密思', '项目B', '翼华科技', 'PL2', 'P210 企业云管理服务', '直签', 'ST4:赢单(Win)', 1]);
  const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
  XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');
  const ws2 = XLSX.utils.aoa_to_sheet([
    ['销售团队', '业务线', '业务/产品', '阶段', '币种'],
    ['渠道业务部', 'PL1', 'P110 企业云产品', 'ST1:线索(Leads)', 'RMB']
  ]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');
  const bytes = new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  const result = XLSX_IO.parseXlsxSmart(bytes);
  assert.ok(result.dicts.owners.includes('张晶晶'), 'owners should include 张晶晶');
  assert.ok(result.dicts.owners.includes('李密思'), 'owners should include 李密思');
  assert.ok(result.dicts.customers.includes('智元创新'), 'customers should include 智元创新');
  assert.ok(result.dicts.customers.includes('翼华科技'), 'customers should include 翼华科技');
  assert.ok(result.dicts.salesChannels.includes('字节跳动'), 'salesChannels should include 字节跳动');
  assert.ok(result.dicts.salesChannels.includes('直签'), 'salesChannels should include 直签');
  // Sheet2's 5 standard dicts should still be populated
  assert.ok(result.dicts.teams.includes('渠道业务部'), 'teams from Sheet2 should be preserved');
  assert.ok(result.dicts.products.includes('P110 企业云产品'), 'products from Sheet2 should be preserved');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
