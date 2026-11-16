/**
 * charts.js - Institutional Chart Visualizations
 * Styled with Institutional Design System Palette
 * Supports Light & Dark themes dynamically with Chart.js
 */

import { state } from './state.js';
import { calculateTakedownShares, getTenorCode } from './analytics.js';

// Allotment Palette
export const ALLOTMENT_COLORS = {
  indirect: '#2f64ae', // Series 1 (Navy / Blue)
  direct: '#13957f',   // Series 3 (Teal)
  dealer: '#d27805'    // Series 2 (Amber / Orange)
};

const FONT_SANS = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function isDarkMode() {
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

function getThemeColors() {
  const dark = isDarkMode();
  return {
    textColor: dark ? '#dbe3f1' : '#334155',
    mutedColor: dark ? '#8fa0c0' : '#64748b',
    gridColor: dark ? 'rgba(255, 255, 255, 0.08)' : '#e3e8f2',
    curveLatest: dark ? '#6bb1e0' : '#132247',
    curvePrior: dark ? '#4b5f8f' : '#8792a8',
    tooltipBg: dark ? '#0b1530' : '#132247'
  };
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    return `${months[m] || parts[1]} '${parts[0].slice(2)}`;
  }
  return dateStr;
}

function buildTakedownConfig(labels, indirectData, directData, dealerData, tc) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Indirect % (Foreign / Inst.)',
          data: indirectData,
          backgroundColor: ALLOTMENT_COLORS.indirect,
          stack: 'allotment',
          borderRadius: 4
        },
        {
          label: 'Direct % (Domestic Non-Dealer)',
          data: directData,
          backgroundColor: ALLOTMENT_COLORS.direct,
          stack: 'allotment',
          borderRadius: 4
        },
        {
          label: 'Primary Dealer % (Underwriter Absorption)',
          data: dealerData,
          backgroundColor: ALLOTMENT_COLORS.dealer,
          stack: 'allotment',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 12,
            boxHeight: 12,
            font: { family: FONT_SANS, size: 11.5, weight: '500' },
            color: tc.textColor
          }
        },
        title: {
          display: false
        },
        tooltip: {
          backgroundColor: tc.tooltipBg,
          titleFont: { family: FONT_MONO, size: 12 },
          bodyFont: { family: FONT_SANS, size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label(ctx) {
              return ` ${ctx.dataset.label.split(' (')[0]}: ${ctx.parsed.y.toFixed(1)}%`;
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: { family: FONT_MONO, size: 11 },
            color: tc.mutedColor
          }
        },
        y: {
          stacked: true,
          max: 100,
          min: 0,
          grid: { color: tc.gridColor },
          ticks: {
            stepSize: 20,
            font: { family: FONT_MONO, size: 11 },
            color: tc.mutedColor,
            callback: v => `${v}%`
          }
        }
      }
    }
  };
}

/**
 * Render or update the 100% stacked takedown bar chart for the active tenor.
 */
export function renderActiveTakedownChart(tenorCode) {
  if (!window.Chart) return;

  const tc = getThemeColors();
  const auctions = state.nominalAuctions
    .filter(a => getTenorCode(a) === tenorCode)
    .sort((a, b) => b.auction_date.localeCompare(a.auction_date))
    .slice(0, 14)
    .reverse();

  const labels = auctions.map(a => formatShortDate(a.auction_date));
  const indirectData = [];
  const directData = [];
  const dealerData = [];

  for (const a of auctions) {
    const shares = calculateTakedownShares(a);
    indirectData.push(shares.indirectPct !== null ? Number(shares.indirectPct.toFixed(1)) : 0);
    directData.push(shares.directPct !== null ? Number(shares.directPct.toFixed(1)) : 0);
    dealerData.push(shares.dealerPct !== null ? Number(shares.dealerPct.toFixed(1)) : 0);
  }

  // 1. Primary/Overview Canvas
  const canvas1 = document.getElementById('chartActiveTakedown');
  if (canvas1) {
    if (state.charts.activeTakedown) {
      const c = state.charts.activeTakedown;
      c.data.labels = labels;
      c.data.datasets[0].data = indirectData;
      c.data.datasets[1].data = directData;
      c.data.datasets[2].data = dealerData;
      c.options.scales.x.ticks.color = tc.mutedColor;
      c.options.scales.y.ticks.color = tc.mutedColor;
      c.options.scales.y.grid.color = tc.gridColor;
      c.options.plugins.legend.labels.color = tc.textColor;
      c.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
      c.update();
    } else {
      const ctx = canvas1.getContext('2d');
      state.charts.activeTakedown = new window.Chart(ctx, buildTakedownConfig(labels, indirectData, directData, dealerData, tc));
    }
  }

  // 2. Full Demand View Canvas
  const canvas2 = document.getElementById('chartDemandFull');
  if (canvas2) {
    if (state.charts.demandFull) {
      const c = state.charts.demandFull;
      c.data.labels = labels;
      c.data.datasets[0].data = indirectData;
      c.data.datasets[1].data = directData;
      c.data.datasets[2].data = dealerData;
      c.options.scales.x.ticks.color = tc.mutedColor;
      c.options.scales.y.ticks.color = tc.mutedColor;
      c.options.scales.y.grid.color = tc.gridColor;
      c.options.plugins.legend.labels.color = tc.textColor;
      c.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
      c.update();
    } else {
      const ctx = canvas2.getContext('2d');
      state.charts.demandFull = new window.Chart(ctx, buildTakedownConfig(labels, indirectData, directData, dealerData, tc));
    }
  }
}

