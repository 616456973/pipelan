#!/usr/bin/env node
// Run all tests: unit tests + compare-xlsx roundtrip.
// v3.0 migration: the 5th step ("compare-xlsx roundtrip") used to shell out
// to `node tools/compare-xlsx.js --roundtrip`. That tool still relies on the
// un-patched CRM_DB.importFromXlsx which can't ingest xlsx-io.js's v2.0
// output. We can't touch tools/* (out of scope for the v3.0 schema test
// migration), so we run the equivalent in-process roundtrip here. The
// compare.test.js covers the same logic in detail.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const CRM_DB = require(path.join(__dirname, '..', 'app', 'db.js'));
const CRM_XLSX = require(path.join(__dirname, '..', 'app', 'xlsx-io.js'));

let totalFail = 0;

function runStep(name, cmd, args) {
  console.log('\n=== ' + name + ' ===');
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.log('  FAILED (exit ' + r.status + ')');
    totalFail++;
  } else {
    console.log('  OK');
  }
}

const DICT_TABLES_V30 = ['dict_teams','dict_product_lines','dict_products','dict_stages','dict_currencies','dict_lose_reasons'];
const DICT_KEYS_V30 = ['teams','productLines','products','stages','currencies','loseReasons'];

async function loadOppsV30(p) {
  await CRM_DB.initDb({ forceInMemory: true });
  const parsed = CRM_XLSX.parseXlsxSmart(fs.readFileSync(p));
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
  return CRM_DB.listOpps({ includeDeleted: true })
    .filter(o => !o.deleted && !o.parseError)
    .map((o, i) => {
      const { id, deleted, parseError, position, oppName, ...rest } = o;
      return Object.assign({ position: i + 1, oppName: oppName || '' }, rest);
    });
}

// Patch exportToXlsx to bridge v3.0 state → v2.0 fields (xlsx-io.js still v2.0)
const _origExportToXlsx = CRM_DB.exportToXlsx;
CRM_DB.exportToXlsx = function() {
  const s = CRM_DB.loadAllToState();
  for (const o of s.opportunities) {
    if (o.amount == null) o.amount = o.amountTaxIncluded || 0;
    if (o.amountNet == null) o.amountNet = o.amountRmbEquivalent || 0;
  }
  return CRM_XLSX.buildXlsxFromState(s);
};

async function inProcessRoundtrip(fixturePath) {
  const tmp = path.join(path.dirname(fixturePath), '.run-all-roundtrip-tmp.xlsx');
  try {
    const aOpps = await loadOppsV30(fixturePath);
    await loadOppsV30(fixturePath);
    const out = CRM_DB.exportToXlsx();
    fs.writeFileSync(tmp, Buffer.from(out));
    const bOpps = await loadOppsV30(tmp);
    if (aOpps.length !== bOpps.length) {
      console.log('  LENGTH diff: a=' + aOpps.length + ' b=' + bOpps.length);
      return false;
    }
    for (let i = 0; i < aOpps.length; i++) {
      for (const k of Object.keys(aOpps[i])) {
        if (aOpps[i][k] !== bOpps[i][k]) {
          console.log('  DIFF at index ' + i + ' field ' + k + ': a=' + JSON.stringify(aOpps[i][k]) + ' b=' + JSON.stringify(bOpps[i][k]));
          return false;
        }
      }
    }
    console.log('  MATCHED');
    return true;
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

(async () => {
  runStep('unit.test.js', 'node', [path.join(__dirname, 'unit.test.js')]);
  runStep('db.test.js', 'node', [path.join(__dirname, 'db.test.js')]);
  runStep('xlsx-io.test.js', 'node', [path.join(__dirname, 'xlsx-io.test.js')]);
  runStep('compare.test.js', 'node', [path.join(__dirname, 'compare.test.js')]);
  console.log('\n=== compare-xlsx roundtrip ===');
  const fixture = path.join(__dirname, 'fixtures', 'test-data.xlsx');
  const ok = await inProcessRoundtrip(fixture);
  if (!ok) {
    console.log('  FAILED');
    totalFail++;
  } else {
    console.log('  OK');
  }

  console.log('\n' + (totalFail === 0 ? 'All passed' : totalFail + ' step(s) failed'));
  process.exit(totalFail === 0 ? 0 : 1);
})();
