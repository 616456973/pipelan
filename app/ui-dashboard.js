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
  // Initialize business line metric if not set
  if (typeof window.__dashBizLineMetric === 'undefined') {
    window.__dashBizLineMetric = '加权金额';
  }

  // Initialize KPI metric if not set
  if (typeof window.__dashKpiMetric === 'undefined') {
    window.__dashKpiMetric = '已开票金额';  // default metric
  }
  // (KPI target is now read live from CRM.getKpiTarget() in yearKpiHtml and the setTarget handler — no caching)

  // Initialize trend chart X-axis (dimension) and metric
  if (typeof window.__dashTrendX === 'undefined') window.__dashTrendX = 'month';
  if (typeof window.__dashTrendMetric === 'undefined') window.__dashTrendMetric = '加权金额';
  // Initialize TOP 10 owner / TOP 5 team metric selectors
  if (typeof window.__dashTopOwnerMetric === 'undefined') window.__dashTopOwnerMetric = '加权金额';
  if (typeof window.__dashTopTeamMetric === 'undefined') window.__dashTopTeamMetric = '加权金额';

  const TREND_AXES = [
    { key: 'month', label: '月' },
    { key: 'team', label: '团队' },
    { key: 'owner', label: '负责人' },
    { key: 'customer', label: '客户' },
    { key: 'product', label: '产品' }
  ];
  const TREND_METRICS = [
    { key: '加权金额', label: '加权金额' },
    { key: '含税金额', label: '含税金额' },
    { key: 'ST4 赢单金额', label: 'ST4 赢单' },
    { key: '已开票金额', label: '已开票' },
    { key: '已回款金额', label: '已回款' }
  ];
  const TOP_METRICS = [
    { key: '加权金额', label: '加权金额' },
    { key: '含税金额', label: '含税金额' },
    { key: 'ST4 赢单金额', label: 'ST4 赢单' },
    { key: '已开票金额', label: '已开票' },
    { key: '已回款金额', label: '已回款' }
  ];

  // Stage change handler — re-renders the dashboard
  window.__dashStageChange = function(newStage) {
    if (newStage === '__ALL__') {
      window.__dashSelectedStage = '__ALL__';
    } else {
      window.__dashSelectedStage = newStage;
    }
    renderDashboard();
    Notify.info('已切换到: ' + (newStage === '__ALL__' ? '全部' : newStage));
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
        <div class="label">阶段商机数:${helpIcon('下拉切换阶段,实时显示该阶段的商机数;选"全部"显示商机总数')}<select id="dash-stage-select" class="kpi-stage-select" onchange="window.__dashStageChange(this.value)">
          <option value="__ALL__" ${(window.__dashSelectedStage === '__ALL__' || !window.__dashSelectedStage) ? 'selected' : ''}>全部</option>
          ${(CRM.state.dicts.stages || []).map(s => `<option value="${s}" ${s === window.__dashSelectedStage ? 'selected' : ''}>${s}</option>`).join('')}
        </select></div>
        <div class="value" id="dash-stage-count">${
          window.__dashSelectedStage === '__ALL__'
            ? CRM.state.opportunities.filter(o => !o.deleted && !o.parseError).length
            : countByStage(window.__dashSelectedStage || 'ST4:赢单(Win)')
        }</div>
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
            ${TOP_METRICS.map(m =>
              `<option value="${m.key}" ${m.key === window.__dashKpiMetric ? 'selected' : ''}>${m.label}</option>`
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
          <h3>月度业绩趋势${helpIcon('按选定维度(月/团队/负责人/客户)聚合,展示选定指标走势。点击栏可下钻')}</h3>
          <div style="display:flex; gap:6px; align-items:center;">
            <select id="trend-x" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 8px; cursor:pointer; font-size:11px;">
              ${TREND_AXES.map(a => `<option value="${a.key}" ${a.key === window.__dashTrendX ? 'selected' : ''}>${a.label}</option>`).join('')}
            </select>
            <select id="trend-metric" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 8px; cursor:pointer; font-size:11px;">
              ${TREND_METRICS.map(m => `<option value="${m.key}" ${m.key === window.__dashTrendMetric ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </div>
        </div>
        ${trendHtml(CRM.state.opportunities)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>业务线金额占比${helpIcon('按选定指标排名的业务线,看哪条产品线贡献最大')}</h3>
          <select id="top-bizline-metric" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 8px; cursor:pointer; font-size:11px;">
            ${TOP_METRICS.map(m => `<option value="${m.key}" ${m.key === window.__dashBizLineMetric ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
        </div>
        ${topBarHtmlByMetric(CRM.state.opportunities, 'productLine', window.__dashBizLineMetric, 6)}
      </div>
      <div class="card">
        <div class="card-header">
          <h3>销售代表业绩 (TOP 10)${helpIcon('按选定指标排名的前 10 位负责人')}</h3>
          <select id="top-owner-metric" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 8px; cursor:pointer; font-size:11px;">
            ${TOP_METRICS.map(m => `<option value="${m.key}" ${m.key === window.__dashTopOwnerMetric ? 'selected' : ''}>${m.label}</option>`).join('')}
          </select>
        </div>
        ${topBarHtmlByMetric(CRM.state.opportunities, 'owner', window.__dashTopOwnerMetric, 10)}
      </div>
    </div>

    <!-- Bottom: TOP 5 teams full width -->
    <div class="card dash-bottom">
      <div class="card-header">
        <h3>团队业绩 TOP 5${helpIcon('按选定指标排名的前 5 个销售团队')}</h3>
        <select id="top-team-metric" class="card-tag" style="border:1px solid var(--border); background:#fff; padding:3px 8px; cursor:pointer; font-size:11px;">
          ${TOP_METRICS.map(m => `<option value="${m.key}" ${m.key === window.__dashTopTeamMetric ? 'selected' : ''}>${m.label}</option>`).join('')}
        </select>
      </div>
      ${topBarHtmlByMetric(CRM.state.opportunities, 'team', window.__dashTopTeamMetric, 5)}
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

    // Trend chart X-axis (dimension) change — re-render whole dashboard
    const trendXEl = document.getElementById('trend-x');
    if (trendXEl) trendXEl.onchange = (e) => { window.__dashTrendX = e.target.value; renderDashboard(); };
    // Trend chart metric change — re-render whole dashboard
    const trendMetricEl = document.getElementById('trend-metric');
    if (trendMetricEl) trendMetricEl.onchange = (e) => { window.__dashTrendMetric = e.target.value; renderDashboard(); };
    // TOP 10 owner metric change — re-render whole dashboard
    const topOwnerMetricEl = document.getElementById('top-owner-metric');
    if (topOwnerMetricEl) topOwnerMetricEl.onchange = (e) => { window.__dashTopOwnerMetric = e.target.value; renderDashboard(); };
    // 业务线 metric change — re-render whole dashboard
    const topBizLineMetricEl = document.getElementById('top-bizline-metric');
    if (topBizLineMetricEl) topBizLineMetricEl.onchange = (e) => { window.__dashBizLineMetric = e.target.value; renderDashboard(); };
    // TOP 5 team metric change — re-render whole dashboard
    const topTeamMetricEl = document.getElementById('top-team-metric');
    if (topTeamMetricEl) topTeamMetricEl.onchange = (e) => { window.__dashTopTeamMetric = e.target.value; renderDashboard(); };

    // Set target button — prompt for a number (in 万元), persist to DB (in 元), re-render
    const setTargetBtn = document.getElementById('dash-set-target');
    if (setTargetBtn) setTargetBtn.onclick = () => {
      const cur = (typeof CRM !== 'undefined' && CRM.getKpiTarget) ? CRM.getKpiTarget() : 0;
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

  // Compute a "time bucket" key for an opp based on trend axis
  function trendBucketKey(o, axis) {
    if (axis === 'month') {
      if (!o.expectedDate || isNaN(Number(o.expectedDate))) return null;
      const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
      if (isNaN(d.getTime())) return null;
      return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
    }
    // team / owner / customer / product / productLine
    return o[axis] || '(未分类)';
  }

  // Get the metric value for an opp based on metric name
  function trendMetricValue(o, metric) {
    const amt = o.amountTaxIncluded || 0;
    switch (metric) {
      case '含税金额': return amt;
      case '加权金额': return amt * (o.winRate || 0);
      case 'ST4 赢单金额':
        return (o.stage && o.stage.indexOf('ST4') >= 0) ? amt : 0;
      case '已开票金额':
        return (o.invoiceStatus === '已开票' || o.invoiceStatus === '已回款') ? amt : 0;
      case '已回款金额':
        return (o.invoiceStatus === '已回款') ? amt : 0;
      default: return amt;
    }
  }

  // Aggregate opps into trend buckets
  function aggregateTrend(opps, axis, metric) {
    const buckets = {};
    for (const o of opps) {
      if (o.deleted || o.parseError) continue;
      const key = trendBucketKey(o, axis);
      if (!key) continue;
      if (!buckets[key]) buckets[key] = { name: key, count: 0, value: 0 };
      buckets[key].count++;
      buckets[key].value += trendMetricValue(o, metric);
    }
    const arr = Object.values(buckets);
    // Sort: month → ascending, otherwise descending by value
    if (axis === 'month') {
      arr.sort((a, b) => a.name < b.name ? -1 : 1);
    } else {
      arr.sort((a, b) => b.value - a.value);
    }
    return arr;
  }

  function trendHtml(opps) {
    const axis = window.__dashTrendX;
    const metric = window.__dashTrendMetric;
    const buckets = aggregateTrend(opps, axis, metric);
    if (!buckets.length) return '<p class="muted">无数据</p>';
    const max = Math.max(1, ...buckets.map(b => b.value));
    if (axis === 'month') {
      // Vertical bars
      const currentYM = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
      return `
        <div style="display:flex; align-items:flex-end; gap:4px; height:160px; border-bottom:1px solid var(--border);">
          ${buckets.map(b => {
            const isPast = b.name < currentYM;
            const isCurrent = b.name === currentYM;
            const bg = isCurrent
              ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
              : isPast
                ? 'linear-gradient(180deg, #cbd5e0, #e2e8f0)'
                : 'linear-gradient(180deg, var(--primary), var(--accent))';
            const heightPct = Math.max(2, (b.value / max) * 100);
            return `<div class="trend-bar ${isCurrent ? 'trend-current' : ''} ${isPast ? 'trend-past' : ''}" style="flex:1; background:${bg}; height:${heightPct}%; min-height:2px; position:relative;" title="${b.name}: ¥${Math.round(b.value).toLocaleString()} (${b.count}条)${isCurrent ? ' (当前月)' : ''}${isPast ? ' (已过去)' : ''}"></div>`;
          }).join('')}
        </div>
        <div style="display:flex; gap:4px; font-size:10px; color:var(--muted); margin-top:6px;">
          ${buckets.map(b => {
            const isCurrent = b.name === currentYM;
            return `<div style="flex:1; text-align:center; ${isCurrent ? 'color:var(--primary); font-weight:600;' : ''}">${b.name.slice(5)}${isCurrent ? ' ●' : ''}</div>`;
          }).join('')}
        </div>
        <div style="margin-top:10px; font-size:12px; color:var(--text-2); display:flex; justify-content:space-between;">
          <span>合计 ¥${(buckets.reduce((s,b)=>s+b.value,0)/10000).toLocaleString(undefined,{maximumFractionDigits:1})} 万</span>
          <span>${buckets.length} 个月</span>
        </div>
      `;
    } else {
      // Horizontal bars (group mode)
      const axisDef = TREND_AXES.find(a => a.key === axis) || { label: axis };
      return `
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${buckets.slice(0, 10).map(b => `
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:120px; font-size:12px; text-align:right; color:var(--text-2); flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${b.name}">${b.name}</div>
              <div style="flex:1; height:20px; background:var(--surface-2); border-radius:4px; overflow:hidden;">
                <div style="background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; width:${(b.value/max*100)}%; border-radius:4px;"></div>
              </div>
              <div style="width:100px; font-size:12px; text-align:right; font-variant-numeric:tabular-nums; flex-shrink:0;">¥${(b.value/10000).toLocaleString(undefined,{maximumFractionDigits:1})} 万</div>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:10px; font-size:12px; color:var(--text-2); display:flex; justify-content:space-between;">
          <span>合计 ¥${(buckets.reduce((s,b)=>s+b.value,0)/10000).toLocaleString(undefined,{maximumFractionDigits:1})} 万</span>
          <span>${buckets.length} 个${axisDef.label}</span>
        </div>
      `;
    }
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

  // Build the 本年 KPI grid (4 cards: total count / amount / target / completion)
  function yearKpiHtml() {
    // Total non-deleted opps (matches the list view's "商机数" header)
    const totalCount = CRM.state.opportunities.filter(o => !o.deleted && !o.parseError).length;
    const actual = computeYearAmount(CRM.state.opportunities, window.__dashKpiMetric);
    const currentYear = new Date().getFullYear();
    const target = (typeof CRM !== 'undefined' && CRM.getKpiTarget) ? CRM.getKpiTarget() : 0;  // stored in 元
    const pct = target > 0 ? (actual / target * 100) : null;
    const pctClass = pct == null ? '' : pct >= 100 ? 'kpi-pct-good' : pct >= 70 ? 'kpi-pct-ok' : 'kpi-pct-low';
    // Display target in 万元 (divide by 10000)
    const targetDisplay = target > 0 ? '¥' + (target / 10000).toLocaleString(undefined, {maximumFractionDigits: 2}) + ' 万' : '未设定';
    return `
    <div class="year-kpi-grid">
      <div class="year-kpi-card">
        <div class="label">总商机数</div>
        <div class="value">${totalCount}</div>
        <div class="year-kpi-sub">非删除, 跟列表一致</div>
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

  // Aggregate opps by groupBy field and render TOP-N bar list, ranking by the chosen metric
  function topBarHtmlByMetric(opps, groupBy, metric, n) {
    const groups = {};
    for (const o of opps) {
      if (o.deleted || o.parseError) continue;
      const k = o[groupBy] || '(未填)';
      if (!groups[k]) {
        groups[k] = {
          name: k, count: 0,
          amount: 0,
          weighted: 0,
          '含税金额': 0,
          '加权金额': 0,
          'ST4 赢单金额': 0,
          '已开票金额': 0,
          '已回款金额': 0
        };
      }
      const amt = o.amountTaxIncluded || 0;
      groups[k].count++;
      groups[k].amount += amt;
      groups[k].weighted += amt * (o.winRate || 0);
      groups[k]['含税金额'] += amt;
      groups[k]['加权金额'] += amt * (o.winRate || 0);
      if (o.stage && o.stage.indexOf('ST4') >= 0) groups[k]['ST4 赢单金额'] += amt;
      if (o.invoiceStatus === '已开票' || o.invoiceStatus === '已回款') groups[k]['已开票金额'] += amt;
      if (o.invoiceStatus === '已回款') groups[k]['已回款金额'] += amt;
    }
    const arr = Object.values(groups).sort((a, b) => (b[metric] || 0) - (a[metric] || 0)).slice(0, n);
    if (!arr.length) return '<p class="muted">（无数据）</p>';
    const max = Math.max(1, ...arr.map(i => i[metric] || 0));
    return arr.map((i, idx) => {
      const v = i[metric] || 0;
      const w = (v / max) * 100;
      const nav = groupBy ? `data-nav='list|${groupBy}|${(i.name || '').replace(/'/g, "\\'")}'` : '';
      return `<div ${nav} style="display:flex; align-items:center; gap:8px; margin:4px 0; padding:4px; border-radius:4px; cursor:pointer;" onmouseover="this.style.background='var(--surface-2)'" onmouseout="this.style.background='transparent'" title="点击筛选 ${groupBy || ''} = ${i.name} 的商机">
        <div style="width:32px; font-size:11px; color:var(--muted); text-align:right;">${idx + 1}</div>
        <div style="width:120px; font-size:12px; text-align:right; color:var(--text-2); flex-shrink:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${i.name}">${i.name}</div>
        <div style="flex:1; background:var(--surface-2); border-radius:4px; height:18px; overflow:hidden;">
          <div style="background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; width:${w}%; border-radius:4px;"></div>
        </div>
        <div style="width:100px; font-size:12px; text-align:right; font-variant-numeric:tabular-nums; flex-shrink:0;">¥${(v/10000).toLocaleString(undefined,{maximumFractionDigits:1})} 万</div>
      </div>`;
    }).join('');
  }

  global.renderDashboard = renderDashboard;
})(window);
