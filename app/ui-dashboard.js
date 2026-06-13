// 仪表盘 — 4 KPI cards + hero header + stage funnel + monthly trend + business line + top 10 owners + top 5 teams.
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
    const totalAmount = Object.values(k.amountByCurrency).reduce((s, v) => s + v, 0);
    const avgWinRate = valid.length ? (valid.reduce((s, o) => s + (o.winRate || 0), 0) / valid.length) : 0;

    const fmtMoney = (v) => {
      v = Number(v) || 0;
      if (v >= 1e8) return '¥' + (v / 1e8).toFixed(2) + '亿';
      if (v >= 1e4) return '¥' + (v / 1e4).toFixed(1) + '万';
      return '¥' + Math.round(v).toLocaleString();
    };

    // Today's date for header
    const today = new Date();
    const hour = today.getHours();
    const greeting = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

    // Build amountHtml by currency for "总金额" KPI
    const amountHtml = Object.entries(k.amountByCurrency).map(([c, v]) => `${c} ${fmtMoney(v)}`).join(' / ') || '0';

    content.innerHTML = `
    <!-- Hero header -->
    <div class="dash-hero">
      <div>
        <div class="dash-hero-greeting">${greeting} 👋</div>
        <div class="dash-hero-title">销售仪表盘</div>
        <div class="dash-hero-sub">${today.toLocaleDateString('zh-CN', {year:'numeric', month:'long', day:'numeric', weekday:'long'})}</div>
      </div>
      <div class="dash-hero-stats">
        <div class="dash-hero-stat">
          <div class="dash-hero-stat-num">${k.oppCount}</div>
          <div class="dash-hero-stat-label">商机</div>
        </div>
        <div class="dash-hero-stat-sep"></div>
        <div class="dash-hero-stat">
          <div class="dash-hero-stat-num">${activeCustomers}</div>
          <div class="dash-hero-stat-label">客户</div>
        </div>
        <div class="dash-hero-stat-sep"></div>
        <div class="dash-hero-stat">
          <div class="dash-hero-stat-num">${k.st4}</div>
          <div class="dash-hero-stat-label">赢单</div>
        </div>
      </div>
    </div>

    <!-- KPI cards (4 primary) -->
    <div class="kpi-grid">
      <div class="kpi k-blue">
        <div class="kpi-icon">💰</div>
        <div class="label">总合同金额</div>
        <div class="value">${amountHtml}</div>
        <div class="sub">按币种: ${Object.keys(k.amountByCurrency).join(', ') || '无'}</div>
      </div>
      <div class="kpi k-green">
        <div class="kpi-icon">🎯</div>
        <div class="label">赢单数 (ST4)</div>
        <div class="value">${k.st4}</div>
        <div class="sub">赢单率 ${(k.winRate * 100).toFixed(1)}% · ST5: ${k.st5}</div>
      </div>
      <div class="kpi k-purple">
        <div class="kpi-icon">📊</div>
        <div class="label">加权金额</div>
        <div class="value">${fmtMoney(totalAmount > 0 ? totalAmount * avgWinRate : 0)}</div>
        <div class="sub">按平均赢率 ${(avgWinRate * 100).toFixed(0)}% 估算</div>
      </div>
      <div class="kpi k-orange">
        <div class="kpi-icon">👥</div>
        <div class="label">活跃客户</div>
        <div class="value">${activeCustomers}</div>
        <div class="sub">${k.oppCount > 0 ? (k.oppCount / Math.max(activeCustomers, 1)).toFixed(1) : 0} 商机/客户</div>
      </div>
    </div>

    <!-- Main visualizations (2x2) -->
    <div class="grid-2 dash-grid">
      <div class="card">
        <div class="card-header">
          <h3>阶段漏斗</h3>
          <span class="card-tag">${funnel.reduce((s, f) => s + f.count, 0)} 条商机</span>
        </div>
        ${funnelHtml(funnel)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>月度加权趋势</h3>
          <span class="card-tag">${trend.length} 个月</span>
        </div>
        ${trendBarsHtml(trend)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>业务线金额占比</h3>
          <span class="card-tag">TOP ${topBls.length}</span>
        </div>
        ${topBarHtml(topBls, 'amount')}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>销售代表业绩 (TOP 10)</h3>
          <span class="card-tag">按加权金额</span>
        </div>
        ${topBarHtml(topOwners, 'weighted')}
      </div>
    </div>

    <!-- Bottom: TOP 5 teams full width -->
    <div class="card dash-bottom">
      <div class="card-header">
        <h3>团队业绩 TOP 5</h3>
        <span class="card-tag">按金额</span>
      </div>
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
