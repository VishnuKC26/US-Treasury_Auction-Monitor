/**
 * client.js - Institutional US Treasury Auction Monitor Terminal
 * Vanilla ES Module orchestrating data loading, pure analytics, Chart.js, and accessible UI.
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
import { renderActiveTakedownChart, renderYieldCurveChart } from './charts.js';

// =========================================================================
// FORMATTERS
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
  // Compute target timestamp in America/New_York
  const [tHours, tMins] = targetTimeStr.split(':').map(Number);
  const now = new Date();
  
  // Format now in NY
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

// Generate simple inline SVG sparkline
function renderSparklineSvg(points) {
  if (!points || points.length < 2) return '';
  const valid = points.filter(p => p.highYield !== null);
  if (valid.length < 2) return '';

  const yields = valid.map(p => p.highYield);
  const min = Math.min(...yields);
  const max = Math.max(...yields);
  const range = max - min || 1;

  const width = 80;
  const height = 24;
  const pad = 3;

  const coords = valid.map((p, i) => {
    const x = pad + (i / (valid.length - 1)) * (width - 2 * pad);
    const y = height - pad - ((p.highYield - min) / range) * (height - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${coords.join(' L ')}`;
  const lastCoord = coords[coords.length - 1].split(',');

  return `
    <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <path d="${pathD}" fill="none" stroke="#475569" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${lastCoord[0]}" cy="${lastCoord[1]}" r="2.2" fill="#0f172a" />
    </svg>
  `;
}

// =========================================================================
// UI RENDERERS
// =========================================================================

function renderHeaderStatus() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const asOfTime = document.getElementById('asOfTime');
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
      statusText.textContent = state.dataSource === 'live-proxy' ? 'LIVE PROXY' : 'LIVE REST';
    } else if (state.dataSource === 'stale-sample') {
      statusDot.className = 'status-dot stale';
      statusText.textContent = 'OFFLINE SAMPLE';
    } else {
      statusDot.className = 'status-dot connecting';
      statusText.textContent = 'CONNECTING';
    }
  }

  if (asOfTime && state.dataTimestamp) {
    asOfTime.textContent = state.dataTimestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  }
}

function renderNextAuctionLine() {
  const nextTextEl = document.getElementById('nextAuctionText');
  if (!nextTextEl) return;

  if (!state.upcomingAuctions || state.upcomingAuctions.length === 0) {
    nextTextEl.textContent = 'No upcoming auctions scheduled';
    return;
  }

  // Find soonest Note/Bond
  const soonest = state.upcomingAuctions.find(a => ['Note', 'Bond'].includes(a.security_type)) || state.upcomingAuctions[0];
  const isReopen = String(soonest.reopening || '').toLowerCase() === 'yes';
  const issueLabel = isReopen ? 'reopening' : 'new issue';
  const tenor = soonest.tenorCode || soonest.security_term;
  
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Format date e.g. "Wed 21 Oct"
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
    annFormatted = `size announced ${weekdays[dt.getDay()]} ${dt.getDate()} ${months[dt.getMonth()]}`;
  } else {
    annFormatted = 'size pending announcement';
  }

  nextTextEl.innerHTML = `<strong>${tenor} ${issueLabel}</strong> · ${dateFormatted} 1:00 pm ET · ${annFormatted}`;
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

function renderScorecards() {
  const container = document.getElementById('scorecardsGrid');
  if (!container) return;

  const html = BENCHMARK_CODES.map(code => {
    const stat = state.tenorStatsMap[code];
    const isActive = state.activeTenor === code ? 'is-active' : '';

    if (!stat) {
      return `
        <div class="tenor-card ${isActive}" data-tenor="${code}">
          <div class="tc-top">
            <span class="tc-tenor">${code}</span>
          </div>
          <div class="tc-yield">—</div>
        </div>
      `;
    }

    const qClass = stat.quality === 'STRONG' ? 'badge-strong' : (stat.quality === 'SOFT' ? 'badge-soft' : 'badge-inline');
    const qSymbol = stat.quality === 'STRONG' ? '▲' : (stat.quality === 'SOFT' ? '▼' : '▬');
    
    // Delta bp styling
    let deltaClass = 'tc-delta neutral';
    let deltaSym = '▬';
    if (stat.deltaHighYieldBp !== null) {
      if (stat.deltaHighYieldBp > 0) {
        deltaClass = 'tc-delta up';
        deltaSym = '▲';
      } else if (stat.deltaHighYieldBp < 0) {
        deltaClass = 'tc-delta down';
        deltaSym = '▼';
      }
    }

    // Dealer vs median text
    let dealerText = '—';
    if (stat.dealerPct !== null) {
      const diff = stat.dealerVsMedianDelta !== null ? `${stat.dealerVsMedianDelta > 0 ? '+' : ''}${stat.dealerVsMedianDelta.toFixed(1)} pp vs med` : '';
      dealerText = `${stat.dealerPct.toFixed(1)}% <span class="tc-sub-stat">(${diff})</span>`;
    }

    const btcPctText = stat.btcPercentile !== null ? `${Math.round(stat.btcPercentile)}th pct` : '—';
    const issueBadge = stat.isReopening ? 'REOPEN' : 'NEW';

    return `
      <button class="tenor-card ${isActive}" data-tenor="${code}" aria-pressed="${state.activeTenor === code}">
        <div class="tc-header">
          <div class="tc-title-wrap">
            <span class="tc-code">${stat.tenorCode}</span>
            <span class="tc-issue-tag">${issueBadge}</span>
          </div>
          <span class="tc-quality ${qClass}">${qSymbol} ${stat.quality}</span>
        </div>

        <div class="tc-yield-row">
          <span class="tc-yield num">${formatPct(stat.highYield)}</span>
          <span class="${deltaClass} num">${deltaSym} ${formatBp(stat.deltaHighYieldBp, 1, false)}</span>
        </div>

        <div class="tc-metrics-grid">
          <div class="tc-metric">
            <span class="tc-lbl">Bid-to-Cover</span>
            <span class="tc-val num">${stat.bidToCover !== null ? `${stat.bidToCover.toFixed(2)}x` : '—'} <span class="tc-pct">${btcPctText}</span></span>
          </div>
          <div class="tc-metric">
            <span class="tc-lbl">Dealer Take</span>
            <span class="tc-val num">${dealerText}</span>
          </div>
        </div>

        <div class="tc-footer">
          <span class="tc-date num">${formatShortDate(stat.auctionDate)}</span>
          <div class="tc-spark">${renderSparklineSvg(stat.sparklineData)}</div>
        </div>
      </button>
    `;
  }).join('');

  container.innerHTML = html;

  // Add click listeners
  container.querySelectorAll('.tenor-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const tenor = btn.getAttribute('data-tenor');
      if (tenor && tenor !== state.activeTenor) {
        state.activeTenor = tenor;
        renderScorecards();
        renderActiveTenorDetails();
        renderActiveTakedownChart(state.activeTenor);
      }
    });
  });
}

function renderActiveTenorDetails() {
  const stat = state.tenorStatsMap[state.activeTenor];
  const titleEl = document.getElementById('activeTenorTitle');
  const badgeEl = document.getElementById('activeTenorBadge');
  const btcMeanEl = document.getElementById('activeTenorBtcMean');
  const heatStripEl = document.getElementById('activeTenorHeatStrip');

  if (titleEl) titleEl.textContent = `${state.activeTenor} Demand Dynamics`;
  
  if (stat) {
    if (badgeEl) {
      badgeEl.className = `quality-badge ${stat.quality === 'STRONG' ? 'strong' : (stat.quality === 'SOFT' ? 'soft' : 'inline')}`;
      badgeEl.textContent = `${stat.quality} (${stat.summary})`;
    }
    if (btcMeanEl && stat.trailingMeanBtc !== null) {
      btcMeanEl.textContent = `Trailing 20 Norm: ${stat.trailingMeanBtc.toFixed(2)}x BTC`;
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
}

function renderSpreadsTable() {
  const container = document.getElementById('spreadsTableBody');
  if (!container) return;

  const html = state.spreads.map(sp => {
    let spreadClass = 'num';
    if (sp.spreadBp !== null) {
      if (sp.spreadBp < 0) spreadClass += ' inverted';
    }

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
}

function renderUpcomingTimeline() {
  const container = document.getElementById('upcomingTimelineList');
  if (!container) return;

  if (!state.upcomingAuctions || state.upcomingAuctions.length === 0) {
    container.innerHTML = '<div class="empty-state">No future auctions scheduled in Fiscal Data feed.</div>';
    return;
  }

  // Filter to next 14 auctions
  const nextAuctions = state.upcomingAuctions.slice(0, 10);

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
            <span class="up-cusip mono">${item.cusip || 'Pending'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

function renderLedgerTable() {
  const tbody = document.getElementById('ledgerTableBody');
  const countEl = document.getElementById('ledgerCount');
  const paginationEl = document.getElementById('ledgerPagination');
  if (!tbody) return;

  // Filter nominalAuctions
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

  // Pagination
  const { page, pageSize } = state.ledgerFilters;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  state.ledgerFilters.page = currentPage;

  const startIdx = (currentPage - 1) * pageSize;
  const pagedRows = filtered.slice(startIdx, startIdx + pageSize);

  // Compute prior auction map for delta high yield
  const tenorPriorMap = new Map();
  for (let i = 0; i < filtered.length; i++) {
    const row = filtered[i];
    const code = getTenorCode(row);
    // Find next auction of same tenor in chronological descending order
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
    
    // Prior delta
    const priorRow = tenorPriorMap.get(row.cusip + '_' + row.auction_date);
    const priorYield = priorRow ? parseNum(priorRow.high_yield) : null;
    const deltaBp = (highYield !== null && priorYield !== null) ? (highYield - priorYield) * 100 : null;

    // Takedown & Quality
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

  // Add click handler to select auction
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

  // Render pagination buttons
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
  const compAccepted = parseNum(auction.comp_accepted);
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
  const annPdf = auction.pdf_filenm_announcemt ? `https://www.treasurydirect.gov/instit/annceresult/press/preanre/${auction.pdf_filenm_announcemt.substring(0, 4)}/${auction.pdf_filenm_announcemt}` : null;

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

  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
}

export function closeInspectorDrawer() {
  document.getElementById('inspectorDrawer')?.classList.remove('is-open');
  document.getElementById('inspectorBackdrop')?.classList.remove('is-open');
}

// CSV Export
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
  link.setAttribute('download', `US_Treasury_Bond_Auctions_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Live ET Clock
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
// MAIN INITIALIZATION WORKFLOW
// =========================================================================

export async function initApp() {
  initClock();
  setupEventListeners();

  try {
    // 1. Fetch auctions, upcoming schedule, and optional WI data
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

    // 2. Compute Trailing 20 stats per benchmark tenor
    for (const code of BENCHMARK_CODES) {
      const list = state.nominalAuctions
        .filter(a => getTenorCode(a) === code)
        .sort((a, b) => b.auction_date.localeCompare(a.auction_date));
      state.tenorStatsMap[code] = computeTenorStats(list, code, 20);
    }

    // 3. Compute benchmark spreads
    state.spreads = computeSpreads(state.tenorStatsMap);

    // 4. Default selected auction to latest 10Y or latest nominal
    if (!state.selectedAuction && state.nominalAuctions.length > 0) {
      const default10Y = state.nominalAuctions.find(a => getTenorCode(a) === '10Y');
      state.selectedAuction = default10Y || state.nominalAuctions[0];
    }

    // 5. Render All Components
    renderHeaderStatus();
    renderNextAuctionLine();
    renderHeadlineStrip();
    renderScorecards();
    renderActiveTenorDetails();
    renderActiveTakedownChart(state.activeTenor);
    renderYieldCurveChart();
    renderSpreadsTable();
    renderUpcomingTimeline();
    renderLedgerTable();

  } catch (err) {
    console.error('App init failed:', err);
    state.error = `Failed to load Treasury auction data: ${err.message}`;
    renderHeaderStatus();
  }
}

function setupEventListeners() {
  // Sync button
  document.getElementById('btnSync')?.addEventListener('click', () => {
    initApp();
  });

  // Retry button
  document.getElementById('btnRetry')?.addEventListener('click', () => {
    initApp();
  });

  // CSV Export
  document.getElementById('btnExport')?.addEventListener('click', exportLedgerToCsv);

  // Inspector Drawer close
  document.getElementById('btnInspClose')?.addEventListener('click', closeInspectorDrawer);
  document.getElementById('inspectorBackdrop')?.addEventListener('click', closeInspectorDrawer);

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeInspectorDrawer();
      document.getElementById('apiGuideModal')?.classList.remove('is-open');
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
