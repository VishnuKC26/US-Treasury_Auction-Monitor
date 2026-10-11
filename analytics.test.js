/**
 * analytics.test.js - Regression and Fixture Tests for Institutional Analytics
 * Run with: node --test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isNominalCoupon,
  parseNum,
  getStandardTenor,
  getTenorCode,
  calculateStopVsMedianBps,
  getAllocationAtHighPct,
  calculateTakedownShares,
  calculateMean,
  calculateMedian,
  calculatePercentileRank,
  evaluateAuctionQuality,
  generateOneLineSummary,
  computeTenorStats,
  computeSpreads,
  processUpcomingAuctions
} from './analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load sample auctions fixture
const sampleRaw = fs.readFileSync(path.join(__dirname, 'data', 'sample_auctions.json'), 'utf8');
const sampleData = JSON.parse(sampleRaw).data;

test('1.1 Regression: TIPS and FRN filtering & 10Y yield delta', () => {
  // Confirm non-nominal counts in sample data
  const nominals = sampleData.filter(isNominalCoupon);
  const nonNominals = sampleData.filter(r => !isNominalCoupon(r));

  assert.equal(sampleData.length, 500, 'Sample data should have 500 rows');
  assert.equal(nonNominals.length, 144, 'Should identify 144 non-nominal rows (71 TIPS, 73 FRN)');
  assert.equal(nominals.length, 356, 'Nominal rows must be 356');

  // Verify TIPS has inflation_index_security === "Yes"
  const tipsRows = sampleData.filter(r => r.inflation_index_security === 'Yes');
  assert.equal(tipsRows.length, 71, 'Should find 71 TIPS rows');
  assert.ok(tipsRows.every(r => !isNominalCoupon(r)), 'All TIPS must be rejected by isNominalCoupon');

  // Verify FRN has floating_rate === "Yes"
  const frnRows = sampleData.filter(r => r.floating_rate === 'Yes');
  assert.equal(frnRows.length, 73, 'Should find 73 FRN rows');
  assert.ok(frnRows.every(r => !isNominalCoupon(r)), 'All FRN must be rejected by isNominalCoupon');

  // 10Y nominal series test
  const tenors10Y = nominals
    .filter(r => getTenorCode(r) === '10Y')
    .sort((a, b) => b.auction_date.localeCompare(a.auction_date));

  assert.ok(tenors10Y.length >= 2, 'Must have at least two 10Y nominal auctions');
  const latest10Y = tenors10Y[0];
  const prior10Y = tenors10Y[1];

  assert.equal(latest10Y.auction_date, '2026-10-07', 'Latest 10Y auction date must be 2026-10-07');
  assert.equal(latest10Y.high_yield, '5.3000', 'Latest 10Y yield must be 5.300');

  // Prior nominal 10Y is Sep 9 (4.834), NOT Sep 17 TIPS reopening (2.653)
  assert.equal(prior10Y.auction_date, '2026-09-09', 'Prior nominal 10Y must be 2026-09-09');
  assert.equal(prior10Y.high_yield, '4.8340', 'Prior nominal 10Y yield must be 4.834');

  const deltaBp = (parseFloat(latest10Y.high_yield) - parseFloat(prior10Y.high_yield)) * 100;
  assert.ok(
    Math.abs(deltaBp - 46.6) < 0.1,
    `10Y delta vs prior must be ~+46.6 bp, got ${deltaBp.toFixed(1)} bp (must NOT be ~+264.7 bp)`
  );
});

test('1.2 Safe number parsing (never convert missing to 0)', () => {
  assert.equal(parseNum(null), null);
  assert.equal(parseNum(undefined), null);
  assert.equal(parseNum(''), null);
  assert.equal(parseNum('null'), null);
  assert.equal(parseNum('None'), null);
  assert.equal(parseNum('abc'), null);

  assert.equal(parseNum('0'), 0);
  assert.equal(parseNum('0.00'), 0);
  assert.equal(parseNum('5.300'), 5.3);
  assert.equal(parseNum('38,665,438,000'), 38665438000);
});

test('1.3 Stop vs median & allocation at high %', () => {
  const row = { high_yield: '5.3000', avg_med_yield: '5.255000', allocation_pctage: '57.600000' };
  const stopVsMed = calculateStopVsMedianBps(row);
  assert.ok(Math.abs(stopVsMed - 4.5) < 0.01, 'Stop vs median should be 4.5 bp');

  const alloc = getAllocationAtHighPct(row);
  assert.equal(alloc, 57.6, 'Allocation at high % should be 57.6%');

  const missingRow = { high_yield: null, avg_med_yield: '5.255000' };
  assert.equal(calculateStopVsMedianBps(missingRow), null, 'Missing yield must return null');
});

test('1.4 Competitive allotment shares sum to 100.0% (Oct 2026 fixtures)', () => {
  const nominals = sampleData.filter(isNominalCoupon);

  // Fixture: 10Y on 2026-10-07
  const row10 = nominals.find(r => r.cusip === '91282CRF0' && r.auction_date === '2026-10-07');
  assert.ok(row10, 'Must find 10Y auction row for 2026-10-07');
  const shares10 = calculateTakedownShares(row10);

  assert.equal(parseFloat(row10.high_yield).toFixed(3), '5.300');
  assert.equal(parseFloat(row10.bid_to_cover_ratio).toFixed(2), '2.77');
  assert.equal(shares10.indirectPct.toFixed(1), '80.3');
  assert.equal(shares10.directPct.toFixed(1), '17.1');
  assert.equal(shares10.dealerPct.toFixed(1), '2.5');
  assert.equal((shares10.indirectPct + shares10.directPct + shares10.dealerPct).toFixed(1), '100.0');

  // Fixture: 30Y on 2026-10-08
  const row30 = nominals.find(r => r.cusip === '912810UW6' && r.auction_date === '2026-10-08');
  assert.ok(row30, 'Must find 30Y auction row for 2026-10-08');
  const shares30 = calculateTakedownShares(row30);

  assert.equal(parseFloat(row30.high_yield).toFixed(3), '5.618');
  assert.equal(parseFloat(row30.bid_to_cover_ratio).toFixed(2), '2.54');
  assert.equal(shares30.indirectPct.toFixed(1), '72.3');
  assert.equal(shares30.directPct.toFixed(1), '20.9');
  assert.equal(shares30.dealerPct.toFixed(1), '6.8');
  assert.equal((shares30.indirectPct + shares30.directPct + shares30.dealerPct).toFixed(1), '100.0');
});

test('2.1 Quality grading logic (transparent rules)', () => {
  // STRONG: BTC pct >= 67 AND dealer pct <= 33
  assert.equal(evaluateAuctionQuality(70, 20), 'STRONG');
  assert.equal(evaluateAuctionQuality(67, 33), 'STRONG');

  // SOFT: BTC pct <= 33 AND dealer pct >= 67
  assert.equal(evaluateAuctionQuality(20, 80), 'SOFT');
  assert.equal(evaluateAuctionQuality(33, 67), 'SOFT');

  // IN LINE: any other condition
  assert.equal(evaluateAuctionQuality(50, 50), 'IN LINE');
  assert.equal(evaluateAuctionQuality(80, 80), 'IN LINE');
  assert.equal(evaluateAuctionQuality(20, 20), 'IN LINE');
  assert.equal(evaluateAuctionQuality(null, 50), 'IN LINE');
});

test('2.2 Full tenor stats computation and deterministic summary', () => {
  const nominals = sampleData.filter(isNominalCoupon);
  const auctions30Y = nominals
    .filter(r => getTenorCode(r) === '30Y')
    .sort((a, b) => b.auction_date.localeCompare(a.auction_date));

  const stats = computeTenorStats(auctions30Y, '30Y', 20);
  assert.ok(stats, 'Should produce 30Y stats');
  assert.equal(stats.tenorCode, '30Y');
  assert.equal(stats.highYield.toFixed(3), '5.618');
  assert.equal(stats.bidToCover.toFixed(2), '2.54');
  assert.equal(stats.dealerPct.toFixed(1), '6.8');
  assert.ok(stats.summary.includes('30Y reopening:'), 'Summary must identify 30Y reopening');
  assert.ok(stats.summary.includes('dealers took 6.8%'), 'Summary must include dealer share');
  assert.ok(stats.summary.includes('bid-to-cover 2.54x'), 'Summary must include BTC');
});

test('2.3 Spreads computation with auction-implied label', () => {
  const nominals = sampleData.filter(isNominalCoupon);
  const tenorMap = {};
  for (const code of ['2Y', '5Y', '10Y', '30Y']) {
    const list = nominals.filter(r => getTenorCode(r) === code).sort((a, b) => b.auction_date.localeCompare(a.auction_date));
    tenorMap[code] = computeTenorStats(list, code, 20);
  }

  const spreads = computeSpreads(tenorMap);
  assert.equal(spreads.length, 4);

  const spread2s10s = spreads.find(s => s.name === '2s10s');
  assert.ok(spread2s10s, 'Should compute 2s10s spread');
  assert.equal(spread2s10s.label, 'auction-implied, dates differ');
  assert.ok(typeof spread2s10s.spreadBp === 'number', 'Spread should be a valid number in bp');
});

test('1.6 Upcoming auctions processing (date filter, deduping, sorting)', () => {
  const upcomingRaw = fs.readFileSync(path.join(__dirname, 'data', 'upcoming_auctions.json'), 'utf8');
  const upcomingData = JSON.parse(upcomingRaw).data;

  const processed = processUpcomingAuctions(upcomingData, '2026-10-11');
  assert.ok(processed.length > 0, 'Should find future upcoming auctions');

  // Verify all are >= 2026-10-11
  assert.ok(processed.every(r => r.auction_date >= '2026-10-11'), 'All upcoming auctions must be on or after refDate');

  // Verify ascending sort
  for (let i = 1; i < processed.length; i++) {
    assert.ok(processed[i].auction_date >= processed[i - 1].auction_date, 'Upcoming auctions must be sorted ascending');
  }

  // Verify deduping
  const keys = new Set();
  for (const r of processed) {
    const k = `${r.cusip}_${r.auction_date}`;
    assert.ok(!keys.has(k), `Duplicate entry found: ${k}`);
    keys.add(k);
  }
});
