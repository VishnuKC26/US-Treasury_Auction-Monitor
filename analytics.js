/**
 * analytics.js - Pure Institutional Analytics Module for US Treasury Bond Auctions
 * No DOM access, dependency-free, tested with node:test.
 */

export const BENCHMARK_TENORS = ['2-Year', '3-Year', '5-Year', '7-Year', '10-Year', '20-Year', '30-Year'];
export const BENCHMARK_CODES = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];

export const TENOR_MAP = {
  '2-Year': '2Y',
  '3-Year': '3Y',
  '5-Year': '5Y',
  '7-Year': '7Y',
  '10-Year': '10Y',
  '20-Year': '20Y',
  '30-Year': '30Y'
};

/**
 * Filter nominal fixed-rate notes and bonds only.
 * Excludes TIPS (inflation_index_security === 'Yes') and FRNs (floating_rate === 'Yes').
 */
export function isNominalCoupon(row) {
  if (!row) return false;
  const isInflation = String(row.inflation_index_security ?? '').trim().toLowerCase() === 'yes';
  const isFloating = String(row.floating_rate ?? '').trim().toLowerCase() === 'yes';
  const secType = String(row.security_type ?? '').trim();
  const isNoteOrBond = secType === 'Note' || secType === 'Bond';
  return !isInflation && !isFloating && isNoteOrBond;
}

/**
 * Parse numeric values safely. Returns null for null/empty/NaN values.
 * Never converts missing values to 0.
 */
