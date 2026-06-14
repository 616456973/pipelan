// Core data layer for RAS CRM. UMD pattern.
// v2.0: state is a DB mirror (loaded from db.js). Mutations go through db.js.
// This file is a thin facade over db.js + pure helpers (validate/compute).
(function (global) {
  'use strict';

  // ---- Node-only / browser shim for db.js ----
  // In Node: require db.js directly. In browser: db.js is loaded as <script> and exposes window.CRM_DB.
  const CRM_DB = (typeof require !== 'undefined') ? require('./db.js') : null;

  function getDb() {
    if (CRM_DB) return CRM_DB;
    if (typeof window !== 'undefined' && window.CRM_DB) return window.CRM_DB;
    throw new Error('db.js not loaded');
  }

  // ---- State (DB mirror) ----
  const state = {
    opportunities: [],
    dicts: { teams: [], owners: [], customers: [], productLines: [], products: [], salesChannels: [], stages: [], currencies: [], loseReasons: [] },
    fileName: '',
    fileLoaded: false,
    dbEmpty: true,
    recentlyChanged: new Set(),  // opp IDs that were just imported/changed (highlighted briefly)
    currentOppId: null,           // opp ID currently shown in the 详情 tab (null = no opp selected)
    detailEditing: false          // true = detail tab is in edit mode
  };

  // Mark a set of opp IDs as "recently changed" (highlighted in the list for 30s).
  // No-op in Node; safe to call from any code path.
  function markOppsAsChanged(ids) {
    if (!ids || !ids.length) return;
    for (const id of ids) state.recentlyChanged.add(id);
    // Auto-clear after 30 seconds
    setTimeout(() => {
      for (const id of ids) state.recentlyChanged.delete(id);
    }, 30000);
  }

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

  async function init() {
    // In browser, db.js is already initialized at app startup. In Node (tests),
    // caller must invoke CRM_DB.initDb({forceInMemory:true}) first. This init just refreshes state.
    await refreshState();
  }

  async function refreshState() {
    const s = getDb().loadAllToState();
    state.opportunities = s.opportunities;
    state.dicts = s.dicts;
    syncDictsFromOpps();  // Auto-populate customer/product/salesChannel/owner from existing opps
    state.dbEmpty = state.opportunities.length === 0 &&
                    state.dicts.teams.length === 0 &&
                    state.dicts.owners.length === 0 &&
                    state.dicts.customers.length === 0 &&
                    state.dicts.productLines.length === 0 &&
                    state.dicts.products.length === 0 &&
                    state.dicts.salesChannels.length === 0 &&
                    state.dicts.stages.length === 0 &&
                    state.dicts.currencies.length === 0 &&
                    state.dicts.loseReasons.length === 0;
  }

  function reset() {
    // Reset in-memory mirror only. Does NOT touch DB. For full DB wipe, use db.clearAll.
    state.opportunities = [];
    state.dicts = { teams: [], owners: [], customers: [], productLines: [], products: [], salesChannels: [], stages: [], currencies: [], loseReasons: [] };
    state.fileName = '';
    state.fileLoaded = false;
    state.dbEmpty = true;
  }

  // Auto-populate customer/product/salesChannel/owner dicts from existing opportunities.
  // Idempotent: re-running does not add duplicates.
  // Scans non-deleted, non-parseError opps and ensures their values exist in the dicts (state + DB).
  function syncDictsFromOpps() {
    // Collect unique values from opps
    const customers = new Set(state.dicts.customers || []);
    const products = new Set(state.dicts.products || []);
    const salesChannels = new Set(state.dicts.salesChannels || []);
    const owners = new Set(state.dicts.owners || []);
    for (const o of state.opportunities) {
      if (o.deleted || o.parseError) continue;
      if (o.customer) customers.add(o.customer);
      if (o.product) products.add(o.product);
      if (o.salesChannel) salesChannels.add(o.salesChannel);
      if (o.owner) owners.add(o.owner);
    }
    // Find new values (not in current state.dicts)
    const newCustomers = [...customers].filter(c => !(state.dicts.customers || []).includes(c));
    const newProducts = [...products].filter(p => !(state.dicts.products || []).includes(p));
    const newSalesChannels = [...salesChannels].filter(s => !(state.dicts.salesChannels || []).includes(s));
    const newOwners = [...owners].filter(o => !(state.dicts.owners || []).includes(o));
    // Persist new values to DB
    try {
      const db = getDb();
      for (const c of newCustomers) db.addDictItem('dict_customers', c);
      for (const p of newProducts) db.addDictItem('dict_products', p);
      for (const s of newSalesChannels) db.addDictItem('dict_sales_channels', s);
      for (const o of newOwners) db.addDictItem('dict_owners', o);
    } catch (e) {
      console.error('syncDictsFromOpps: DB write failed', e);
    }
    // Update state mirror
    state.dicts.customers = [...customers];
    state.dicts.products = [...products];
    state.dicts.salesChannels = [...salesChannels];
    state.dicts.owners = [...owners];
    // Return what was added (for caller info, optional)
    return {
      customers: newCustomers.length,
      products: newProducts.length,
      salesChannels: newSalesChannels.length,
      owners: newOwners.length
    };
  }

  // ---- Opportunity factory + pure validators ----
  function makeOpportunity(partial) {
    return Object.assign({
      id: (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      oppName: '',
      team: '', owner: '', customer: '',
      productLine: '', product: '', salesChannel: '',
      stage: 'ST1 线索(Leads)',
      invoiceStatus: '',
      currency: '',
      winRate: 0, amountTaxIncluded: 0, amountRmbEquivalent: 0,
      expectedDate: null, note: '', loseReason: '',
      projectStatus: '',
      dictRefs: null,
      deleted: false, parseError: null, position: 0
    }, partial || {});
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
      amountByCurrency[o.currency] = (amountByCurrency[o.currency] || 0) + (o.amountTaxIncluded || 0);
      weightedByCurrency[o.currency] = (weightedByCurrency[o.currency] || 0) + ((o.amountTaxIncluded || 0) * (o.winRate || 0));
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
      const amount = inStage.reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
      const weighted = inStage.reduce((s, o) => s + (o.amountTaxIncluded || 0) * (o.winRate || 0), 0);
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
      buckets[key].amount += (o.amountTaxIncluded || 0);
      buckets[key].weighted += (o.amountTaxIncluded || 0) * (o.winRate || 0);
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
      groups[key].amount += (o.amountTaxIncluded || 0);
      groups[key].weighted += (o.amountTaxIncluded || 0) * (o.winRate || 0);
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

  // ---- xlsx import / export facade ----
  async function importXlsxFile(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    const result = getDb().importFromXlsx(buffer);
    state.fileName = file.name;
    state.fileLoaded = true;
    await refreshState();
    // Collect all currently-loaded opp IDs (everything that was just imported).
    // We use the refreshed state.opportunities, which is the source of truth after
    // refreshState() finishes.
    const importedIds = (state.opportunities || [])
      .filter(o => !o.deleted && !o.parseError)
      .map(o => o.id);
    return Object.assign({}, result, { importedIds });
  }

  function exportXlsxBlob() {
    return getDb().exportToXlsx();
  }

  // ---- DB backup / restore facade ----
  function downloadBackup() {
    return getDb().exportBackup();  // Uint8Array of .sqlite file bytes
  }

  async function restoreFromBackup(file) {
    const buffer = new Uint8Array(await file.arrayBuffer());
    getDb().importBackup(buffer);
    state.fileName = '';
    state.fileLoaded = false;
    await refreshState();
  }

  // ---- UI convenience: write opp to DB + mirror ----
  function upsertOpp(opp) {
    if (!opp.id) opp.id = makeOpportunity().id;
    if (opp.position == null) opp.position = 0;
    getDb().upsertOpp(opp);
    // Update in-memory state
    const idx = state.opportunities.findIndex(o => o.id === opp.id);
    if (idx >= 0) state.opportunities[idx] = opp;
    else state.opportunities.push(opp);
  }

  // ---- Dict CRUD (persists to DB + updates state mirror) ----
  const DICT_TABLE = {
    teams: 'dict_teams', owners: 'dict_owners', customers: 'dict_customers',
    productLines: 'dict_product_lines', products: 'dict_products',
    salesChannels: 'dict_sales_channels', stages: 'dict_stages',
    currencies: 'dict_currencies', loseReasons: 'dict_lose_reasons'
  };
  const DICT_TO_OPP_FIELD = {
    teams: 'team', owners: 'owner', customers: 'customer',
    productLines: 'productLine', products: 'product',
    salesChannels: 'salesChannel', stages: 'stage', currencies: 'currency'
    // loseReasons: stored as comma-separated in opp.loseReason
  };

  function addDictValue(key, value) {
    const table = DICT_TABLE[key];
    if (!table) return false;
    getDb().addDictItem(table, value);
    if (state.dicts[key] && !state.dicts[key].includes(value)) {
      state.dicts[key].push(value);
    }
    return true;
  }

  function updateDictValue(key, oldVal, newVal) {
    const table = DICT_TABLE[key];
    if (!table) return false;
    getDb().updateDictItem(table, oldVal, newVal);
    // Update state mirror
    if (state.dicts[key]) {
      const i = state.dicts[key].indexOf(oldVal);
      if (i >= 0) state.dicts[key][i] = newVal;
    }
    // Cascade: also update opps that reference this value
    const oppField = DICT_TO_OPP_FIELD[key];
    if (oppField) {
      for (const o of state.opportunities) {
        if (o[oppField] === oldVal) o[oppField] = newVal;
      }
    }
    // For loseReasons, opp.loseReason is comma-separated
    if (key === 'loseReasons') {
      for (const o of state.opportunities) {
        if (o.loseReason && o.loseReason.split(',').map(s => s.trim()).includes(oldVal)) {
          o.loseReason = o.loseReason.split(',').map(s => s.trim() === oldVal ? newVal : s.trim()).join(',');
        }
      }
    }
    return true;
  }

  function deleteDictValue(key, value) {
    const table = DICT_TABLE[key];
    if (!table) return false;
    getDb().deleteDictItem(table, value);
    // Update state mirror
    if (state.dicts[key]) {
      const i = state.dicts[key].indexOf(value);
      if (i >= 0) state.dicts[key].splice(i, 1);
    }
    // Cascade: rewrite references to '未分类' (per existing convention)
    const oppField = DICT_TO_OPP_FIELD[key];
    if (oppField) {
      for (const o of state.opportunities) {
        if (o[oppField] === value) o[oppField] = '未分类';
      }
    }
    if (key === 'loseReasons') {
      for (const o of state.opportunities) {
        if (o.loseReason) {
          o.loseReason = o.loseReason.split(',').map(s => s.trim()).filter(s => s && s !== value).join(',');
        }
      }
    }
    return true;
  }

  // No-op: db.js already auto-saves on every db.run via scheduleSave().
  // Kept for backward compatibility with existing call sites.
  function markModified() {}

  // ---- KPI target persistence (stored in meta table; value in 元) ----
  function getKpiTarget() {
    const v = getDb().getMeta('kpi_target');
    return v ? parseFloat(String(v)) || 0 : 0;
  }

  async function setKpiTarget(value) {
    const num = Number(value) || 0;
    getDb().setMeta('kpi_target', String(num));
    // Force immediate flush to IndexedDB so quick refreshes don't lose data
    try { await getDb().flushSave(); } catch (e) { console.warn('flushSave failed', e); }
    return num;
  }

  // ---- Export ----
  const api = {
    state,
    init, reset, refreshState,
    makeOpportunity, validateOpportunity,
    computeKpi, computeFunnel, computeStageConversion,
    computeTrend, computeTopN, computePareto, computeLoseReasonAgg,
    importXlsxFile, exportXlsxBlob,
    downloadBackup, restoreFromBackup,
    upsertOpp,
    addDictValue, updateDictValue, deleteDictValue, markModified,
    syncDictsFromOpps,
    markOppsAsChanged,
    getKpiTarget, setKpiTarget
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CRM = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
