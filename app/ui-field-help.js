// 字段说明 — shows 商机↔字典 映射关系 (v3.0 transparency feature)
(function (global) {
  'use strict';

  const FIELD_BINDINGS = [
    { field: 'team',           type: '下拉单选', dict: 'dict_teams',          desc: '销售团队' },
    { field: 'owner',          type: '下拉单选', dict: 'dict_owners',         desc: '主责销售' },
    { field: 'customer',       type: '下拉单选', dict: 'dict_customers',      desc: '客户名称' },
    { field: 'product_line',   type: '下拉单选', dict: 'dict_product_lines',  desc: '业务线' },
    { field: 'product',        type: '下拉单选', dict: 'dict_products',       desc: '业务/产品' },
    { field: 'sales_channel',  type: '下拉单选', dict: 'dict_sales_channels', desc: '销售渠道' },
    { field: 'stage',          type: '下拉单选', dict: 'dict_stages',         desc: '阶段' },
    { field: 'invoice_status', type: '下拉单选', dict: '(内置枚举)',           desc: '发票状态 (5 个固定值, 不可编辑)' },
    { field: 'currency',       type: '下拉单选', dict: 'dict_currencies',      desc: '币种' },
    { field: 'amount_tax_included',  type: '数字', dict: '(无)',  desc: '含税金额 (从 xlsx M 列读入)' },
    { field: 'amount_rmb_equivalent', type: '数字 (自动算)', dict: '(无)',  desc: '折算 RMB = 含税金额 × EXCHANGE_RATES_TO_RMB[currency]' },
    { field: 'win_rate',       type: '数字 (0-1)', dict: '(无)',  desc: '赢单概率' },
    { field: 'expected_date',  type: 'Excel 序列号', dict: '(无)',  desc: '预计落单时间' },
    { field: 'note',           type: '自由文本', dict: '(无)',  desc: '内部备注' },
    { field: 'lose_reason',    type: '逗号分隔多值', dict: '(无)',  desc: '丢单原因 (例: "价格过高,竞品优势")' }
  ];

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };

  function renderFieldHelp() {
    const content = document.getElementById('content');
    const rows = FIELD_BINDINGS.map(b => {
      const isBuiltin = b.dict.startsWith('(');
      return `<tr>
        <td><code>${b.field}</code></td>
        <td>${b.type}</td>
        <td>${isBuiltin ? `<span class="muted">${b.dict}</span>` : `<code>${b.dict}</code>`}</td>
        <td>${b.desc}</td>
      </tr>`;
    }).join('');

    const rateRows = Object.entries(EXCHANGE_RATES_TO_RMB)
      .map(([cur, rate]) => `<tr><td><code>${cur}</code></td><td>${rate}</td></tr>`).join('');

    const invoiceChips = BUILTIN_INVOICE_STATUSES
      .map(s => `<span class="chip">${s}</span>`).join(' ');

    content.innerHTML = `
      <h2>字段说明 — 商机 ↔ 字典 映射</h2>
      <div class="card">
        <p class="muted">每条商机包含 15 个业务字段。其中 9 个字段的值来自数据库字典 (下拉单选), 1 个字段是内置枚举 (不可编辑), 其余 5 个是自由值。</p>
        <table>
          <thead><tr><th>商机字段</th><th>类型</th><th>字典</th><th>说明</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="card">
        <h3>内置枚举: 发票状态</h3>
        <p class="muted">这 5 个值写死在代码里, 不在字典管理 UI 里, 不能编辑。修改这些值需要改 <code>app/core.js</code> 里的 <code>BUILTIN_INVOICE_STATUSES</code> 常量。</p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
          ${invoiceChips}
        </div>
      </div>

      <div class="card">
        <h3>汇率表 (折算 RMB 用)</h3>
        <p class="muted">v3.0 硬编码汇率。下次刷新前 (v3.1) 会改成数据库表 + UI 维护。</p>
        <table style="max-width: 320px;">
          <thead><tr><th>币种</th><th>汇率 (→ RMB)</th></tr></thead>
          <tbody>${rateRows}</tbody>
        </table>
        <p class="muted" style="margin-top: 12px;">公式: <code>折算 RMB = 含税金额 × 汇率</code></p>
      </div>

      <div class="card">
        <h3>如何修改字典?</h3>
        <p>1. 点击顶栏"字典" tab</p>
        <p>2. 选要改的字典 (团队 / 主责销售 / 客户名称 / 业务线 / 业务·产品 / 销售渠道 / 阶段 / 币种 / 丢单原因)</p>
        <p>3. 加/改/删条目。删除时如果该字典值被商机引用, 会弹引用计数对话框, 确认后商机字段值改为"未分类"。</p>
      </div>
    `;
  }

  global.renderFieldHelp = renderFieldHelp;
})(window);
