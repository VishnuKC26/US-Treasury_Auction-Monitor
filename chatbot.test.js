import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuctionChatbot } from './chatbot.js';
import { state } from './state.js';

describe('AuctionChatbot Engine Tests', () => {
  const bot = new AuctionChatbot();

  // Populate mock state
  state.tenorStatsMap = {
    '10Y': {
      tenorCode: '10Y',
      highYield: 4.435,
      priorHighYield: 4.382,
      deltaHighYieldBp: 5.3,
      bidToCover: 2.54,
      btcPercentile: 65,
      trailingMeanBtc: 2.51,
      shares: {
        indirectPct: 67.2,
        directPct: 18.0,
        dealerPct: 14.8
      },
      dealerVsMedianDelta: -1.2,
      stopVsMedianBp: 0.8,
      allocationAtHighPct: 24.5,
      quality: 'IN LINE',
      summary: 'BTC 2.54x (65th pct), dealer 14.8%',
      auctionDate: '2026-10-15',
      offeringAmt: 39000000000,
      isReopening: false
    },
    '2Y': {
      tenorCode: '2Y',
      highYield: 4.150,
      priorHighYield: 4.120,
      deltaHighYieldBp: 3.0,
      bidToCover: 2.68,
      btcPercentile: 82,
      trailingMeanBtc: 2.58,
      shares: {
        indirectPct: 62.0,
        directPct: 22.0,
        dealerPct: 16.0
      },
      dealerVsMedianDelta: -2.0,
      stopVsMedianBp: 0.3,
      allocationAtHighPct: 45.0,
      quality: 'STRONG',
      summary: 'BTC 2.68x (82th pct), dealer 16.0%',
      auctionDate: '2026-10-22',
      offeringAmt: 69000000000,
      isReopening: false
    }
  };

  state.spreads = [
    { name: '2s10s', spreadBp: 28.5, shortYield: 4.15, longYield: 4.435 }
  ];

  state.upcomingAuctions = [
    {
      tenorCode: '10Y',
      auction_date: '2026-11-18',
      reopening: 'No',
      offeringDisplay: '$39.00B',
      cusip: '91282CJZ1'
    }
  ];

  it('generates in-depth tenor explanation for 10Y', () => {
    const res = bot.generateResponse('Explain the 10Y auction');
    assert.match(res, /10Y Benchmark Telemetry/);
    assert.match(res, /4\.435%/);
    assert.match(res, /Bid-to-Cover/);
    assert.match(res, /67\.2%/);
  });

  it('explains yield curve spreads accurately', () => {
    const res = bot.generateResponse('What is the 2s10s spread?');
    assert.match(res, /Yield Curve/);
    assert.match(res, /28\.5 bp/);
  });

  it('explains Bid-to-Cover concepts', () => {
    const res = bot.generateResponse('What is bid-to-cover?');
    assert.match(res, /Total Tendered Bids/);
    assert.match(res, /Demand Multiplier/i);
  });

  it('explains takedown allotment shares', () => {
    const res = bot.generateResponse('Explain Indirect vs Dealer takedown');
    assert.match(res, /Indirect Bidders/);
    assert.match(res, /Primary Dealers/);
    assert.match(res, /Dealer Overhang/);
  });

  it('explains tails and cutoff dispersion', () => {
    const res = bot.generateResponse('What does an auction tail mean?');
    assert.match(res, /Stop vs Median/);
    assert.match(res, /When-Issued/);
  });

  it('formats markdown with chat badge tokens', () => {
    const formatted = bot.formatMarkdown('Demand is [STRONG] and curve is [NORMAL]');
    assert.match(formatted, /chat-badge strong/);
    assert.match(formatted, /chat-badge normal/);
  });
});

