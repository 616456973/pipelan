// 仪表盘 — 6 KPI cards + stage funnel + monthly trend + business line + top 10 owners + top 5 teams.
(function (global) {
  'use strict';

  function renderDashboard() {
    const opps = CRM.state.opportunities;
    const k = CRM.computeKpi(opps);
    const funnel = CRM.computeFunnel(opps);
    const topTeams = CRM.computeTopN(opps, { groupBy: 'team', metric: 'amount', n: 5 });
    const topOwners = CRM.computeTopN(opps, { groupBy: 'owner', metric: 'weighted', n: 10 });
    const topBls = CRM.computeTopN(opps, { groupBy: 'productLine', metric: 'amount', n: 6 });
    const trend = CRM.computeTrend(opps);

    const content = document.getElementById('content');
    const valid = opps.filter(o => !o.deleted && !o.parseError);
    const activeCustomers = new Set(valid.map(o => o.customer).filter(Boolean)).size;
    const avgWinRate = valid.length ? (valid.reduce((s, o) => s + (o.winRate || 0), 0) / valid.length) : 0;

    const amountHtml = Object.entries(k.amountByCurrency).map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`).join(' / ') || '0';
    const weightedHtml = Object.entries(k.weightedByCurrency).map(([c, v]) => `${c} ${Math.round(v).toLocaleString()}`).join(' / ') || '0';

    content.innerHTML = `
    <h2>仪表盘</h2>
    <div class="kpi-grid">
      <div class="kpi k-blue"><div class="label">商机总数</div><div class="value">${k.oppCount}</div></div>
      <div class="kpi k-purple"><div class="label">活跃客户数</div><div class="value">${activeCustomers}</div></div>
      <div class="kpi k-orange"><div class="label">加权金额</div><div class="value">${weightedHtml}</div></div>
      <div class="kpi k-green"><div class="label">赢单数 (ST4)</div><div class="value">${k.st4}</div></div>
      <div class="kpi k-cyan"><div class="label">赢单率</div><div class="value">${(k.winRate * 100).toFixed(1)}%</div><div class="sub">ST4: ${k.st4} / ST5: ${k.st5}</div></div>
      <div class="kpi k-pink"><div class="label">平均赢率</div><div class="value">${(avgWinRate * 100).toFixed(1)}%</div></div>
    </div>
    <div class="grid-2" style="display:grid; grid-template-columns: 1fr 1fr; gap:18px;">
      <div class="card">
        <h3>阶段漏斗</h3>
        <div class="funnel">${funnelHtml(funnel)}</div>
      </div>
      <div class="card">
        <h3>月度加权趋势</h3>
        ${trendBarsHtml(trend)}
      </div>
      <div class="card">
        <h3>业务线金额占比</h3>
        ${topBarHtml(topBls, 'amount')}
      </div>
      <div class="card">
        <h3>TOP 10 销售代表 (按加权金额)</h3>
        ${topBarHtml(topOwners, 'weighted')}
      </div>
    </div>
    <div class="card" style="margin-top:18px;">
      <h3>TOP 5 团队 (按金额)</h3>
      ${topBarHtml(topTeams, 'amount')}
    </div>
  `;
  }

  function funnelHtml(funnel) {
    const max = Math.max(1, ...funnel.map(f => f.amount));
    return funnel.map(f => {
      const widthPct = (f.amount / max) * 100;
      return `<div class="stage" style="width:${Math.max(20, widthPct)}%;">
        <span class="name">${f.stage}</span>
        <span class="meta">${f.count} 条 / ${f.amount.toLocaleString()}</span>
      </div>`;
    }).join('');
  }

  function trendBarsHtml(trend) {
    if (!trend.length) return '<p class="muted">无日期数据</p>';
    const max = Math.max(1, ...trend.map(t => t.weighted));
    return `
    <div style="display:flex; align-items:flex-end; gap:4px; height:160px; border-bottom:1px solid var(--border);">
      ${trend.map(t => `<div style="flex:1; background:linear-gradient(180deg,var(--primary),var(--accent)); height:${(t.weighted / max) * 100}%; min-height:2px; position:relative;" title="${t.month}: ${Math.round(t.weighted).toLocaleString()}"></div>`).join('')}
    </div>
    <div style="display:flex; gap:4px; font-size:10px; color:var(--muted); margin-top:4px;">
      ${trend.map(t => `<div style="flex:1; text-align:center;">${t.month.slice(5)}</div>`).join('')}
    </div>
  `;
  }

  function topBarHtml(items, metric) {
    if (!items.length) return '<p class="muted">（无数据）</p>';
    const max = Math.max(1, ...items.map(i => i[metric]));
    return items.map(i => {
      const w = (i[metric] / max) * 100;
      return `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <div style="width:140px; font-size:12px; text-align:right;">${i.name}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:20px; position:relative;">
          <div style="background:#2563eb; height:100%; width:${w}%; border-radius:4px;"></div>
        </div>
        <div style="width:80px; font-size:12px;">${i[metric].toLocaleString()}</div>
      </div>`;
    }).join('');
  }

  global.renderDashboard = renderDashboard;
})(window);