export function parseNum(val) {
  if (val === null || val === undefined || val === '' || val === 'null' || val === 'None') {
    return null;
  }
  const n = parseFloat(String(val).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Standardize security term to canonical benchmark tenor string.
 */
export function getStandardTenor(item) {
  if (!item) return '';
  const term = String(item.original_security_term || item.security_term || '').trim();
  if (/\b(30-Year|29-Year)\b/i.test(term)) return '30-Year';
  if (/\b(20-Year|19-Year)\b/i.test(term)) return '20-Year';
  if (/\b(10-Year|9-Year)\b/i.test(term)) return '10-Year';
  if (/\b(7-Year|6-Year)\b/i.test(term)) return '7-Year';
  if (/\b(5-Year|4-Year)\b/i.test(term)) return '5-Year';
  if (/\b(3-Year)\b/i.test(term) || (/\b2-Year\b/i.test(term) && /\b(10|11)-Month\b/i.test(term))) return '3-Year';
  if (/\b(2-Year|1-Year)\b/i.test(term)) return '2-Year';
  return term;
}

/**
 * Convert auction row to short tenor code (e.g. '10Y').
 */
export function getTenorCode(item) {
  const std = getStandardTenor(item);
  return TENOR_MAP[std] || '';
}

/**
 * Stop vs median yield dispersion in basis points: (high_yield - avg_med_yield) * 100.
 * Returns null if either metric is missing.
 */
export function calculateStopVsMedianBps(row) {
  if (!row) return null;
  const high = parseNum(row.high_yield);
  const avg = parseNum(row.avg_med_yield);
  if (high === null || avg === null) return null;
  return (high - avg) * 100;
}

/**
 * Allocation percentage awarded at the cut-off / high yield.
 */
export function getAllocationAtHighPct(row) {
  if (!row) return null;
  return parseNum(row.allocation_pctage);
}

/**
 * Calculate competitive allotment shares using comp_accepted as the denominator.
 * Indirect, direct, and dealer shares sum to exactly 100% of comp_accepted.
 */
export function calculateTakedownShares(row) {
  if (!row) return { indirectPct: null, directPct: null, dealerPct: null };
  const compAccepted = parseNum(row.comp_accepted);
  const indirect = parseNum(row.indirect_bidder_accepted);
  const direct = parseNum(row.direct_bidder_accepted);
  const dealer = parseNum(row.primary_dealer_accepted);

  if (compAccepted === null || compAccepted <= 0) {
    return { indirectPct: null, directPct: null, dealerPct: null };
  }

  const indPct = indirect !== null ? (indirect / compAccepted) * 100 : null;
  const dirPct = direct !== null ? (direct / compAccepted) * 100 : null;
  const dlrPct = dealer !== null ? (dealer / compAccepted) * 100 : null;

  return {
    indirectPct: indPct,
    directPct: dirPct,
    dealerPct: dlrPct
  };
}

/**
 * Non-competitive and SOMA accepted amounts (shown separately).
 */
export function getNonCompAndSoma(row) {
  if (!row) return { nonCompAccepted: null, somaAccepted: null };
  return {
    nonCompAccepted: parseNum(row.noncomp_accepted),
    somaAccepted: parseNum(row.soma_accepted)
  };
}

/**
 * Calculate mean of a numeric array (skipping null/NaN).
 */
export function calculateMean(values) {
  if (!Array.isArray(values)) return null;
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Calculate median of a numeric array (skipping null/NaN).
 */
export function calculateMedian(values) {
  if (!Array.isArray(values)) return null;
  const valid = values.filter(v => v !== null && !isNaN(v)).sort((a, b) => a - b);
  if (valid.length === 0) return null;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
}

/**
 * Calculate standard deviation.
 */
export function calculateStdDev(values) {
  if (!Array.isArray(values)) return null;
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length < 2) return 0;
  const mean = calculateMean(valid);
  const variance = valid.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / valid.length;
  return Math.sqrt(variance);
}

/**
 * Calculate z-score of a value against an array.
 */
export function calculateZScore(val, values) {
  if (val === null || val === undefined || isNaN(val)) return null;
  const std = calculateStdDev(values);
  const mean = calculateMean(values);
  if (std === null || mean === null || std === 0) return 0;
  return (val - mean) / std;
}

/**
 * Calculate rank-based percentile (0 - 100).
 * Mid-rank handling: (count(v < x) + 0.5 * count(v == x)) / N * 100.
 */
export function calculatePercentileRank(val, values) {
  if (val === null || val === undefined || isNaN(val) || !Array.isArray(values)) return null;
  const valid = values.filter(v => v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  const below = valid.filter(v => v < val).length;
  const equal = valid.filter(v => v === val).length;
  return ((below + 0.5 * equal) / valid.length) * 100;
}

/**
 * Transparent quality label:
 * - STRONG if bid-to-cover percentile >= 67 and dealer-share percentile <= 33
 * - SOFT if bid-to-cover percentile <= 33 and dealer-share percentile >= 67
 * - Otherwise IN LINE
 */
export function evaluateAuctionQuality(btcPercentile, dealerPercentile) {
  if (btcPercentile === null || dealerPercentile === null) {
    return 'IN LINE';
  }
  if (btcPercentile >= 67 && dealerPercentile <= 33) {
    return 'STRONG';
  }
  if (btcPercentile <= 33 && dealerPercentile >= 67) {
    return 'SOFT';
  }
  return 'IN LINE';
}

/**
 * Deterministic one-line summary.
 * e.g. "30Y reopening: dealers took 6.8% (trailing median 11.6%), bid-to-cover 2.54x (88th pct) — in line."
 */
export function generateOneLineSummary(tenorCode, latestAuction, stats) {
  if (!latestAuction || !stats) return `${tenorCode}: No auction data`;
  const isReopen = String(latestAuction.reopening ?? '').trim().toLowerCase() === 'yes';
  const issueType = isReopen ? 'reopening' : 'new issue';
  const dealerStr = stats.dealerPct !== null ? `${stats.dealerPct.toFixed(1)}%` : '—';
  const medianStr = stats.trailingMedianDealerPct !== null ? `${stats.trailingMedianDealerPct.toFixed(1)}%` : '—';
  const btcStr = stats.bidToCover !== null ? `${stats.bidToCover.toFixed(2)}x` : '—';
  const btcPctStr = stats.btcPercentile !== null ? `${Math.round(stats.btcPercentile)}th pct` : '—';
  const quality = stats.quality ? stats.quality.toLowerCase() : 'in line';

  return `${tenorCode} ${issueType}: dealers took ${dealerStr} (trailing median ${medianStr}), bid-to-cover ${btcStr} (${btcPctStr}) — ${quality}.`;
}

/**
 * Compute all trailing stats for a specific tenor.
 * Assumes auctions are nominal only and sorted by auction_date descending.
 */
export function computeTenorStats(auctionsForTenor, tenorCode, trailingWindow = 20) {
  if (!Array.isArray(auctionsForTenor) || auctionsForTenor.length === 0) {
    return null;
  }

  const latest = auctionsForTenor[0];
  const prior = auctionsForTenor[1] || null;

  const latestHighYield = parseNum(latest.high_yield);
  const priorHighYield = prior ? parseNum(prior.high_yield) : null;
  const deltaHighYieldBp = (latestHighYield !== null && priorHighYield !== null)
    ? (latestHighYield - priorHighYield) * 100
    : null;

  const trailing = auctionsForTenor.slice(0, trailingWindow);

  // Bid-to-cover statistics
  const latestBtc = parseNum(latest.bid_to_cover_ratio);
  const btcValues = trailing.map(a => parseNum(a.bid_to_cover_ratio)).filter(v => v !== null);
  const trailingMeanBtc = calculateMean(btcValues);
  const btcZScore = calculateZScore(latestBtc, btcValues);
  const btcPercentile = calculatePercentileRank(latestBtc, btcValues);

  // Competitive takedown shares
  const latestShares = calculateTakedownShares(latest);
  const allDealerShares = trailing.map(a => calculateTakedownShares(a).dealerPct).filter(v => v !== null);
  const allIndirectShares = trailing.map(a => calculateTakedownShares(a).indirectPct).filter(v => v !== null);

  const trailingMedianDealerPct = calculateMedian(allDealerShares);
  const trailingMeanIndirectPct = calculateMean(allIndirectShares);

  const dealerVsMedianDelta = (latestShares.dealerPct !== null && trailingMedianDealerPct !== null)
    ? latestShares.dealerPct - trailingMedianDealerPct
    : null;

  const indirectVsMeanDelta = (latestShares.indirectPct !== null && trailingMeanIndirectPct !== null)
    ? latestShares.indirectPct - trailingMeanIndirectPct
    : null;

  const dealerPercentile = calculatePercentileRank(latestShares.dealerPct, allDealerShares);

  // Stop vs median & allocation at high
  const stopVsMedianBp = calculateStopVsMedianBps(latest);
  const allocationAtHighPct = getAllocationAtHighPct(latest);

  // Offering size & change
  const offeringAmt = parseNum(latest.offering_amt);
  const priorOfferingAmt = prior ? parseNum(prior.offering_amt) : null;
  const offeringAmtDelta = (offeringAmt !== null && priorOfferingAmt !== null)
    ? offeringAmt - priorOfferingAmt
    : null;

  // Accepted size net of SOMA
  const totalAccepted = parseNum(latest.total_accepted);
  const somaAccepted = parseNum(latest.soma_accepted) || 0;
  const acceptedNetSoma = totalAccepted !== null ? totalAccepted - somaAccepted : null;

  // New issue vs reopening
  const isReopening = String(latest.reopening ?? '').trim().toLowerCase() === 'yes';

  // Transparent quality evaluation
  const quality = evaluateAuctionQuality(btcPercentile, dealerPercentile);

  // Sparkline data (last 12 auctions chronological)
  const sparklineData = auctionsForTenor.slice(0, 12).reverse().map(a => ({
    auctionDate: a.auction_date,
    highYield: parseNum(a.high_yield),
    bidToCover: parseNum(a.bid_to_cover_ratio)
  }));

  const stats = {
    tenorCode,
    latestAuction: latest,
    priorAuction: prior,
    auctionDate: latest.auction_date,
    issueDate: latest.issue_date,
    highYield: latestHighYield,
    priorHighYield,
    deltaHighYieldBp,
    bidToCover: latestBtc,
    trailingMeanBtc,
    btcZScore,
    btcPercentile,
    indirectPct: latestShares.indirectPct,
    directPct: latestShares.directPct,
    dealerPct: latestShares.dealerPct,
    trailingMedianDealerPct,
    trailingMeanIndirectPct,
    dealerVsMedianDelta,
    indirectVsMeanDelta,
    dealerPercentile,
    stopVsMedianBp,
    allocationAtHighPct,
    offeringAmt,
    priorOfferingAmt,
    offeringAmtDelta,
    acceptedNetSoma,
    isReopening,
    quality,
    sparklineData
  };

  stats.summary = generateOneLineSummary(tenorCode, latest, stats);
  return stats;
}

/**
 * Compute key benchmark spreads from the latest nominal auctions per tenor.
 */
export function computeSpreads(tenorStatsMap) {
  const spreadDefs = [
    { name: '2s5s', short: '2Y', long: '5Y' },
    { name: '2s10s', short: '2Y', long: '10Y' },
    { name: '5s10s', short: '5Y', long: '10Y' },
    { name: '10s30s', short: '10Y', long: '30Y' }
  ];

  return spreadDefs.map(def => {
    const sStat = tenorStatsMap[def.short];
    const lStat = tenorStatsMap[def.long];

    const sYield = sStat ? sStat.highYield : null;
    const lYield = lStat ? lStat.highYield : null;
    const spreadBp = (sYield !== null && lYield !== null) ? (lYield - sYield) * 100 : null;

    return {
      name: def.name,
      shortTenor: def.short,
      longTenor: def.long,
      shortYield: sYield,
      longYield: lYield,
      shortDate: sStat ? sStat.auctionDate : null,
      longDate: lStat ? lStat.auctionDate : null,
      spreadBp,
      label: 'auction-implied, dates differ'
    };
  });
}

/**
 * Filter and sort upcoming auctions feed.
 * Keeps rows with auction_date >= today (America/New_York).
 * Dedupes by cusip + auction_date, keeping latest record_date.
 * Sorts ascending so earliest future auction is first.
 */
export function processUpcomingAuctions(upcomingList, refDateStr = null) {
  if (!Array.isArray(upcomingList)) return [];

  const todayNY = refDateStr || getTodayInNY();

  // Filter >= today in NY and keep Notes/Bonds (or all nominal)
  const valid = upcomingList.filter(row => {
    if (!row || !row.auction_date) return false;
    return row.auction_date >= todayNY;
  });

  // Dedupe by cusip + auction_date, keeping latest record_date
  const dedupedMap = new Map();
  for (const row of valid) {
    const key = `${row.cusip || ''}_${row.auction_date}`;
    const existing = dedupedMap.get(key);
    if (!existing) {
      dedupedMap.set(key, row);
    } else {
      const recExisting = String(existing.record_date || '');
      const recNew = String(row.record_date || '');
      if (recNew > recExisting) {
        dedupedMap.set(key, row);
      }
    }
  }

  // Sort ascending by auction_date
  const sorted = Array.from(dedupedMap.values()).sort((a, b) => {
    if (a.auction_date !== b.auction_date) {
      return a.auction_date.localeCompare(b.auction_date);
    }
    return String(a.cusip || '').localeCompare(String(b.cusip || ''));
  });

  return sorted.map(row => {
    const offAmt = parseNum(row.offering_amt);
    const hasOffering = offAmt !== null && offAmt > 0;
    const isNoteOrBond = ['Note', 'Bond'].includes(row.security_type);
    const closeTimeET = isNoteOrBond ? '1:00 pm ET' : '11:30 am ET';

    return {
      ...row,
      hasOffering,
      offeringDisplay: hasOffering ? formatOfferingBillions(offAmt) : `Size announced ${formatShortDate(row.announcemt_date)}`,
      closeTimeET,
      tenorCode: getTenorCode(row) || row.security_term || ''
    };
  });
}

/**
 * Get today's ISO date string in America/New_York (YYYY-MM-DD).
 */
export function getTodayInNY() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  return parts;
}

function formatOfferingBillions(amt) {
  if (amt === null || amt === undefined) return '—';
  return `$${(amt / 1e9).toFixed(1)}B`;
}

function formatShortDate(dateStr) {
  if (!dateStr || dateStr === 'null') return 'TBD';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${months[mIdx] || parts[1]} ${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}
