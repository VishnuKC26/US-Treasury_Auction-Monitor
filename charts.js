/**
 * charts.js - Institutional Chart Visualizations
 * Uses Chart.js (vendored) with high-contrast, accessible design.
 * Modifies chart data in-place via chart.update() instead of recreating instances.
 */

import { state } from './state.js';
import { calculateTakedownShares, parseNum, getTenorCode } from './analytics.js';

// Fixed takedown allotment palette (never collided with tenor tokens)
export const ALLOTMENT_COLORS = {
  indirect: '#2563eb', // Royal Blue
  direct: '#0d9488',   // Deep Teal
  dealer: '#ea580c'    // Amber / Burnt Orange
};

const FONT_SANS = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

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

/**
 * Render or update the 100% stacked takedown bar chart for the active tenor.
 */
export function renderActiveTakedownChart(tenorCode) {
  const canvas = document.getElementById('chartActiveTakedown');
  if (!canvas || !window.Chart) return;

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

  if (state.charts.activeTakedown) {
    const c = state.charts.activeTakedown;
    c.data.labels = labels;
    c.data.datasets[0].data = indirectData;
    c.data.datasets[1].data = directData;
    c.data.datasets[2].data = dealerData;
    c.options.plugins.title.text = `${tenorCode} Competitive Takedown Shares (% of comp_accepted)`;
    c.update();
    return;
  }

  const ctx = canvas.getContext('2d');
  state.charts.activeTakedown = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Indirect % (Foreign / Inst.)',
          data: indirectData,
          backgroundColor: ALLOTMENT_COLORS.indirect,
          stack: 'allotment',
          borderRadius: 2
        },
        {
          label: 'Direct % (Domestic Non-Dealer)',
          data: directData,
          backgroundColor: ALLOTMENT_COLORS.direct,
          stack: 'allotment',
          borderRadius: 2
        },
        {
          label: 'Primary Dealer % (Underwriter Absorption)',
          data: dealerData,
          backgroundColor: ALLOTMENT_COLORS.dealer,
          stack: 'allotment',
          borderRadius: 2
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
            font: { family: FONT_SANS, size: 11, weight: '500' },
            color: '#334155'
          }
        },
        title: {
          display: false
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: FONT_MONO, size: 12 },
          bodyFont: { family: FONT_SANS, size: 12 },
          padding: 10,
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
            color: '#64748b'
          }
        },
        y: {
          stacked: true,
          max: 100,
          min: 0,
          grid: { color: '#e2e8f0' },
          ticks: {
            stepSize: 20,
            font: { family: FONT_MONO, size: 11 },
            color: '#64748b',
            callback: v => `${v}%`
          }
        }
      }
    }
  });
}

/**
 * Render or update the Yield Curve chart (Latest vs Prior Month).
 */
export function renderYieldCurveChart() {
  const canvas = document.getElementById('chartYieldCurve');
  if (!canvas || !window.Chart) return;

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

  if (state.charts.yieldCurve) {
    const c = state.charts.yieldCurve;
    c.data.datasets[0].data = latestYields;
    c.data.datasets[0].metaDates = latestDates;
    c.data.datasets[1].data = priorYields;
    c.data.datasets[1].metaDates = priorDates;
    c.update();
    return;
  }

  const ctx = canvas.getContext('2d');
  state.charts.yieldCurve = new window.Chart(ctx, {
    type: 'line',
    data: {
      labels: tenors,
      datasets: [
        {
          label: 'Latest Auction Curve',
          data: latestYields,
          metaDates: latestDates,
          borderColor: '#0f172a',
          backgroundColor: '#0f172a',
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
          pointHoverRadius: 6,
          spanGaps: false
        },
        {
          label: 'Prior Auction Curve (~1 Mo Prior)',
          data: priorYields,
          metaDates: priorDates,
          borderColor: '#94a3b8',
          backgroundColor: '#94a3b8',
          borderWidth: 1.8,
          borderDash: [5, 4],
          tension: 0.25,
          pointRadius: 3.5,
          pointHoverRadius: 5,
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
            font: { family: FONT_SANS, size: 11, weight: '500' },
            color: '#334155'
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleFont: { family: FONT_MONO, size: 12 },
          bodyFont: { family: FONT_SANS, size: 12 },
          padding: 10,
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
            font: { family: FONT_MONO, size: 11, weight: '600' },
            color: '#1e293b'
          }
        },
        y: {
          grid: { color: '#e2e8f0' },
          ticks: {
            font: { family: FONT_MONO, size: 11 },
            color: '#64748b',
            callback: v => `${v.toFixed(2)}%`
          }
        }
      }
    }
  });
}
