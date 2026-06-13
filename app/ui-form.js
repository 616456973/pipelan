// 商机表单 — add/edit single opportunity.
(function (global) {
  'use strict';

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
      team: v('f-team-sel'),
      owner: v('f-owner'),
      oppName: v('f-oppName'),
      customer: v('f-customer'),
      productLine: v('f-productLine'),
      product: v('f-product'),
      currency: v('f-currency'),
      stage: v('f-stage'),
      winRate: parseFloat(v('f-winRate')),
      amount: parseFloat(v('f-amount')),
      amountNet: parseFloat(v('f-amountNet')),
      expectedDate: v('f-expectedDate') ? parseFloat(v('f-expectedDate')) : null,
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
          <div class="field"><label>负责人 *</label><input id="f-owner" value="${opp.owner || ''}"><div class="err" id="err-owner"></div></div>
          <div class="field"><label>商机名称 *</label><input id="f-oppName" value="${opp.oppName || ''}"><div class="err" id="err-oppName"></div></div>
          <div class="field"><label>客户名称 *</label><input id="f-customer" value="${opp.customer || ''}"><div class="err" id="err-customer"></div></div>
          <div class="field"><label>业务线 *</label><select id="f-productLine">${d.productLines.map(t => `<option value="${t}" ${t === opp.productLine ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-productLine"></div></div>
          <div class="field"><label>业务/产品 *</label><select id="f-product">${productOptions.map(t => `<option value="${t}" ${t === opp.product ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-product"></div></div>
          <div class="field"><label>币种 *</label><select id="f-currency">${d.currencies.map(t => `<option value="${t}" ${t === opp.currency ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-currency"></div></div>
          <div class="field"><label>阶段 *</label><select id="f-stage">${d.stages.map(t => `<option value="${t}" ${t === opp.stage ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="err" id="err-stage"></div></div>
          <div class="field"><label>赢率 (0-1) *</label><input id="f-winRate" type="number" step="0.01" min="0" max="1" value="${opp.winRate}"><div class="err" id="err-winRate"></div></div>
          <div class="field"><label>含税金额 *</label><input id="f-amount" type="number" step="0.01" value="${opp.amount}"><div class="err" id="err-amount"></div></div>
          <div class="field"><label>不含税金额 *</label><input id="f-amountNet" type="number" step="0.01" value="${opp.amountNet}"><div class="err" id="err-amountNet"></div></div>
          <div class="field"><label>预计成交/丢单时间 (Excel序列号)</label><input id="f-expectedDate" type="number" value="${opp.expectedDate === null ? '' : opp.expectedDate}"></div>
          <div class="field" style="grid-column: span 2"><label>备注</label><textarea id="f-note" rows="2">${opp.note || ''}</textarea></div>
          ${showLoseReason ? `<div class="field" style="grid-column: span 2"><label>丢单原因 (多选)</label>
            <div>${d.loseReasons.map(r => `<label><input type="checkbox" class="lose-reason-cb" value="${r}" ${(opp.loseReason || '').split(',').includes(r) ? 'checked' : ''}> ${r}</label>`).join(' ')}</div>
          </div>` : ''}
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
