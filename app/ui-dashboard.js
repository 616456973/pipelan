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

  // Initialize KPI metric / target defaults for the 本年 KPI section
  if (typeof window.__dashKpiMetric === 'undefined') {
    window.__dashKpiMetric = '含税金额';
  }
  // Read persisted target from DB (default 0 if not set)
  if (typeof window.__dashKpiTarget === 'undefined') {
    try {
      window.__dashKpiTarget = (typeof CRM !== 'undefined' && CRM.getKpiTarget) ? CRM.getKpiTarget() : 0;
    } catch (e) {
      window.__dashKpiTarget = 0;
    }
  }

  // Stage change handler — re-renders the dashboard
  window.__dashStageChange = function(newStage) {
    window.__dashSelectedStage = newStage;
    renderDashboard();
    Notify.info('已切换到: ' + newStage);
  };

  // Compute the "本年金额" total for the given metric across this year's opps
  function computeYearAmount(opps, metric) {
    const thisYear = new Date().getFullYear();
    const filtered = opps.filter(o => {
      if (o.deleted || o.parseError) return false;
      if (!o.expectedDate || isNaN(Number(o.expectedDate))) return false;
      const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
      return d.getUTCFullYear() === thisYear;
    });
    // Pattern-match common KPI metric labels (supports custom user-defined ones)
    const m = String(metric || '').toLowerCase();
    if (m.includes('含税') || m.includes('总金额') || m.includes('合同')) {
      return filtered.reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
    }
    if (m.includes('加权')) {
      return filtered.reduce((s, o) => s + (o.amountTaxIncluded || 0) * (o.winRate || 0), 0);
    }
    if (m.includes('st4') || m.includes('赢单')) {
      return filtered.filter(o => o.stage && o.stage.indexOf('ST4') >= 0)
        .reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
    }
    if (m.includes('已开票')) {
      return filtered.filter(o => o.invoiceStatus === '已开票' || o.invoiceStatus === '已回款')
        .reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
    }
    if (m.includes('已回款')) {
      return filtered.filter(o => o.invoiceStatus === '已回款')
        .reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
    }
    // Fallback: 含税金额
    return filtered.reduce((s, o) => s + (o.amountTaxIncluded || 0), 0);
  }

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

    <!-- 本年 KPI section (new) -->
    <div class="card kpi-section" id="dash-year-kpi">
      <div class="card-header">
        <h3>📅 本年 KPI (${new Date().getFullYear()})</h3>
        <div style="display:flex; gap:8px; align-items:center;">
          <label style="font-size:12px; color:var(--muted);">金额口径:</label>
          <select id="dash-kpi-metric" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 10px; cursor:pointer;">
            ${(CRM.state.dicts.kpiAmounts || ['含税金额', '加权金额', 'ST4 赢单金额', '已开票金额', '已回款金额']).map(m =>
              `<option value="${m}" ${m === window.__dashKpiMetric ? 'selected' : ''}>${m}</option>`
            ).join('')}
          </select>
          <button class="btn" id="dash-set-target" style="padding:3px 10px; font-size:11px;">设定目标</button>
        </div>
      </div>
      ${yearKpiHtml()}
    </div>

    <!-- Overdue alert section (new) -->
    <div class="card overdue-alert" id="dash-overdue-card">
      <div class="card-header">
        <h3>⚠️ 逾期商机预警</h3>
        <span class="card-tag" id="dash-overdue-count">${CRM.state.opportunities.filter(o => {
          if (o.deleted || o.parseError) return false;
          if (!o.expectedDate || isNaN(Number(o.expectedDate))) return false;
          const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
          if (isNaN(d.getTime())) return false;
          const today0 = new Date(); today0.setHours(0, 0, 0, 0);
          if (d >= today0) return false;
          if (o.stage && (o.stage.indexOf('ST4') >= 0 || o.stage.indexOf('ST5') >= 0)) return false;
          return true;
        }).length} 条</span>
      </div>
      ${overdueHtml(CRM.state.opportunities)}
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
          Notify.info('已筛选: 阶段 = ' + (fieldOrSpecial.length > 20 ? fieldOrSpecial.substring(0, 20) + '...' : fieldOrSpecial));
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

    // KPI metric change — re-render just the year-kpi-grid in place
    const kpiMetricEl = document.getElementById('dash-kpi-metric');
    if (kpiMetricEl) kpiMetricEl.onchange = (e) => {
      window.__dashKpiMetric = e.target.value;
      const card = document.getElementById('dash-year-kpi');
      if (card) {
        const tmp = document.createElement('div');
        tmp.innerHTML = yearKpiHtml();
        const newGrid = tmp.querySelector('.year-kpi-grid');
        const oldGrid = card.querySelector('.year-kpi-grid');
        if (newGrid && oldGrid) oldGrid.parentNode.replaceChild(newGrid, oldGrid);
      }
      Notify.info('已切换 KPI 金额口径: ' + e.target.value);
    };

    // Set target button — prompt for a number (in 万元), persist to DB (in 元), re-render
    const setTargetBtn = document.getElementById('dash-set-target');
    if (setTargetBtn) setTargetBtn.onclick = () => {
      const cur = window.__dashKpiTarget || '';
      // Prompt in 万元, store in 元
      const v = prompt('设定本年度目标 (万元):', cur ? (cur / 10000).toString() : '');
      if (v === null) return;
      const numWan = parseFloat(String(v).replace(/,/g, ''));
      if (isNaN(numWan) || numWan < 0) {
        Notify.error('请输入有效的非负数字');
        return;
      }
      // Store in 元 internally
      const numYuan = numWan * 10000;
      window.__dashKpiTarget = numYuan;
      // Persist to DB
      if (typeof CRM !== 'undefined' && CRM.setKpiTarget) {
        CRM.setKpiTarget(numYuan);
      }
      renderDashboard();
      Notify.info('本年度目标已设为: ¥' + numWan.toLocaleString(undefined, {maximumFractionDigits: 1}) + ' 万');
    };
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
      const nav = `data-nav='list|${(f.stage || '').replace(/'/g, "\\'")}'`;
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

  // Build the overdue-opportunities table for the alert card
  function overdueHtml(opps) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = [];
    for (const o of opps) {
      if (o.deleted || o.parseError) continue;
      if (!o.expectedDate || isNaN(Number(o.expectedDate))) continue;
      const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
      if (isNaN(d.getTime()) || d >= today) continue;
      if (o.stage && (o.stage.indexOf('ST4') >= 0 || o.stage.indexOf('ST5') >= 0)) continue;
      const days = Math.floor((today - d) / (1000 * 60 * 60 * 24));
      overdue.push({ opp: o, days, amount: o.amountTaxIncluded || 0 });
    }
    overdue.sort((a, b) => b.amount - a.amount);
    if (!overdue.length) return '<p class="muted">（无逾期商机）</p>';
    const top = overdue.slice(0, 5);
    return `<table>
    <thead>
      <tr>
        <th>商机</th>
        <th>客户</th>
        <th>负责人</th>
        <th>预计落单</th>
        <th class="num">金额</th>
        <th>逾期</th>
      </tr>
    </thead>
    <tbody>
      ${top.map(x => `<tr data-nav='list|${(x.opp.stage || '').replace(/'/g, "\\'")}' style="cursor:pointer;">
        <td>${x.opp.oppName || ''}</td>
        <td>${x.opp.customer || ''}</td>
        <td>${x.opp.owner || ''}</td>
        <td>${new Date((Number(x.opp.expectedDate) - 25569) * 86400 * 1000).toISOString().slice(0, 10)}</td>
        <td class="num">¥${Math.round(x.amount).toLocaleString()}</td>
        <td><span class="tag tag-st5">${x.days} 天</span></td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p class="muted" style="margin-top:8px; font-size:11px;">点行跳转商机列表(按阶段筛选)。共 ${overdue.length} 条逾期商机。</p>`;
  }

  // Build the 本年 KPI grid (4 cards: count / amount / target / completion)
  function yearKpiHtml() {
    const thisYear = new Date().getFullYear();
    const thisYearOpps = CRM.state.opportunities.filter(o => {
      if (o.deleted || o.parseError) return false;
      if (!o.expectedDate || isNaN(Number(o.expectedDate))) return false;
      const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
      return d.getUTCFullYear() === thisYear;
    });
    const thisYearCount = thisYearOpps.length;
    const actual = computeYearAmount(CRM.state.opportunities, window.__dashKpiMetric);
    const target = window.__dashKpiTarget || 0;  // stored in 元
    const pct = target > 0 ? (actual / target * 100) : null;
    const pctClass = pct == null ? '' : pct >= 100 ? 'kpi-pct-good' : pct >= 70 ? 'kpi-pct-ok' : 'kpi-pct-low';
    // Display target in 万元 (divide by 10000)
    const targetDisplay = target > 0 ? '¥' + (target / 10000).toLocaleString(undefined, {maximumFractionDigits: 2}) + ' 万' : '未设定';
    return `
    <div class="year-kpi-grid">
      <div class="year-kpi-card">
        <div class="label">${thisYear} 年商机数</div>
        <div class="value">${thisYearCount}</div>
      </div>
      <div class="year-kpi-card">
        <div class="label">本年 ${window.__dashKpiMetric}</div>
        <div class="value">¥${(actual / 10000).toLocaleString(undefined, {maximumFractionDigits: 1})} 万</div>
      </div>
      <div class="year-kpi-card">
        <div class="label">本年度目标</div>
        <div class="value">${targetDisplay}</div>
      </div>
      <div class="year-kpi-card ${pctClass}">
        <div class="label">完成度</div>
        <div class="value">${pct != null ? pct.toFixed(1) + '%' : '—'}</div>
        ${target > 0 ? `<div class="kpi-progress-bar"><div class="kpi-progress-fill" style="width:${Math.min(100, pct)}%;"></div></div>` : ''}
      </div>
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
