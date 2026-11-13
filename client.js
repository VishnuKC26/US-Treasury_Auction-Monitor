/**
 * client.js - Futures First Institutional US Treasury Monitor Terminal
 * Vanilla ES Module orchestrating data loading, pure analytics, Chart.js,
 * theme management, responsive tab switching, and the AI Analyst Chatbot.
 */

import { state } from './state.js';
import {
  BENCHMARK_CODES,
  getTenorCode,
  parseNum,
  computeTenorStats,
  computeSpreads,
  processUpcomingAuctions,
  calculateStopVsMedianBps,
  getAllocationAtHighPct,
  calculateTakedownShares,
  evaluateAuctionQuality,
  calculatePercentileRank
} from './analytics.js';
import { loadAuctionsData, loadUpcomingData, loadWhenIssuedData } from './data.js';
import { renderActiveTakedownChart, renderYieldCurveChart, updateChartsTheme } from './charts.js';
import { chatbot } from './chatbot.js';

// =========================================================================
// FORMATTERS & UTILITIES
// =========================================================================

function formatPct(val, decimals = 3) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${Number(val).toFixed(decimals)}%`;
}

function formatBp(val, decimals = 1, withSign = true) {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const n = Number(val);
  const sign = n > 0 ? (withSign ? '+' : '') : '';
  return `${sign}${n.toFixed(decimals)} bp`;
}

function formatBillions(amt) {
  if (amt === null || amt === undefined || isNaN(amt)) return '—';
  const b = amt / 1e9;
  return `$${b.toFixed(2)}B`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr === 'null') return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    return `${months[m] || parts[1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
  }
  return dateStr;
}

