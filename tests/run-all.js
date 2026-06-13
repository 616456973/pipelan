#!/usr/bin/env node
// Run all tests: unit tests + compare-xlsx roundtrip.
const { spawnSync } = require('node:child_process');
const path = require('node:path');

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

runStep('unit.test.js', 'node', [path.join(__dirname, 'unit.test.js')]);
runStep('compare.test.js', 'node', [path.join(__dirname, 'compare.test.js')]);
runStep('compare-xlsx roundtrip', 'node', [
  path.join(__dirname, '..', 'tools', 'compare-xlsx.js'),
  '--roundtrip',
  path.join(__dirname, 'fixtures', 'test-data.xlsx')
]);

console.log('\n' + (totalFail === 0 ? 'All passed' : totalFail + ' step(s) failed'));
process.exit(totalFail === 0 ? 0 : 1);
