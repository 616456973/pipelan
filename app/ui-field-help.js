// 字段说明 — 左右两栏 + FAQ 卡片(v3.0.1)
(function (global) {
  'use strict';

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };

  function renderFieldHelp() {
    const content = document.getElementById('content');
    const invoiceChips = BUILTIN_INVOICE_STATUSES
      .map(s => `<span class="chip">${s}</span>`).join(' ');
    const rateRows = Object.entries(EXCHANGE_RATES_TO_RMB)
      .map(([cur, rate]) => `<tr><td><code>${cur}</code></td><td>${rate}</td></tr>`).join('');

    content.innerHTML = `
      <h2>字段说明 — 字典 ↔ 商机 映射</h2>

      <div class="grid-2" style="display:grid; grid-template-columns: 1fr 1.4fr; gap:18px;">
        <div class="card">
          <h3>字段分类</h3>
          <p><b>下拉单选字段 (9)</b></p>
          <p class="muted" style="line-height:2;">销售团队 / 主责销售 / 客户名称 / 业务线 / 业务·产品 / 销售渠道 / 阶段 / 币种 / 丢单原因</p>
          <hr style="margin:14px 0; border:0; border-top:1px solid var(--border);">
          <p><b>内置枚举 (1)</b></p>
          <p class="muted" style="line-height:2;">发票状态(5 个固定值,代码里改)</p>
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">${invoiceChips}</div>
          <hr style="margin:14px 0; border:0; border-top:1px solid var(--border);">
          <p><b>自由值字段 (5)</b></p>
          <p class="muted" style="line-height:2;">含税金额 / 折算 RMB / 赢率 / 预计落单时间 / (内部)备注</p>
          <hr style="margin:14px 0; border:0; border-top:1px solid var(--border);">
          <p><b>汇率 (3 个币种,代码里改)</b></p>
          <table style="max-width:280px; margin-top:6px;">
            <thead><tr><th>币种</th><th>汇率 → RMB</th></tr></thead>
            <tbody>${rateRows}</tbody>
          </table>
        </div>

        <div>
          <div class="card">
            <h3>📌 Q1: 字典里能加新值吗?</h3>
            <p>可以。点击顶栏 <b>「字典」</b> tab,选要改的字典(销售团队/主责销售/客户名称/业务线/业务·产品/销售渠道/阶段/币种/丢单原因),点 <b>+ 新增</b>。</p>
          </div>
          <div class="card">
            <h3>📝 Q2: 字典值能改名吗?</h3>
            <p>可以。点字典里某行的 <b>编辑</b> 按钮。改完后,所有引用这个值的商机字段会<b>自动更新</b>(数据库是事务级更新的)。</p>
          </div>
          <div class="card">
            <h3>🗑️ Q3: 字典值能删吗?</h3>
            <p>可以,但被引用的删之前会弹引用计数对话框。<br>
            例如:删字典 <b>「李经理」</b>,如果有 5 条商机负责人 = 「李经理」,会提示「5 条商机引用了 李经理,删除后这些商机的字段会变成'未分类'」。<br>
            确认后才会改。</p>
          </div>
          <div class="card">
            <h3>🔒 Q4: 哪些字段不能改?</h3>
            <p><b>发票状态</b>(5 个固定值)和 <b>汇率</b>(3 个币种)是写死在代码里的内置枚举,不在字典管理 UI 里,不能编辑。<br>
            需要改这两个,要改 <code>app/core.js</code> 里的 <code>BUILTIN_INVOICE_STATUSES</code> 和 <code>EXCHANGE_RATES_TO_RMB</code> 常量。</p>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:18px;">
        <h3>技术参考 — 商机字段 × 字典表 完整映射</h3>
        <table>
          <thead><tr><th>商机字段</th><th>类型</th><th>字典</th><th>说明</th></tr></thead>
          <tbody>
            <tr><td><code>oppName</code></td><td>文本</td><td>(无)</td><td>商机名称</td></tr>
            <tr><td><code>team</code></td><td>下拉</td><td><code>dict_teams</code></td><td>销售团队</td></tr>
            <tr><td><code>owner</code></td><td>下拉</td><td><code>dict_owners</code></td><td>主责销售</td></tr>
            <tr><td><code>customer</code></td><td>下拉(可手动新增)</td><td><code>dict_customers</code></td><td>客户名称</td></tr>
            <tr><td><code>productLine</code></td><td>下拉</td><td><code>dict_product_lines</code></td><td>业务线</td></tr>
            <tr><td><code>product</code></td><td>下拉</td><td><code>dict_products</code></td><td>业务/产品</td></tr>
            <tr><td><code>salesChannel</code></td><td>下拉</td><td><code>dict_sales_channels</code></td><td>销售渠道</td></tr>
            <tr><td><code>stage</code></td><td>下拉</td><td><code>dict_stages</code></td><td>阶段 (5 个固定值)</td></tr>
            <tr><td><code>invoiceStatus</code></td><td>下拉</td><td>(内置枚举)</td><td>发票状态 (5 个固定值,代码里改)</td></tr>
            <tr><td><code>currency</code></td><td>下拉</td><td><code>dict_currencies</code></td><td>币种</td></tr>
            <tr><td><code>amountTaxIncluded</code></td><td>数字</td><td>(无)</td><td>含税金额</td></tr>
            <tr><td><code>amountRmbEquivalent</code></td><td>数字(自动算)</td><td>(无)</td><td>折算 RMB = 含税金额 × 汇率</td></tr>
            <tr><td><code>winRate</code></td><td>数字 (0-1)</td><td>(无)</td><td>赢单概率</td></tr>
            <tr><td><code>expectedDate</code></td><td>Excel 序列号</td><td>(无)</td><td>预计落单时间</td></tr>
            <tr><td><code>note</code></td><td>自由文本</td><td>(无)</td><td>内部备注</td></tr>
            <tr><td><code>loseReason</code></td><td>逗号分隔多值</td><td><code>dict_lose_reasons</code></td><td>丢单原因 (例: "价格过高,竞品优势")</td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  global.renderFieldHelp = renderFieldHelp;
})(window);