function formatShortDate(dateStr) {
  if (!dateStr || dateStr === 'null') return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    return `${months[m] || parts[1]} ${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}

function getCountdownToET(targetDateStr, targetTimeStr = '13:00') {
  if (!targetDateStr) return '—';
  const [tHours, tMins] = targetTimeStr.split(':').map(Number);
  const now = new Date();
  
  const nyDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now);
  const nyTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(now);

  const [nyH, nyM, nyS] = nyTimeStr.split(':').map(Number);
  const nyNowSec = (new Date(`${nyDateStr}T12:00:00Z`)).getTime() / 1000 + (nyH * 3600 + nyM * 60 + nyS) - 43200;
  const targetSec = (new Date(`${targetDateStr}T12:00:00Z`)).getTime() / 1000 + (tHours * 3600 + tMins * 60) - 43200;

  const diffSec = targetSec - nyNowSec;
  if (diffSec <= 0) return 'Closed';

  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

// =========================================================================
// TAB SWITCHING SYSTEM
// =========================================================================

export function switchTab(tabId) {
  state.activeTab = tabId;

  // Update nav buttons
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    const isTarget = btn.getAttribute('data-tab') === tabId;
    btn.classList.toggle('is-active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  // Update tab content containers
  const tabMap = {
    overview: 'tabOverview',
    curve: 'tabCurve',
    demand: 'tabDemand',
    ledger: 'tabLedger',
    upcoming: 'tabUpcoming',
    chat: 'tabChat'
  };

  Object.entries(tabMap).forEach(([key, elementId]) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.classList.toggle('is-active', key === tabId);
    }
  });

  // Update topbar heading
  const headingEl = document.getElementById('pageTitleHeading');
  if (headingEl) {
    const titleMap = {
      overview: 'Executive Overview',
      curve: 'Yield Curve & Spreads',
      demand: 'Demand Dynamics & Allotment',
      ledger: 'Historical Auction Ledger',
      upcoming: 'Upcoming Issuance Calendar',
      chat: 'AI Institutional Analyst'
    };
    headingEl.textContent = titleMap[tabId] || 'Treasury Monitor';
  }

  // Refresh charts on tab activation
  if (tabId === 'overview') {
    renderYieldCurveChart();
    renderActiveTakedownChart(state.activeTenor);
  } else if (tabId === 'curve') {
    renderYieldCurveChart();
  } else if (tabId === 'demand') {
    renderDemandDynamicsTab();
    renderActiveTakedownChart(state.activeTenor);
  }

  // Close mobile sidebar if open
  document.getElementById('workspace-nav')?.classList.remove('mobile-open');
}

// =========================================================================
// THEME MANAGEMENT (Futures First Light / Dark System)
// =========================================================================

function initTheme() {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('ff-theme');
    if (saved === 'light' || saved === 'dark') {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    }
  } catch (e) {}

  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeUI();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  state.theme = next;
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('ff-theme', next);
  } catch (e) {}
  updateThemeUI();
  updateChartsTheme();
}

function updateThemeUI() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textEl = document.getElementById('themeToggleText');
  const iconSun = document.getElementById('themeIconSun');

  if (textEl) {
    textEl.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  }

  if (iconSun) {
    if (isDark) {
      // Moon icon
      iconSun.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
      // Sun icon
      iconSun.innerHTML = `
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      `;
    }
  }
}

// =========================================================================
// HEADER & STATUS RENDERERS
// =========================================================================

function renderHeaderStatus() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const staleBanner = document.getElementById('staleBanner');
  const errorBanner = document.getElementById('errorBanner');

  if (errorBanner) {
    if (state.error) {
      errorBanner.classList.remove('is-hidden');
      const errMsg = document.getElementById('errorBannerMsg');
      if (errMsg) errMsg.textContent = state.error;
    } else {
      errorBanner.classList.add('is-hidden');
    }
  }

  if (staleBanner) {
    if (state.dataSource === 'stale-sample') {
      staleBanner.classList.remove('is-hidden');
    } else {
      staleBanner.classList.add('is-hidden');
    }
  }

  if (statusDot && statusText) {
    if (state.dataSource === 'live-proxy' || state.dataSource === 'live-direct') {
      statusDot.className = 'status-dot live';
      statusText.textContent = state.dataSource === 'live-proxy' ? 'LIVE PROXY' : 'LIVE FISCAL';
    } else if (state.dataSource === 'stale-sample') {
      statusDot.className = 'status-dot stale';
      statusText.textContent = 'OFFLINE SAMPLE';
    } else {
      statusDot.className = 'status-dot connecting';
      statusText.textContent = 'CONNECTING';
    }
  }
}

function renderNextAuctionLine() {
  const nextTextEl = document.getElementById('nextAuctionText');
  if (!nextTextEl) return;

  if (!state.upcomingAuctions || state.upcomingAuctions.length === 0) {
    nextTextEl.textContent = 'No upcoming auctions scheduled';
    return;
  }

  const soonest = state.upcomingAuctions.find(a => ['Note', 'Bond'].includes(a.security_type)) || state.upcomingAuctions[0];
  const isReopen = String(soonest.reopening || '').toLowerCase() === 'yes';
  const issueLabel = isReopen ? 'reopening' : 'new issue';
  const tenor = soonest.tenorCode || soonest.security_term;
  
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let dateFormatted = soonest.auction_date;
  if (soonest.auction_date) {
    const parts = soonest.auction_date.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    dateFormatted = `${weekdays[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
  }

  let annFormatted = '';
  if (soonest.hasOffering) {
    annFormatted = `size ${soonest.offeringDisplay}`;
  } else if (soonest.announcemt_date && soonest.announcemt_date !== 'null') {
    const parts = soonest.announcemt_date.split('-');
    const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    annFormatted = `announced ${weekdays[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
  } else {
    annFormatted = 'size pending';
  }

  nextTextEl.innerHTML = `<strong>${tenor} ${issueLabel}</strong> · ${dateFormatted} 1:00 pm ET · ${annFormatted}`;
}

// =========================================================================
// TAB 1: EXECUTIVE OVERVIEW RENDERERS
// =========================================================================

function renderOverviewKPIs() {
  // 1. 10Y Benchmark
  const stat10Y = state.tenorStatsMap['10Y'];
  const y10El = document.getElementById('kpi10YYield');
  const d10El = document.getElementById('kpi10YDelta');
  const t10El = document.getElementById('kpi10YTag');
  const b10El = document.getElementById('kpi10YBtc');

  if (stat10Y) {
    if (y10El) y10El.textContent = formatPct(stat10Y.highYield);
    if (d10El) {
      d10El.textContent = formatBp(stat10Y.deltaHighYieldBp);
      d10El.className = stat10Y.deltaHighYieldBp > 0 ? 'text-up num' : (stat10Y.deltaHighYieldBp < 0 ? 'text-down num' : 'num');
    }
    if (t10El) {
      t10El.className = `kpi-tag ${stat10Y.quality === 'STRONG' ? 'strong' : (stat10Y.quality === 'SOFT' ? 'soft' : 'inline')}`;
      t10El.textContent = stat10Y.quality;
    }
    if (b10El) {
      b10El.textContent = `${stat10Y.bidToCover?.toFixed(2)}x BTC`;
    }
  }

  // 2. 2s10s Spread
  const s2s10 = state.spreads?.find(s => s.name === '2s10s');
  const spValEl = document.getElementById('kpi2s10Val');
  const spTagEl = document.getElementById('kpi2s10Tag');
  const spShortEl = document.getElementById('kpi2s10Short');
  const spLongEl = document.getElementById('kpi2s10Long');

  if (s2s10) {
    if (spValEl) {
      spValEl.textContent = formatBp(s2s10.spreadBp);
      spValEl.className = `kpi-val num ${s2s10.spreadBp < 0 ? 'inverted' : ''}`;
    }
    if (spTagEl) {
      const isInverted = s2s10.spreadBp < 0;
      spTagEl.className = `kpi-tag ${isInverted ? 'soft' : 'strong'}`;
      spTagEl.textContent = isInverted ? 'INVERTED' : 'NORMAL';
    }
    if (spShortEl) spShortEl.textContent = s2s10.shortYield !== null ? `${s2s10.shortYield.toFixed(3)}%` : '—';
    if (spLongEl) spLongEl.textContent = s2s10.longYield !== null ? `${s2s10.longYield.toFixed(3)}%` : '—';
  }

  // 3. Primary Dealer Absorption
  const dealerPctEl = document.getElementById('kpiDealerPct');
  const dealerTagEl = document.getElementById('kpiDealerTag');
  const dealerSubEl = document.getElementById('kpiDealerSub');

  if (stat10Y && stat10Y.shares) {
    const dlrPct = stat10Y.shares.dealerPct;
    if (dealerPctEl) dealerPctEl.textContent = dlrPct !== null ? `${dlrPct.toFixed(1)}%` : '—';
    if (dealerTagEl) {
      if (dlrPct > 22) {
        dealerTagEl.className = 'kpi-tag soft';
        dealerTagEl.textContent = 'HIGH INDIGESTION';
      } else if (dlrPct < 15) {
        dealerTagEl.className = 'kpi-tag strong';
        dealerTagEl.textContent = 'LOW OVERHANG';
      } else {
        dealerTagEl.className = 'kpi-tag inline';
        dealerTagEl.textContent = 'BALANCED';
      }
    }
    if (dealerSubEl) {
      dealerSubEl.textContent = `Indirect takedown: ${stat10Y.shares.indirectPct?.toFixed(1)}%`;
    }
  }

  // 4. Next Upcoming Issuance
  const soonest = state.upcomingAuctions?.[0];
  const nextTenorEl = document.getElementById('kpiNextTenor');
  const nextCountEl = document.getElementById('kpiNextCountdown');
  const nextDateEl = document.getElementById('kpiNextDate');
  const nextSizeEl = document.getElementById('kpiNextSize');

  if (soonest) {
    if (nextTenorEl) nextTenorEl.textContent = `${soonest.tenorCode || soonest.security_term} ${String(soonest.reopening || '').toLowerCase() === 'yes' ? 'Reopen' : 'New'}`;
    if (nextCountEl) nextCountEl.textContent = getCountdownToET(soonest.auction_date);
    if (nextDateEl) nextDateEl.textContent = formatShortDate(soonest.auction_date);
    if (nextSizeEl) nextSizeEl.textContent = soonest.offeringDisplay || 'Size Pending';
  }
}

function renderTenorPillsAndFocusCard() {
  const container = document.getElementById('overviewTenorPills');
  if (!container) return;

  const html = BENCHMARK_CODES.map(code => {
    const stat = state.tenorStatsMap[code];
    const isActive = state.activeTenor === code ? 'is-active' : '';
    const yieldText = stat?.highYield !== null && stat?.highYield !== undefined ? `${stat.highYield.toFixed(3)}%` : '—';
    const qClass = stat?.quality === 'STRONG' ? 'strong' : (stat?.quality === 'SOFT' ? 'soft' : 'inline');

    return `
      <button class="tenor-pill-btn ${isActive}" data-tenor="${code}" aria-pressed="${state.activeTenor === code}">
        <span class="pill-status-dot ${qClass}"></span>
        <span class="pill-tenor-code">${code}</span>
        <span class="pill-yield num">${yieldText}</span>
      </button>
    `;
  }).join('');

  container.innerHTML = html;

  // Add click handlers
  container.querySelectorAll('.tenor-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tenor = btn.getAttribute('data-tenor');
      if (tenor && tenor !== state.activeTenor) {
        state.activeTenor = tenor;
        renderTenorPillsAndFocusCard();
        renderActiveTenorDetails();
        renderActiveTakedownChart(state.activeTenor);
      }
    });
  });

  // Render the Focused Tenor Card
  renderFocusedTenorCard();
}

function renderFocusedTenorCard() {
  const stat = state.tenorStatsMap[state.activeTenor];
  if (!stat) return;

  const codeEl = document.getElementById('focusTenorCode');
  const issueEl = document.getElementById('focusIssueBadge');
  const qualityEl = document.getElementById('focusQualityBadge');
  const yieldEl = document.getElementById('focusHighYield');
  const deltaEl = document.getElementById('focusDeltaYield');
  const btcValEl = document.getElementById('focusBtcVal');
  const btcPctEl = document.getElementById('focusBtcPct');
  const takedownSumEl = document.getElementById('focusTakedownSummary');
  const takedownBarEl = document.getElementById('focusTakedownBar');
  const stopVsMedEl = document.getElementById('focusStopVsMed');
  const allocHighEl = document.getElementById('focusAllocHigh');
  const askAiBtn = document.getElementById('btnAskAiTenor');

  if (codeEl) codeEl.textContent = `${stat.tenorCode} Benchmark Security`;
  if (issueEl) issueEl.textContent = stat.isReopening ? 'REOPENING' : 'NEW ISSUE';
  if (qualityEl) {
    qualityEl.className = `quality-badge ${stat.quality === 'STRONG' ? 'strong' : (stat.quality === 'SOFT' ? 'soft' : 'inline')}`;
    qualityEl.textContent = `${stat.quality} (${stat.summary})`;
  }
  if (yieldEl) yieldEl.textContent = formatPct(stat.highYield);
  if (deltaEl) {
    deltaEl.textContent = formatBp(stat.deltaHighYieldBp);
    deltaEl.className = `focus-delta num ${stat.deltaHighYieldBp > 0 ? 'text-up' : (stat.deltaHighYieldBp < 0 ? 'text-down' : '')}`;
  }
  if (btcValEl) btcValEl.textContent = stat.bidToCover !== null ? `${stat.bidToCover.toFixed(2)}x` : '—';
  if (btcPctEl) {
    const pct = stat.btcPercentile !== null ? Math.round(stat.btcPercentile) : '—';
    btcPctEl.textContent = `${pct}th percentile vs norm (${stat.trailingMeanBtc?.toFixed(2)}x)`;
  }
  if (takedownSumEl && stat.shares) {
    takedownSumEl.textContent = `Ind: ${stat.shares.indirectPct?.toFixed(1)}% · Dir: ${stat.shares.directPct?.toFixed(1)}% · Dlr: ${stat.shares.dealerPct?.toFixed(1)}%`;
  }
  if (takedownBarEl && stat.shares) {
    const ind = stat.shares.indirectPct || 0;
    const dir = stat.shares.directPct || 0;
    const dlr = stat.shares.dealerPct || 0;
    takedownBarEl.innerHTML = `
      <div class="takedown-bar-seg indirect" style="width: ${ind}%;" title="Indirect ${ind.toFixed(1)}%"></div>
      <div class="takedown-bar-seg direct" style="width: ${dir}%;" title="Direct ${dir.toFixed(1)}%"></div>
      <div class="takedown-bar-seg dealer" style="width: ${dlr}%;" title="Primary Dealer ${dlr.toFixed(1)}%"></div>
    `;
  }
  if (stopVsMedEl) stopVsMedEl.textContent = formatBp(stat.stopVsMedianBp);
  if (allocHighEl) allocHighEl.textContent = stat.allocationAtHighPct !== null ? `${stat.allocationAtHighPct.toFixed(1)}% alloc at high` : '—';
  
  if (askAiBtn) {
    askAiBtn.setAttribute('data-ask-ai', `Analyze the latest ${stat.tenorCode} Treasury auction telemetry, demand shares, and quality rating in depth.`);
  }
}

function renderActiveTenorDetails() {
  const stat = state.tenorStatsMap[state.activeTenor];
  const titleEl = document.getElementById('activeTenorTitle');
  const btcMeanEl = document.getElementById('activeTenorBtcMean');
  const demandTabTitle = document.getElementById('demandTabTitle');
  const demandTabBtcNorm = document.getElementById('demandTabBtcNorm');
  const heatStripEl = document.getElementById('activeTenorHeatStrip');
  const btnAskAiDemand = document.getElementById('btnAskAiDemandTab');

  if (titleEl) titleEl.textContent = `${state.activeTenor} Demand Dynamics`;
  if (demandTabTitle) demandTabTitle.textContent = `${state.activeTenor} Demand Dynamics & Heatmap`;
  
  if (stat) {
    if (btcMeanEl && stat.trailingMeanBtc !== null) {
      btcMeanEl.textContent = `Trailing 20 Norm: ${stat.trailingMeanBtc.toFixed(2)}x BTC`;
    }
    if (demandTabBtcNorm && stat.trailingMeanBtc !== null) {
      demandTabBtcNorm.textContent = `Trailing 20 Norm: ${stat.trailingMeanBtc.toFixed(2)}x BTC`;
    }
    if (btnAskAiDemand) {
      btnAskAiDemand.setAttribute('data-ask-ai', `Analyze ${state.activeTenor} demand dynamics, dealer absorption, and quality rating.`);
    }
  }

  // Render Heat Strip for last 14 auctions of active tenor
  if (heatStripEl) {
    const auctions = state.nominalAuctions
      .filter(a => getTenorCode(a) === state.activeTenor)
      .sort((a, b) => b.auction_date.localeCompare(a.auction_date))
      .slice(0, 14);

    const allBtcs = auctions.map(a => parseNum(a.bid_to_cover_ratio));
    const allDealers = auctions.map(a => calculateTakedownShares(a).dealerPct);

    const cellsHtml = auctions.map(a => {
      const btc = parseNum(a.bid_to_cover_ratio);
      const btcPct = calculatePercentileRank(btc, allBtcs);
      const shares = calculateTakedownShares(a);
      const dlrPct = calculatePercentileRank(shares.dealerPct, allDealers);
      const quality = evaluateAuctionQuality(btcPct, dlrPct);
      const stopVsMed = calculateStopVsMedianBps(a);

      const qClass = quality === 'STRONG' ? 'cell-strong' : (quality === 'SOFT' ? 'cell-soft' : 'cell-inline');

      return `
        <div class="heat-cell ${qClass}" title="${a.auction_date}: BTC ${btc !== null ? btc.toFixed(2) : '—'}x (${Math.round(btcPct || 0)}th pct), Dealer ${shares.dealerPct !== null ? shares.dealerPct.toFixed(1) : '—'}%, Stop vs Med ${formatBp(stopVsMed, 1)}">
          <div class="hc-date num">${formatShortDate(a.auction_date)}</div>
          <div class="hc-btc num">${btc !== null ? `${btc.toFixed(2)}x` : '—'}</div>
          <div class="hc-dlr num">${shares.dealerPct !== null ? `${shares.dealerPct.toFixed(0)}% dlr` : '—'}</div>
          <div class="hc-q">${quality === 'STRONG' ? '▲ Strong' : (quality === 'SOFT' ? '▼ Soft' : '▬ In Line')}</div>
        </div>
      `;
    }).join('');

    heatStripEl.innerHTML = cellsHtml;
  }

  // Update focused card
  renderFocusedTenorCard();
}

function renderHeadlineStrip() {
  const container = document.getElementById('headlineStrip');
  if (!container) return;

  const html = BENCHMARK_CODES.map(code => {
    const stat = state.tenorStatsMap[code];
    if (!stat) return '';
    const qClass = stat.quality === 'STRONG' ? 'is-strong' : (stat.quality === 'SOFT' ? 'is-soft' : 'is-inline');
    const qSymbol = stat.quality === 'STRONG' ? '▲' : (stat.quality === 'SOFT' ? '▼' : '▬');
    return `
      <div class="headline-card ${qClass}" data-tenor="${code}">
        <div class="headline-badge">${stat.tenorCode} <span class="q-symbol">${qSymbol}</span> ${stat.quality}</div>
        <div class="headline-summary">${stat.summary}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// =========================================================================
// TAB 2: CURVE & SPREADS RENDERERS
// =========================================================================

function renderSpreadsTable() {
  const container = document.getElementById('spreadsTableBody');
  if (!container) return;

  const html = state.spreads.map(sp => {
    const isInverted = sp.spreadBp !== null && sp.spreadBp < 0;
    const spreadClass = `num ${isInverted ? 'inverted' : ''}`;

    return `
      <tr>
        <td class="sp-name"><strong>${sp.name}</strong></td>
        <td class="${spreadClass}">${formatBp(sp.spreadBp, 1)}</td>
        <td class="num">${sp.shortYield !== null ? sp.shortYield.toFixed(3) : '—'}% <span class="dt-sub">(${formatShortDate(sp.shortDate)})</span></td>
        <td class="num">${sp.longYield !== null ? sp.longYield.toFixed(3) : '—'}% <span class="dt-sub">(${formatShortDate(sp.longDate)})</span></td>
      </tr>
    `;
  }).join('');

  container.innerHTML = html;

  // Update curve insight text
  const insightEl = document.getElementById('curveInsightText');
  const s2s10 = state.spreads.find(s => s.name === '2s10s');
  if (insightEl && s2s10) {
    if (s2s10.spreadBp < 0) {
      insightEl.innerHTML = `<strong>Curve Inversion Detected:</strong> The benchmark <strong>2s10s spread is inverted at ${s2s10.spreadBp.toFixed(1)} bp</strong>. Historically, sustained inversion reflects tight monetary conditions and anticipation of future rate cuts.`;
    } else {
      insightEl.innerHTML = `<strong>Normal Term Structure:</strong> The <strong>2s10s spread is positive at +${s2s10.spreadBp.toFixed(1)} bp</strong>, reflecting typical upward-sloping term premium and duration compensation.`;
    }
  }
}

// =========================================================================
// TAB 3: DEMAND DYNAMICS TAB
// =========================================================================

function renderDemandDynamicsTab() {
  const navContainer = document.getElementById('demandTenorNav');
  if (!navContainer) return;

  navContainer.querySelectorAll('.tenor-pill-btn').forEach(btn => {
    const code = btn.getAttribute('data-tenor');
    btn.classList.toggle('is-active', code === state.activeTenor);
    btn.onclick = () => {
      state.activeTenor = code;
      renderDemandDynamicsTab();
      renderTenorPillsAndFocusCard();
      renderActiveTenorDetails();
      renderActiveTakedownChart(state.activeTenor);
    };
  });
}

// =========================================================================
// TAB 4: HISTORICAL LEDGER RENDERERS
// =========================================================================

function renderLedgerTable() {
  const tbody = document.getElementById('ledgerTableBody');
  const countEl = document.getElementById('ledgerCount');
  const paginationEl = document.getElementById('ledgerPagination');
  if (!tbody) return;

  let filtered = [...state.nominalAuctions];

  if (state.ledgerFilters.tenor !== 'ALL') {
    filtered = filtered.filter(a => getTenorCode(a) === state.ledgerFilters.tenor);
  }

  if (state.ledgerFilters.reopening !== 'ALL') {
    const isReopen = state.ledgerFilters.reopening === 'REOPEN';
    filtered = filtered.filter(a => (String(a.reopening || '').toLowerCase() === 'yes') === isReopen);
  }

  if (state.ledgerFilters.search.trim()) {
    const query = state.ledgerFilters.search.trim().toLowerCase();
    filtered = filtered.filter(a => {
      const cusip = String(a.cusip || '').toLowerCase();
      const date = String(a.auction_date || '').toLowerCase();
      const term = String(a.original_security_term || a.security_term || '').toLowerCase();
      return cusip.includes(query) || date.includes(query) || term.includes(query);
    });
  }

  state.filteredLedger = filtered;
  if (countEl) countEl.textContent = `${filtered.length} Auctions`;

  const { page, pageSize } = state.ledgerFilters;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  state.ledgerFilters.page = currentPage;

  const startIdx = (currentPage - 1) * pageSize;
  const pagedRows = filtered.slice(startIdx, startIdx + pageSize);

  const tenorPriorMap = new Map();
  for (let i = 0; i < filtered.length; i++) {
    const row = filtered[i];
    const code = getTenorCode(row);
    for (let j = i + 1; j < filtered.length; j++) {
      if (getTenorCode(filtered[j]) === code) {
        tenorPriorMap.set(row.cusip + '_' + row.auction_date, filtered[j]);
        break;
      }
    }
  }

  const rowsHtml = pagedRows.map(row => {
    const tenorCode = getTenorCode(row);
    const isReopen = String(row.reopening || '').toLowerCase() === 'yes';
    const highYield = parseNum(row.high_yield);
    
    const priorRow = tenorPriorMap.get(row.cusip + '_' + row.auction_date);
    const priorYield = priorRow ? parseNum(priorRow.high_yield) : null;
    const deltaBp = (highYield !== null && priorYield !== null) ? (highYield - priorYield) * 100 : null;

    const shares = calculateTakedownShares(row);
    const btc = parseNum(row.bid_to_cover_ratio);
    const stopVsMed = calculateStopVsMedianBps(row);
    const allocHigh = getAllocationAtHighPct(row);
    const offeringAmt = parseNum(row.offering_amt);

    const isSelected = state.selectedAuction && state.selectedAuction.cusip === row.cusip && state.selectedAuction.auction_date === row.auction_date;

    return `
      <tr class="ledger-row ${isSelected ? 'is-selected' : ''}" data-cusip="${row.cusip}" data-date="${row.auction_date}">
        <td class="num mono">${row.auction_date}</td>
        <td><span class="ledger-tenor-badge">${tenorCode || row.security_term}</span></td>
        <td><span class="ledger-type-badge ${isReopen ? 'reopen' : 'new'}">${isReopen ? 'Reopen' : 'New'}</span></td>
        <td class="num text-right font-bold">${formatPct(highYield)}</td>
        <td class="num text-right ${deltaBp > 0 ? 'text-up' : (deltaBp < 0 ? 'text-down' : '')}">${formatBp(deltaBp, 1)}</td>
        <td class="num text-right font-medium">${btc !== null ? `${btc.toFixed(2)}x` : '—'}</td>
        <td class="num text-right">${shares.indirectPct !== null ? `${shares.indirectPct.toFixed(1)}%` : '—'}</td>
        <td class="num text-right">${shares.dealerPct !== null ? `${shares.dealerPct.toFixed(1)}%` : '—'}</td>
        <td class="num text-right">${stopVsMed !== null ? `${stopVsMed.toFixed(1)} bp` : '—'}</td>
        <td class="num text-right">${allocHigh !== null ? `${allocHigh.toFixed(0)}%` : '—'}</td>
        <td class="num text-right">${formatBillions(offeringAmt)}</td>
        <td class="num text-muted">${formatShortDate(row.issue_date)}</td>
      </tr>
    `;
  }).join('');

  tbody.innerHTML = rowsHtml;

  tbody.querySelectorAll('.ledger-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const cusip = tr.getAttribute('data-cusip');
      const date = tr.getAttribute('data-date');
      const match = state.nominalAuctions.find(a => a.cusip === cusip && a.auction_date === date);
      if (match) {
        state.selectedAuction = match;
        renderLedgerTable();
        openInspectorDrawer(match);
      }
    });
  });

  if (paginationEl) {
    paginationEl.innerHTML = `
      <button class="pg-btn" id="pgPrev" ${currentPage <= 1 ? 'disabled' : ''}>← Prev</button>
      <span class="pg-info num">Page ${currentPage} of ${totalPages}</span>
      <button class="pg-btn" id="pgNext" ${currentPage >= totalPages ? 'disabled' : ''}>Next →</button>
    `;

    document.getElementById('pgPrev')?.addEventListener('click', () => {
      if (state.ledgerFilters.page > 1) {
        state.ledgerFilters.page--;
        renderLedgerTable();
      }
    });
    document.getElementById('pgNext')?.addEventListener('click', () => {
      if (state.ledgerFilters.page < totalPages) {
        state.ledgerFilters.page++;
        renderLedgerTable();
      }
    });
  }
}

