// SQLite data layer for RAS CRM. UMD pattern (browser + Node).
// Schema: 8 tables. Auto-persist to IndexedDB. xlsx import/export comes in Task B.
(function (global) {
  'use strict';

  // ---- Node-only deps (no-op in browser) ----
  const nodePath = (typeof require !== 'undefined') ? require('node:path') : null;

  // ---- Lazy init ----
  let SQL = null;
  let db = null;
  let saveTimer = null;
  const IDB_KEY = 'crm-sqlite';
  const IDB_NAME = 'ras-crm-db';
  const IDB_STORE = 'kv';

  async function initSqlJs() {
    if (SQL) return SQL;
    if (typeof require !== 'undefined') {
      const initSqlJs = require('../vendor/sqljs/sql-wasm.js');
      SQL = await initSqlJs({
        locateFile: (f) => nodePath.join(nodePath.dirname(require.main ? require.main.filename : __dirname), '..', 'vendor', 'sqljs', f)
      });
    } else {
      const initSqlJs = (global.initSqlJs || global.window.initSqlJs);
      if (!initSqlJs) throw new Error('sql.js not loaded; include vendor/sqljs/sql-wasm.js');
      SQL = await initSqlJs({
        locateFile: (f) => 'vendor/sqljs/' + f
      });
    }
    return SQL;
  }

  async function initDb(opts) {
    opts = opts || {};
    await initSqlJs();
    if (opts.forceInMemory) {
      db = new SQL.Database();
    } else {
      const bytes = await loadFromIndexedDb();
      db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();
    }
    runMigrations();
  }

  // ---- Schema / Migrations ----
  function runMigrations() {
    // Make sure meta table exists for version tracking
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
    const v = getMeta('schema_version');
    if (!v) applyV1Schema();
    setMeta('schema_version', '1');
  }

  function applyV1Schema() {
    db.run(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_teams (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_product_lines (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_products (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_stages (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_currencies (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS dict_lose_reasons (value TEXT PRIMARY KEY);`);
    db.run(`CREATE TABLE IF NOT EXISTS oportunidades (
      id TEXT PRIMARY KEY, team TEXT, owner TEXT, opp_name TEXT, customer TEXT,
      product_line TEXT, product TEXT, currency TEXT, stage TEXT,
      win_rate REAL, amount REAL, amount_net REAL,
      expected_date REAL, note TEXT, lose_reason TEXT,
      deleted INTEGER DEFAULT 0, parse_error TEXT, position INTEGER
    );`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_team ON oportunidades(team);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_customer ON oportunidades(customer);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_stage ON oportunidades(stage);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_opp_deleted ON oportunidades(deleted);`);
  }

  function getMeta(key) {
    const r = db.exec('SELECT value FROM meta WHERE key=?', [key]);
    return r[0] && r[0].values[0] && r[0].values[0][0];
  }
  function setMeta(key, value) {
    db.run('INSERT OR REPLACE INTO meta VALUES (?,?)', [key, String(value)]);
    scheduleSave();
  }

  // ---- Persistence (IndexedDB) ----
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToIndexedDb, 500);
  }

  async function saveToIndexedDb() {
    if (typeof indexedDB === 'undefined') return;
    try {
      const bytes = db.export();
      const idb = await openIdb();
      await idbPut(idb, bytes);
    } catch (e) { /* swallow */ }
  }

  async function loadFromIndexedDb() {
    if (typeof indexedDB === 'undefined') return null;
    try {
      const idb = await openIdb();
      return await idbGet(idb);
    } catch (e) { return null; }
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(idb, bytes) {
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  function idbGet(idb) {
    return new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  // ---- CRUD: Opportunities ----
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

  const COLS = 'id, team, owner, opp_name, customer, product_line, product, currency, stage, win_rate, amount, amount_net, expected_date, note, lose_reason, deleted, parse_error, position';

  function listOpps(opts) {
    opts = opts || {};
    let sql = 'SELECT ' + COLS + ' FROM oportunidades WHERE 1=1';
    const params = [];
    if (!opts.includeDeleted) sql += ' AND deleted=0';
    if (opts.team) { sql += ' AND team=?'; params.push(opts.team); }
    if (opts.stage) { sql += ' AND stage=?'; params.push(opts.stage); }
    if (opts.currency) { sql += ' AND currency=?'; params.push(opts.currency); }
    if (opts.search) { sql += ' AND (opp_name LIKE ? OR customer LIKE ?)'; params.push('%' + opts.search + '%', '%' + opts.search + '%'); }
    sql += ' ORDER BY position ASC, id ASC';
    const r = db.exec(sql, params);
    if (!r[0]) return [];
    return r[0].values.map(rowToOpp);
  }

  function getOpp(id) {
    const r = db.exec('SELECT ' + COLS + ' FROM oportunidades WHERE id=?', [id]);
    if (!r[0] || !r[0].values[0]) return null;
    return rowToOpp(r[0].values[0]);
  }

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

  function softDeleteOpp(id) {
    db.run('UPDATE oportunidades SET deleted=1 WHERE id=?', [id]);
    scheduleSave();
  }

  function undeleteOpp(id) {
    db.run('UPDATE oportunidades SET deleted=0 WHERE id=?', [id]);
    scheduleSave();
  }

  // ---- CRUD: Dictionaries ----
  const DICT_TABLES = ['dict_teams', 'dict_product_lines', 'dict_products', 'dict_stages', 'dict_currencies', 'dict_lose_reasons'];
  const DICT_KEYS = { dict_teams: 'teams', dict_product_lines: 'productLines', dict_products: 'products', dict_stages: 'stages', dict_currencies: 'currencies', dict_lose_reasons: 'loseReasons' };
  const DICT_TO_OPP = { dict_teams: 'team', dict_product_lines: 'productLine', dict_products: 'product', dict_stages: 'stage', dict_currencies: 'currency' };

  function listDict(table) {
    if (!DICT_TABLES.includes(table)) throw new Error('Invalid dict table: ' + table);
    const r = db.exec('SELECT value FROM ' + table + ' ORDER BY rowid ASC');
    if (!r[0]) return [];
    return r[0].values.map(v => v[0]);
  }

  function addDictItem(table, value) {
    if (!DICT_TABLES.includes(table)) throw new Error('Invalid dict table: ' + table);
    db.run('INSERT OR IGNORE INTO ' + table + ' VALUES (?)', [value]);
    scheduleSave();
  }

  function updateDictItem(table, oldVal, newVal) {
    if (!DICT_TABLES.includes(table)) throw new Error('Invalid dict table: ' + table);
    db.run('UPDATE ' + table + ' SET value=? WHERE value=?', [newVal, oldVal]);
    scheduleSave();
  }

  function deleteDictItem(table, value) {
    if (!DICT_TABLES.includes(table)) throw new Error('Invalid dict table: ' + table);
    db.run('DELETE FROM ' + table + ' WHERE value=?', [value]);
    scheduleSave();
  }

  function countDictRefs(table, value) {
    const oppField = DICT_TO_OPP[table];
    if (oppField) {
      const r = db.exec('SELECT COUNT(*) FROM oportunidades WHERE deleted=0 AND ' + oppField + '=?', [value]);
      return r[0] ? r[0].values[0][0] : 0;
    }
    if (table === 'dict_lose_reasons') {
      const r = db.exec("SELECT COUNT(*) FROM oportunidades WHERE deleted=0 AND lose_reason LIKE ?", ['%' + value + '%']);
      return r[0] ? r[0].values[0][0] : 0;
    }
    return 0;
  }

  function listDicts() {
    const out = {};
    for (const t of DICT_TABLES) out[DICT_KEYS[t]] = listDict(t);
    return out;
  }

  function loadAllToState() {
    return { opportunities: listOpps(), dicts: listDicts() };
  }

  // ---- Maintenance ----
  function listTables() {
    const r = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    return r[0] ? r[0].values.map(v => v[0]) : [];
  }

  function clearAll() {
    for (const t of DICT_TABLES) db.run('DELETE FROM ' + t);
    db.run('DELETE FROM oportunidades');
    scheduleSave();
  }

  function exportBackup() {
    return db.export();
  }

  function importBackup(bytes) {
    if (db) db.close();
    db = new SQL.Database(new Uint8Array(bytes));
    runMigrations();
    scheduleSave();
  }

  // ---- Test helper ----
  function _setDbForTest(testDb) { db = testDb; }

  // ---- Export ----
  const api = {
    initDb,
    listOpps, getOpp, upsertOpp, softDeleteOpp, undeleteOpp,
    listDict, addDictItem, updateDictItem, deleteDictItem, countDictRefs,
    listDicts, loadAllToState,
    listTables, clearAll,
    exportBackup, importBackup,
    scheduleSave,
    _setDbForTest
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CRM_DB = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
