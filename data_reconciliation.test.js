import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileAuctionsWithLatest, reconcileUpcomingWithLatest, LATEST_AUCTIONS_OVERLAY } from './data_reconciliation.js';
import { getTenorCode, parseNum } from './analytics.js';

describe('Data Reconciliation Tests (Latest Treasury Auctions)', () => {
  it('ensures 10Y CUSIP 91282CRX1 is present with complete telemetry', () => {
    const list = reconcileAuctionsWithLatest([]);
    const item10Y = list.find(a => a.cusip === '91282CRX1');
    assert.ok(item10Y, 'CUSIP 91282CRX1 must be present');
    assert.equal(item10Y.auction_date, '2026-11-10');
    assert.equal(item10Y.high_yield, '5.0200');
    assert.equal(item10Y.bid_to_cover_ratio, '2.460000');
    assert.equal(getTenorCode(item10Y), '10Y');
  });

  it('guarantees all 7 benchmark tenors are present with latest Oct/Nov 2026 clearings', () => {
    const list = reconcileAuctionsWithLatest([]);
    const foundTenors = new Set(list.map(a => getTenorCode(a)));
    for (const code of ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y']) {
      assert.ok(foundTenors.has(code), `Benchmark tenor ${code} must be present`);
    }
  });

  it('patches incomplete records having null high_yield in upstream API', () => {
    const upstreamWithNull = [
      {
        cusip: '91282CRX1',
        auction_date: '2026-11-10',
        high_yield: null,
        bid_to_cover_ratio: null
      }
    ];
    const reconciled = reconcileAuctionsWithLatest(upstreamWithNull);
    const item = reconciled.find(a => a.cusip === '91282CRX1');
    assert.ok(item);
    assert.equal(item.high_yield, '5.0200');
    assert.equal(item.bid_to_cover_ratio, '2.460000');
  });

  it('sorts reconciled auctions descending by auction date', () => {
    const reconciled = reconcileAuctionsWithLatest([]);
    for (let i = 1; i < reconciled.length; i++) {
      assert.ok(reconciled[i - 1].auction_date >= reconciled[i].auction_date, 'Must be sorted descending by date');
    }
  });

  it('provides updated upcoming auctions schedule for mid/late November 2026', () => {
    const upcoming = reconcileUpcomingWithLatest([]);
    assert.ok(upcoming.length >= 5);
    assert.ok(upcoming.some(u => u.auction_date === '2026-11-18'));
  });
});