// Side Drawer Inspector
export function openInspectorDrawer(auction) {
  const drawer = document.getElementById('inspectorDrawer');
  const backdrop = document.getElementById('inspectorBackdrop');
  if (!drawer || !backdrop) return;

  const shares = calculateTakedownShares(auction);
  const stopVsMed = calculateStopVsMedianBps(auction);
  const allocHigh = getAllocationAtHighPct(auction);
  const nonComp = parseNum(auction.noncomp_accepted);
  const soma = parseNum(auction.soma_accepted);
  const totalAccepted = parseNum(auction.total_accepted);
  const totalTendered = parseNum(auction.total_tendered);
  const btc = parseNum(auction.bid_to_cover_ratio);
  const highYield = parseNum(auction.high_yield);
  const avgYield = parseNum(auction.avg_med_yield);
  const lowYield = parseNum(auction.low_yield);
  const coupon = parseNum(auction.int_rate);
  const price = parseNum(auction.price_per100);

  const compPdf = auction.pdf_filenm_comp_results ? `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${auction.pdf_filenm_comp_results.substring(0, 4)}/${auction.pdf_filenm_comp_results}` : null;

  document.getElementById('inspTitle').textContent = `${getTenorCode(auction) || auction.security_term} Auction Telemetry`;
  document.getElementById('inspCusip').textContent = auction.cusip || '—';
  document.getElementById('inspAuctionDate').textContent = formatDate(auction.auction_date);
  document.getElementById('inspIssueDate').textContent = formatDate(auction.issue_date);
  document.getElementById('inspMaturityDate').textContent = formatDate(auction.maturity_date);

  document.getElementById('inspHighYield').textContent = formatPct(highYield);
  document.getElementById('inspAvgYield').textContent = formatPct(avgYield);
  document.getElementById('inspLowYield').textContent = formatPct(lowYield);
  document.getElementById('inspStopVsMed').textContent = formatBp(stopVsMed);
  document.getElementById('inspAllocHigh').textContent = allocHigh !== null ? `${allocHigh.toFixed(2)}%` : '—';
  document.getElementById('inspCoupon').textContent = formatPct(coupon);
  document.getElementById('inspPrice').textContent = price !== null ? `$${price.toFixed(3)}` : '—';

  document.getElementById('inspBtc').textContent = btc !== null ? `${btc.toFixed(2)}x` : '—';
  document.getElementById('inspOfferingAmt').textContent = formatBillions(parseNum(auction.offering_amt));
  document.getElementById('inspTendered').textContent = formatBillions(totalTendered);
  document.getElementById('inspTotalAccepted').textContent = formatBillions(totalAccepted);

  document.getElementById('inspIndirect').textContent = shares.indirectPct !== null ? `${shares.indirectPct.toFixed(1)}% (${formatBillions(parseNum(auction.indirect_bidder_accepted))})` : '—';
  document.getElementById('inspDirect').textContent = shares.directPct !== null ? `${shares.directPct.toFixed(1)}% (${formatBillions(parseNum(auction.direct_bidder_accepted))})` : '—';
  document.getElementById('inspDealer').textContent = shares.dealerPct !== null ? `${shares.dealerPct.toFixed(1)}% (${formatBillions(parseNum(auction.primary_dealer_accepted))})` : '—';
  document.getElementById('inspNonComp').textContent = formatBillions(nonComp);
  document.getElementById('inspSoma').textContent = formatBillions(soma);

  const compPdfBtn = document.getElementById('inspCompPdfBtn');
  if (compPdfBtn) {
    if (compPdf) {
      compPdfBtn.href = compPdf;
      compPdfBtn.classList.remove('is-hidden');
    } else {
      compPdfBtn.classList.add('is-hidden');
    }
  }

  // Connect drawer's Ask AI button
  const inspAskAiBtn = document.getElementById('btnInspAskAi');
  if (inspAskAiBtn) {
    inspAskAiBtn.onclick = () => {
      closeInspectorDrawer();
      chatbot.open();
      chatbot.ask(`Explain the ${getTenorCode(auction) || auction.security_term} auction from ${auction.auction_date} (CUSIP: ${auction.cusip}) in depth.`);
    };
  }

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
}

