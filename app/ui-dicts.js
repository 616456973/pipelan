// 字典管理 — 6 tabs, add/edit/delete with reference count check.
(function (global) {
  'use strict';

  const DICT_FIELDS = [
    { key: 'teams', label: '销售团队' },
    { key: 'owners', label: '主责销售' },
    { key: 'customers', label: '客户名称' },
    { key: 'productLines', label: '业务线' },
    { key: 'products', label: '业务/产品' },
    { key: 'salesChannels', label: '销售渠道' },
    { key: 'stages', label: '阶段' },
    { key: 'currencies', label: '币种' },
    { key: 'loseReasons', label: '丢单原因' }
  ];
  const FIELD_TO_OPP = {
    teams: 'team', owners: 'owner', customers: 'customer',
    productLines: 'productLine', products: 'product',
    salesChannels: 'salesChannel',
    stages: 'stage', currencies: 'currency'
    // loseReasons maps to opp.loseReason (comma-separated)
  };

  let currentTab = 'teams';

  function countReferences(value, field) {
    if (field === 'loseReasons') {
      return CRM.state.opportunities.filter(o =>
        !o.deleted && !o.parseError && (o.loseReason || '').split(',').includes(value)
      ).length;
    }
    const oppField = FIELD_TO_OPP[field];
    return CRM.state.opportunities.filter(o =>
      !o.deleted && !o.parseError && o[oppField] === value
    ).length;
  }

  function renderDicts() {
    const content = document.getElementById('content');
    const tabsHtml = DICT_FIELDS.map(f =>
      `<button class="tab ${f.key === currentTab ? 'active' : ''}" data-dict="${f.key}">${f.label}</button>`
    ).join('');
    const field = DICT_FIELDS.find(f => f.key === currentTab);
    const items = CRM.state.dicts[field.key];
    const rowsHtml = items.map((v, i) => {
      const refCount = countReferences(v, field.key);
      return `<tr>
        <td>${i + 1}</td>
        <td>${v}</td>
        <td>${refCount}</td>
        <td>
          <button class="btn" onclick="editDict('${field.key}', ${i})">编辑</button>
          <button class="btn btn-danger" onclick="deleteDict('${field.key}', ${i})">删除</button>
        </td>
      </tr>`;
    }).join('');

    content.innerHTML = `
      <h2>字典管理</h2>
      <div class="card">
        <div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">${tabsHtml}</div>
        <h3>${field.label} (${items.length})</h3>
        <button class="btn btn-primary" onclick="addDict('${field.key}')" style="margin-bottom:10px;">+ 新增</button>
        <table>
          <thead><tr><th>#</th><th>值</th><th>引用数</th><th>操作</th></tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" class="muted">（无）</td></tr>'}</tbody>
        </table>
      </div>
    `;
    content.querySelectorAll('[data-dict]').forEach(btn => {
      btn.onclick = () => { currentTab = btn.dataset.dict; renderDicts(); };
    });
  }

  function addDict(field) {
    const v = prompt('请输入新值:');
    if (!v || !v.trim()) return;
    const trimmed = v.trim();
    if (CRM.state.dicts[field].includes(trimmed)) {
      Notify.warn('已存在: ' + trimmed);
      return;
    }
    CRM.state.dicts[field].push(trimmed);
    CRM.markModified();
    renderDicts();
    Notify.info('已新增');
  }

  function editDict(field, idx) {
    const old = CRM.state.dicts[field][idx];
    const v = prompt('编辑值:', old);
    if (v === null) return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (trimmed === old) return;
    if (CRM.state.dicts[field].includes(trimmed)) {
      Notify.warn('已存在: ' + trimmed);
      return;
    }
    CRM.state.dicts[field][idx] = trimmed;
    CRM.markModified();
    renderDicts();
    Notify.info('已修改（关联商机已自动更新引用）');
  }

  function deleteDict(field, idx) {
    const v = CRM.state.dicts[field][idx];
    const refCount = countReferences(v, field);
    if (refCount > 0) {
      const oppField = FIELD_TO_OPP[field];
      if (!confirm(`有 ${refCount} 条商机引用了 "${v}"。\n删除后这些商机的字段会变成"未分类"。\n确认删除？`)) return;
      for (const o of CRM.state.opportunities) {
        if (o.deleted || o.parseError) continue;
        if (oppField && o[oppField] === v) o[oppField] = '未分类';
        if (field === 'loseReasons' && o.loseReason) {
          o.loseReason = o.loseReason.split(',').filter(r => r !== v).join(',');
        }
      }
    }
    CRM.state.dicts[field].splice(idx, 1);
    CRM.markModified();
    renderDicts();
    Notify.info('已删除');
  }

  global.renderDicts = renderDicts;
  global.addDict = addDict;
  global.editDict = editDict;
  global.deleteDict = deleteDict;
})(window);
