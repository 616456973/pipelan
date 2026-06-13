// Save/Open flow — wire topbar buttons.
(function (global) {
  'use strict';

  let warnedAboutStyleLoss = false;

  function pad(n) { return String(n).padStart(2, '0'); }
  function timestamp() {
    const d = new Date();
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function doSave() {
    if (!CRM.state.fileLoaded) {
      Notify.warn('请先打开一个 xlsx 文件');
      return;
    }
    if (!warnedAboutStyleLoss) {
      if (!confirm('首次保存提醒:\n\n保存的 xlsx 会丢失原文件的样式/合并单元格/嵌入图片（数据完整保留）。\n\n如需保留原版样式请改用 Excel 维护。\n\n继续保存？')) return;
      warnedAboutStyleLoss = true;
    }
    try {
      const bytes = CRM.buildXlsx();
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ras_crm_' + timestamp() + '.xlsx';
      a.click();
      URL.revokeObjectURL(url);
      CRM.state.modified = false;
      Notify.info('已下载: ' + a.download + '（请手动覆盖原文件）');
    } catch (e) {
      Notify.error('保存失败: ' + e.message);
    }
  }

  function doOpen(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = new Uint8Array(e.target.result);
        CRM.parseXlsx(buffer, { fileName: file.name });
        warnedAboutStyleLoss = false;
        Notify.info('已加载: ' + file.name + ' (' + CRM.state.opportunities.length + ' 条)');
        document.querySelector('.tab[data-tab="list"]').click();
      } catch (err) {
        Notify.error('打开失败: ' + err.message);
      }
    };
    reader.onerror = () => Notify.error('文件读取失败');
    reader.readAsArrayBuffer(file);
  }

  function wireSaveOpen() {
    document.getElementById('save-btn').onclick = doSave;
    document.getElementById('open-btn').onclick = () => {
      if (CRM.state.modified) {
        if (!confirm('当前有未保存的改动。打开新文件会丢弃这些改动。继续？')) return;
      }
      document.getElementById('file-input').click();
    };
    document.getElementById('file-input').onchange = (e) => {
      const f = e.target.files[0];
      if (f) doOpen(f);
      e.target.value = '';
    };
  }

  global.wireSaveOpen = wireSaveOpen;
})(window);
