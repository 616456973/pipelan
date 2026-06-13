// 字段说明 — 左右两栏 + FAQ 卡片(v3.0.1)
(function (global) {
  'use strict';

  const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
  const EXCHANGE_RATES_TO_RMB = { USD: 7.2, SGD: 5.3, RMB: 1.0 };

  function renderFieldHelp() {
    const content = document.getElementById('content');
    const invoiceChips = BUILTIN_INVOICE_STATUSES
      .map(s => `<span class="chip">${s}</span>`).join(' ');

    content.innerHTML = `
      <h2>字段说明 — 怎么填商机</h2>

      <div class="callout info" style="margin-bottom:18px;">
        <div class="title">💡 5 分钟快速上手</div>
        <p>在「新增商机」页填一条记录,系统会自动算出加权金额;在「商机列表」查看所有商机,可以筛选、按列排序、点行直接编辑。字典里可以加新的客户、负责人、销售渠道等,以后填商机时下拉里就有。</p>
      </div>

      <div class="grid-2" style="display:grid; grid-template-columns: 1fr 1.2fr; gap:18px;">
        <div class="card">
          <h3>📋 填商机时,每个字段是什么意思?</h3>
          <p><b>商机名称</b><br>这个商机的简短名字,比如"XX 公司 ERP 项目"。建议写得具体一点,方便后面查找。</p>
          <p><b>客户名称</b><br>客户的真实公司全称。下拉里选已有的;没有就输入新名字,系统会自动加到客户字典里。</p>
          <p><b>负责人(主责销售)</b><br>这个商机由谁在跟。例:"张晶晶"。</p>
          <p><b>销售团队</b><br>负责人所在团队。例:"渠道业务部"。</p>
          <p><b>业务线 / 业务·产品</b><br>这个商机属于哪个产品线。例:业务线选"PL1 企业云方案",产品选"P120 企业数字化解决方案"。</p>
          <p><b>销售渠道</b><br>这个商机通过什么渠道来的。例:"字节跳动"(合作伙伴)、"直签"(直接找客户)、"翼华科技"。</p>
          <p><b>阶段</b><br>当前跟单到哪一步:
            <span class="tag stage-st1">ST1 线索</span>
            <span class="tag stage-st2">ST2 商机</span>
            <span class="tag stage-st3">ST3 投标</span>
            <span class="tag stage-st4">ST4 赢单</span>
            <span class="tag stage-st5">ST5 丢单</span>
          </p>
          <p><b>发票状态</b><br>钱到哪一步了:${invoiceChips}</p>
          <p><b>币种 / 含税金额</b><br>合同金额和币种。系统自动算"折算 RMB"显示在仪表盘上。</p>
          <p><b>赢单概率</b><br>你判断能拿下的把握。0-1 之间的数字,例 0.7 = 70%。<b>选阶段时系统会自动建议一个默认值</b>(ST1=10%, ST2=30%, ST3=50%, ST4=100%),你可以再调。</p>
          <p><b>预计落单时间</b><br>预计什么时候签合同/丢单。用日期选择器选。</p>
          <p><b>丢单原因</b>(仅 ST5)<br>如果最后没拿下,勾选原因。例:"价格过高"、"竞品优势"。多选。</p>
          <p><b>备注</b><br>内部备注,不在导出 Excel 里(发票状态那列才是导出时给客户看的)。</p>
        </div>

        <div>
          <div class="card">
            <h3>❓ 字典是什么?能加新值吗?</h3>
            <p><b>字典</b>就是下拉里那些选项的来源(团队、负责人、客户、产品…)。</p>
            <p><b>能加新值吗?</b>能。在「字典」页选要改的字典 → 点「+ 新增」→ 输入名字 → 确认。下次填商机时下拉里就有。</p>
            <p><b>能改名字吗?</b>能。点某行的「编辑」改完,所有引用这个值的商机会自动同步更新。</p>
            <p><b>能删除吗?</b>能,但被引用的删之前会提示"X 条商机引用了 Y,删除后这些商机字段会变成'未分类'"。确认后才会改。</p>
            <p><b>哪些不能改?</b>发票状态 5 个值(代码里固定的)、汇率(代码里)。要改这两个要找开发。</p>
          </div>

          <div class="card">
            <h3>📊 仪表盘怎么看?</h3>
            <p><b>商机总数 / 赢单数 / 活跃客户</b> — 一目了然,顶部 4 个大数字就是。</p>
            <p><b>总合同金额 / 加权金额</b> — 总金额是所有商机的合同金额,加权金额是"金额 × 赢单概率"的合计(预计能拿到的钱)。</p>
            <p><b>阶段漏斗</b> — 看每个阶段有多少商机,越往下越少说明转化健康。</p>
            <p><b>月度加权趋势</b> — 按月看未来 N 个月预计能到手的金额走势。</p>
            <p><b>业务线金额占比 / TOP 10 销售代表</b> — 看哪个产品/谁贡献最大。</p>
          </div>

          <div class="card">
            <h3>📈 分析页能干啥?</h3>
            <p>分析页有 12 个视图,涵盖阶段漏斗、趋势、TOP 排名、帕累托 80/20、转化率、丢单原因汇总、透视表、销售代表业绩、逾期预警、客户集中度、发票状态分布、ST4 vs ST5 对比。</p>
            <p>视图之间是同一份数据(响应你设置的筛选条件)。</p>
          </div>
        </div>
      </div>
    `;
  }

  global.renderFieldHelp = renderFieldHelp;
})(window);
