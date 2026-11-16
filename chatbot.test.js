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

  state.nominalAuctions = [
    {
      cusip: '91282CRX1',
      security_term: '10-Year',
      auction_date: '2026-11-10',
      issue_date: '2026-11-16',
      high_yield: '5.0200',
      avg_med_yield: '4.9610',
      bid_to_cover_ratio: '2.460000',
      offering_amt: '42000000000',
      comp_accepted: '41833398700',
      indirect_bidder_accepted: '25602039000',
      direct_bidder_accepted: '12131685000',
      primary_dealer_accepted: '4099674700',
      int_rate: '5.000000',
      price_per100: '99.843952'
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

  it('looks up specific CUSIP like 91282CRX1 accurately', () => {
    const res = bot.generateResponse('tell me about 91282CRX1');
    assert.match(res, /91282CRX1/);
    assert.match(res, /5\.020%/);
    assert.match(res, /2\.46x/);
    assert.match(res, /\$42\.00B/);
  });

  it('formats markdown with chat badge tokens', () => {
    const formatted = bot.formatMarkdown('Demand is [STRONG] and curve is [NORMAL]');
    assert.match(formatted, /chat-badge strong/);
    assert.match(formatted, /chat-badge normal/);
  });

  it('formats markdown links and quotes properly', () => {
    const text = 'Check [console.groq.com/keys](https://console.groq.com/keys)\n\n> Important quote';
    const formatted = bot.formatMarkdown(text);
    assert.match(formatted, /<a href="https:\/\/console\.groq\.com\/keys"/);
    assert.match(formatted, /<blockquote class="chat-quote">Important quote<\/blockquote>/);
  });

  it('formats block and inline LaTeX equations cleanly', () => {
    const text = 'Formula:\n$$\\text{Bid-to-Cover} = \\frac{\\text{Total Tendered}}{\\text{Total Accepted}}$$\nYield changed by $\\Delta y = +2.5\\text{ bp}$ and \\(y_{10Y} > y_{2Y}\\). Offering was $42.00B.';
    const formatted = bot.formatMarkdown(text);
    assert.match(formatted, /chat-math-block/);
    assert.match(formatted, /chat-math-inline/);
    assert.match(formatted, /\$42\.00B/);
  });

  it('formats markdown tables and headings', () => {
    const text = '### Yield Table\n\n| Tenor | Yield |\n| :--- | :--- |\n| 10Y | 4.45% |\n| 2Y | 4.15% |';
    const formatted = bot.formatMarkdown(text);
    assert.match(formatted, /<h4 class="chat-heading">Yield Table<\/h4>/);
    assert.match(formatted, /<table class="chat-table">/);
    assert.match(formatted, /<th>Tenor<\/th>/);
    assert.match(formatted, /<td>10Y<\/td>/);
  });

  it('strictly rejects off-topic queries with out-of-scope notice', () => {
    const offQueries = [
      'write a python script to scrape websites',
      'how do I bake a chocolate cake?',
      'who is the president of France?',
      'tell me a funny joke',
      'what is Bitcoin and crypto?'
    ];
    for (const q of offQueries) {
      assert.equal(bot.isProjectTopic(q), false, `Expected query to be off-topic: ${q}`);
      const res = bot.generateResponse(q);
      assert.match(res, /Out of Scope Notice/);
      assert.match(res, /strictly refrain from answering/i);
    }
  });

  it('accurately identifies and allows in-topic Treasury queries', () => {
    const inQueries = [
      'explain the 10Y note auction',
      'what is bid to cover?',
      'is the 2s10s curve inverted?',
      'how are dealer tails calculated?',
      'what is CUSIP 91282CRX1?',
      'what auctions are upcoming?'
    ];
    for (const q of inQueries) {
      assert.equal(bot.isProjectTopic(q), true, `Expected query to be in-topic: ${q}`);
    }
  });

  it('builds comprehensive telemetry context for Groq AI inference', () => {
    const ctx = bot.buildTelemetryContext();
    assert.ok(ctx.benchmarks['10Y']);
    assert.equal(ctx.benchmarks['10Y'].highYield, 4.435);
    assert.equal(ctx.benchmarks['10Y'].bidToCover, 2.54);
    assert.equal(ctx.benchmarks['10Y'].quality, 'IN LINE');
    assert.ok(Array.isArray(ctx.spreads));
    assert.equal(ctx.spreads[0].name, '2s10s');
    assert.equal(ctx.spreads[0].spreadBp, 28.5);
    assert.equal(ctx.spreads[0].isInverted, false);
    assert.ok(Array.isArray(ctx.upcomingSchedule));
  });

  it('manages Groq API key persistence and memory store', () => {
    bot.setGroqKey('gsk_test1234567890');
    assert.equal(bot.getGroqKey(), 'gsk_test1234567890');
    bot.clearGroqKey();
    assert.equal(bot.getGroqKey(), '');
  });
});

