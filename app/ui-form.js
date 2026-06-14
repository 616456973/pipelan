// 商机表单 + 详情 — view/edit/new 三个模式共享一个渲染函数。
// mode='new'  : 新增空白表单 (新增 tab)
// mode='view' : 只读详情 (详情 tab,默认)
// mode='edit' : 可编辑状态 (详情 tab,点了"编辑"按钮后)
(function (global) {
  'use strict';

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const STAGE_DEFAULT_WINRATE = { 'ST1': 0.1, 'ST2': 0.3, 'ST3': 0.5, 'ST4': 1, 'ST5': 0 };
  const PROJECT_STATUS_PLACEHOLDER = '项目详细情况,如客户关键人,具体销售产品/服务等';

  // Module-level: which opp is being edited/created, and which mode.
  // In 'new' mode: editingId=null and we render an empty makeOpportunity().
  // In 'view'/'edit' mode: editingId=currentOppId from CRM.state.
  let editingId = null;
  let mode = 'new';

  function startNew() {
    editingId = null;
    mode = 'new';
    CRM.state.currentOppId = null;
    CRM.state.detailEditing = false;
    renderForm();
  }

  function startEdit(id) {
    editingId = id;
    mode = 'edit';
    CRM.state.currentOppId = id;
    CRM.state.detailEditing = true;
    renderForm();
  }

  // Switch from 'view' → 'edit' (no editingId change; same opp)
  function enterEditMode() {
    mode = 'edit';
    CRM.state.detailEditing = true;
    renderForm();
  }

  // Switch from 'edit' → 'view' (discard pending changes)
  function cancelEdit() {
    if (mode === 'edit' && editingId) {
      mode = 'view';
      CRM.state.detailEditing = false;
      renderForm();
    } else {
      // In 'new' mode, cancel = back to list
      document.querySelector('.tab[data-tab="list"]').click();
    }
  }

  // ---- Date helpers ----
  function excelDateToSerial(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (!m) return null;
    const [, y, mo, d] = m;
    const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d));
    return Math.round(utcMs / 86400000) + 25569;
  }
  function serialToExcelDate(serial) {
    if (!serial) return '';
    const n = Number(serial);
    if (isNaN(n) || n <= 0) return '';
    const d = new Date((n - 25569) * 86400 * 1000);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  // ---- Form data extraction ----
  function getFormData() {
    const v = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    return {
      oppName: v('f-oppName'),
      team: v('f-team-sel'),
      owner: v('f-owner'),
      customer: v('f-customer'),
      productLine: v('f-productLine'),
      product: v('f-product'),
      currency: v('f-currency'),
      stage: v('f-stage'),
      winRate: parseFloat(v('f-winRate')),
      amount: parseFloat(v('f-amount')),
      expectedDate: v('f-expectedDate') ? excelDateToSerial(v('f-expectedDate')) : null,
      invoiceStatus: v('f-invoiceStatus'),
      salesChannel: v('f-salesChannel'),
      note: v('f-note'),
      projectStatus: v('f-projectStatus'),
      loseReason: Array.from(document.querySelectorAll('.lose-reason-cb:checked')).map(cb => cb.value).join(',')
    };
  }

  function buildProductOptions(productLine) {
    const all = CRM.state.dicts.products;
    if (productLine && productLine.indexOf('PL1') >= 0) return all.filter(p => /^P1/.test(p));
    if (productLine && productLine.indexOf('PL2') >= 0) return all.filter(p => /^P2/.test(p));
    return all;
  }

  // ---- The shared form renderer ----
  function renderOppForm(opp, m) {
    mode = m;
    const content = document.getElementById('content');
    const d = CRM.state.dicts;
    const readonly = (mode === 'view');
    const isNew = (mode === 'new');
    const productOptions = buildProductOptions(opp.productLine);
    const showLoseReason = opp.stage && opp.stage.indexOf('ST5') >= 0;

    // Readonly / disabled attributes applied per field
    const ro = readonly ? 'readonly' : '';
    const dis = readonly ? 'disabled' : '';
    const roClass = readonly ? 'ro' : '';

    // Title and subtitle
    let title, subtitle;
    if (mode === 'new') { title = '新增商机'; subtitle = '填写下面字段,创建一条新商机'; }
    else if (mode === 'view') {
      title = '商机详情';
      subtitle = `<span class="chip" style="background: var(--surface-2); color: var(--text-2); padding: 2px 10px; border-radius: 999px; font-size: 11px;">只读</span> 点击「编辑」按钮修改`;
    } else {
      title = '编辑商机';
      subtitle = '修改下面字段,点击「保存」持久化到数据库';
    }

    // Action buttons depend on mode
    let actions;
    if (mode === 'view') {
      actions = `
        <button class="btn btn-primary" id="form-edit">✏️ 编辑</button>
        <button class="btn btn-danger" id="form-delete">🗑️ 删除</button>
        <button class="btn" id="form-back">← 返回列表</button>
      `;
    } else {
      actions = `
        <button class="btn btn-primary" id="form-save">💾 保存</button>
        <button class="btn" id="form-cancel">取消</button>
        ${!isNew ? `<button class="btn" id="form-back" style="margin-left:auto;">← 返回列表</button>` : ''}
      `;
    }

    content.innerHTML = `
      <h2>${title}</h2>
      <p class="muted" style="margin-bottom: 16px;">${subtitle}</p>
      <div class="card">
        <div class="form-grid">
          <div class="field ${roClass}"><label>销售团队 *</label><select id="f-team-sel" ${dis}>${d.teams.map(t => `<option value="${t}" ${t === opp.team ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-team-sel"></div></div>
          <div class="field ${roClass}"><label>商机名称 *</label><input id="f-oppName" value="${opp.oppName || ''}" ${ro}><div class="err" id="err-oppName"></div></div>
          <div class="field ${roClass}"><label>客户名称 *</label>
            <div style="display:flex; gap:6px;">
              <select id="f-customer" style="flex:1;" ${dis}>
                <option value="">— 请选择 —</option>
                ${(CRM.state.dicts.customers || []).map(c => `<option value="${c}" ${c === opp.customer ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              ${readonly ? '' : `<button type="button" class="btn btn-sm" id="f-customer-add" title="新增客户到字典">+ 新增</button>`}
            </div>
            <div class="err" id="err-customer"></div>
          </div>
          <div class="field ${roClass}"><label>负责人 *</label><input id="f-owner" value="${opp.owner || ''}" ${ro}><div class="err" id="err-owner"></div></div>
          <div class="field ${roClass}"><label>业务线 *</label><select id="f-productLine" ${dis}>${d.productLines.map(t => `<option value="${t}" ${t === opp.productLine ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-productLine"></div></div>
          <div class="field ${roClass}"><label>业务/产品 *</label><select id="f-product" ${dis}>${productOptions.map(t => `<option value="${t}" ${t === opp.product ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-product"></div></div>
          <div class="field ${roClass}"><label>销售渠道</label>
            <div style="display:flex; gap:6px;">
              <select id="f-salesChannel" style="flex:1;" ${dis}>
                <option value="">— 请选择 —</option>
                ${(d.salesChannels || []).map(t => `<option value="${t}" ${t === opp.salesChannel ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              ${readonly ? '' : `<button type="button" class="btn btn-sm" id="f-salesChannel-add" title="新增销售渠道到字典">+ 新增</button>`}
            </div>
          </div>
          <div class="field ${roClass}"><label>阶段 *</label><select id="f-stage" ${dis}>${d.stages.map(t => `<option value="${t}" ${t === opp.stage ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-stage"></div></div>
          <div class="field ${roClass}"><label>发票状态</label><select id="f-invoiceStatus" ${dis}>
            <option value="">(无)</option>
            ${BUILTIN_INVOICE_STATUSES.map(s => `<option value="${s}" ${s === opp.invoiceStatus ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
          <div class="field ${roClass}"><label>币种 *</label><select id="f-currency" ${dis}>${d.currencies.map(t => `<option value="${t}" ${t === opp.currency ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-currency"></div></div>
          <div class="field ${roClass}"><label>含税金额 *</label><input id="f-amount" type="number" step="0.01" value="${opp.amountTaxIncluded || opp.amount || 0}" ${ro}><div class="err" id="err-amount"></div></div>
          <div class="field ${roClass}">
            <label>赢率 (0-1) *</label>
            <input id="f-winRate" type="number" step="0.01" min="0" max="1" value="${opp.winRate}" ${ro}>
            <div class="err" id="err-winRate"></div>
            ${showLoseReason ? `
              <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
                <label style="font-size:11px; color:var(--muted); display:block; margin-bottom:4px;">丢单原因 (ST5 阶段必选):</label>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${d.loseReasons.map(r => `<label class="lose-reason-chip ${readonly ? 'ro' : ''}"><input type="checkbox" class="lose-reason-cb" value="${r}" ${(opp.loseReason || '').split(',').includes(r) ? 'checked' : ''} ${readonly ? 'disabled' : ''}> ${r}</label>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          <div class="field ${roClass}"><label>预计落单时间</label><input id="f-expectedDate" type="date" value="${serialToExcelDate(opp.expectedDate)}" ${ro}></div>
          <div class="field ${roClass}" style="grid-column: span 2">
            <label>项目情况</label>
            <textarea id="f-projectStatus" rows="4" ${ro} placeholder="${PROJECT_STATUS_PLACEHOLDER}">${opp.projectStatus || ''}</textarea>
            <div class="help">详细记录项目情况,例如客户关键人、具体销售产品/服务、当前进展等。仅内部可见,不会随 xlsx 导出对外分享。</div>
          </div>
          <div class="field ${roClass}" style="grid-column: span 2"><label>备注 (内部)</label><textarea id="f-note" rows="2" ${ro}>${opp.note || ''}</textarea></div>
        </div>
        <div class="form-actions">
          ${actions}
        </div>
      </div>
    `;

    // Wire up event handlers
    wireFormHandlers(opp, d, readonly);
  }

  // Wire all form event handlers (separated for readability)
  function wireFormHandlers(opp, d, readonly) {
    const productLineEl = document.getElementById('f-productLine');
    if (productLineEl && !readonly) {
      productLineEl.onchange = (e) => {
        const newOpts = buildProductOptions(e.target.value);
        const sel = document.getElementById('f-product');
        sel.innerHTML = newOpts.map(t => `<option value="${t}">${t}</option>`).join('');
      };
    }

    const stageEl = document.getElementById('f-stage');
    if (stageEl && !readonly) {
      stageEl.onchange = (e) => {
        const stage = e.target.value || '';
        const m = stage.toUpperCase().match(/ST\s*([1-9])/);
        if (m) {
          const key = 'ST' + m[1];
          if (STAGE_DEFAULT_WINRATE[key] !== undefined) {
            document.getElementById('f-winRate').value = STAGE_DEFAULT_WINRATE[key];
          }
        }
        // Re-render to show/hide lose reason
        if ((e.target.value.indexOf('ST5') >= 0) !== (opp.stage && opp.stage.indexOf('ST5') >= 0)) {
          const oldStage = opp.stage;
          opp.stage = e.target.value;
          renderOppForm(opp, mode);
          opp.stage = oldStage;
        }
      };
    }

    // "+ 新增" 客户
    const custAdd = document.getElementById('f-customer-add');
    if (custAdd) {
      custAdd.onclick = () => {
        const sel = document.getElementById('f-customer');
        const cur = (sel.value || '').trim();
        const v = (prompt('输入新客户名称:', cur) || '').trim();
        if (!v) return;
        if (CRM.state.dicts.customers.includes(v)) {
          Notify.warn('已存在: ' + v);
          sel.value = v;
          return;
        }
        CRM.state.dicts.customers.push(v);
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v; opt.selected = true;
        sel.appendChild(opt);
        CRM.markModified();
        Notify.info('已新增客户到字典: ' + v);
      };
    }
    // "+ 新增" 销售渠道
    const chanAdd = document.getElementById('f-salesChannel-add');
    if (chanAdd) {
      chanAdd.onclick = () => {
        const sel = document.getElementById('f-salesChannel');
        const cur = (sel.value || '').trim();
        const v = (prompt('输入新销售渠道:', cur) || '').trim();
        if (!v) return;
        if (CRM.state.dicts.salesChannels.includes(v)) {
          Notify.warn('已存在: ' + v);
          sel.value = v;
          return;
        }
        CRM.state.dicts.salesChannels.push(v);
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v; opt.selected = true;
        sel.appendChild(opt);
        CRM.markModified();
        Notify.info('已新增销售渠道到字典: ' + v);
      };
    }

    // Action buttons
    const saveBtn = document.getElementById('form-save');
    if (saveBtn) saveBtn.onclick = () => submitForm();
    const cancelBtn = document.getElementById('form-cancel');
    if (cancelBtn) cancelBtn.onclick = () => cancelEdit();
    const backBtn = document.getElementById('form-back');
    if (backBtn) backBtn.onclick = () => {
      // Discard edit state, switch to list
      mode = 'view'; CRM.state.detailEditing = false;
      document.querySelector('.tab[data-tab="list"]').click();
    };
    const editBtn = document.getElementById('form-edit');
    if (editBtn) editBtn.onclick = () => enterEditMode();
    const delBtn = document.getElementById('form-delete');
    if (delBtn) delBtn.onclick = () => {
      if (!editingId) return;
      const target = CRM.state.opportunities.find(o => o.id === editingId);
      if (!target) return;
      if (!confirm(`确定删除商机 "${target.oppName}"?\n(软删除,可在"显示已删除"里找回)`)) return;
      target.deleted = true;
      try {
        CRM_DB.upsertOpp(target);
        if (CRM_DB.flushSave) CRM_DB.flushSave();
      } catch (e) { console.error('delete failed', e); Notify.error('删除失败: ' + e.message); return; }
      mode = 'new'; editingId = null; CRM.state.currentOppId = null; CRM.state.detailEditing = false;
      Notify.info('已删除: ' + target.oppName);
      document.querySelector('.tab[data-tab="list"]').click();
    };
  }

  // ---- Public renderers ----
  function renderForm() {
    // 1) Clear detail selection so the "新增" tab is a fresh blank form
    CRM.state.currentOppId = null;
    CRM.state.detailEditing = false;
    editingId = null;
    mode = 'new';
    renderOppForm(CRM.makeOpportunity(), 'new');
  }

  function renderDetail() {
    const id = CRM.state.currentOppId;
    if (!id) {
      // No opp selected → show empty state
      const content = document.getElementById('content');
      content.innerHTML = `
        <h2>商机详情</h2>
        <div class="card">
          <div class="empty-state">
            <div class="empty-icon">👈</div>
            <div class="empty-title">请先选择一个商机</div>
            <div class="empty-sub">在 <a href="#" id="link-to-list">商机列表</a> 点击任意一行,或从仪表盘点击逾期商机,即可查看详情</div>
          </div>
        </div>
      `;
      const link = document.getElementById('link-to-list');
      if (link) link.onclick = (e) => { e.preventDefault(); document.querySelector('.tab[data-tab="list"]').click(); };
      return;
    }
    const opp = CRM.state.opportunities.find(o => o.id === id);
    if (!opp) {
      // Stale id → reset and show empty state
      CRM.state.currentOppId = null;
      renderDetail();
      return;
    }
    editingId = id;
    // Re-sync mode from state (in case user came back to this tab)
    mode = CRM.state.detailEditing ? 'edit' : 'view';
    renderOppForm(opp, mode);
  }

  // Public: navigate to detail for an opp id (called from list click, dashboard click)
  function viewOpp(id) {
    const opp = CRM.state.opportunities.find(o => o.id === id);
    if (!opp) { Notify.error('找不到该商机'); return; }
    if (opp.deleted) { Notify.warn('该商机已删除,可在「显示已删除」里恢复'); }
    CRM.state.currentOppId = id;
    CRM.state.detailEditing = false;
    mode = 'view';
    editingId = id;
    // Show the detail tab (it starts hidden when no opp is selected)
    const tabBtn = document.getElementById('tab-detail');
    if (tabBtn) tabBtn.style.display = '';
    // Switch to detail tab
    const tab = document.querySelector('.tab[data-tab="detail"]');
    if (tab) tab.click();
    else renderDetail();
  }

  // ---- Submit (with DB persistence fix) ----
  function submitForm() {
    const data = getFormData();
    const errors = CRM.validateOpportunity(Object.assign({ id: editingId || 'new' }, data));
    if (errors.length) {
      document.querySelectorAll('.err').forEach(e => e.textContent = '');
      document.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
      for (const e of errors) {
        const el = document.getElementById('err-' + e.field);
        if (el) el.textContent = e.message;
        const input = document.getElementById('f-' + e.field);
        if (input) input.classList.add('invalid');
      }
      Notify.error('表单有 ' + errors.length + ' 处错误');
      return;
    }
    let target;
    if (editingId) {
      // Update existing
      target = CRM.state.opportunities.find(x => x.id === editingId);
      if (!target) { Notify.error('找不到要更新的商机'); return; }
      Object.assign(target, data);
      // Compute amountRmbEquivalent if user didn't set it
      if (!target.amountRmbEquivalent) {
        const rate = (typeof EXCHANGE_RATES_TO_RMB !== 'undefined' && EXCHANGE_RATES_TO_RMB[target.currency]) || 1.0;
        target.amountRmbEquivalent = (target.amountTaxIncluded || 0) * rate;
      }
      // Persist to DB
      try { CRM_DB.upsertOpp(target); if (CRM_DB.flushSave) CRM_DB.flushSave(); }
      catch (e) { console.error('save failed', e); Notify.error('保存失败: ' + e.message); return; }
      Notify.info('已更新: ' + target.oppName);
    } else {
      // Create new
      target = CRM.makeOpportunity(data);
      // Compute amountRmbEquivalent
      const rate = (typeof EXCHANGE_RATES_TO_RMB !== 'undefined' && EXCHANGE_RATES_TO_RMB[target.currency]) || 1.0;
      target.amountRmbEquivalent = (target.amountTaxIncluded || 0) * rate;
      CRM.state.opportunities.push(target);
      // Persist
      try { CRM_DB.upsertOpp(target); if (CRM_DB.flushSave) CRM_DB.flushSave(); }
      catch (e) { console.error('save failed', e); Notify.error('保存失败: ' + e.message); return; }
      Notify.info('已新增: ' + target.oppName);
    }
    // After save: if we were in detail view, go back to view mode; if new, switch to list
    if (mode === 'edit' && editingId) {
      mode = 'view';
      CRM.state.detailEditing = false;
      renderOppForm(target, 'view');
    } else {
      editingId = null;
      mode = 'new';
      CRM.state.currentOppId = null;
      document.querySelector('.tab[data-tab="list"]').click();
    }
  }

  // Backwards-compat with existing callers
  global.startEditForm = startEdit;
  global.renderForm = renderForm;
  global.renderDetail = renderDetail;
  global.viewOpp = viewOpp;
  global.enterEditMode = enterEditMode;
  global.cancelEdit = cancelEdit;
})(window);
