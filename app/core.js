// Core data layer for RAS CRM. UMD pattern.
(function (global) {
  'use strict';

  function getXLSX() {
    if (typeof require !== 'undefined') {
      return require('../vendor/sheetjs/xlsx.full.min.js');
    }
    if (typeof globalThis.XLSX !== 'undefined') return globalThis.XLSX;
    throw new Error('XLSX not loaded');
  }

  const DEFAULT_LOSE_REASONS = ['价格过高', '竞品优势', '客户预算', '技术不符', '决策延期', '客户取消', '其他'];

  const state = {
    opportunities: [],
    dicts: { teams: [], productLines: [], products: [], stages: [], currencies: [], loseReasons: [] },
    fileName: '', fileLoaded: false, modified: false
  };

  function reset() {
    state.opportunities = [];
    state.dicts = { teams: [], productLines: [], products: [], stages: [], currencies: [], loseReasons: [] };
    state.fileName = ''; state.fileLoaded = false; state.modified = false;
  }

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

  function markModified() { state.modified = true; }

  function findHeaderRow(rows) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.some(c => typeof c === 'string' && c.indexOf('商机名称') >= 0)) return i;
    }
    return -1;
  }

  const COL = {
    team: '销售团队', owner: '负责人', oppName: '商机名称', customer: '客户名称',
    productLine: '业务线', product: '业务/产品', currency: '币种', stage: '阶段',
    winRate: '赢率', amount: '预计合同金额(含税)', amountNet: '预计合同金额(不含税)',
    expectedDate: '预计成交/丢单时间', note: '备注'
  };

  function mapColumns(headerRow) {
    const m = {};
    for (let i = 0; i < headerRow.length; i++) {
      const cell = String(headerRow[i] || '').trim();
      for (const [key, substr] of Object.entries(COL)) {
        if (cell.indexOf(substr) >= 0) { m[key] = i; break; }
      }
    }
    return m;
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  function parseSheet1(rows, headerRowIdx, colMap, dicts) {
    const out = [];
    const teamSet = new Set(dicts.teams);
    const productSet = new Set(dicts.products);
    const productLineSet = new Set(dicts.productLines);
    const stageSet = new Set(dicts.stages);
    const currencySet = new Set(dicts.currencies);
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every(c => c === null || c === '' || c === undefined)) continue;

      const opp = makeOpportunity();
      try {
        opp.team        = String(row[colMap.team] || '').trim();
        opp.owner       = String(row[colMap.owner] || '').trim();
        opp.oppName     = String(row[colMap.oppName] || '').trim();
        opp.customer    = String(row[colMap.customer] || '').trim();
        opp.productLine = String(row[colMap.productLine] || '').trim();
        opp.product     = String(row[colMap.product] || '').trim();
        opp.currency    = String(row[colMap.currency] || '').trim();
        opp.stage       = String(row[colMap.stage] || '').trim() || 'ST1 线索(Leads)';
        const wr = toNumber(row[colMap.winRate]);
        if (wr === null) throw new Error('winRate 不是数字');
        if (wr < 0 || wr > 1) throw new Error('winRate 必须在 [0,1]');
        opp.winRate = wr;
        const amt = toNumber(row[colMap.amount]);
        if (amt === null) throw new Error('amount 不是数字');
        opp.amount = amt;
        const amtN = toNumber(row[colMap.amountNet]);
        if (amtN === null) throw new Error('amountNet 不是数字');
        opp.amountNet = amtN;
        opp.expectedDate = (row[colMap.expectedDate] === undefined || row[colMap.expectedDate] === '') ? null : row[colMap.expectedDate];
        opp.note = String(row[colMap.note] || '').trim();

        if (opp.team && !teamSet.has(opp.team)) throw new Error('team 字典悬空: ' + opp.team);
        if (opp.productLine && !productLineSet.has(opp.productLine)) throw new Error('productLine 字典悬空: ' + opp.productLine);
        if (opp.product && !productSet.has(opp.product)) throw new Error('product 字典悬空: ' + opp.product);
        if (opp.stage && !stageSet.has(opp.stage)) throw new Error('stage 字典悬空: ' + opp.stage);
        if (opp.currency && !currencySet.has(opp.currency)) throw new Error('currency 字典悬空: ' + opp.currency);
      } catch (e) {
        opp.parseError = { row: r + 1, message: e.message };
      }
      out.push(opp);
    }
    return out;
  }

  function parseSheet2(rows) {
    const dicts = { teams: [], productLines: [], products: [], stages: [], currencies: [] };
    if (!rows.length) return dicts;
    const maxCol = Math.max(...rows.map(r => (r || []).length));
    for (let c = 0; c < maxCol; c++) {
      const colVals = [];
      for (let r = 0; r < rows.length; r++) {
        const v = rows[r] ? String(rows[r][c] || '').trim() : '';
        if (r > 0 && v) colVals.push(v);
      }
      if (c === 0) dicts.teams = colVals;
      else if (c === 1) dicts.productLines = colVals;
      else if (c === 2) dicts.products = colVals;
      else if (c === 3) dicts.stages = colVals;
      else if (c === 4) dicts.currencies = colVals;
    }
    return dicts;
  }

  function parseXlsx(buffer, opts) {
    opts = opts || {};
    if (!buffer || buffer.length === 0) throw new Error('文件为空');
    const X = getXLSX();
    const wb = X.read(buffer, { type: 'array', cellDates: false, cellNF: true });
    if (!wb.SheetNames.length) throw new Error('xlsx 没有 sheet');

    const ws2 = wb.Sheets[wb.SheetNames[1] || wb.SheetNames[0]];
    const rows2 = ws2 ? X.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: false }) : [];
    const dicts = parseSheet2(rows2);
    dicts.loseReasons = DEFAULT_LOSE_REASONS.slice();

    const ws1 = wb.Sheets[wb.SheetNames[0]];
    const rows1 = X.utils.sheet_to_json(ws1, { header: 1, defval: null, blankrows: false });
    const headerRowIdx = findHeaderRow(rows1);
    if (headerRowIdx < 0) throw new Error('Sheet1 找不到表头行(含商机名称)');
    const colMap = mapColumns(rows1[headerRowIdx]);
    if (colMap.oppName === undefined) throw new Error('Sheet1 表头缺商机名称列');

    const opportunities = parseSheet1(rows1, headerRowIdx, colMap, dicts);

    state.opportunities = opportunities;
    state.dicts = dicts;
    state.fileName = opts.fileName || '';
    state.fileLoaded = true;
    state.modified = false;

    return { opportunities, dicts };
  }

  // ---- buildXlsx: write current state.opportunities + state.dicts to xlsx ----
  function buildXlsx() {
    const X = getXLSX();
    const wb = X.utils.book_new();

    const headers = [
      '#', '销售团队', '负责人', '商机名称', '客户名称',
      '业务线', '业务/产品', '币种', '阶段', '赢率',
      '预计合同金额(含税)', '预计合同金额(不含税)', '预计成交/丢单时间', '备注',
      '丢单原因'
    ];
    const rows = [];
    for (let i = 0; i < 16; i++) rows.push(new Array(15).fill(''));
    rows.push(headers);
    let n = 1;
    for (const o of state.opportunities) {
      if (o.deleted) continue;
      if (o.parseError) continue;
      rows.push([
        n++, o.team, o.owner, o.oppName, o.customer,
        o.productLine, o.product, o.currency, o.stage, o.winRate,
        o.amount, o.amountNet, o.expectedDate === null ? '' : o.expectedDate, o.note,
        o.loseReason || ''
      ]);
    }
    const ws1 = X.utils.aoa_to_sheet(rows);
    X.utils.book_append_sheet(wb, ws1, 'Sheet1');

    const maxDictRows = Math.max(
      state.dicts.teams.length, state.dicts.productLines.length,
      state.dicts.products.length, state.dicts.stages.length, state.dicts.currencies.length
    );
    const sheet2Rows = [['销售团队', '业务线', '业务/产品', '阶段', '币种']];
    for (let i = 0; i < maxDictRows; i++) {
      sheet2Rows.push([
        state.dicts.teams[i] || '',
        state.dicts.productLines[i] || '',
        state.dicts.products[i] || '',
        state.dicts.stages[i] || '',
        state.dicts.currencies[i] || ''
      ]);
    }
    const ws2 = X.utils.aoa_to_sheet(sheet2Rows);
    X.utils.book_append_sheet(wb, ws2, 'Sheet2');

    const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
    return new Uint8Array(out);
  }

  function validateOpportunity(opp) {
    const errs = [];
    if (!opp.team) errs.push({ field: 'team', message: '销售团队必填' });
    if (!opp.owner) errs.push({ field: 'owner', message: '负责人必填' });
    else if (opp.owner.length > 100) errs.push({ field: 'owner', message: '负责人 ≤100 字符' });
    if (!opp.oppName) errs.push({ field: 'oppName', message: '商机名称必填' });
    else if (opp.oppName.length > 200) errs.push({ field: 'oppName', message: '商机名称 ≤200 字符' });
    if (!opp.customer) errs.push({ field: 'customer', message: '客户名称必填' });
    else if (opp.customer.length > 200) errs.push({ field: 'customer', message: '客户名称 ≤200 字符' });
    if (!opp.productLine) errs.push({ field: 'productLine', message: '业务线必填' });
    if (!opp.product) errs.push({ field: 'product', message: '业务/产品必填' });
    if (!opp.currency) errs.push({ field: 'currency', message: '币种必填' });
    if (!opp.stage) errs.push({ field: 'stage', message: '阶段必填' });
    if (typeof opp.winRate !== 'number' || isNaN(opp.winRate) || opp.winRate < 0 || opp.winRate > 1) {
      errs.push({ field: 'winRate', message: '赢率 0~1' });
    }
    if (typeof opp.amount !== 'number' || isNaN(opp.amount) || opp.amount < 0 || opp.amount > 1e15) {
      errs.push({ field: 'amount', message: '含税金额 0~1e15' });
    }
    if (typeof opp.amountNet !== 'number' || isNaN(opp.amountNet) || opp.amountNet < 0 || opp.amountNet > 1e15) {
      errs.push({ field: 'amountNet', message: '不含税金额 0~1e15' });
    }
    if (opp.note && opp.note.length > 500) errs.push({ field: 'note', message: '备注 ≤500 字符' });
    return errs;
  }

  // ---- Pure compute functions (no DOM, no state mutation) ----
  // All take opportunities array, return derived data.
  function isCountable(o) { return !o.deleted && !o.parseError; }

  const DEFAULT_STAGES = [
    'ST1 线索(Leads)', 'ST2 商机(Pipeline)', 'ST3 投标(Proposal)',
    'ST4 赢单(Win)', 'ST5 丢单(Lose)'
  ];

  function getStageList() {
    const stages = state.dicts.stages;
    if (stages && stages.length) return stages;
    return DEFAULT_STAGES;
  }

  function computeKpi(opps) {
    const valid = opps.filter(isCountable);
    const stages = getStageList();
    const oppCount = valid.length;

    const amountByCurrency = {};
    const weightedByCurrency = {};
    for (const o of valid) {
      amountByCurrency[o.currency] = (amountByCurrency[o.currency] || 0) + o.amount;
      weightedByCurrency[o.currency] = (weightedByCurrency[o.currency] || 0) + (o.amount * o.winRate);
    }
    const st4 = valid.filter(o => o.stage === stages.find(s => s.startsWith('ST4'))).length;
    const st5 = valid.filter(o => o.stage === stages.find(s => s.startsWith('ST5'))).length;
    const winRate = (st4 + st5) > 0 ? st4 / (st4 + st5) : 0;
    return { oppCount, amountByCurrency, weightedByCurrency, winRate, st4, st5 };
  }

  function computeFunnel(opps) {
    const valid = opps.filter(isCountable);
    const stages = getStageList();
    return stages.map(stage => {
      const inStage = valid.filter(o => o.stage === stage);
      const amount = inStage.reduce((s, o) => s + o.amount, 0);
      const weighted = inStage.reduce((s, o) => s + o.amount * o.winRate, 0);
      return { stage, count: inStage.length, amount, weighted };
    });
  }

  function computeStageConversion(opps) {
    const funnel = computeFunnel(opps);
    return funnel.map((item, i) => {
      if (i === 0) return Object.assign({}, item, { conversion: null });
      const prev = funnel[i - 1].count;
      return Object.assign({}, item, { conversion: prev > 0 ? item.count / prev : 0 });
    });
  }

  // Excel serial date -> JS Date (treating input as Windows 1900 system)
  function excelSerialToDate(n) {
    if (typeof n !== 'number' || isNaN(n) || n <= 0) return null;
    // 25569 = 1970-01-01 in Excel 1900 system
    const ms = (n - 25569) * 86400 * 1000;
    return new Date(ms);
  }

  function computeTrend(opps) {
    const valid = opps.filter(isCountable);
    const buckets = {};  // 'YYYY-MM' -> { count, amount, weighted }
    for (const o of valid) {
      const d = excelSerialToDate(o.expectedDate);
      if (!d || isNaN(d.getTime())) continue;
      const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
      if (!buckets[key]) buckets[key] = { month: key, count: 0, amount: 0, weighted: 0 };
      buckets[key].count++;
      buckets[key].amount += o.amount;
      buckets[key].weighted += o.amount * o.winRate;
    }
    return Object.values(buckets).sort((a, b) => a.month < b.month ? -1 : 1);
  }

  function computeTopN(opps, opts) {
    const valid = opps.filter(isCountable);
    const groups = {};
    for (const o of valid) {
      const key = o[opts.groupBy] || '(未分类)';
      if (!groups[key]) groups[key] = { name: key, count: 0, amount: 0, weighted: 0 };
      groups[key].count++;
      groups[key].amount += o.amount;
      groups[key].weighted += o.amount * o.winRate;
    }
    const arr = Object.values(groups);
    arr.sort((a, b) => (b[opts.metric] || 0) - (a[opts.metric] || 0));
    return arr.slice(0, opts.n || 10);
  }

  function computePareto(opps, opts) {
    const top = computeTopN(opps, Object.assign({}, opts, { n: 9999 }));
    const total = top.reduce((s, x) => s + (x[opts.metric] || 0), 0);
    let cum = 0;
    return top.map(item => {
      cum += (item[opts.metric] || 0);
      return Object.assign({}, item, { cumulativePct: total > 0 ? (cum / total) * 100 : 0 });
    });
  }

  function computeLoseReasonAgg(opps) {
    const valid = opps.filter(isCountable);
    const st5Stage = getStageList().find(s => s.startsWith('ST5'));
    const st5 = valid.filter(o => o.stage === st5Stage);
    const counts = {};
    for (const o of st5) {
      if (!o.loseReason) continue;
      for (const r of o.loseReason.split(',').map(s => s.trim()).filter(Boolean)) {
        counts[r] = (counts[r] || 0) + 1;
      }
    }
    return Object.entries(counts).map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }

  const api = { state, reset, makeOpportunity, markModified, parseXlsx, buildXlsx, validateOpportunity, computeKpi, computeFunnel, computeStageConversion, computeTrend, computeTopN, computePareto, computeLoseReasonAgg };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CRM = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
