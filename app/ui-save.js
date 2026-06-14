// Top-bar flow: import xlsx / export xlsx / backup DB / restore DB.
// v2.0: uses CRM.importXlsxFile, CRM.exportXlsxBlob, CRM.downloadBackup, CRM.restoreFromBackup.
(function (global) {
  'use strict';

  function pad(n) { return String(n).padStart(2, '0'); }
  function timestamp() {
    const d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function downloadBlob(bytes, filename, mime) {
    const blob = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport() {
    document.getElementById('import-input').click();
  }

  // Validation rules — return array of human-readable issues.
  // Runs against the dry-run parsed data BEFORE writing to the DB.
  function validateImportData(parsed) {
    const issues = [];
    if (!parsed || !parsed.opportunities || !parsed.opportunities.length) {
      issues.push('文件中没有商机数据(0 条记录)');
      return issues;
    }
    let missingOppName = 0, missingTeam = 0, missingOwner = 0, missingCustomer = 0;
    let invalidWinRate = 0, invalidAmount = 0, invalidDate = 0;
    const invalidStages = new Set();
    for (const o of parsed.opportunities) {
      if (o.parseError) continue;
      if (!o.oppName) missingOppName++;
      if (!o.team) missingTeam++;
      if (!o.owner) missingOwner++;
      if (!o.customer) missingCustomer++;
      if (typeof o.winRate !== 'number' || o.winRate < 0 || o.winRate > 1) invalidWinRate++;
      if (o.amount == null || isNaN(o.amount) || o.amount < 0) invalidAmount++;
      if (o.expectedDate != null && isNaN(Number(o.expectedDate))) invalidDate++;
      if (o.stage && !/^ST[1-5]/.test(String(o.stage).toUpperCase())) invalidStages.add(o.stage);
    }
    if (missingOppName) issues.push(`${missingOppName} 条商机缺少「商机名称」`);
    if (missingTeam) issues.push(`${missingTeam} 条商机缺少「销售团队」`);
    if (missingOwner) issues.push(`${missingOwner} 条商机缺少「负责人」`);
    if (missingCustomer) issues.push(`${missingCustomer} 条商机缺少「客户名称」`);
    if (invalidWinRate) issues.push(`${invalidWinRate} 条商机「赢单概率」值无效(应为 0-1 之间的数字)`);
    if (invalidAmount) issues.push(`${invalidAmount} 条商机「含税金额」值无效`);
    if (invalidDate) issues.push(`${invalidDate} 条商机「预计落单时间」值无效`);
    if (invalidStages.size) {
      issues.push(`${invalidStages.size} 个非标准阶段值: ${[...invalidStages].slice(0, 3).join(', ')}`);
    }
    return issues;
  }

  async function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      // Step 1: Dry-run parse (no DB writes) for pre-import validation.
      const XLSX_IO = window.CRM_XLSX || (window.RASH && window.RASH.parseXlsxSmart);
      if (!XLSX_IO) {
        Notify.error('xlsx 解析器未加载');
        e.target.value = '';
        return;
      }
      const buffer = new Uint8Array(await file.arrayBuffer());
      let parsed;
      try {
        parsed = XLSX_IO.parseXlsxSmart(buffer);
      } catch (parseErr) {
        Notify.error('文件解析失败: ' + parseErr.message);
        e.target.value = '';
        return;
      }

      // Step 2: Validate and confirm if any issues found.
      const issues = validateImportData(parsed);
      if (issues.length > 0) {
        const summary = issues.slice(0, 8).map(s => '• ' + s).join('\n');
        const more = issues.length > 8 ? `\n... 还有 ${issues.length - 8} 条问题` : '';
        const msg = `发现 ${issues.length} 个问题:\n${summary}${more}\n\n是否仍要导入?`;
        if (!confirm(msg)) {
          Notify.info('已取消导入');
          e.target.value = '';
          return;
        }
        Notify.warn('继续导入, 跳过错误检查');
      }

      // Step 3: Actually import (CRM.importXlsxFile re-parses & persists).
      Notify.info('正在导入 ' + file.name + ' ...');
      const result = await CRM.importXlsxFile(file);
      const errs = (result && result.parseErrors) ? result.parseErrors : 0;
      Notify.info('已导入 ' + result.imported + ' 条商机' + (errs ? ', ' + errs + ' 条解析异常' : ''));
      // Mark all imported opps as recently changed (so they highlight in the list).
      if (result && result.importedIds && CRM.markOppsAsChanged) {
        CRM.markOppsAsChanged(result.importedIds);
      }
      // Refresh current view
      const activeTab = document.querySelector('.tab.active');
      if (activeTab) activeTab.click();
      updateDbStatus();
    } catch (err) {
      Notify.error('导入失败: ' + err.message);
    }
    e.target.value = '';  // allow re-selecting same file
  }

  function doExport() {
    try {
      const bytes = CRM.exportXlsxBlob();
      downloadBlob(bytes, 'ras_crm_' + timestamp() + '.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      Notify.info('已导出 (下载到 Downloads 文件夹)');
    } catch (err) {
      Notify.error('导出失败: ' + err.message);
    }
  }

  function doBackup() {
    try {
      const bytes = CRM.downloadBackup();
      downloadBlob(bytes, 'ras_crm_backup_' + timestamp() + '.sqlite',
        'application/x-sqlite3');
      Notify.info('已备份 sqlite 文件');
    } catch (err) {
      Notify.error('备份失败: ' + err.message);
    }
  }

  function doRestore() {
    // Warn if there's existing data
    if (CRM.state.opportunities.length > 0 || (CRM.state.dicts && Object.values(CRM.state.dicts).some(d => d && d.length > 0))) {
      if (!confirm('当前数据库有数据, 恢复将覆盖现有数据。继续？')) return;
    }
    document.getElementById('restore-input').click();
  }

  async function onRestoreFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      Notify.info('正在恢复 ' + file.name + ' ...');
      await CRM.restoreFromBackup(file);
      Notify.info('已恢复');
      const activeTab = document.querySelector('.tab.active');
      if (activeTab) activeTab.click();
      updateDbStatus();
    } catch (err) {
      Notify.error('恢复失败: ' + err.message);
    }
    e.target.value = '';
  }

  function updateDbStatus() {
    const el = document.getElementById('db-status');
    if (!el) return;
    const dicts = CRM.state.dicts || {};
    const dictTotal = Object.values(dicts).reduce((s, d) => s + ((d && d.length) || 0), 0);
    const oppCount = (CRM.state.opportunities || []).length;
    const empty = oppCount === 0 && dictTotal === 0;
    // Show data source for debug
    const src = (window.CRM_DB && window.CRM_DB.getDataSource) ? window.CRM_DB.getDataSource() : '?';
    const srcLabel = src === 'file' ? '文件' : src === 'indexeddb' ? 'IndexedDB' : '空';
    if (empty) {
      el.textContent = '○ ' + srcLabel;
    } else {
      el.textContent = '● ' + srcLabel + ' (' + oppCount + ')';
    }
    el.className = 'db-status ' + (empty ? 'empty' : 'loaded');
    el.title = '数据来源: ' + srcLabel + ' · ' + oppCount + ' 条商机';
  }

  function wireImportExport() {
    document.getElementById('import-btn').onclick = doImport;
    document.getElementById('export-btn').onclick = doExport;
    document.getElementById('backup-btn').onclick = doBackup;
    document.getElementById('restore-btn').onclick = doRestore;
    document.getElementById('import-input').onchange = onImportFile;
    document.getElementById('restore-input').onchange = onRestoreFile;
    setInterval(updateDbStatus, 1000);
  }

  global.wireImportExport = wireImportExport;
})(window);
