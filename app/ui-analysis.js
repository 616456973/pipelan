// 多维分析 — 12 views. Shares filterState with list page.
(function (global) {
  'use strict';

  let currentView = 'funnel';

  const VIEWS = [
    { key: 'funnel', label: '1. 阶段漏斗' },
    { key: 'trend', label: '2. 趋势 + 同比环比' },
    { key: 'topn', label: '3. TOP N 排名' },
    { key: 'pareto', label: '4. 帕累托 80/20' },
    { key: 'conversion', label: '5. 阶段转化率' },
    { key: 'lose', label: '6. 丢单原因汇总' },
    { key: 'pivot', label: '7. 多维透视' },
    { key: 'st4st5', label: '8. ST4 vs ST5 对比' },
    { key: 'ownerPerf', label: '9. 销售代表业绩' },
    { key: 'overdue', label: '10. 逾期商机预警' },
    { key: 'customer', label: '11. 客户集中度' },
    { key: 'invoice', label: '12. 发票状态分布' }
  ];

  let pivotConfig = { xField: 'product', yMetric: 'amount' };

  const PIVOT_FIELDS = [
    { key: 'product', label: '产品' },
    { key: 'productLine', label: '业务线' },
    { key: 'team', label: '团队' },
    { key: 'owner', label: '负责人' },
    { key: 'customer', label: '客户' },
    { key: 'stage', label: '阶段' },
    { key: 'salesChannel', label: '销售渠道' },
    { key: 'invoiceStatus', label: '发票状态' }
  ];
  const PIVOT_METRICS = [
    { key: 'amount', label: '总金额' },
    { key: 'weighted', label: '加权金额' },
    { key: 'count', label: '数量' }
  ];

  function filteredOpps() {
    const fs = window.CRM_FILTERS || {};
    let opps = CRM.state.opportunities;
    if (fs.teams && fs.teams.length) opps = opps.filter(o => fs.teams.includes(o.team));
    if (fs.productLines && fs.productLines.length) opps = opps.filter(o => fs.productLines.includes(o.productLine));
    if (fs.products && fs.products.length) opps = opps.filter(o => fs.products.includes(o.product));
    if (fs.stages && fs.stages.length) opps = opps.filter(o => fs.stages.includes(o.stage));
    if (fs.currencies && fs.currencies.length) opps = opps.filter(o => fs.currencies.includes(o.currency));
    return opps.filter(o => !o.deleted && !o.parseError);
  }

  function renderAnalysis() {
    const content = document.getElementById('content');
    const nav = VIEWS.map(v => `<button class="tab ${v.key === currentView ? 'active' : ''}" data-view="${v.key}">${v.label}</button>`).join('');
    content.innerHTML = `<h2>多维分析</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;">${nav}</div>
      <div id="analysis-body"></div>`;
    content.querySelectorAll('[data-view]').forEach(btn => {
      btn.onclick = () => { currentView = btn.dataset.view; renderAnalysis(); };
    });
    const body = document.getElementById('analysis-body');
    const opps = filteredOpps();
    if (currentView === 'funnel') body.innerHTML = viewFunnel(opps);
    else if (currentView === 'trend') body.innerHTML = viewTrend(opps);
    else if (currentView === 'topn') body.innerHTML = viewTopN(opps);
    else if (currentView === 'pareto') body.innerHTML = viewPareto(opps);
    else if (currentView === 'conversion') body.innerHTML = viewConversion(opps);
    else if (currentView === 'lose') body.innerHTML = viewLose(opps);
    else if (currentView === 'pivot') {
      body.innerHTML = viewPivot(opps);
      const px = document.getElementById('pv-x');
      const py = document.getElementById('pv-y');
      if (px) px.onchange = (e) => { pivotConfig.xField = e.target.value; renderAnalysis(); };
      if (py) py.onchange = (e) => { pivotConfig.yMetric = e.target.value; renderAnalysis(); };
    }
    else if (currentView === 'st4st5') body.innerHTML = viewSt4St5(opps);
    else if (currentView === 'ownerPerf') body.innerHTML = viewOwnerPerf(opps);
    else if (currentView === 'overdue') body.innerHTML = viewOverdue(opps);
    else if (currentView === 'customer') body.innerHTML = viewCustomer(opps);
    else if (currentView === 'invoice') body.innerHTML = viewInvoice(opps);
  }

  function viewFunnel(opps) {
    const f = CRM.computeFunnel(opps);
    return `<div class="card"><h3>阶段漏斗 (${opps.length} 条数据)</h3>
      <div class="funnel">${f.map(s => `<div class="stage"><span class="name">${s.stage}</span><span class="meta">${s.count} 条 / ${s.amount.toLocaleString()} / 加权 ${s.weighted.toLocaleString()}</span></div>`).join('')}</div></div>`;
  }

  function viewTrend(opps) {
    const t = CRM.computeTrend(opps);
    if (!t.length) return '<div class="card"><p class="muted">无日期数据</p></div>';
    const max = Math.max(1, ...t.map(m => m.weighted));
    let yoy = '', mom = '';
    if (t.length >= 12) {
      const last = t[t.length - 1].weighted;
      const sameLastYear = t[t.length - 12].weighted;
      yoy = sameLastYear > 0 ? ((last - sameLastYear) / sameLastYear * 100).toFixed(1) : 'N/A';
    }
    if (t.length >= 2) {
      const last = t[t.length - 1].weighted;
      const prev = t[t.length - 2].weighted;
      mom = prev > 0 ? ((last - prev) / prev * 100).toFixed(1) : 'N/A';
    }
    return `<div class="card">
      <h3>月度趋势 (${t.length} 月)</h3>
      <p class="muted">MoM (环比): ${mom}% | YoY (同比): ${yoy}%</p>
      <div style="display:flex; align-items:flex-end; gap:4px; height:200px; border-bottom:1px solid #e3e8ef;">
        ${t.map(m => `<div style="flex:1; background:#2563eb; height:${(m.weighted / max) * 100}%; min-height:2px; position:relative;" title="${m.month}: ${m.weighted.toLocaleString()}"></div>`).join('')}
      </div>
      <div style="display:flex; gap:4px; font-size:10px; color:#7a8699;">
        ${t.map(m => `<div style="flex:1; text-align:center;">${m.month.slice(5)}</div>`).join('')}
      </div>
    </div>`;
  }

  function viewTopN(opps) {
    const t = CRM.computeTopN(opps, { groupBy: 'team', metric: 'amount', n: 10 });
    const max = Math.max(1, ...t.map(i => i.amount));
    return `<div class="card">
      <h3>TOP 10 团队 (按金额)</h3>
      ${t.length ? t.map(i => `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <div style="width:140px; font-size:12px; text-align:right;">${i.name}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:20px;">
          <div style="background:#2563eb; height:100%; width:${(i.amount / max) * 100}%; border-radius:4px;"></div>
        </div>
        <div style="width:100px; font-size:12px;">${i.amount.toLocaleString()}</div>
      </div>`).join('') : '<p class="muted">（无数据）</p>'}
    </div>`;
  }

  function viewPareto(opps) {
    const p = CRM.computePareto(opps, { groupBy: 'customer', metric: 'amount' });
    const max = Math.max(1, ...p.map(i => i.amount));
    const eightyIdx = p.findIndex(i => i.cumulativePct >= 80);
    return `<div class="card">
      <h3>帕累托 80/20 (按客户金额)</h3>
      <p class="muted">${eightyIdx >= 0 ? `前 ${eightyIdx + 1} 个客户贡献 80% 金额` : '数据不足'}</p>
      ${p.length ? `<table>
        <thead><tr><th>#</th><th>客户</th><th>金额</th><th>累计 %</th></tr></thead>
        <tbody>${p.map((i, idx) => `<tr${idx === eightyIdx ? ' style="background:#fef3c7;"' : ''}>
          <td>${idx + 1}</td><td>${i.name}</td><td>${i.amount.toLocaleString()}</td><td>${i.cumulativePct.toFixed(1)}%</td>
        </tr>`).join('')}</tbody>
      </table>` : '<p class="muted">（无数据）</p>'}
    </div>`;
  }

  function viewConversion(opps) {
    const c = CRM.computeStageConversion(opps);
    return `<div class="card">
      <h3>阶段转化率</h3>
      ${c.map((s, i) => `<div style="display:flex; align-items:center; gap:12px; margin:6px 0;">
        <div style="width:140px; font-size:13px;">${s.stage}</div>
        <div style="width:80px; font-size:13px;">${s.count} 条</div>
        <div style="font-size:13px; color:#4a5568;">${i === 0 ? '(起点)' : (s.conversion * 100).toFixed(1) + '%'}</div>
      </div>`).join('')}
    </div>`;
  }

  function viewLose(opps) {
    const r = CRM.computeLoseReasonAgg(opps);
    if (!r.length) return '<div class="card"><p class="muted">无 ST5 丢单记录</p></div>';
    const max = Math.max(1, ...r.map(i => i.count));
    return `<div class="card">
      <h3>丢单原因汇总</h3>
      ${r.map(i => `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
        <div style="width:140px; font-size:12px; text-align:right;">${i.reason}</div>
        <div style="flex:1; background:#e3e8ef; border-radius:4px; height:20px;">
          <div style="background:#ef4444; height:100%; width:${(i.count / max) * 100}%; border-radius:4px;"></div>
        </div>
        <div style="width:60px; font-size:12px;">${i.count}</div>
      </div>`).join('')}
    </div>`;
  }

  function viewPivot(opps) {
    const xField = pivotConfig.xField;
    const yMetric = pivotConfig.yMetric;
    const groups = {};
    for (const o of opps) {
      const k = o[xField] || '(未分类)';
      if (!groups[k]) groups[k] = { name: k, count: 0, amount: 0, weighted: 0 };
      groups[k].count++;
      groups[k].amount += (o.amountTaxIncluded || 0);
      groups[k].weighted += (o.amountTaxIncluded || 0) * (o.winRate || 0);
    }
    const arr = Object.values(groups).sort((a, b) => (b[yMetric] || 0) - (a[yMetric] || 0));
    const total = arr.reduce((s, i) => s + (i[yMetric] || 0), 0) || 1;
    const xSelect = PIVOT_FIELDS.map(f => `<option value="${f.key}" ${f.key === xField ? 'selected' : ''}>${f.label}</option>`).join('');
    const ySelect = PIVOT_METRICS.map(m => `<option value="${m.key}" ${m.key === yMetric ? 'selected' : ''}>${m.label}</option>`).join('');
    return `<div class="card">
    <h3>多维透视 (${opps.length} 条数据)</h3>
    <div class="filters" style="margin-bottom:14px;">
      <label>X 轴 <select id="pv-x">${xSelect}</select></label>
      <label>指标 <select id="pv-y">${ySelect}</select></label>
    </div>
    <table>
      <thead><tr><th>${PIVOT_FIELDS.find(f => f.key === xField).label}</th><th>数量</th><th>${PIVOT_METRICS.find(m => m.key === yMetric).label}</th><th>占比</th></tr></thead>
      <tbody>${arr.map(i => `<tr>
        <td>${i.name}</td>
        <td class="num">${i.count}</td>
        <td class="num">${(i[yMetric] || 0).toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td>${((i[yMetric] || 0) / total * 100).toFixed(1)}%</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
  }

  function viewSt4St5(opps) {
    const st4 = opps.filter(o => o.stage && o.stage.indexOf('ST4') >= 0);
    const st5 = opps.filter(o => o.stage && o.stage.indexOf('ST5') >= 0);
    const sum = arr => arr.reduce((s, o) => s + o.amount, 0);
    return `<div class="card">
      <h3>ST4 (赢单) vs ST5 (丢单) 对比</h3>
      <table>
        <thead><tr><th></th><th>ST4 赢单 (${st4.length} 条)</th><th>ST5 丢单 (${st5.length} 条)</th></tr></thead>
        <tbody>
          <tr><td>总金额</td><td>${sum(st4).toLocaleString()}</td><td>${sum(st5).toLocaleString()}</td></tr>
          <tr><td>平均金额</td><td>${st4.length ? (sum(st4) / st4.length).toFixed(0) : 0}</td><td>${st5.length ? (sum(st5) / st5.length).toFixed(0) : 0}</td></tr>
        </tbody>
      </table>
    </div>`;
  }

  function viewOwnerPerf(opps) {
    const groups = {};
    for (const o of opps) {
      const k = o.owner || '(未填)';
      if (!groups[k]) groups[k] = { name: k, count: 0, amount: 0, weighted: 0, winCount: 0, winRateSum: 0 };
      groups[k].count++;
      groups[k].amount += (o.amountTaxIncluded || 0);
      groups[k].weighted += (o.amountTaxIncluded || 0) * (o.winRate || 0);
      groups[k].winRateSum += (o.winRate || 0);
      if (o.stage && o.stage.indexOf('ST4') >= 0) groups[k].winCount++;
    }
    const arr = Object.values(groups).map(g => ({
      ...g,
      avgWinRate: g.count ? g.winRateSum / g.count : 0
    })).sort((a, b) => b.weighted - a.weighted);
    return `<div class="card">
    <h3>销售代表业绩表 (${opps.length} 条数据, ${arr.length} 人)</h3>
    ${arr.length ? `<table>
      <thead><tr><th>负责人</th><th>商机数</th><th class="num">总金额</th><th class="num">加权金额</th><th>赢单数</th><th>平均赢率</th></tr></thead>
      <tbody>${arr.map(i => `<tr>
        <td>${i.name}</td>
        <td>${i.count}</td>
        <td class="num">${i.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td class="num">${i.weighted.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td>${i.winCount}</td>
        <td>${(i.avgWinRate * 100).toFixed(1)}%</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">（无数据）</p>'}
  </div>`;
  }

  function viewOverdue(opps) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = [];
    for (const o of opps) {
      if (o.deleted || o.parseError) continue;
      if (!o.expectedDate || isNaN(Number(o.expectedDate))) continue;
      const d = new Date((Number(o.expectedDate) - 25569) * 86400 * 1000);
      if (isNaN(d.getTime())) continue;
      if (d >= today) continue;
      if (o.stage && (o.stage.indexOf('ST4') >= 0 || o.stage.indexOf('ST5') >= 0)) continue;
      const days = Math.floor((today - d) / (1000 * 60 * 60 * 24));
      overdue.push({ opp: o, days, amount: o.amountRmbEquivalent || o.amountTaxIncluded || 0 });
    }
    overdue.sort((a, b) => b.amount - a.amount);
    return `<div class="card">
    <h3>逾期商机预警 (${overdue.length} 条,共逾期未成交)</h3>
    ${overdue.length ? `<table>
      <thead><tr><th>#</th><th>商机</th><th>客户</th><th>负责人</th><th>阶段</th><th>预计落单</th><th class="num">金额</th><th>逾期</th></tr></thead>
      <tbody>${overdue.map((x, i) => `<tr>
        <td>${i + 1}</td>
        <td>${x.opp.oppName || ''}</td>
        <td>${x.opp.customer || ''}</td>
        <td>${x.opp.owner || ''}</td>
        <td>${x.opp.stage || ''}</td>
        <td>${new Date((Number(x.opp.expectedDate) - 25569) * 86400 * 1000).toISOString().slice(0, 10)}</td>
        <td class="num">¥${Math.round(x.amount).toLocaleString()}</td>
        <td><span class="tag tag-st5">${x.days} 天</span></td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">（无逾期商机）</p>'}
  </div>`;
  }

  function viewCustomer(opps) {
    const groups = {};
    for (const o of opps) {
      const k = o.customer || '(未填)';
      if (!groups[k]) groups[k] = { name: k, count: 0, amount: 0, weighted: 0, lastDate: 0 };
      groups[k].count++;
      groups[k].amount += (o.amountTaxIncluded || 0);
      groups[k].weighted += (o.amountTaxIncluded || 0) * (o.winRate || 0);
      if (o.expectedDate && Number(o.expectedDate) > groups[k].lastDate) {
        groups[k].lastDate = Number(o.expectedDate);
      }
    }
    const arr = Object.values(groups).map(g => ({
      ...g,
      lastDateStr: g.lastDate ? new Date((g.lastDate - 25569) * 86400 * 1000).toISOString().slice(0, 10) : '-'
    })).sort((a, b) => b.amount - a.amount);
    return `<div class="card">
    <h3>客户集中度 (${opps.length} 条数据, ${arr.length} 客户)</h3>
    ${arr.length ? `<table>
      <thead><tr><th>#</th><th>客户</th><th>商机数</th><th class="num">总金额</th><th class="num">加权金额</th><th>最近商机时间</th></tr></thead>
      <tbody>${arr.map((i, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${i.name}</td>
        <td>${i.count}</td>
        <td class="num">${i.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td class="num">${i.weighted.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
        <td>${i.lastDateStr}</td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="muted">（无数据）</p>'}
  </div>`;
  }

  function viewInvoice(opps) {
    const BUILTIN_INVOICE_STATUSES = ['未开发票', '已开票', '合同中', '已回款', '已预付'];
    const groups = {};
    for (const s of BUILTIN_INVOICE_STATUSES) groups[s] = { name: s, count: 0, amount: 0 };
    for (const o of opps) {
      const s = o.invoiceStatus || '(未填)';
      if (!groups[s]) groups[s] = { name: s, count: 0, amount: 0 };
      groups[s].count++;
      groups[s].amount += (o.amountTaxIncluded || 0);
    }
    const arr = Object.values(groups).filter(g => g.count > 0).sort((a, b) => b.amount - a.amount);
    const max = Math.max(1, ...arr.map(i => i.amount));
    return `<div class="card">
    <h3>发票状态分布 (${opps.length} 条数据)</h3>
    ${arr.length ? arr.map(i => `<div style="display:flex; align-items:center; gap:8px; margin:4px 0;">
      <div style="width:100px; font-size:12px; text-align:right;">${i.name}</div>
      <div style="flex:1; background:var(--border); border-radius:4px; height:20px;">
        <div style="background:linear-gradient(90deg,var(--primary),var(--accent)); height:100%; width:${(i.amount / max) * 100}%; border-radius:4px;"></div>
      </div>
      <div style="width:80px; font-size:12px;">${i.count} 条</div>
      <div style="width:120px; font-size:12px;" class="num">${i.amount.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
    </div>`).join('') : '<p class="muted">（无数据）</p>'}
  </div>`;
  }

  global.renderAnalysis = renderAnalysis;
})(window);
