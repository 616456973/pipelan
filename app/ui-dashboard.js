// 仪表盘 — 4 KPI cards + mini stage funnel + TOP 5 bars.
(function (global) {
  'use strict';

  function renderDashboard() {
    const opps = CRM.state.opportunities;
    const k = CRM.computeKpi(opps);
    const funnel = CRM.computeFunnel(opps);
    const topTeams = CRM.computeTopN(opps, { groupBy: 'team', metric: 'amount', n: 5 });
    const topProds = CRM.computeTopN(opps, { groupBy: 'product', metric: 'amount', n: 5 });

    const content = document.getElementById('content');
    const amountHtml = Object.entries(k.amountByCurrency).map(([c, v]) => `${c} ${v.toLocaleString()}`).join(' / ') || '0';
    const weightedHtml = Object.entries(k.weightedByCurrency).map(([c, v]) => `${c} ${v.toLocaleString()}`).join(' / ') || '0';

    content.innerHTML = `
      <h2>仪表盘</h2>
      <div class="kpi-grid">
        <div class="kpi"><div class="label">商机总数</div><div class="value">${k.oppCount}</div></div>
        <div class="kpi"><div class="label">总合同金额</div><div class="value">${amountHtml}</div></div>
        <div class="kpi"><div class="label">加权金额</div><div class="value">${weightedHtml}</div></div>
        <div class="kpi"><div class="label">赢单率</div><div class="value">${(k.winRate * 100).toFixed(1)}%</div><div class="muted">ST4: ${k.st4} / ST5: ${k.st5}</div></div>
      </div>
      <div class="grid-2" style="display:grid; grid-template-columns: 1fr 1fr; gap:18px;">
        <div class="card">
          <h3>阶段漏斗</h3>
          <div class="funnel">${funnelHtml(funnel)}</div>
        </div>
        <div class="card">
          <h3>TOP 5 团队 (按金额)</h3>
          ${topBarHtml(topTeams, 'amount')}
          <h3 style="margin-top:18px;">TOP 5 产品 (按金额)</h3>
          ${topBarHtml(topProds, 'amount')}
        </div>
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
