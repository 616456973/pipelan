// Build a synthetic test-data.xlsx for use as a known fixture.
// Run with: node tests/build-fixture.js
// Output:   tests/fixtures/test-data.xlsx
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../vendor/sheetjs/xlsx.full.min.js');

const headers = [
  '#', '销售团队', '负责人', '商机名称', '客户名称',
  '业务线', '业务/产品', '币种', '阶段', '赢率',
  '预计合同金额(含税)', '预计合同金额(不含税)', '预计成交/丢单时间', '备注'
];

const teams = ['基础业务', '企业云客户拓展', '金融行业大客户', '政府行业大客户', 'AI+企业大模型', '铁抓手', 'AIPULSE'];
const productLines = ['PL1 企业云方案(Hyper Cloud)', 'PL2 企业云服务(Hyper Care)'];
const products = ['P110 企业云基础产品', 'P120 企业云数字化集成', 'P130 企业云原场景化解决方案',
                  'P210 企业云运营服务', 'P220 企业云专业服务', 'P230 企业云原场景专业服务'];
const stages = ['ST1 线索(Leads)', 'ST2 商机(Pipeline)', 'ST3 投标(Proposal)', 'ST4 赢单(Win)', 'ST5 丢单(Lose)'];
const currencies = ['USD', 'SGD', 'RMB'];

function makeRow(i) {
  const team = teams[i % teams.length];
  const productLine = productLines[i % productLines.length];
  const product = products[i % products.length];
  const stage = stages[i % stages.length];
  const currency = currencies[i % currencies.length];
  const winRate = stage.startsWith('ST4') ? 1 : (stage.startsWith('ST5') ? 0 : ((i % 5) + 1) / 10);
  const amount = 10000 + (i * 7919) % 900000;
  const dateSerial = 46023 + (i * 7) % 365;  // ~2026
  return [
    i + 1, team, '经理' + (i%5+1),
    '测试商机' + (i+1), '测试客户' + ((i%10)+1) + '公司',
    productLine, product, currency, stage, winRate,
    amount, Math.round(amount / 1.13 * 100) / 100,
    dateSerial, (i % 7 === 0) ? ('备注' + i) : ''
  ];
}

// 3 malformed/dangling/bad rows for testing
const malformedAmount = [99, '基础业务', '测试', '测试商机99', '客户99',
  'PL1 企业云方案(Hyper Cloud)', 'P110 企业云基础产品', 'USD', 'ST4 赢单(Win)', 1,
  'NOT_A_NUMBER', 5000, 46100, '故意坏数据 amount 不是数字'];
const danglingTeam = [100, '已不存在的团队', '测试', '测试商机100', '客户100',
  'PL1 企业云方案(Hyper Cloud)', 'P110 企业云基础产品', 'USD', 'ST2 商机(Pipeline)', 0.5,
  50000, 44247, '字典悬空'];
const badWinRate = [101, '基础业务', '测试', '测试商机101', '客户101',
  'PL1 企业云方案(Hyper Cloud)', 'P110 企业云基础产品', 'RMB', 'ST2 商机(Pipeline)', 1.5,
  10000, 8849, '赢率非法 1.5'];

const dataRows = [];
for (let i = 0; i < 50; i++) dataRows.push(makeRow(i));
dataRows.push(malformedAmount);
dataRows.push(danglingTeam);
dataRows.push(badWinRate);

// Sheet2: 5 dict blocks
const maxDictRows = Math.max(teams.length, productLines.length, products.length, stages.length, currencies.length);
const sheet2Rows = [];
sheet2Rows.push(['销售团队', '业务线', '业务/产品', '阶段', '币种']);
for (let r = 0; r < maxDictRows; r++) {
  sheet2Rows.push([
    teams[r] || '',
    productLines[r] || '',
    products[r] || '',
    stages[r] || '',
    currencies[r] || ''
  ]);
}

// Build workbook
const wb = XLSX.utils.book_new();

// Sheet1: 16 empty rows (mimic real xlsx layout), then header, then data
const ws1Rows = [];
for (let r = 0; r < 16; r++) ws1Rows.push(new Array(14).fill(''));
ws1Rows.push(headers);
for (const d of dataRows) ws1Rows.push(d);
const ws1 = XLSX.utils.aoa_to_sheet(ws1Rows);
XLSX.utils.book_append_sheet(wb, ws1, 'Sheet1');

const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
XLSX.utils.book_append_sheet(wb, ws2, 'Sheet2');

const out = path.join(__dirname, 'fixtures', 'test-data.xlsx');
// SheetJS writeFile can intermittently fail on Windows with a generic
// "cannot save file" error, so write through a buffer for reliability.
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(out, buf);
console.log('wrote', out, 'with', dataRows.length, 'data rows');
