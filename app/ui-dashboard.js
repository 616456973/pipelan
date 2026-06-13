// 仪表盘 — 4 KPI cards + hero header + stage funnel + monthly trend + business line + top 10 owners + top 5 teams.
(function (global) {
  'use strict';

  // Navigate to a tab with an optional filter preset
  function setFilterAndSwitch(tab, filterPatch) {
    const fs = window.CRM_FILTERS;
    if (fs && filterPatch) {
      for (const [k, v] of Object.entries(filterPatch)) {
        fs[k] = v;
      }
    }
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn) btn.click();
  }

  // Count opportunities in a given stage (excludes deleted / parse errors)
  function countByStage(stageLabel) {
    if (!stageLabel) return 0;
    const valid = CRM.state.opportunities.filter(o => !o.deleted && !o.parseError);
    return valid.filter(o => o.stage === stageLabel).length;
  }

  // Small ⓘ icon with a tooltip explaining the metric
  function helpIcon(text) {
    return ` <span class="help-icon" title="${String(text).replace(/"/g, '&quot;')}">ⓘ</span>`;
  }

  // Initialize selected stage if not set
  if (typeof window.__dashSelectedStage === 'undefined') {
    window.__dashSelectedStage = 'ST4:赢单(Win)';
  }

  // Stage change handler — re-renders the dashboard
  window.__dashStageChange = function(newStage) {
    window.__dashSelectedStage = newStage;
    renderDashboard();
    Notify.info('已切换到: ' + newStage);
  };

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
        <div class="label">总合同金额${helpIcon('所有商机的合同金额合计,按币种细分')}</div>
        <div class="value">${amountHtml}</div>
        <div class="sub">按币种: ${Object.keys(k.amountByCurrency).join(', ') || '无'}</div>
      </div>
      <div class="kpi k-green" data-dash-stage>
        <div class="kpi-icon">🎯</div>
        <div class="label">阶段商机数:${helpIcon('下拉切换阶段,实时显示该阶段的商机数')}<select id="dash-stage-select" class="kpi-stage-select" onchange="window.__dashStageChange(this.value)">
          ${(CRM.state.dicts.stages || []).map(s => `<option value="${s}" ${s === (window.__dashSelectedStage || 'ST4:赢单(Win)') ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="value" id="dash-stage-count">${countByStage(window.__dashSelectedStage || 'ST4:赢单(Win)')}</div>
        <div class="sub">赢单率 ${(k.winRate * 100).toFixed(1)}% · ST5: ${k.st5} · 点数字可切换</div>
      </div>
      <div class="kpi k-purple">
        <div class="kpi-icon">📊</div>
        <div class="label">加权金额${helpIcon('含税金额 × 赢单概率 的合计,代表"预计能拿到的钱"')}</div>
        <div class="value">${fmtMoney(totalAmount > 0 ? totalAmount * avgWinRate : 0)}</div>
        <div class="sub">按平均赢率 ${(avgWinRate * 100).toFixed(0)}% 估算</div>
      </div>
      <div class="kpi k-orange">
        <div class="kpi-icon">👥</div>
        <div class="label">活跃客户${helpIcon('去重的客户数(同一客户多个商机算一个)')}</div>
        <div class="value">${activeCustomers}</div>
        <div class="sub">${k.oppCount > 0 ? (k.oppCount / Math.max(activeCustomers, 1)).toFixed(1) : 0} 商机/客户</div>
      </div>
    </div>

    <!-- Main visualizations (2x2) -->
    <div class="grid-2 dash-grid">
      <div class="card">
        <div class="card-header">
          <h3>阶段漏斗${helpIcon('每个阶段的商机数。漏斗越往下越窄,说明转化健康')}</h3>
          <span class="card-tag">${funnel.reduce((s, f) => s + f.count, 0)} 条商机</span>
        </div>
        ${funnelHtml(funnel)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>月度加权趋势${helpIcon('按月聚合的加权金额走势,看未来能到多少钱')}</h3>
          <span class="card-tag">${trend.length} 个月</span>
        </div>
        ${trendBarsHtml(trend)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>业务线金额占比${helpIcon('各业务线的合同金额合计,看哪条产品线是主力')}</h3>
          <span class="card-tag">TOP ${topBls.length}</span>
        </div>
        ${topBarHtml(topBls, 'amount', 'productLine')}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>销售代表业绩 (TOP 10)${helpIcon('按加权金额排名的前 10 位负责人')}</h3>
          <span class="card-tag">按加权金额</span>
        </div>
        ${topBarHtml(topOwners, 'weighted', 'owner')}
      </div>
    </div>

    <!-- Bottom: TOP 5 teams full width -->
    <div class="card dash-bottom">
      <div class="card-header">
        <h3>团队业绩 TOP 5${helpIcon('按金额排名的前 5 个销售团队')}</h3>
        <span class="card-tag">按金额</span>
      </div>
      ${topBarHtml(topTeams, 'amount', 'team')}
    </div>
  `;
    // Wire up click handlers for all [data-nav] elements
    content.querySelectorAll('[data-nav]').forEach(el => {
      el.onclick = () => {
        const parts = el.dataset.nav.split('|');
        const tab = parts[0];
        const fieldOrSpecial = parts[1];
        if (tab === 'list' && fieldOrSpecial && fieldOrSpecial.startsWith('ST')) {
          // Stage filter
          setFilterAndSwitch('list', { stages: [fieldOrSpecial] });
          Notify.info('已筛选: 阶段 = ' + fieldOrSpecial);
        } else if (tab === 'list' && fieldOrSpecial) {
          // Other field filter (owner/customer/etc.)
          setFilterAndSwitch('list', { [fieldOrSpecial]: parts[2] ? [parts[2]] : [] });
          const label = { owner: '负责人', customer: '客户', productLine: '业务线', product: '产品', team: '团队' }[fieldOrSpecial] || fieldOrSpecial;
          Notify.info('已筛选: ' + label + ' = ' + (parts[2] || '全部'));
        } else {
          // No filter, just switch tab
          setFilterAndSwitch(tab, null);
        }
      };
    });
  }

  function funnelHtml(funnel) {
    if (!funnel.length) return '<p class="muted">（无数据）</p>';
    // Use the FIRST stage's count as the reference (100% width)
    const maxCount = Math.max(1, funnel[0].count);
    return funnel.map((f, i) => {
      const m = (f.stage || '').toUpperCase().match(/ST\s*([1-9])/);
      const stCode = m ? 'ST' + m[1] : 'st' + (i + 1);
      const stClass = m ? 'st' + m[1] : 'st-other';
      const widthPct = Math.max(2, (f.count / maxCount) * 100);
      const nav = m ? `data-nav='list|ST${m[1]}'` : '';
      return `<div class="funnel-row" ${nav} title="点击筛选 ${f.stage} 的商机">
      <div class="funnel-label">${f.stage}</div>
      <div class="funnel-bar-wrap">
        <div class="funnel-bar funnel-bar-${stClass}" style="width:${widthPct}%;"></div>
      </div>
      <div class="funnel-meta">
        <b>${f.count}</b> 条
        <div class="funnel-meta-sub">${f.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
      </div>
    </div>`;
    }).join('');
  }

  function trendBarsHtml(trend) {
    if (!trend.length) return '<p class="muted">无日期数据</p>';
    const max = Math.max(1, ...trend.map(t => t.weighted));
    // Determine current year-month
    const now = new Date();
    const currentYM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    return `
    <div style="display:flex; align-items:flex-end; gap:4px; height:160px; border-bottom:1px solid var(--border);">
      ${trend.map(t => {
        const isPast = t.month < currentYM;
        const isCurrent = t.month === currentYM;
        const isFuture = t.month > currentYM;
        const bg = isCurrent
          ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'  // current: orange highlight
          : isPast
            ? 'linear-gradient(180deg, #cbd5e0, #e2e8f0)'  // past: gray
            : 'linear-gradient(180deg, var(--primary), var(--accent))';  // future: default
        const heightPct = Math.max(2, (t.weighted / max) * 100);
        return `<div class="trend-bar ${isCurrent ? 'trend-current' : ''} ${isPast ? 'trend-past' : ''}" style="flex:1; background:${bg}; height:${heightPct}%; min-height:2px; position:relative;" title="${t.month}: ${Math.round(t.weighted).toLocaleString()}${isCurrent ? ' (当前月)' : ''}${isPast ? ' (已过去)' : ' (未来)'}"></div>`;
      }).join('')}
    </div>
    <div style="display:flex; gap:4px; font-size:10px; color:var(--muted); margin-top:4px;">
      ${trend.map(t => {
        const isCurrent = t.month === currentYM;
        return `<div style="flex:1; text-align:center; ${isCurrent ? 'color:var(--primary); font-weight:600;' : ''}">${t.month.slice(5)}${isCurrent ? ' ●' : ''}</div>`;
      }).join('')}
    </div>
  `;
  }

  function topBarHtml(items, metric, groupBy) {
    if (!items.length) return '<p class="muted">（无数据）</p>';
    const max = Math.max(1, ...items.map(i => i[metric]));
    return items.map(i => {
      const w = (i[metric] / max) * 100;
      const nav = groupBy ? `data-nav='list|${groupBy}|${(i.name || '').replace(/'/g, "\\'")}'` : '';
      return `<div ${nav} style="display:flex; align-items:center; gap:8px; margin:4px 0; padding:4px; border-radius:4px; cursor:pointer;" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'" title="点击筛选 ${groupBy || ''} = ${i.name} 的商机">
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
