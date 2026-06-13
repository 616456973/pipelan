// 商机表单 — add/edit single opportunity.
(function (global) {
  'use strict';

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const STAGE_DEFAULT_WINRATE = { 'ST1': 0.1, 'ST2': 0.3, 'ST3': 0.5, 'ST4': 1, 'ST5': 0 };

  function excelDateToSerial(dateStr) {
    // dateStr in 'YYYY-MM-DD' format → Excel serial
    // Use Date.UTC to avoid timezone interpretation
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
    // Use getUTC* methods for timezone-safe formatting
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  let editingId = null;  // null = new mode; otherwise editing existing opp.id

  function startNew() {
    editingId = null;
    renderForm();
  }
  function startEdit(id) {
    editingId = id;
    renderForm();
  }

  function getFormData() {
    const v = (id) => document.getElementById(id).value;
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
      loseReason: Array.from(document.querySelectorAll('.lose-reason-cb:checked')).map(cb => cb.value).join(',')
    };
  }

  function buildProductOptions(productLine) {
    const all = CRM.state.dicts.products;
    if (productLine && productLine.indexOf('PL1') >= 0) {
      return all.filter(p => /^P1/.test(p));
    } else if (productLine && productLine.indexOf('PL2') >= 0) {
      return all.filter(p => /^P2/.test(p));
    }
    return all;
  }

  function renderForm() {
    const content = document.getElementById('content');
    const opp = editingId ? CRM.state.opportunities.find(o => o.id === editingId) : CRM.makeOpportunity();
    if (!opp) { Notify.error('找不到要编辑的商机'); return; }

    const d = CRM.state.dicts;
    const productOptions = buildProductOptions(opp.productLine);
    const showLoseReason = opp.stage && opp.stage.indexOf('ST5') >= 0;

    content.innerHTML = `
      <h2>${editingId ? '编辑' : '新增'}商机</h2>
      <div class="card">
        <div class="form-grid">
          <div class="field"><label>销售团队 *</label><select id="f-team-sel">${d.teams.map(t => `<option value="${t}" ${t === opp.team ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-team-sel"></div></div>
          <div class="field"><label>商机名称 *</label><input id="f-oppName" value="${opp.oppName || ''}"><div class="err" id="err-oppName"></div></div>
          <div class="field"><label>客户名称 *</label>
            <div style="display:flex; gap:6px;">
              <select id="f-customer" style="flex:1;">
                <option value="">— 请选择 —</option>
                ${(CRM.state.dicts.customers || []).map(c => `<option value="${c}" ${c === opp.customer ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              <button type="button" class="btn" id="f-customer-add" title="新增客户到字典">+ 新增</button>
            </div>
            <div class="err" id="err-customer"></div>
          </div>
          <div class="field"><label>负责人 *</label><input id="f-owner" value="${opp.owner || ''}"><div class="err" id="err-owner"></div></div>
          <div class="field"><label>业务线 *</label><select id="f-productLine">${d.productLines.map(t => `<option value="${t}" ${t === opp.productLine ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-productLine"></div></div>
          <div class="field"><label>业务/产品 *</label><select id="f-product">${productOptions.map(t => `<option value="${t}" ${t === opp.product ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-product"></div></div>
          <div class="field"><label>销售渠道</label>
            <div style="display:flex; gap:6px;">
              <select id="f-salesChannel" style="flex:1;">
                <option value="">— 请选择 —</option>
                ${(d.salesChannels || []).map(t => `<option value="${t}" ${t === opp.salesChannel ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
              <button type="button" class="btn" id="f-salesChannel-add" title="新增销售渠道到字典">+ 新增</button>
            </div>
          </div>
          <div class="field"><label>阶段 *</label><select id="f-stage">${d.stages.map(t => `<option value="${t}" ${t === opp.stage ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-stage"></div></div>
          <div class="field"><label>发票状态</label><select id="f-invoiceStatus">
            <option value="">(无)</option>
            ${BUILTIN_INVOICE_STATUSES.map(s => `<option value="${s}" ${s === opp.invoiceStatus ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
          <div class="field"><label>币种 *</label><select id="f-currency">${d.currencies.map(t => `<option value="${t}" ${t === opp.currency ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-currency"></div></div>
          <div class="field"><label>含税金额 *</label><input id="f-amount" type="number" step="0.01" value="${opp.amountTaxIncluded || opp.amount || 0}"><div class="err" id="err-amount"></div></div>
          <div class="field">
            <label>赢率 (0-1) *</label>
            <input id="f-winRate" type="number" step="0.01" min="0" max="1" value="${opp.winRate}">
            <div class="err" id="err-winRate"></div>
            ${showLoseReason ? `
              <div style="margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
                <label style="font-size:11px; color:var(--muted); display:block; margin-bottom:4px;">丢单原因 (ST5 阶段必选):</label>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">
                  ${d.loseReasons.map(r => `<label class="lose-reason-chip"><input type="checkbox" class="lose-reason-cb" value="${r}" ${(opp.loseReason || '').split(',').includes(r) ? 'checked' : ''}> ${r}</label>`).join('')}
                </div>
              </div>
            ` : ''}
          </div>
          <div class="field"><label>预计落单时间</label><input id="f-expectedDate" type="date" value="${serialToExcelDate(opp.expectedDate)}"></div>
          <div class="field" style="grid-column: span 2"><label>备注 (内部)</label><textarea id="f-note" rows="2">${opp.note || ''}</textarea></div>
        </div>
        <div style="margin-top:16px; display:flex; gap:8px;">
          <button class="btn btn-primary" id="form-save">保存</button>
          <button class="btn" id="form-cancel">取消</button>
        </div>
      </div>
    `;

    document.getElementById('f-productLine').onchange = (e) => {
      const newLine = e.target.value;
      const newOpts = buildProductOptions(newLine);
      const sel = document.getElementById('f-product');
      sel.innerHTML = newOpts.map(t => `<option value="${t}">${t}</option>`).join('');
    };
    document.getElementById('f-stage').onchange = (e) => {
      // 阶段变更时建议赢率
      const stage = e.target.value || '';
      const m = stage.toUpperCase().match(/ST\s*([1-9])/);
      if (m) {
        const key = 'ST' + m[1];
        if (STAGE_DEFAULT_WINRATE[key] !== undefined) {
          document.getElementById('f-winRate').value = STAGE_DEFAULT_WINRATE[key];
        }
      }
      // If ST5, re-render to show lose reason
      if (e.target.value.indexOf('ST5') >= 0) {
        const oldStage = opp.stage;
        opp.stage = e.target.value;
        renderForm();
        opp.stage = oldStage;
      } else {
        const lr = document.querySelector('.lose-reason-cb');
        if (lr) {
          const oldStage = opp.stage;
          opp.stage = e.target.value;
          renderForm();
          opp.stage = oldStage;
        }
      }
    };

    // "+ 新增" 按钮:把当前选中的客户值(若有)或弹出 prompt,加入 dict_customers
    document.getElementById('f-customer-add').onclick = () => {
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
      // Add new option to select and select it
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      opt.selected = true;
      sel.appendChild(opt);
      CRM.markModified();
      Notify.info('已新增客户到字典: ' + v);
    };

    // "+ 新增" 按钮 for 销售渠道
    document.getElementById('f-salesChannel-add').onclick = () => {
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
      opt.value = v;
      opt.textContent = v;
      opt.selected = true;
      sel.appendChild(opt);
      CRM.markModified();
      Notify.info('已新增销售渠道到字典: ' + v);
    };

    document.getElementById('form-save').onclick = () => submitForm();
    document.getElementById('form-cancel').onclick = () => {
      editingId = null;
      document.querySelector('.tab[data-tab="list"]').click();
    };
  }

  function submitForm() {
    const data = getFormData();
    const errors = CRM.validateOpportunity(Object.assign({ id: editingId || 'new' }, data));
    if (errors.length) {
      document.querySelectorAll('.err').forEach(e => e.textContent = '');
      document.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
      for (const e of errors) {
        const el = document.getElementById('err-' + e.field);
        if (el) el.textContent = e.message;
        const input = document.getElementById('f-' + e.field) || document.getElementById('f-' + (e.field === 'productLine' ? 'productLine' : e.field));
        if (input) input.classList.add('invalid');
      }
      Notify.error('表单有 ' + errors.length + ' 处错误');
      return;
    }
    if (editingId) {
      const o = CRM.state.opportunities.find(x => x.id === editingId);
      Object.assign(o, data);
      Notify.info('已更新: ' + o.oppName);
    } else {
      const o = CRM.makeOpportunity(data);
      CRM.state.opportunities.push(o);
      Notify.info('已新增: ' + o.oppName);
    }
    CRM.markModified();
    editingId = null;
    document.querySelector('.tab[data-tab="list"]').click();
  }

  global.renderForm = renderForm;
  global.startEditForm = startEdit;
})(window);
