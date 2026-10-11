/**
 * app.js - Executive U.S. Treasury Sovereign Debt Terminal
 * Live Fiscal Data API Client & Institutional Telemetry Engine
 */

(function () {
  'use strict';

  // Signature Tenor Palette (High-contrast Institutional tones for white background)
  const TENOR_COLORS = {
    '2-Year': '#059669',  // Emerald Note
    '5-Year': '#0284c7',  // Sky Blue
    '10-Year': '#2563eb', // Benchmark Royal Blue
    '20-Year': '#7c3aed', // Violet
    '30-Year': '#d97706'  // Amber Bronze Long Bond
  };

  const TENOR_ORDER = ['2-Year', '5-Year', '10-Year', '20-Year', '30-Year'];

  // Global Terminal State
  const state = {
    rawAuctions: [],
    filteredAuctions: [],
    upcomingAuctions: [],
    activeTenors: new Set(['2Y', '5Y', '10Y', '20Y', '30Y']),
    filters: {
      period: '1Y',
      reopen: 'ALL',
      search: '',
      yieldMetric: 'high_yield'
    },
    pagination: {
      page: 1,
      pageSize: 15
    },
    sort: {
      field: 'issue_date',
      asc: false
    },
    selectedAuction: null,
    charts: {
      yield: null,
      curve: null,
      allotment: null,
      btc: null
    }
  };

  // Safe Num Parsing
  const numOrZero = (val) => {
    if (val === null || val === undefined || val === '' || val === 'null') return 0;
    const n = parseFloat(String(val).replace(/,/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const formatCurrencyBillions = (val) => {
    const num = numOrZero(val);
    const billions = num / 1000000000;
    return `$${billions.toFixed(2)} B`;
  };

  const formatPct = (val, decimals = 3) => {
    const num = numOrZero(val);
    return `${num.toFixed(decimals)}%`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  };

  function getStandardTenor(item) {
    const term = item.original_security_term || item.security_term || '';
    if (term.startsWith('2-Year')) return '2-Year';
    if (term.startsWith('5-Year')) return '5-Year';
    if (term.startsWith('10-Year')) return '10-Year';
    if (term.startsWith('20-Year')) return '20-Year';
    if (term.startsWith('30-Year')) return '30-Year';
    return term;
  }

  function getTenorCode(item) {
    const term = getStandardTenor(item);
    if (term.startsWith('2-Year')) return '2Y';
    if (term.startsWith('5-Year')) return '5Y';
    if (term.startsWith('10-Year')) return '10Y';
    if (term.startsWith('20-Year')) return '20Y';
    if (term.startsWith('30-Year')) return '30Y';
    return '';
  }

  function calculateTailBps(item) {
    const high = numOrZero(item.high_yield);
    const avg = numOrZero(item.avg_med_yield);
    if (high > 0 && avg > 0) {
      return (high - avg) * 100;
    }
    return 0;
  }

  // =========================================================================
  // LIVE CLOCKS & TICKER MARQUEE
  // =========================================================================

  function startClocks() {
    function update() {
      const now = new Date();
      // UTC Clock
      const utcStr = now.toISOString().substring(11, 19) + ' UTC';
      const elUTC = document.getElementById('clockUTC');
      if (elUTC) elUTC.textContent = utcStr;

      // New York ET Clock
      const etFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      const elET = document.getElementById('clockET');
      if (elET) elET.textContent = etFormatter.format(now) + ' ET';
    }
    update();
    setInterval(update, 1000);
  }

  // =========================================================================
  // DATA FETCHING (DIRECT FISCAL DATA REST API)
  // =========================================================================

  async function fetchAuctionsData() {
    const statusTag = document.getElementById('statusLiveTag');
    statusTag.textContent = 'SYNCING LIVE DATA...';

    const directUrl = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?page[size]=1000&filter=original_security_term:in:(2-Year,5-Year,10-Year,20-Year,30-Year)&sort=-issue_date';
    const proxyUrl = '/api/treasury/auctions?page[size]=1000&filter=original_security_term:in:(2-Year,5-Year,10-Year,20-Year,30-Year)&sort=-issue_date';

    let data = null;
    let latency = 0;

    try {
      const t0 = performance.now();
      const res = await fetch(directUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      data = json.data;
      latency = Math.round(performance.now() - t0);
      statusTag.textContent = `LIVE REST // ${latency}ms`;
      statusTag.style.borderColor = 'rgba(0, 245, 155, 0.4)';
      statusTag.style.color = '#00f59b';
    } catch (err) {
      console.warn('Direct fetch error, attempting live server proxy:', err.message);
      try {
        const t0 = performance.now();
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        data = json.data;
        latency = Math.round(performance.now() - t0);
        statusTag.textContent = `LIVE PROXY // ${latency}ms`;
        statusTag.style.borderColor = 'rgba(0, 245, 155, 0.4)';
        statusTag.style.color = '#00f59b';
      } catch (e2) {
        console.error('Failed to fetch live auctions data:', e2.message);
        statusTag.textContent = 'LIVE FEED ERROR';
        statusTag.style.borderColor = 'rgba(255, 51, 102, 0.5)';
        statusTag.style.color = '#ff3366';
      }
    }

    if (data && Array.isArray(data)) {
      state.rawAuctions = data.filter(item => {
        const term = item.original_security_term || '';
        return ['2-Year', '5-Year', '10-Year', '20-Year', '30-Year'].includes(term);
      });
      applyFilters();
    }
  }

  async function fetchUpcomingAuctions() {
    const directUrl = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions?page[size]=100&sort=-record_date';
    const proxyUrl = '/api/treasury/upcoming?page[size]=100&sort=-record_date';

    let data = null;
    try {
      const res = await fetch(directUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      data = json.data;
    } catch (err) {
      console.warn('Direct upcoming fetch error, trying live proxy:', err.message);
      try {
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        data = json.data;
      } catch (e) {
        console.error('Failed to fetch live upcoming auctions:', e.message);
      }
    }

    if (data && Array.isArray(data)) {
      state.upcomingAuctions = data;
      renderUpcomingBoard();
    }
  }

  // =========================================================================
  // FILTERING & AGGREGATION
  // =========================================================================

  function applyFilters() {
    const { period, reopen, search } = state.filters;
    let list = [...state.rawAuctions];

    // Tenor selection (multi-select from left rail)
    if (state.activeTenors.size > 0 && state.activeTenors.size < 5) {
      list = list.filter(item => {
        const code = getTenorCode(item);
        return state.activeTenors.has(code);
      });
    }

    // Reopening filter
    if (reopen === 'NEW') {
      list = list.filter(item => (item.reopening || '').toLowerCase() === 'no');
    } else if (reopen === 'REOPEN') {
      list = list.filter(item => (item.reopening || '').toLowerCase() === 'yes');
    }

    // Time Horizon
    if (period !== 'ALL') {
      const now = new Date();
      let monthsBack = 12;
      if (period === '6M') monthsBack = 6;
      if (period === '1Y') monthsBack = 12;
      if (period === '3Y') monthsBack = 36;
      if (period === '5Y') monthsBack = 60;

      const cutoff = new Date();
      cutoff.setMonth(now.getMonth() - monthsBack);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      list = list.filter(item => (item.issue_date || item.record_date || '') >= cutoffStr);
    }

    // Search query
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      list = list.filter(item => {
        return (
          (item.cusip || '').toLowerCase().includes(q) ||
          (item.issue_date || '').toLowerCase().includes(q) ||
          (item.auction_date || '').toLowerCase().includes(q) ||
          (item.original_security_term || '').toLowerCase().includes(q) ||
          String(item.high_yield || '').includes(q)
        );
      });
    }

    // Sort
    const { field, asc } = state.sort;
    list.sort((a, b) => {
      let valA = a[field];
      let valB = b[field];

      if (['high_yield', 'int_rate', 'bid_to_cover_ratio', 'total_accepted', 'offering_amt'].includes(field)) {
        valA = numOrZero(valA);
        valB = numOrZero(valB);
      } else {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      }

      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });

    state.filteredAuctions = list;
    state.pagination.page = 1;

    updateMacroTelemetry();
    renderAllCharts();
    renderTableLedger();

    // Select the first item by default for telemetry deck if none selected
    if (list.length > 0) {
      selectAuction(list[0]);
    }
  }

  // =========================================================================
  // TELEMETRY & KPI ENGINE
  // =========================================================================

  function updateMacroTelemetry() {
    const all = state.rawAuctions;
    const filtered = state.filteredAuctions;

    // 1. Tenors in Left Rail & Ticker Marquee
    TENOR_ORDER.forEach(tenor => {
      const latest = all
        .filter(i => (i.original_security_term || '').startsWith(tenor) && numOrZero(i.high_yield) > 0)
        .sort((a, b) => b.issue_date.localeCompare(a.issue_date))[0];

      const code = tenor.replace('-Year', '');
      const railYield = document.getElementById(`rail${code}Yield`);
      const railDate = document.getElementById(`rail${code}Date`);
      const tick = document.getElementById(`tick${code}Y`);
      const matrixYield = document.getElementById(`mYield${code}Y`);
      const matrixDate = document.getElementById(`mDate${code}Y`);

      if (latest) {
        const yStr = formatPct(latest.high_yield, 3);
        const dStr = formatDate(latest.issue_date);

        if (railYield) railYield.textContent = yStr;
        if (railDate) railDate.textContent = dStr;
        if (tick) tick.textContent = yStr;
        if (matrixYield) matrixYield.textContent = yStr;
        if (matrixDate) matrixDate.textContent = dStr;
      }
    });

    // 2. 10Y Benchmark Details
    const tenors10Y = all
      .filter(i => (i.original_security_term || '').startsWith('10-Year') && numOrZero(i.high_yield) > 0)
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

    if (tenors10Y.length > 0) {
      const latest10 = tenors10Y[0];
      const prev10 = tenors10Y[1];
      const y10 = numOrZero(latest10.high_yield);

      document.getElementById('kpi10YieldVal').textContent = formatPct(y10, 3);
      document.getElementById('kpi10AuctionDate').textContent = `Settled: ${formatDate(latest10.issue_date)}`;
      document.getElementById('kpi10Coupon').textContent = `Coupon: ${formatPct(latest10.int_rate, 3)}`;

      if (prev10) {
        const delta = (y10 - numOrZero(prev10.high_yield)) * 100;
        const sign = delta > 0 ? '+' : '';
        const tag = document.getElementById('kpi10DeltaTag');
        tag.textContent = `${sign}${delta.toFixed(1)} bps vs prior`;
        tag.style.color = delta > 0 ? 'var(--neon-coral)' : 'var(--neon-emerald)';
      }
    }

    // 3. 2s10s Curve Slope
    const tenors2Y = all
      .filter(i => (i.original_security_term || '').startsWith('2-Year') && numOrZero(i.high_yield) > 0)
      .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

    if (tenors10Y.length > 0 && tenors2Y.length > 0) {
      const y10 = numOrZero(tenors10Y[0].high_yield);
      const y2 = numOrZero(tenors2Y[0].high_yield);
      const spreadBps = (y10 - y2) * 100;

      const spreadEl = document.getElementById('rail2s10sVal');
      const slopeTag = document.getElementById('curveSlopeTag');
      const tickSpread = document.getElementById('tickSpread');

      const sStr = `${spreadBps > 0 ? '+' : ''}${spreadBps.toFixed(1)} bps`;
      spreadEl.textContent = sStr;
      if (tickSpread) tickSpread.textContent = sStr;

      if (spreadBps < 0) {
        slopeTag.textContent = 'INVERTED';
        slopeTag.className = 'spread-status-tag status-inverted';
        spreadEl.style.color = 'var(--neon-coral)';
      } else {
        slopeTag.textContent = 'STEEPENING';
        slopeTag.className = 'spread-status-tag status-steep';
        spreadEl.style.color = 'var(--neon-emerald)';
      }
    }

    // 4. Bid-to-Cover and Demand Index
    const btcItems = filtered.filter(i => numOrZero(i.bid_to_cover_ratio) > 0);
    if (btcItems.length > 0) {
      const avgBtc = btcItems.reduce((acc, curr) => acc + numOrZero(curr.bid_to_cover_ratio), 0) / btcItems.length;
      document.getElementById('kpiBtcMainVal').textContent = `${avgBtc.toFixed(2)}x`;
      document.getElementById('railBtcAvg').textContent = `${avgBtc.toFixed(2)}x`;

      const btcStatus = document.getElementById('kpiBtcStatus');
      const railRating = document.getElementById('railBtcRating');

      if (avgBtc >= 2.6) {
        btcStatus.textContent = 'STRONG DEMAND';
        btcStatus.style.color = 'var(--neon-emerald)';
        railRating.textContent = 'HIGH APPETITE';
        railRating.style.color = 'var(--neon-emerald)';
      } else if (avgBtc >= 2.35) {
        btcStatus.textContent = 'HEALTHY NORM';
        btcStatus.style.color = 'var(--neon-cyan)';
        railRating.textContent = 'HEALTHY';
        railRating.style.color = 'var(--neon-cyan)';
      } else {
        btcStatus.textContent = 'SOFT / CONCESSION';
        btcStatus.style.color = 'var(--neon-coral)';
        railRating.textContent = 'SOFT DEMAND';
        railRating.style.color = 'var(--neon-coral)';
      }
    }

    // 5. Allotment Totals & Volumes
    let totalAcc = 0;
    let totalInd = 0;
    let totalDlr = 0;
    let totalTend = 0;

    filtered.forEach(i => {
      const acc = numOrZero(i.total_accepted);
      totalAcc += acc;
      totalInd += numOrZero(i.indirect_bidder_accepted);
      totalDlr += numOrZero(i.primary_dealer_accepted);
      totalTend += numOrZero(i.total_tendered);
    });

    if (totalAcc > 0) {
      const indPct = (totalInd / totalAcc) * 100;
      const dlrPct = (totalDlr / totalAcc) * 100;

      document.getElementById('kpiIndirectPct').textContent = `${indPct.toFixed(1)}%`;
      document.getElementById('kpiIndirectAmt').textContent = formatCurrencyBillions(totalInd);

      document.getElementById('kpiDealerPct').textContent = `${dlrPct.toFixed(1)}%`;
      document.getElementById('kpiDealerAmt').textContent = formatCurrencyBillions(totalDlr);

      const dGrade = document.getElementById('kpiDealerGrade');
      if (dlrPct < 15) {
        dGrade.textContent = 'Low Concession (Healthy)';
        dGrade.style.color = 'var(--neon-emerald)';
      } else {
        dGrade.textContent = 'Elevated Dealer Take';
        dGrade.style.color = 'var(--neon-amber)';
      }
    }

    document.getElementById('kpiTotalPlaced').textContent = formatCurrencyBillions(totalAcc);
    document.getElementById('kpiCountTag').textContent = `${filtered.length} Sales`;
    document.getElementById('kpiTenderedTotal').textContent = `Tendered: ${formatCurrencyBillions(totalTend)}`;
  }

  // =========================================================================
  // CHART RENDERING (OBSIDIAN TERMINAL DESIGN)
  // =========================================================================

  function renderAllCharts() {
    if (typeof Chart === 'undefined') return;

    const gridColor = 'rgba(0, 0, 0, 0.06)';
    const textColor = '#475569';
    const tooltipBg = '#09090b';
    const tooltipBorder = '#27272a';

    Chart.defaults.color = textColor;
    Chart.defaults.font.family = 'JetBrains Mono, monospace';

    renderYieldEvolutionChart(gridColor, tooltipBg, tooltipBorder);
    renderCurveSnapshotChart(gridColor, tooltipBg, tooltipBorder);
    renderAllotmentCompositionChart(gridColor, tooltipBg, tooltipBorder);
    renderBtcBarChart(gridColor, tooltipBg, tooltipBorder);
  }

  // Chart 1: Yield & Coupon Evolution
  function renderYieldEvolutionChart(gridColor, tooltipBg, tooltipBorder) {
    const ctx = document.getElementById('yieldChart');
    if (!ctx) return;
    if (state.charts.yield) state.charts.yield.destroy();

    const dataList = [...state.filteredAuctions].reverse();
    const metric = state.filters.yieldMetric;
    const datasets = [];

    // Update panel title and subtitle to match active metric
    const titleEl = document.getElementById('yieldChartTitle');
    const subtitleEl = document.getElementById('yieldChartSubtitle');
    if (titleEl && subtitleEl) {
      if (metric === 'high_yield') {
        titleEl.textContent = 'AUCTION CLEARING HIGH YIELDS HISTORICAL EVOLUTION (%)';
        subtitleEl.textContent = 'Clearing cut-off yields awarded across sovereign debt auctions over time';
      } else if (metric === 'int_rate') {
        titleEl.textContent = 'TREASURY ISSUANCE COUPON INTEREST RATES (%)';
        subtitleEl.textContent = 'Stated fixed annual coupon interest rate awarded to note and bond issues over time';
      } else if (metric === 'tail') {
        titleEl.textContent = 'AUCTION TAIL SPREAD & DEALER CONCESSION (BPS)';
        subtitleEl.textContent = 'Auction tail in basis points (High Yield minus Average Yield). Positive = soft demand concession.';
      }
    }

    const allDates = [...new Set(dataList.map(item => item.issue_date))].filter(Boolean).sort();

    TENOR_ORDER.forEach(tenor => {
      const code = tenor.replace('-Year', 'Y');
      if (state.activeTenors.size > 0 && !state.activeTenors.has(code)) return;

      const tenorData = dataList.filter(i => (i.original_security_term || '').startsWith(tenor));
      const color = TENOR_COLORS[tenor] || '#38bdf8';

      if (metric === 'tail') {
        // Auction tail shown as distinct bar telemetry
        datasets.push({
          type: 'bar',
          label: `${tenor} Tail`,
          data: tenorData.map(item => ({
            x: item.issue_date,
            y: calculateTailBps(item),
            cusip: item.cusip
          })),
          backgroundColor: color,
          borderColor: color,
          borderRadius: 2,
          borderWidth: 1
        });
      } else if (metric === 'int_rate') {
        // Coupon rate shown as stepped plateaus
        datasets.push({
          type: 'line',
          label: `${tenor} Coupon`,
          data: tenorData.map(item => ({
            x: item.issue_date,
            y: numOrZero(item.int_rate),
            cusip: item.cusip
          })),
          borderColor: color,
          backgroundColor: color,
          stepped: 'before',
          borderWidth: 2,
          spanGaps: true,
          pointRadius: tenorData.length > 60 ? 1.5 : 3.5,
          pointHoverRadius: 6
        });
      } else {
        // High clearing yield shown as smooth curve
        datasets.push({
          type: 'line',
          label: `${tenor} Yield`,
          data: tenorData.map(item => ({
            x: item.issue_date,
            y: numOrZero(item.high_yield),
            cusip: item.cusip
          })),
          borderColor: color,
          backgroundColor: color,
          tension: 0.25,
          borderWidth: 2,
          spanGaps: true,
          pointRadius: tenorData.length > 60 ? 1.5 : 3.5,
          pointHoverRadius: 6
        });
      }
    });

    state.charts.yield = new Chart(ctx, {
      type: metric === 'tail' ? 'bar' : 'line',
      data: {
        labels: allDates,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: true,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, usePointStyle: true, padding: 12 } },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: (ctx) => {
                if (metric === 'tail') {
                  const val = ctx.parsed.y;
                  return `${ctx.dataset.label}: ${val > 0 ? '+' : ''}${val.toFixed(2)} bps`;
                }
                return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}%`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 12, font: { size: 9 } } },
          y: {
            grid: { color: gridColor },
            ticks: {
              callback: v => metric === 'tail' ? `${v > 0 ? '+' : ''}${v} bps` : `${v}%`,
              font: { size: 10 }
            }
          }
        }
      }
    });
  }

  // Chart 2: Current Yield Curve Snapshot
  function renderCurveSnapshotChart(gridColor, tooltipBg, tooltipBorder) {
    const ctx = document.getElementById('curveChart');
    if (!ctx) return;
    if (state.charts.curve) state.charts.curve.destroy();

    const currentPoints = [];
    const prevPoints = [];

    TENOR_ORDER.forEach(tenor => {
      const list = state.rawAuctions
        .filter(i => (i.original_security_term || '').startsWith(tenor) && numOrZero(i.high_yield) > 0)
        .sort((a, b) => b.issue_date.localeCompare(a.issue_date));

      if (list.length > 0) {
        currentPoints.push({ x: tenor, y: numOrZero(list[0].high_yield), date: list[0].issue_date });
        if (list.length > 1) {
          prevPoints.push({ x: tenor, y: numOrZero(list[1].high_yield), date: list[1].issue_date });
        }
      }
    });

    state.charts.curve = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['2-Year', '5-Year', '10-Year', '20-Year', '30-Year'],
        datasets: [
          {
            label: 'Current Curve',
            data: currentPoints,
            borderColor: '#09090b',
            backgroundColor: 'rgba(9, 9, 11, 0.05)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: '#09090b',
            pointRadius: 5
          },
          {
            label: 'Prior Auction Curve',
            data: prevPoints,
            borderColor: 'rgba(100, 116, 139, 0.6)',
            borderDash: [4, 4],
            tension: 0.35,
            borderWidth: 1.5,
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10, usePointStyle: true } },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(3)}% (${ctx.raw.date || ''})`
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { font: { weight: 700, size: 9 } } },
          y: { grid: { color: gridColor }, ticks: { callback: v => `${v}%`, font: { size: 10 } } }
        }
      }
    });
  }

  // Chart 3: Bidder Allotment Composition (%)
  function renderAllotmentCompositionChart(gridColor, tooltipBg, tooltipBorder) {
    const ctx = document.getElementById('allotmentChart');
    if (!ctx) return;
    if (state.charts.allotment) state.charts.allotment.destroy();

    const dataList = [...state.filteredAuctions].reverse();
    const labels = dataList.map(i => i.issue_date);
    const ind = [];
    const dir = [];
    const dlr = [];

    dataList.forEach(i => {
      const acc = numOrZero(i.total_accepted);
      if (acc > 0) {
        ind.push((numOrZero(i.indirect_bidder_accepted) / acc) * 100);
        dir.push((numOrZero(i.direct_bidder_accepted) / acc) * 100);
        dlr.push((numOrZero(i.primary_dealer_accepted) / acc) * 100);
      } else {
        ind.push(0); dir.push(0); dlr.push(0);
      }
    });

    state.charts.allotment = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Indirect Bidders (Foreign / Central Banks)',
            data: ind,
            borderColor: '#7c3aed',
            backgroundColor: 'rgba(124, 58, 237, 0.25)',
            fill: 'origin',
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Direct Bidders (Domestic Funds)',
            data: dir,
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.25)',
            fill: '-1',
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 0
          },
          {
            label: 'Primary Dealers (Absorption)',
            data: dlr,
            borderColor: '#d97706',
            backgroundColor: 'rgba(217, 119, 6, 0.25)',
            fill: '-1',
            tension: 0.25,
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10 } },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
          y: { stacked: true, max: 100, grid: { color: gridColor }, ticks: { callback: v => `${v}%` } }
        }
      }
    });
  }

  // Chart 4: Bid to Cover Ratio Bar
  function renderBtcBarChart(gridColor, tooltipBg, tooltipBorder) {
    const ctx = document.getElementById('btcChart');
    if (!ctx) return;
    if (state.charts.btc) state.charts.btc.destroy();

    const dataList = [...state.filteredAuctions].reverse();
    const labels = dataList.map(i => i.issue_date);
    const btcValues = dataList.map(i => numOrZero(i.bid_to_cover_ratio));

    state.charts.btc = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Bid-to-Cover Ratio',
            data: btcValues,
            backgroundColor: dataList.map(i => {
              const tenor = getStandardTenor(i);
              return TENOR_COLORS[tenor] || '#00d4ff';
            }),
            borderRadius: 2
          },
          {
            type: 'line',
            label: 'Benchmark Norm (2.50x)',
            data: dataList.map(() => 2.50),
            borderColor: '#ff3366',
            borderDash: [4, 4],
            pointRadius: 0,
            borderWidth: 1.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 10 } },
          tooltip: {
            backgroundColor: tooltipBg,
            borderColor: tooltipBorder,
            borderWidth: 1,
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}x` }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { maxTicksLimit: 10, font: { size: 9 } } },
          y: { min: 1.5, grid: { color: gridColor }, ticks: { callback: v => `${v}x` } }
        }
      }
    });
  }

  // =========================================================================
  // UPCOMING SCHEDULE BOARD
  // =========================================================================

  function renderUpcomingBoard() {
    const grid = document.getElementById('upcomingGrid');
    if (!grid) return;

    const sortedUpcoming = [...state.upcomingAuctions].sort((a, b) => {
      const dA = a.auction_date || a.announcemt_date || a.record_date || '';
      const dB = b.auction_date || b.announcemt_date || b.record_date || '';
      return dB.localeCompare(dA);
    });

    let notesAndBonds = sortedUpcoming.filter(i => {
      const type = (i.security_type || '').toLowerCase();
      const term = (i.security_term || '').toLowerCase();
      return type.includes('note') || type.includes('bond') || term.includes('year');
    });

    if (notesAndBonds.length < 6) {
      const others = sortedUpcoming.filter(i => !notesAndBonds.includes(i));
      notesAndBonds = notesAndBonds.concat(others);
    }
    const items = notesAndBonds.slice(0, 8);

    if (items.length === 0) {
      grid.innerHTML = '<div style="color: var(--t-muted); padding: 20px;">No upcoming debt scheduled.</div>';
      return;
    }

    // Update ticker tape with next upcoming
    const nextItem = items[0];
    const tickNext = document.getElementById('tickNext');
    if (tickNext && nextItem) {
      tickNext.textContent = `${nextItem.security_term || nextItem.security_type} (${formatDate(nextItem.auction_date)})`;
    }

    grid.innerHTML = items.map(item => {
      const isReopen = (item.reopening || '').toLowerCase() === 'yes';
      const term = item.security_term || item.security_type || 'Bond';
      const rawOffering = numOrZero(item.offering_amt);
      const offeringDisplay = rawOffering > 0 ? formatCurrencyBillions(rawOffering) : 'Target Pending Announcement';

      return `
        <div class="u-card">
          <div class="u-card-header">
            <span class="u-term-badge">${term}</span>
            <span class="u-tag ${isReopen ? 'tag-reopen' : 'tag-new'}">
              ${isReopen ? 'REOPENING' : 'NEW BENCHMARK'}
            </span>
          </div>

          <div class="u-date-row">
            <div class="u-date-item">
              <span>ANNOUNCEMENT</span>
              <span class="num">${formatDate(item.announcemt_date)}</span>
            </div>
            <div class="u-date-item">
              <span>AUCTION DATE</span>
              <span class="num" style="color: var(--neon-amber);">${formatDate(item.auction_date)}</span>
            </div>
            <div class="u-date-item">
              <span>SETTLEMENT</span>
              <span class="num">${formatDate(item.issue_date)}</span>
            </div>
            <div class="u-date-item">
              <span>CUSIP</span>
              <span class="num">${item.cusip || 'Pending'}</span>
            </div>
          </div>

          <div class="u-offering-row">
            <span style="color: var(--t-muted); font-size: 10px;">OFFERING TARGET:</span>
            <span class="num" style="color: var(--neon-cyan);">${offeringDisplay}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // =========================================================================
  // MASTER LEDGER & INLINE TELEMETRY INSPECTION
  // =========================================================================

  function renderTableLedger() {
    const tbody = document.getElementById('auctionTableBody');
    const countText = document.getElementById('ledgerCountText');
    const pageInfo = document.getElementById('pageInfoDisplay');
    const btnPrev = document.getElementById('btnPrevPage');
    const btnNext = document.getElementById('btnNextPage');

    const total = state.filteredAuctions.length;
    const { page, pageSize } = state.pagination;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    countText.textContent = `Displaying ${Math.min(total, (page - 1) * pageSize + 1)} - ${Math.min(total, page * pageSize)} of ${total} Sovereign Debt Records`;
    pageInfo.textContent = `PAGE ${page} OF ${totalPages} (${total} TOTAL)`;

    btnPrev.disabled = page <= 1;
    btnNext.disabled = page >= totalPages;

    const start = (page - 1) * pageSize;
    const pageItems = state.filteredAuctions.slice(start, start + pageSize);

    if (pageItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 20px; color: var(--t-muted);">No auction records found matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageItems.map((item, idx) => {
      const isReopen = (item.reopening || '').toLowerCase() === 'yes';
      const tenor = getStandardTenor(item);
      const color = TENOR_COLORS[tenor] || 'var(--t-primary)';
      const highYield = numOrZero(item.high_yield);
      const coupon = numOrZero(item.int_rate);
      const tailBps = calculateTailBps(item);
      const btc = numOrZero(item.bid_to_cover_ratio);
      const accepted = numOrZero(item.total_accepted);

      let indPct = 0, dirPct = 0, dlrPct = 0;
      if (accepted > 0) {
        indPct = ((numOrZero(item.indirect_bidder_accepted) / accepted) * 100).toFixed(0);
        dirPct = ((numOrZero(item.direct_bidder_accepted) / accepted) * 100).toFixed(0);
        dlrPct = ((numOrZero(item.primary_dealer_accepted) / accepted) * 100).toFixed(0);
      }

      const tailBadge = tailBps <= 0 
        ? `<span class="badge-tail tail-through">${tailBps.toFixed(1)}</span>`
        : `<span class="badge-tail tail-out">+${tailBps.toFixed(1)}</span>`;

      const isSelected = state.selectedAuction && state.selectedAuction.cusip === item.cusip;

      return `
        <tr data-idx="${start + idx}" class="${isSelected ? 'selected-row' : ''}">
          <td class="num">${formatDate(item.issue_date)}</td>
          <td><span style="font-weight: 700; color: ${color};">${tenor}</span></td>
          <td><span class="u-tag ${isReopen ? 'tag-reopen' : 'tag-new'}">${isReopen ? 'REOPEN' : 'NEW'}</span></td>
          <td class="num" style="color: var(--t-secondary);">${item.cusip || '--'}</td>
          <td class="num" style="font-weight: 700; color: var(--t-primary); font-size: 12px;">${formatPct(highYield, 3)}</td>
          <td class="num" style="color: var(--t-secondary);">${formatPct(coupon, 3)}</td>
          <td>${tailBadge}</td>
          <td class="num" style="font-weight: 600; color: ${btc >= 2.6 ? 'var(--neon-emerald)' : btc < 2.3 ? 'var(--neon-coral)' : 'var(--neon-cyan)'};">${btc.toFixed(2)}x</td>
          <td class="num">${formatCurrencyBillions(accepted)}</td>
          <td class="num" style="font-size: 10px;">
            <span style="color: var(--neon-violet);">${indPct}%</span> / 
            <span style="color: var(--neon-cyan);">${dirPct}%</span> / 
            <span style="color: var(--neon-amber);">${dlrPct}%</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const idx = row.getAttribute('data-idx');
        if (idx !== null) {
          const item = state.filteredAuctions[parseInt(idx, 10)];
          selectAuction(item);
          // Highlight row
          tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected-row'));
          row.classList.add('selected-row');
        }
      });
    });
  }

  function selectAuction(auction) {
    if (!auction) return;
    state.selectedAuction = auction;

    const tenor = getStandardTenor(auction);
    const isReopen = (auction.reopening || '').toLowerCase() === 'yes';

    document.getElementById('tDeckTitle').textContent = `${tenor} ${auction.security_type || 'BOND'}`;
    const tType = document.getElementById('tDeckType');
    tType.textContent = isReopen ? 'REOPENING' : 'NEW BENCHMARK';
    tType.className = `u-tag ${isReopen ? 'tag-reopen' : 'tag-new'}`;

    document.getElementById('tDeckCusip').textContent = auction.cusip || '--';
    document.getElementById('tDeckIssueDate').textContent = formatDate(auction.issue_date);
    document.getElementById('tDeckMatDate').textContent = formatDate(auction.maturity_date || auction.mat_date);
    document.getElementById('tDeckSeries').textContent = auction.series || 'N/A';

    const highYield = numOrZero(auction.high_yield);
    const avgYield = numOrZero(auction.avg_med_yield);
    const tailBps = calculateTailBps(auction);

    document.getElementById('tDeckHighYield').textContent = formatPct(highYield, 4);
    document.getElementById('tDeckAvgYield').textContent = avgYield > 0 ? formatPct(avgYield, 4) : 'N/A';
    document.getElementById('tDeckTailBps').textContent = `${tailBps > 0 ? '+' : ''}${tailBps.toFixed(2)} bps`;
    document.getElementById('tDeckCoupon').textContent = formatPct(auction.int_rate, 3);
    document.getElementById('tDeckPrice').textContent = auction.high_price ? `$${parseFloat(auction.high_price).toFixed(3)}` : (auction.price_per100 || 'N/A');

    const accepted = numOrZero(auction.total_accepted);
    const indirect = numOrZero(auction.indirect_bidder_accepted);
    const direct = numOrZero(auction.direct_bidder_accepted);
    const dealer = numOrZero(auction.primary_dealer_accepted);
    const soma = numOrZero(auction.soma_accepted);

    document.getElementById('tDeckOffering').textContent = formatCurrencyBillions(auction.offering_amt);
    document.getElementById('tDeckTendered').textContent = formatCurrencyBillions(auction.total_tendered);
    document.getElementById('tDeckAccepted').textContent = formatCurrencyBillions(accepted);
    document.getElementById('tDeckBtc').textContent = `${numOrZero(auction.bid_to_cover_ratio).toFixed(2)}x`;
    document.getElementById('tDeckSoma').textContent = formatCurrencyBillions(soma);

    let indPct = 0, dirPct = 0, dlrPct = 0;
    if (accepted > 0) {
      indPct = (indirect / accepted) * 100;
      dirPct = (direct / accepted) * 100;
      dlrPct = (dealer / accepted) * 100;
    }

    document.getElementById('tBarIndirect').style.width = `${indPct}%`;
    document.getElementById('tBarDirect').style.width = `${dirPct}%`;
    document.getElementById('tBarDealer').style.width = `${dlrPct}%`;

    document.getElementById('tPctIndirect').textContent = `${indPct.toFixed(1)}% (${formatCurrencyBillions(indirect)})`;
    document.getElementById('tPctDirect').textContent = `${dirPct.toFixed(1)}% (${formatCurrencyBillions(direct)})`;
    document.getElementById('tPctDealer').textContent = `${dlrPct.toFixed(1)}% (${formatCurrencyBillions(dealer)})`;

    const pdfLink = document.getElementById('tDeckPdfLink');
    if (auction.pdf_filenm_comp_results) {
      pdfLink.href = `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${auction.pdf_filenm_comp_results}`;
      pdfLink.style.display = 'flex';
    } else {
      pdfLink.href = 'https://fiscaldata.treasury.gov/datasets/treasury-securities-auctions-data/treasury-securities-auctions-data';
      pdfLink.style.display = 'flex';
    }
  }

  // =========================================================================
  // EXPORT CSV
  // =========================================================================

  function exportLedgerCsv() {
    const list = state.filteredAuctions;
    if (list.length === 0) return alert('No records to export');

    const headers = ['Issue Date', 'Tenor', 'CUSIP', 'Reopening', 'Clearing Yield', 'Coupon', 'Tail bps', 'Bid/Cover', 'Offering', 'Accepted', 'Indirect', 'Direct', 'Primary Dealer'];
    const rows = list.map(i => [
      i.issue_date || '',
      getStandardTenor(i),
      i.cusip || '',
      i.reopening || '',
      i.high_yield || '',
      i.int_rate || '',
      calculateTailBps(i).toFixed(2),
      i.bid_to_cover_ratio || '',
      i.offering_amt || '',
      i.total_accepted || '',
      i.indirect_bidder_accepted || '',
      i.direct_bidder_accepted || '',
      i.primary_dealer_accepted || ''
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `US_Treasury_Auctions_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  // =========================================================================
  // EVENT LISTENERS & SETUP
  // =========================================================================

  function setupEvents() {
    // Deck Switcher Tabs
    const tabs = document.querySelectorAll('#deckTabs .deck-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetId = tab.getAttribute('data-tab');
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.add('active');
        renderAllCharts();
      });
    });

    // Left Rail Tenor Toggle Cards
    const tenorBtns = document.querySelectorAll('#tenorStack .tenor-card-btn');
    tenorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-tenor');
        if (state.activeTenors.has(code)) {
          if (state.activeTenors.size > 1) {
            state.activeTenors.delete(code);
            btn.classList.remove('active');
          }
        } else {
          state.activeTenors.add(code);
          btn.classList.add('active');
        }
        applyFilters();
      });
    });

    document.getElementById('btnTenorAll').addEventListener('click', () => {
      state.activeTenors = new Set(['2Y', '5Y', '10Y', '20Y', '30Y']);
      tenorBtns.forEach(b => b.classList.add('active'));
      applyFilters();
    });

    // Horizon filter pills
    document.querySelectorAll('#horizonFilter .f-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#horizonFilter .f-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.period = btn.getAttribute('data-period');
        applyFilters();
      });
    });

    // Offering filter pills
    document.querySelectorAll('#offeringFilter .f-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#offeringFilter .f-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.reopen = btn.getAttribute('data-reopen');
        applyFilters();
      });
    });

    // Yield metric toggle (Clearing vs Coupon vs Tail)
    document.querySelectorAll('#yieldMetricToggle .f-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#yieldMetricToggle .f-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.filters.yieldMetric = btn.getAttribute('data-metric');
        renderAllCharts();
      });
    });

    // Search Box with Debounce
    let searchTimer;
    document.getElementById('termSearch').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.search = e.target.value;
        applyFilters();
      }, 200);
    });

    // Sync button
    document.getElementById('btnSync').addEventListener('click', () => {
      fetchAuctionsData();
      fetchUpcomingAuctions();
    });

    // Export CSV
    document.getElementById('btnExport').addEventListener('click', exportLedgerCsv);

    // Pagination
    document.getElementById('btnPrevPage').addEventListener('click', () => {
      if (state.pagination.page > 1) {
        state.pagination.page--;
        renderTableLedger();
      }
    });

    document.getElementById('btnNextPage').addEventListener('click', () => {
      const maxPages = Math.ceil(state.filteredAuctions.length / state.pagination.pageSize);
      if (state.pagination.page < maxPages) {
        state.pagination.page++;
        renderTableLedger();
      }
    });

    document.getElementById('pageSizeSelect').addEventListener('change', (e) => {
      state.pagination.pageSize = parseInt(e.target.value, 10);
      state.pagination.page = 1;
      renderTableLedger();
    });

    // Column sorting in ledger
    document.querySelectorAll('.dense-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (state.sort.field === field) {
          state.sort.asc = !state.sort.asc;
        } else {
          state.sort.field = field;
          state.sort.asc = false;
        }
        applyFilters();
      });
    });

    // API Modal Handlers
    const apiShield = document.getElementById('apiModalShield');
    document.getElementById('btnApiGuide').addEventListener('click', () => {
      apiShield.classList.add('active');
    });
    document.getElementById('btnCloseApiModal').addEventListener('click', () => {
      apiShield.classList.remove('active');
    });
    apiShield.addEventListener('click', (e) => {
      if (e.target.id === 'apiModalShield') apiShield.classList.remove('active');
    });

    // Copy buttons in modal
    document.querySelectorAll('.copy-mini-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-copy');
        const pre = document.getElementById(targetId);
        if (pre) {
          navigator.clipboard.writeText(pre.textContent).then(() => {
            btn.textContent = 'COPIED';
            setTimeout(() => btn.textContent = 'COPY', 1800);
          });
        }
      });
    });
  }

  // =========================================================================
  // BOOTSTRAP
  // =========================================================================

  function init() {
    startClocks();
    setupEvents();
    fetchAuctionsData();
    fetchUpcomingAuctions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