export function closeInspectorDrawer() {
  document.getElementById('inspectorDrawer')?.classList.remove('is-open');
  document.getElementById('inspectorBackdrop')?.classList.remove('is-open');
}

// =========================================================================
// TAB 5: UPCOMING SCHEDULE RENDERER
// =========================================================================

function renderUpcomingTimeline() {
  const container = document.getElementById('upcomingTimelineList');
  if (!container) return;

  if (!state.upcomingAuctions || state.upcomingAuctions.length === 0) {
    container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--ff-text-3);">No future auctions scheduled in Fiscal Data feed.</div>';
    return;
  }

  const nextAuctions = state.upcomingAuctions.slice(0, 14);

  const html = nextAuctions.map(item => {
    const countdown = getCountdownToET(item.auction_date, item.security_type === 'FRN' ? '11:30' : '13:00');
    const isReopen = String(item.reopening || '').toLowerCase() === 'yes';

    return `
      <div class="upcoming-item">
        <div class="up-time-col">
          <span class="up-date num">${formatShortDate(item.auction_date)}</span>
          <span class="up-countdown num">${countdown}</span>
        </div>
        <div class="up-details-col">
          <div class="up-title-row">
            <span class="up-tenor"><strong>${item.tenorCode || item.security_term}</strong></span>
            <span class="up-badge ${isReopen ? 'reopen' : 'new'}">${isReopen ? 'REOPEN' : 'NEW'}</span>
          </div>
          <div class="up-sub-row">
            <span class="up-amt">${item.offeringDisplay}</span>
            <span>·</span>
            <span class="up-cusip mono">CUSIP: ${item.cusip || 'Pending'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// =========================================================================
// CSV EXPORT & CLOCK
// =========================================================================

function exportLedgerToCsv() {
  if (!state.nominalAuctions || state.nominalAuctions.length === 0) return;

  const headers = [
    'Auction Date',
    'Tenor',
    'Type',
    'CUSIP',
    'High Yield (%)',
    'Median Yield (%)',
    'Stop vs Median (bp)',
    'Allocation at High (%)',
    'Bid-to-Cover',
    'Indirect (%)',
    'Direct (%)',
    'Primary Dealer (%)',
    'Offering Amount ($)',
    'Competitive Accepted ($)',
    'Non-Competitive Accepted ($)',
    'SOMA Accepted ($)',
    'Settles (Issue Date)',
    'Maturity Date'
  ];

  const rows = state.nominalAuctions.map(a => {
    const shares = calculateTakedownShares(a);
    const stopVsMed = calculateStopVsMedianBps(a);
    const allocHigh = getAllocationAtHighPct(a);
    const isReopen = String(a.reopening || '').toLowerCase() === 'yes';

    return [
      a.auction_date || '',
      getTenorCode(a) || a.security_term || '',
      isReopen ? 'Reopening' : 'New Issue',
      a.cusip || '',
      a.high_yield || '',
      a.avg_med_yield || '',
      stopVsMed !== null ? stopVsMed.toFixed(2) : '',
      allocHigh !== null ? allocHigh.toFixed(2) : '',
      a.bid_to_cover_ratio || '',
      shares.indirectPct !== null ? shares.indirectPct.toFixed(2) : '',
      shares.directPct !== null ? shares.directPct.toFixed(2) : '',
      shares.dealerPct !== null ? shares.dealerPct.toFixed(2) : '',
      a.offering_amt || '',
      a.comp_accepted || '',
      a.noncomp_accepted || '',
      a.soma_accepted || '',
      a.issue_date || '',
      a.maturity_date || ''
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Futures_First_US_Treasury_Auctions_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function initClock() {
  const clockEl = document.getElementById('clockET');
  function update() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(now) + ' ET';
  }
  update();
  setInterval(update, 1000);
}

// =========================================================================
// APP INITIALIZATION
// =========================================================================

export async function initApp() {
  initTheme();
  initClock();
  chatbot.init();
  setupEventListeners();

  try {
    const [auctionsRes, upcomingRes, wiData] = await Promise.all([
      loadAuctionsData(),
      loadUpcomingData(),
      loadWhenIssuedData()
    ]);

    state.rawAuctions = auctionsRes.raw;
    state.nominalAuctions = auctionsRes.nominals;
    state.dataSource = auctionsRes.source;
    state.dataTimestamp = auctionsRes.timestamp;
    state.whenIssuedMap = wiData || {};
    state.upcomingAuctions = processUpcomingAuctions(upcomingRes.raw);
    state.error = null;

    // Compute Trailing 20 stats per benchmark tenor
    for (const code of BENCHMARK_CODES) {
      const list = state.nominalAuctions
        .filter(a => getTenorCode(a) === code)
        .sort((a, b) => b.auction_date.localeCompare(a.auction_date));
      state.tenorStatsMap[code] = computeTenorStats(list, code, 20);
    }

    // Compute benchmark spreads
    state.spreads = computeSpreads(state.tenorStatsMap);

    // Default selected auction
    if (!state.selectedAuction && state.nominalAuctions.length > 0) {
      const default10Y = state.nominalAuctions.find(a => getTenorCode(a) === '10Y');
      state.selectedAuction = default10Y || state.nominalAuctions[0];
    }

    // Render All Views
    renderHeaderStatus();
    renderNextAuctionLine();
    renderOverviewKPIs();
    renderTenorPillsAndFocusCard();
    renderActiveTenorDetails();
    renderActiveTakedownChart(state.activeTenor);
    renderYieldCurveChart();
    renderSpreadsTable();
    renderHeadlineStrip();
    renderUpcomingTimeline();
    renderLedgerTable();

  } catch (err) {
    console.error('App init failed:', err);
    state.error = `Failed to load Treasury auction data: ${err.message}`;
    renderHeaderStatus();
  }
}

function setupEventListeners() {
  // Sidebar navigation tabs
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab) switchTab(tab);
    });
  });

  // Direct tab link buttons from Overview panels
  document.querySelectorAll('[data-nav-target]').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav-target');
      if (target) switchTab(target);
    });
  });

  // Brand link resets to overview
  document.getElementById('brandHomeLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    switchTab('overview');
  });

  // Mobile menu toggle
  document.getElementById('btnMobileMenu')?.addEventListener('click', () => {
    document.getElementById('workspace-nav')?.classList.toggle('mobile-open');
  });

  // Theme toggle
  document.getElementById('btnThemeToggle')?.addEventListener('click', toggleTheme);

  // Sync button
  document.getElementById('btnSync')?.addEventListener('click', () => initApp());
  document.getElementById('btnRetry')?.addEventListener('click', () => initApp());

  // CSV Export
  document.getElementById('btnExport')?.addEventListener('click', exportLedgerToCsv);

  // Chatbot floating triggers
  document.getElementById('btnOpenChat')?.addEventListener('click', () => chatbot.toggle());
  document.getElementById('chatFloatingBtn')?.addEventListener('click', () => chatbot.open());

  // Inspector Drawer close
  document.getElementById('btnInspClose')?.addEventListener('click', closeInspectorDrawer);
  document.getElementById('inspectorBackdrop')?.addEventListener('click', closeInspectorDrawer);

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeInspectorDrawer();
      chatbot.close();
      document.getElementById('apiGuideModal')?.classList.remove('is-open');
      document.getElementById('workspace-nav')?.classList.remove('mobile-open');
    }
  });

  // API Guide Modal
  const apiGuideModal = document.getElementById('apiGuideModal');
  document.getElementById('btnApiGuide')?.addEventListener('click', () => {
    apiGuideModal?.classList.add('is-open');
  });
  document.getElementById('btnApiGuideClose')?.addEventListener('click', () => {
    apiGuideModal?.classList.remove('is-open');
  });
  document.getElementById('apiGuideBackdrop')?.addEventListener('click', () => {
    apiGuideModal?.classList.remove('is-open');
  });

  // Ledger Search
  document.getElementById('ledgerSearchInput')?.addEventListener('input', (e) => {
    state.ledgerFilters.search = e.target.value;
    state.ledgerFilters.page = 1;
    renderLedgerTable();
  });

  // Ledger Tenor Filter
  document.getElementById('ledgerTenorSelect')?.addEventListener('change', (e) => {
    state.ledgerFilters.tenor = e.target.value;
    state.ledgerFilters.page = 1;
    renderLedgerTable();
  });

  // Ledger Reopening Filter
  document.getElementById('ledgerReopenSelect')?.addEventListener('change', (e) => {
    state.ledgerFilters.reopening = e.target.value;
    state.ledgerFilters.page = 1;
    renderLedgerTable();
  });
}

// Auto-run when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
