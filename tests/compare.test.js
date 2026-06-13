// Tests for tools/compare-xlsx.js
// Run: node tests/compare.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execSync } = require('node:child_process');

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

test('--roundtrip mode produces MATCHED for valid fixture', () => {
  let stdout = '';
  try {
    stdout = execSync(`node "${COMPARE}" --roundtrip "${FIXTURE}"`, { stdio: 'pipe' }).toString();
  } catch (e) {
    stdout = (e.stdout || '') + (e.stderr || '');
  }
  assert.ok(stdout.indexOf('MATCHED') >= 0, 'expected MATCHED in output: ' + stdout);
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
