#!/usr/bin/env node
// Compare two xlsx files (or roundtrip one). Exit 0 if identical, 1 if different.
// Usage:
//   node tools/compare-xlsx.js <a.xlsx> <b.xlsx>
//   node tools/compare-xlsx.js --roundtrip <a.xlsx>
//   node tools/compare-xlsx.js --json <a.xlsx> <b.xlsx>
//   node tools/compare-xlsx.js --ignore-cols=<colA,colB> <a.xlsx> <b.xlsx>
//
// v2.0: Uses app/db.js (CRM_DB) instead of the v1.0 CRM facade.
// CRM.parseXlsx and CRM.buildXlsx were removed; we now go through the DB layer.

const fs = require('node:fs');
const path = require('node:path');
const CRM_DB = require(path.join(__dirname, '..', 'app', 'db.js'));

const args = process.argv.slice(2);
const opts = { roundtrip: false, json: false, ignoreCols: [] };
const fileArgs = [];
for (const a of args) {
  if (a === '--roundtrip') opts.roundtrip = true;
  else if (a === '--json') opts.json = true;
  else if (a.startsWith('--ignore-cols=')) opts.ignoreCols = a.split('=')[1].split(',').map(s => s.trim());
  else fileArgs.push(a);
}

async function loadOpps(p) {
  // Reset DB to a clean state, then load the xlsx file via the v2.0 import flow
  await CRM_DB.initDb({ forceInMemory: true });
  const buf = fs.readFileSync(p);
  CRM_DB.importFromXlsx(buf);
  // Normalize position to array index + 1 (position is a row index in the
  // source xlsx and gets re-numbered across roundtrip, so strip it for
  // logical comparison).
  return CRM_DB.listOpps({ includeDeleted: true })
    .filter(o => !o.deleted && !o.parseError)
    .map((o, i) => {
      const { id, deleted, parseError, position, ...rest } = o;
      return Object.assign({ position: i + 1 }, rest);
    });
}

function findColIndex(headers, substr) {
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || '').indexOf(substr) >= 0) return i;
  }
  return -1;
}

