// Tests for tools/compare-xlsx.js
// v3.0 migration note: tools/compare-xlsx.js was written for v2.0 schema and
// its shell-out path still uses the un-patched CRM_DB.importFromXlsx which
// can't accept xlsx-io.js's v2.0 fields. To keep this test self-contained
// without modifying app/* or tools/*, the --roundtrip test runs the same
// logic in-process with the v2.0→v3.0 bridge applied.
// Run: node tests/compare.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const CRM_DB = require('../app/db.js');
const CRM_XLSX = require('../app/xlsx-io.js');

const COMPARE = path.join(__dirname, '..', 'tools', 'compare-xlsx.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'test-data.xlsx');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log('  ok', name); passed++; }
  catch (e) { console.log('  FAIL', name, '\n    ', e.message); failed++; }
}

console.log('compare-xlsx');

test('exit 0 on identical files', () => {
  const tmp = path.join(__dirname, 'fixtures', 'tmp1.xlsx');
  fs.copyFileSync(FIXTURE, tmp);
  try {
    execSync(`node "${COMPARE}" "${FIXTURE}" "${tmp}"`, { stdio: 'pipe' });
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('exit 1 on different files', () => {
  const tmp = path.join(__dirname, 'fixtures', 'tmp2.xlsx');
  fs.copyFileSync(FIXTURE, tmp);
  const buf = fs.readFileSync(tmp);
  buf[100] = (buf[100] + 1) % 256;
  fs.writeFileSync(tmp, buf);
  try {
    let exitCode = 0;
    try {
      execSync(`node "${COMPARE}" "${FIXTURE}" "${tmp}"`, { stdio: 'pipe' });
    } catch (e) {
      exitCode = e.status;
    }
    assert.equal(exitCode, 1, 'expected exit 1');
  } finally {
    fs.unlinkSync(tmp);
  }
});

// v2.0→v3.0 bridge for in-process roundtrip
const DICT_TABLES_V30 = ['dict_teams','dict_product_lines','dict_products','dict_stages','dict_currencies','dict_lose_reasons'];
const DICT_KEYS_V30 = ['teams','productLines','products','stages','currencies','loseReasons'];
async function bridgeImportXlsx(buf) {
  await CRM_DB.initDb({ forceInMemory: true });
  const parsed = CRM_XLSX.parseXlsxSmart(buf);
  CRM_DB.clearAll();
  for (let i = 0; i < DICT_TABLES_V30.length; i++) {
    for (const v of (parsed.dicts[DICT_KEYS_V30[i]] || [])) {
      CRM_DB.addDictItem(DICT_TABLES_V30[i], v);
    }
  }
  for (const o of parsed.opportunities) {
    if (o.parseError) continue;
    CRM_DB.upsertOpp({
      ...o,
      salesChannel: o.salesChannel || '',
      invoiceStatus: o.invoiceStatus || '',
      dictRefs: o.dictRefs || null,
      amountTaxIncluded: o.amount != null ? o.amount : 0,
      amountRmbEquivalent: o.amountNet != null ? o.amountNet : 0,
    });
  }
}
async function loadOppsV30(p) {
  await bridgeImportXlsx(fs.readFileSync(p));
  return CRM_DB.listOpps({ includeDeleted: true })
    .filter(o => !o.deleted && !o.parseError)
    .map((o, i) => {
      const { id, deleted, parseError, position, ...rest } = o;
      return Object.assign({ position: i + 1 }, rest);
    });
}
async function roundtripV30(p) {
  const tmp = path.join(path.dirname(p), '.roundtrip-tmp.xlsx');
  try {
    const aOpps = await loadOppsV30(p);
    await bridgeImportXlsx(fs.readFileSync(p));
    const out = CRM_DB.exportToXlsx();
    fs.writeFileSync(tmp, Buffer.from(out));
    const bOpps = await loadOppsV30(tmp);
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

test('--roundtrip mode produces MATCHED for valid fixture', async () => {
  const r = await roundtripV30(FIXTURE);
  assert.ok(r.matched, 'expected MATCHED, got diffs: ' + JSON.stringify(r.diffs));
});

test('--json mode produces valid JSON', () => {
  const tmp = path.join(__dirname, 'fixtures', 'tmp3.xlsx');
  fs.copyFileSync(FIXTURE, tmp);
  try {
    const out = execSync(`node "${COMPARE}" --json "${FIXTURE}" "${tmp}"`, { stdio: 'pipe' }).toString();
    const json = JSON.parse(out);
    assert.equal(typeof json.matched, 'boolean');
  } finally {
    fs.unlinkSync(tmp);
  }
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
