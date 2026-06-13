// 商机列表 — table with multi-select filters + soft delete.
(function (global) {
  'use strict';

  // Module-level filter state, shared with analysis page.
  const filterState = {
    customers: [], owners: [], stages: [], currencies: [],
    search: '',
    showDeleted: false
  };

  // Row-level edit state. null = no row in edit mode; otherwise the opp.id being edited.
  let editingId = null;

  function uniqueValues(field) {
    const set = new Set();
    for (const o of CRM.state.opportunities) {
      if (o[field]) set.add(o[field]);
    }
    return Array.from(set);
  }

  async function upsertAndRender(opp) {
    // Persist to DB
    if (window.CRM_DB && CRM_DB.upsertOpp) {
      CRM_DB.upsertOpp(opp);
    }
    // Update in-memory state
    const idx = CRM.state.opportunities.findIndex(o => o.id === opp.id);
    if (idx >= 0) CRM.state.opportunities[idx] = opp;
    // Re-render the list
    renderList();
  }

  function stageCode(stage) {
    if (!stage) return 'other';
    const m = String(stage).toUpperCase().match(/ST\s*([1-9])/);
    return m ? 'st' + m[1] : 'other';
  }

  function invCode(status) {
    if (!status) return 'empty';
    if (status.indexOf('已开票') >= 0) return 'paid';
    if (status.indexOf('已回款') >= 0) return 'collected';
    if (status.indexOf('已预付') >= 0) return 'prepaid';
    if (status.indexOf('合同中') >= 0) return 'contracting';
    return 'other';
  }

  function serialToDateStr(serial) {
    if (!serial) return '';
    const n = Number(serial);
    if (isNaN(n) || n <= 0) return '';
    const d = new Date((n - 25569) * 86400 * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function renderFilters() {
    const customers = uniqueValues('customer');
    const owners = uniqueValues('owner');
    const stages = uniqueValues('stage');
    const currs = uniqueValues('currency');
    return `
      <div class="filters">
        <label>客户 <select multiple size="1" id="f-customer">${customers.map(t => `<option value="${t}" ${filterState.customers.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>负责人 <select multiple size="1" id="f-owner">${owners.map(t => `<option value="${t}" ${filterState.owners.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>阶段 <select multiple size="1" id="f-stage">${stages.map(t => `<option value="${t}" ${filterState.stages.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>币种 <select multiple size="1" id="f-currency">${currs.map(t => `<option value="${t}" ${filterState.currencies.includes(t) ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>搜索 <input id="f-search" value="${filterState.search}" placeholder="商机/客户"></label>
        <label><input type="checkbox" id="f-del" ${filterState.showDeleted ? 'checked' : ''}> 显示已删除</label>
        <button class="btn" id="f-clear">清空</button>
      </div>
    `;
  }

  function applyFilters(opps) {
    return opps.filter(o => {
      if (!filterState.showDeleted && o.deleted) return false;
      if (filterState.showDeleted && !o.deleted) return false;
      if (filterState.customers.length && !filterState.customers.includes(o.customer)) return false;
      if (filterState.owners.length && !filterState.owners.includes(o.owner)) return false;
      if (filterState.stages.length && !filterState.stages.includes(o.stage)) return false;
      if (filterState.currencies.length && !filterState.currencies.includes(o.currency)) return false;
      if (filterState.search) {
        const s = filterState.search.toLowerCase();
        if (!(o.oppName || '').toLowerCase().includes(s) && !(o.customer || '').toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  function rowHtml(o, idx) {
    const cls = o.parseError ? 'row-error' : (o.deleted ? 'row-deleted' : (editingId === o.id ? 'row-editing' : ''));
    const errTitle = o.parseError ? `title="行 ${o.parseError.row}: ${o.parseError.message}"` : '';
    const safeId = o.id.replace(/'/g, "\\'");
    const isEditing = editingId === o.id;
    return `
      <tr class="${cls}" ${errTitle}>
        <td>${idx + 1}</td>
        <td>${o.team || ''}</td>
        <td>${isEditing
          ? `<select id="ed-owner-${safeId}" class="cell-edit"><option value="">—</option>${(CRM.state.dicts.owners || []).map(v => `<option value="${v}" ${v === o.owner ? 'selected' : ''}>${v}</option>`).join('')}</select>`
          : (o.owner || '')}</td>
        <td>${o.oppName || ''}</td>
        <td>${o.customer || ''}</td>
        <td>${o.productLine || ''}</td>
        <td>${o.product || ''}</td>
        <td>${isEditing
          ? `<select id="ed-stage-${safeId}" class="cell-edit">${(CRM.state.dicts.stages || []).map(v => `<option value="${v}" ${v === o.stage ? 'selected' : ''}>${v}</option>`).join('')}</select>`
          : `<span class="tag stage-${stageCode(o.stage)}">${o.stage || ''}</span>${(o.stage && o.stage.indexOf('ST5') >= 0 && o.loseReason) ? `<div style="font-size:10px; color:var(--text-2); margin-top:2px;">${o.loseReason}</div>` : ''}`}</td>
        <td>${isEditing
          ? `<select id="ed-invoiceStatus-${safeId}" class="cell-edit"><option value="">—</option>${['未开发票', '已开票', '合同中', '已回款', '已预付'].map(s => `<option value="${s}" ${s === o.invoiceStatus ? 'selected' : ''}>${s}</option>`).join('')}</select>`
          : `<span class="tag inv-${invCode(o.invoiceStatus)}">${o.invoiceStatus || ''}</span>`}</td>
        <td class="num">${(o.amountTaxIncluded || 0).toLocaleString()}</td>
        <td>${Math.round((o.winRate || 0) * 100)}%</td>
        <td>${serialToDateStr(o.expectedDate)}</td>
        <td>${isEditing
          ? `<button class="btn btn-primary" onclick="window.__saveRow('${safeId}')">保存</button> <button class="btn" onclick="window.__cancelEdit()">取消</button>`
          : (o.deleted ? '已删除' : `<button class="btn" onclick="window.__startEdit('${safeId}')">编辑</button> <button class="btn btn-danger" onclick="deleteOpp('${safeId}')">删除</button>`)}</td>
      </tr>
    `;
  }

  function attachFilterHandlers() {
    const ids = { customer: 'customers', owner: 'owners', stage: 'stages', currency: 'currencies' };
    for (const [elId, key] of Object.entries(ids)) {
      const el = document.getElementById('f-' + elId);
      if (!el) continue;
      el.onchange = () => {
        filterState[key] = Array.from(el.selectedOptions).map(o => o.value);
        renderList();
      };
    }
    document.getElementById('f-search').oninput = (e) => {
      filterState.search = e.target.value;
      renderList();
    };
    document.getElementById('f-del').onchange = (e) => {
      filterState.showDeleted = e.target.checked;
      renderList();
    };
    document.getElementById('f-clear').onclick = () => {
      for (const k of Object.keys(filterState)) {
        if (Array.isArray(filterState[k])) filterState[k] = [];
        else if (typeof filterState[k] === 'boolean') filterState[k] = false;
        else filterState[k] = '';
      }
      renderList();
    };
  }

  function renderList() {
    const content = document.getElementById('content');
    const filtered = applyFilters(CRM.state.opportunities);
    // Compute totals
    const totals = { count: filtered.length, byCurrency: {} };
    for (const o of filtered) {
      if (o.deleted || o.parseError) continue;
      const c = o.currency || '';
      totals.byCurrency[c] = (totals.byCurrency[c] || 0) + (o.amountTaxIncluded || 0);
    }
    const currencyHtml = Object.entries(totals.byCurrency)
      .map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`)
      .join(' / ') || '-';
    content.innerHTML = `
      <h2>商机列表 (${filtered.length} / ${CRM.state.opportunities.length})</h2>
      ${renderFilters()}
      <div class="card">
        <table>
          <colgroup>
            <col style="width:40px">       <!-- # -->
            <col style="width:80px">       <!-- 团队 -->
            <col style="width:80px">       <!-- 负责人 -->
            <col>                          <!-- 商机 (auto-expand) -->
            <col>                          <!-- 客户 (auto-expand) -->
            <col style="width:110px">      <!-- 业务线 -->
            <col style="width:100px">      <!-- 产品 -->
            <col style="width:90px">       <!-- 阶段 -->
            <col style="width:80px">       <!-- 发票状态 -->
            <col style="width:100px">      <!-- 含税金额 -->
            <col style="width:56px">       <!-- 赢率 -->
            <col style="width:92px">       <!-- 预计落单 -->
            <col style="width:100px">      <!-- 操作 (2 buttons) -->
          </colgroup>
          <thead><tr>
            <th>#</th><th>团队</th><th>负责人</th><th>商机</th><th>客户</th>
            <th>业务线</th><th>产品</th><th>阶段</th><th>发票状态</th>
            <th class="num">含税金额</th>
            <th>赢率</th><th>预计落单</th><th>操作</th>
          </tr></thead>
          <tbody>${filtered.map((o, i) => rowHtml(o, i)).join('')}</tbody>
          <tfoot>
            <tr>
              <td colspan="10" style="text-align:right;"><b>合计</b> (共 ${totals.count} 条)</td>
              <td class="num" title="按币种明细: ${Object.entries(totals.byCurrency).map(([c,v])=>c+' '+Math.round(v).toLocaleString()).join(' / ')}">
                <b>${currencyHtml}</b>
              </td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
    attachFilterHandlers();
  }

  function deleteOpp(id) {
    const o = CRM.state.opportunities.find(x => x.id === id);
    if (!o) return;
    if (!confirm(`确定删除商机 "${o.oppName}"？\n（软删除，可在"显示已删除"里找回）`)) return;
    o.deleted = true;
    CRM.markModified();
    renderList();
    Notify.info('已删除: ' + o.oppName);
  }

  window.__startEdit = function(id) {
    editingId = id;
    renderList();
  };

  window.__saveRow = function(id) {
    const opp = CRM.state.opportunities.find(o => o.id === id);
    if (!opp) return;
    const oldOwner = opp.owner;
    const oldStage = opp.stage;
    const oldInvoice = opp.invoiceStatus;
    // Read values from the 3 selects
    const ownerEl = document.getElementById('ed-owner-' + id);
    const stageEl = document.getElementById('ed-stage-' + id);
    const invEl = document.getElementById('ed-invoiceStatus-' + id);
    if (!stageEl) return;  // row not in edit mode
    opp.owner = ownerEl ? ownerEl.value : '';
    opp.stage = stageEl.value;
    opp.invoiceStatus = invEl ? invEl.value : '';
    // Persist
    try { CRM_DB.upsertOpp(opp); } catch (e) { console.error('save failed', e); Notify.error('保存失败: ' + e.message); }
    editingId = null;
    renderList();
    const changes = [];
    if (oldOwner !== opp.owner) changes.push('负责人');
    if (oldStage !== opp.stage) changes.push('阶段');
    if (oldInvoice !== opp.invoiceStatus) changes.push('发票状态');
    Notify.info('已保存' + (changes.length ? ': ' + changes.join('/') : ' (无变化)'));
  };

  window.__cancelEdit = function() {
    editingId = null;
    renderList();
  };

  global.renderList = renderList;
  global.deleteOpp = deleteOpp;
  global.CRM_FILTERS = filterState;
})(window);
