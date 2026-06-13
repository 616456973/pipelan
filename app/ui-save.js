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

  async function onImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      Notify.info('正在导入 ' + file.name + ' ...');
      const result = await CRM.importXlsxFile(file);
      const errs = (result && result.parseErrors) ? result.parseErrors : 0;
      Notify.info('已导入 ' + result.imported + ' 条商机' + (errs ? ', ' + errs + ' 条解析异常' : ''));
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
    const empty = (CRM.state.opportunities || []).length === 0 && dictTotal === 0;
    el.textContent = empty ? '○ 空' : '● 已加载';
    el.className = 'db-status ' + (empty ? 'empty' : 'loaded');
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
