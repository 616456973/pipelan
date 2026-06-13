// Smart xlsx parser + builder. Alias-aware column mapping. Adaptive dict parsing.
// Used by db.js for xlsx import/export.
(function (global) {
  'use strict';

  // ---- Column name aliases (key -> array of accepted header names) ----
  const COLUMN_ALIASES = {
    oppName:        ['商机名称', '商机', '项目名称', 'Opp Name', 'Opportunity'],
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
    note:           ['自由备注', 'Internal Note', 'Notes'],
    loseReason:     ['丢单原因', '失败原因', 'Lose Reason']
  };

  // ---- Dict key classification ----
  const DICT_CLASSIFICATION = {
    teams:        (h, v) => /团队|team/i.test(h),
    productLines: (h, v) => /业务线|产品线|product.?line/i.test(h) || (v.some(x => /^PL\d/.test(x))),
    products:     (h, v) => /产品|product/i.test(h) || (v.some(x => /^P\d{3}/.test(x))),
    stages:       (h, v) => /阶段|stage/i.test(h) || (v.some(x => /^ST\d/.test(x))),
    currencies:   (h, v) => /币种|currenc/i.test(h) || (v.some(x => /^(USD|SGD|RMB|CNY|EUR|JPY|GBP|HKD)$/.test(x)))
  };

  const DEFAULT_LOSE_REASONS = ['价格过高', '竞品优势', '客户预算', '技术不符', '决策延期', '客户取消', '其他'];

  // ---- Helpers ----
  function getXLSX() {
    if (typeof require !== 'undefined') {
      return require('../vendor/sheetjs/xlsx.full.min.js');
    }
    if (typeof globalThis.XLSX !== 'undefined') return globalThis.XLSX;
    throw new Error('XLSX not loaded');
  }

  // Normalize full-width colon ： to half-width : in any string
  // Reason: xlsx stage values can be either "ST4：赢单(Win)" or "ST4:赢单(Win)"
  // depending on template version. Dictionary and opportunity stage values must match
  // for computeKpi/filtering to work.
  function normalizeStr(s) {
    if (s == null) return s;
    return String(s).replace(/：/g, ':');
  }

  function makeId() {
    if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }

  function findHeaderRow(rows) {
    // Try Chinese first (preferred)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      if (row.some(c => typeof c === 'string' && c.indexOf('商机名称') >= 0)) return i;
    }
    // Fallback: look for any of the alias keywords that are recognizably header-y
    const headerKeywords = [
      '商机名称', '商机', '项目名称', 'Opp Name', 'Opportunity',
      '主责销售', 'Sales Rep', 'Owner', '负责人',
      '客户名称', '客户', 'Customer',
      '团队', 'Team'
    ];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const matchCount = row.filter(c => {
        if (typeof c !== 'string') return false;
        return headerKeywords.some(k => c.indexOf(k) >= 0);
      }).length;
      // Require at least 2 keyword matches to avoid false positives
      if (matchCount >= 2) return i;
    }
    return -1;
  }

  // ---- Column mapping (alias-aware) ----
  function mapColumns(headerRow) {
    const m = {};
    for (let i = 0; i < headerRow.length; i++) {
      const cell = String(headerRow[i] || '').trim();
      for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.some(a => cell === a || cell.indexOf(a) >= 0)) {
          if (m[key] === undefined) m[key] = i;
        }
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

  function cleanStr(v) {
    return v == null ? '' : String(v).trim();
  }

  // ---- Sheet1 parser ----
  function parseSheet1(rows, headerRowIdx, colMap) {
    const out = [];
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every(c => c === null || c === '' || c === undefined)) continue;

      const opp = {
        id: makeId(),
        team: '', owner: '', customer: '',
        productLine: '', product: '', salesChannel: '', stage: '',
        invoiceStatus: '', currency: '',
        winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0,
        expectedDate: null, note: '', loseReason: '',
        deleted: false, parseError: null, position: r + 1
      };

      try {
        if (colMap.oppName !== undefined)  opp.oppName = normalizeStr(cleanStr(row[colMap.oppName]));
        if (colMap.team !== undefined)           opp.team = normalizeStr(cleanStr(row[colMap.team]));
        if (colMap.owner !== undefined)          opp.owner = normalizeStr(cleanStr(row[colMap.owner]));
        if (colMap.customer !== undefined)       opp.customer = normalizeStr(cleanStr(row[colMap.customer]));
        if (colMap.productLine !== undefined)    opp.productLine = normalizeStr(cleanStr(row[colMap.productLine]));
        if (colMap.product !== undefined)        opp.product = normalizeStr(cleanStr(row[colMap.product]));
        if (colMap.salesChannel !== undefined)   opp.salesChannel = normalizeStr(cleanStr(row[colMap.salesChannel]));
        if (colMap.stage !== undefined)          opp.stage = normalizeStr(cleanStr(row[colMap.stage])) || 'ST1 线索(Leads)';
        if (colMap.invoiceStatus !== undefined)  opp.invoiceStatus = normalizeStr(cleanStr(row[colMap.invoiceStatus]));
        if (colMap.currency !== undefined)       opp.currency = normalizeStr(cleanStr(row[colMap.currency]));
        if (colMap.winRate !== undefined) {
          const wr = toNumber(row[colMap.winRate]);
          if (wr === null) throw new Error('winRate 不是数字');
          opp.winRate = wr;
        }
        if (colMap.amount !== undefined) {
          const amt = toNumber(row[colMap.amount]);
          if (amt === null) throw new Error('amount 不是数字');
          opp.amountTaxIncluded = amt;
        }
        if (colMap.amountRmb !== undefined) {
          const rmb = toNumber(row[colMap.amountRmb]);
          if (rmb === null) throw new Error('amountRmb 不是数字');
          opp.amountRmbEquivalent = rmb;
        } else if (colMap.amount !== undefined) {
          // auto-compute from amount × rate (fallback when amountRmb column not present)
          const rate = (typeof EXCHANGE_RATES_TO_RMB !== 'undefined' && EXCHANGE_RATES_TO_RMB[opp.currency]) || 1.0;
          opp.amountRmbEquivalent = opp.amountTaxIncluded * rate;
        }
        if (colMap.expectedDate !== undefined) {
          const d = row[colMap.expectedDate];
          opp.expectedDate = (d === undefined || d === '' || d === null) ? null : d;
        }
        if (colMap.note !== undefined)        opp.note = cleanStr(row[colMap.note]);
        if (colMap.loseReason !== undefined)  opp.loseReason = cleanStr(row[colMap.loseReason]);
      } catch (e) {
        opp.parseError = { row: r + 1, message: e.message };
      }
      out.push(opp);
    }
    return out;
  }

  // ---- Sheet2 smart parser (adaptive dict extraction) ----
  function parseSheet2Smart(rows) {
    const dicts = {
      teams: [], productLines: [], products: [],
      stages: [], currencies: [], loseReasons: DEFAULT_LOSE_REASONS.slice()
    };

    if (!rows.length) return dicts;

    // Find header row (any row containing dict keywords)
    let headerRow = -1;
    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i] || [];
      if (row.some(c => typeof c === 'string' && /团队|team|产品|product|阶段|stage|币种|currenc|业务|product/i.test(c))) {
        headerRow = i;
        break;
      }
    }
    if (headerRow < 0) return dicts;

    // Collect column data (skip empty cells, dedupe later)
    const maxCol = Math.max(...rows.map(r => (r || []).length));
    const cols = [];
    for (let c = 0; c < maxCol; c++) {
      const colVals = [];
      for (let r = headerRow + 1; r < rows.length; r++) {
        const v = rows[r] ? String(rows[r][c] || '').trim() : '';
        if (v) colVals.push(normalizeStr(v));
      }
      const headerText = String(rows[headerRow][c] || '').trim();
      cols.push({ c, headerText, values: colVals });
    }

    // Classify each column
    for (const col of cols) {
      if (col.values.length === 0) continue;
      // Try each dict key
      let matched = false;
      for (const [dictKey, classifier] of Object.entries(DICT_CLASSIFICATION)) {
        if (classifier(col.headerText, col.values)) {
          dicts[dictKey] = mergeUnique(dicts[dictKey], col.values);
          matched = true;
          break;
        }
      }
      // If header text has '产品' but we haven't matched, try products
      if (!matched && /业务\/产品|产品/.test(col.headerText)) {
        dicts.products = mergeUnique(dicts.products, col.values);
      }
    }

    return dicts;
  }

  function mergeUnique(existing, additions) {
    const seen = new Set(existing);
    const out = existing.slice();
    for (const v of additions) {
      if (!seen.has(v)) { seen.add(v); out.push(v); }
    }
    return out;
  }

  // ---- Main parse entry ----
  function parseXlsxSmart(buffer) {
    const X = getXLSX();
    const wb = X.read(buffer, { type: 'array', cellDates: false, cellNF: true });
    if (!wb.SheetNames.length) throw new Error('xlsx 没有 sheet');

    // Sheet1: opportunities
    const ws1 = wb.Sheets[wb.SheetNames[0]];
    const rows1 = X.utils.sheet_to_json(ws1, { header: 1, defval: null, blankrows: false });
    const headerRowIdx = findHeaderRow(rows1);
    let colMap = {};
    let opportunities = [];
    if (headerRowIdx >= 0) {
      colMap = mapColumns(rows1[headerRowIdx]);
      opportunities = parseSheet1(rows1, headerRowIdx, colMap);
    }

    // Sheet2: dicts (smart parse)
    let dicts;
    if (wb.SheetNames[1]) {
      const ws2 = wb.Sheets[wb.SheetNames[1]];
      const rows2 = X.utils.sheet_to_json(ws2, { header: 1, defval: null, blankrows: false });
      dicts = parseSheet2Smart(rows2);
    } else {
      dicts = parseSheet2Smart([]);
    }

    // If Sheet2 didn't populate any dict (or was missing), infer dicts from Sheet1 data
    const totalDictItems = dicts.teams.length + dicts.productLines.length + dicts.products.length
      + dicts.stages.length + dicts.currencies.length;
    if (totalDictItems === 0) {
      let inferred;
      if (headerRowIdx >= 0) {
        inferred = inferDictsFromSheet1(rows1, headerRowIdx, colMap);
      } else {
        // No header found at all: scan all data rows for value patterns
        inferred = inferDictsFromValues(rows1);
      }
      dicts = mergeDicts(dicts, inferred);
    }

    return { opportunities, dicts };
  }

  function mergeDicts(existing, additions) {
    const out = {};
    for (const key of Object.keys(existing)) {
      out[key] = mergeUnique(existing[key] || [], additions[key] || []);
    }
    return out;
  }

  function inferDictsFromSheet1(rows, headerRowIdx, colMap) {
    const dicts = { teams: [], productLines: [], products: [], stages: [], currencies: [] };
    // Collect data rows
    const dataRows = [];
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every(c => c === null || c === '' || c === undefined)) continue;
      dataRows.push(row);
    }
    if (!dataRows.length) return dicts;
    const headerRow = rows[headerRowIdx] || [];
    const maxCol = Math.max(...dataRows.map(r => r.length));
    // For each column, look up its dict classification via the header
    for (let c = 0; c < maxCol; c++) {
      const headerText = String(headerRow[c] || '').trim();
      const vals = dataRows.map(r => String(r[c] || '').trim()).filter(v => v);
      if (!vals.length) continue;
      // Try each dict key (first match wins, but for the same key all matching columns are added)
      for (const [dictKey, classifier] of Object.entries(DICT_CLASSIFICATION)) {
        if (classifier(headerText, vals)) {
          dicts[dictKey] = mergeUnique(dicts[dictKey], vals);
          break;
        }
      }
    }
    return dicts;
  }

  // Last-resort: scan all rows for value patterns matching dict signatures.
  function inferDictsFromValues(rows) {
    const dicts = { teams: [], productLines: [], products: [], stages: [], currencies: [] };
    // Pattern checks
    const teamRe = /^(基础业务|AIPULSE|[A-Za-z一-鿿]{2,}(团队|部|Team))$/;
    const plRe = /^PL\d/;
    const productRe = /^P\d{3}/;
    const stageRe = /^ST\d/;
    const currencyRe = /^(USD|SGD|RMB|CNY|EUR|JPY|GBP|HKD)$/;
    for (const row of rows) {
      for (const cell of (row || [])) {
        const v = String(cell || '').trim();
        if (!v) continue;
        if (teamRe.test(v)) dicts.teams = mergeUnique(dicts.teams, [v]);
        else if (plRe.test(v)) dicts.productLines = mergeUnique(dicts.productLines, [v]);
        else if (productRe.test(v)) dicts.products = mergeUnique(dicts.products, [v]);
        else if (stageRe.test(v)) dicts.stages = mergeUnique(dicts.stages, [v]);
        else if (currencyRe.test(v)) dicts.currencies = mergeUnique(dicts.currencies, [v]);
      }
    }
    return dicts;
  }

  // ---- Build xlsx from canonical state (DB → xlsx) ----
  function buildXlsxFromState(state) {
    const X = getXLSX();
    const wb = X.utils.book_new();

    // Sheet1: 17 columns (v3.0 schema)
    const headers = [
      '#', '销售团队', '主责销售', '客户名称', '商机名称',
      '业务线', '业务线产品', '销售渠道', '阶段', '发票状态',
      '币种', '赢单概率',
      '预估合同金额（含税）', '预估合同金额（RMB）', '预计落单时间',
      '发票状态', '丢单原因'
    ];
    const sheet1Rows = [];
    for (let i = 0; i < 16; i++) sheet1Rows.push(new Array(headers.length).fill(''));
    sheet1Rows.push(headers);
    let n = 1;
    for (const o of (state.opportunities || [])) {
      if (o.deleted) continue;
      if (o.parseError) continue;
      sheet1Rows.push([
        n++, o.team, o.owner, o.customer, '',
        o.productLine, o.product, o.salesChannel || '', o.stage, o.invoiceStatus || '',
        o.currency, o.winRate,
        o.amountTaxIncluded, o.amountRmbEquivalent, o.expectedDate === null ? '' : o.expectedDate,
        o.invoiceStatus || '', o.loseReason || ''
      ]);
    }
    const ws1 = X.utils.aoa_to_sheet(sheet1Rows);
    stripStyles(ws1);
    X.utils.book_append_sheet(wb, ws1, 'Sheet1');

    // Sheet2: canonical 5-dict block layout
    const dicts = state.dicts || {};
    const maxDictRows = Math.max(
      (dicts.teams || []).length,
      (dicts.productLines || []).length,
      (dicts.products || []).length,
      (dicts.stages || []).length,
      (dicts.currencies || []).length
    );
    const sheet2Rows = [['销售团队', '业务线', '业务/产品', '阶段', '币种']];
    for (let i = 0; i < maxDictRows; i++) {
      sheet2Rows.push([
        (dicts.teams || [])[i] || '',
        (dicts.productLines || [])[i] || '',
        (dicts.products || [])[i] || '',
        (dicts.stages || [])[i] || '',
        (dicts.currencies || [])[i] || ''
      ]);
    }
    const ws2 = X.utils.aoa_to_sheet(sheet2Rows);
    stripStyles(ws2);
    X.utils.book_append_sheet(wb, ws2, 'Sheet2');

    const bytes = X.write(wb, { type: 'array', bookType: 'xlsx' });
    return new Uint8Array(bytes);
  }

  // Strip cell styles so Excel uses default General format
  function stripStyles(ws) {
    if (!ws) return;
    Object.keys(ws).forEach(addr => {
      if (addr.startsWith('!')) return;
      const cell = ws[addr];
      if (cell && typeof cell === 'object') {
        cell.s = { numFmtId: 0, fontId: 0, fillId: 0, borderId: 0, xfId: 0 };
      }
    });
  }

  // ---- Export ----
  const api = { parseXlsxSmart, buildXlsxFromState, COLUMN_ALIASES, DICT_CLASSIFICATION };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CRM_XLSX = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