function loadRowsRaw(p) {
  const buf = fs.readFileSync(p);
  const X = require(path.join(__dirname, '..', 'vendor', 'sheetjs', 'xlsx.full.min.js'));
  const wb = X.read(buf, { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = X.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if ((rows[i] || []).some(c => typeof c === 'string' && c.indexOf('商机名称') >= 0)) { headerRow = i; break; }
  }
  if (headerRow < 0) throw new Error('找不到表头');
  return { headers: rows[headerRow], data: rows.slice(headerRow + 1) };
}

function compare(aPath, bPath) {
  // Fast path: byte-level equality means definitely matched.
  const aBuf = fs.readFileSync(aPath);
  const bBuf = fs.readFileSync(bPath);
  if (aBuf.equals(bBuf)) {
    return { matched: true, diffs: [] };
  }
  const a = loadRowsRaw(aPath);
  const b = loadRowsRaw(bPath);
  const diffs = [{ kind: 'BYTES', a: aBuf.length, b: bBuf.length }];
  const aData = a.data.filter(r => r.some(c => c !== null && c !== ''));
  const bData = b.data.filter(r => r.some(c => c !== null && c !== ''));
  const ignoreIdx = opts.ignoreCols.map(name => findColIndex(a.headers, name)).filter(i => i >= 0);
  function filterRow(row) {
    return row.filter((_, i) => !ignoreIdx.includes(i));
  }
  if (aData.length !== bData.length) {
    diffs.push({ kind: 'LENGTH', a: aData.length, b: bData.length });
  }
  const max = Math.max(aData.length, bData.length);
  for (let i = 0; i < max; i++) {
    const ra = aData[i] ? filterRow(aData[i]) : null;
    const rb = bData[i] ? filterRow(bData[i]) : null;
    if (!ra) { diffs.push({ kind: 'MISSING_B', index: i }); continue; }
    if (!rb) { diffs.push({ kind: 'MISSING_A', index: i }); continue; }
    for (let c = 0; c < Math.max(ra.length, rb.length); c++) {
      if (ra[c] !== rb[c]) {
        diffs.push({ kind: 'DIFF', index: i, col: c, a: ra[c], b: rb[c] });
      }
    }
  }
  return { matched: diffs.length === 0, diffs };
}

async function roundtrip(p) {
  const tmp = path.join(path.dirname(p), '.roundtrip-tmp.xlsx');
  try {
    // Roundtrip is a logical self-consistency check: parse the rebuilt file
    // and compare the resulting opportunity objects. This intentionally
    // drops the original fixture's raw layout (header row position, extra
    // columns, parseError rows) and compares the canonicalized data model.
    const aOpps = await loadOpps(p);
    await CRM_DB.initDb({ forceInMemory: true });
    const buf = fs.readFileSync(p);
    CRM_DB.importFromXlsx(buf);
    const out = CRM_DB.exportToXlsx();
    fs.writeFileSync(tmp, Buffer.from(out));
    const bOpps = await loadOpps(tmp);
    const diffs = [];
    if (aOpps.length !== bOpps.length) {
      diffs.push({ kind: 'LENGTH', a: aOpps.length, b: bOpps.length });
    }
    const max = Math.max(aOpps.length, bOpps.length);
    for (let i = 0; i < max; i++) {
      const ra = aOpps[i], rb = bOpps[i];
      if (!ra) { diffs.push({ kind: 'MISSING_B', index: i }); continue; }
      if (!rb) { diffs.push({ kind: 'MISSING_A', index: i }); continue; }
      for (const k of Object.keys(ra)) {
        if (ra[k] !== rb[k]) {
          diffs.push({ kind: 'DIFF', index: i, field: k, a: ra[k], b: rb[k] });
        }
      }
    }
    return { matched: diffs.length === 0, diffs };
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function formatResult(result, aPath, bPath) {
  if (opts.json) return JSON.stringify(result);
  if (result.matched) {
    return `MATCHED: ${aPath} == ${bPath}`;
  }
  let out = `DIFF: ${aPath} vs ${bPath}\n`;
  for (const d of result.diffs) {
    if (d.kind === 'BYTES') out += `  bytes differ (a=${d.a}, b=${d.b})\n`;
    else if (d.kind === 'LENGTH') out += `  rows: a=${d.a}, b=${d.b}\n`;
    else if (d.kind === 'MISSING_B') out += `  missing in b: row ${d.index}\n`;
    else if (d.kind === 'MISSING_A') out += `  extra in b: row ${d.index}\n`;
    else if (d.kind === 'DIFF') {
      const tag = d.field !== undefined ? `field=${d.field}` : `col ${d.col}`;
      out += `  row ${d.index} ${tag}: a=${JSON.stringify(d.a)} b=${JSON.stringify(d.b)}\n`;
    }
  }
  return out;
}

function main() {
  (async () => {
    try {
      if (opts.roundtrip) {
        if (fileArgs.length !== 1) { console.error('Usage: --roundtrip <file>'); process.exit(2); }
        const r = await roundtrip(fileArgs[0]);
        console.log(formatResult(r, fileArgs[0], fileArgs[0] + ' (roundtrip)'));
        process.exit(r.matched ? 0 : 1);
      } else {
        if (fileArgs.length !== 2) { console.error('Usage: <a.xlsx> <b.xlsx>'); process.exit(2); }
        const r = compare(fileArgs[0], fileArgs[1]);
        console.log(formatResult(r, fileArgs[0], fileArgs[1]));
        process.exit(r.matched ? 0 : 1);
      }
    } catch (e) {
      console.error('ERROR:', e.message);
      process.exit(2);
    }
  })();
}

main();