function buildYieldCurveConfig(tenors, latestYields, latestDates, priorYields, priorDates, tc) {
  return {
    type: 'line',
    data: {
      labels: tenors,
      datasets: [
        {
          label: 'Latest Clearing Curve',
          data: latestYields,
          metaDates: latestDates,
          borderColor: tc.curveLatest,
          backgroundColor: tc.curveLatest,
          borderWidth: 2.8,
          tension: 0.25,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: tc.curveLatest,
          spanGaps: false
        },
        {
          label: 'Prior Auction Curve (~1 Mo Prior)',
          data: priorYields,
          metaDates: priorDates,
          borderColor: tc.curvePrior,
          backgroundColor: tc.curvePrior,
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.25,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: tc.curvePrior,
          spanGaps: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 14,
            font: { family: FONT_SANS, size: 12, weight: '500' },
            color: tc.textColor
          }
        },
        tooltip: {
          backgroundColor: tc.tooltipBg,
          titleFont: { family: FONT_MONO, size: 12 },
          bodyFont: { family: FONT_SANS, size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label(ctx) {
              const y = ctx.parsed.y !== null ? `${ctx.parsed.y.toFixed(3)}%` : '—';
              const dt = ctx.dataset.metaDates?.[ctx.dataIndex] || '';
              return ` ${ctx.dataset.label.split(' (')[0]}: ${y} (${dt})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { family: FONT_MONO, size: 12, weight: '600' },
            color: tc.textColor
          }
        },
        y: {
          grid: { color: tc.gridColor },
          ticks: {
            font: { family: FONT_MONO, size: 11 },
            color: tc.mutedColor,
            callback: v => `${v.toFixed(2)}%`
          }
        }
      }
    }
  };
}

/**
 * Render or update the Yield Curve chart (Latest vs Prior Month).
 */
export function renderYieldCurveChart() {
  if (!window.Chart) return;

  const tc = getThemeColors();
  const tenors = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
  const latestYields = [];
  const priorYields = [];
  const latestDates = [];
  const priorDates = [];

  for (const t of tenors) {
    const stat = state.tenorStatsMap[t];
    if (stat && stat.highYield !== null) {
      latestYields.push(Number(stat.highYield.toFixed(3)));
      latestDates.push(stat.auctionDate);
    } else {
      latestYields.push(null);
      latestDates.push('n/a');
    }

    if (stat && stat.priorHighYield !== null) {
      priorYields.push(Number(stat.priorHighYield.toFixed(3)));
      priorDates.push(stat.priorAuction?.auction_date || 'n/a');
    } else {
      priorYields.push(null);
      priorDates.push('n/a');
    }
  }

  // 1. Overview Canvas
  const canvas1 = document.getElementById('chartYieldCurve');
  if (canvas1) {
    if (state.charts.yieldCurve) {
      const c = state.charts.yieldCurve;
      c.data.datasets[0].data = latestYields;
      c.data.datasets[0].metaDates = latestDates;
      c.data.datasets[0].borderColor = tc.curveLatest;
      c.data.datasets[0].backgroundColor = tc.curveLatest;
      c.data.datasets[1].data = priorYields;
      c.data.datasets[1].metaDates = priorDates;
      c.data.datasets[1].borderColor = tc.curvePrior;
      c.data.datasets[1].backgroundColor = tc.curvePrior;
      c.options.scales.x.ticks.color = tc.textColor;
      c.options.scales.y.ticks.color = tc.mutedColor;
      c.options.scales.y.grid.color = tc.gridColor;
      c.options.plugins.legend.labels.color = tc.textColor;
      c.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
      c.update();
    } else {
      const ctx = canvas1.getContext('2d');
      state.charts.yieldCurve = new window.Chart(ctx, buildYieldCurveConfig(tenors, latestYields, latestDates, priorYields, priorDates, tc));
    }
  }

  // 2. Full Curve Detail Canvas
  const canvas2 = document.getElementById('chartYieldCurveDetail');
  if (canvas2) {
    if (state.charts.yieldCurveDetail) {
      const c = state.charts.yieldCurveDetail;
      c.data.datasets[0].data = latestYields;
      c.data.datasets[0].metaDates = latestDates;
      c.data.datasets[0].borderColor = tc.curveLatest;
      c.data.datasets[0].backgroundColor = tc.curveLatest;
      c.data.datasets[1].data = priorYields;
      c.data.datasets[1].metaDates = priorDates;
      c.data.datasets[1].borderColor = tc.curvePrior;
      c.data.datasets[1].backgroundColor = tc.curvePrior;
      c.options.scales.x.ticks.color = tc.textColor;
      c.options.scales.y.ticks.color = tc.mutedColor;
      c.options.scales.y.grid.color = tc.gridColor;
      c.options.plugins.legend.labels.color = tc.textColor;
      c.options.plugins.tooltip.backgroundColor = tc.tooltipBg;
      c.update();
    } else {
      const ctx = canvas2.getContext('2d');
      state.charts.yieldCurveDetail = new window.Chart(ctx, buildYieldCurveConfig(tenors, latestYields, latestDates, priorYields, priorDates, tc));
    }
  }
}

/**
 * Triggered on theme toggle to refresh Chart colors without reloading data.
 */
export function updateChartsTheme() {
  if (state.charts.activeTakedown || state.charts.demandFull) {
    renderActiveTakedownChart(state.activeTenor);
  }
  if (state.charts.yieldCurve || state.charts.yieldCurveDetail) {
    renderYieldCurveChart();
  }
}
