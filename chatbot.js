/**
 * chatbot.js - Institutional US Treasury Auction AI Analyst
 * Provides in-depth financial explanations of dashboard data, yield curve dynamics,
 * auction mechanics (tails, bid-to-cover, allotment shares), and live market telemetry.
 */

import { state } from './state.js';
import { getTenorCode, parseNum } from './analytics.js';

export class AuctionChatbot {
  constructor() {
    this.history = [];
    this.isOpen = false;
    this.dom = {};
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.renderWelcome();
  }

  cacheDom() {
    this.dom.widget = document.getElementById('chatWidget');
    this.dom.toggleBtn = document.getElementById('chatToggleBtn');
    this.dom.closeBtn = document.getElementById('chatCloseBtn');
    this.dom.messagesContainer = document.getElementById('chatMessages');
    this.dom.input = document.getElementById('chatInput');
    this.dom.sendBtn = document.getElementById('chatSendBtn');
    this.dom.chips = document.getElementById('chatPromptChips');
    this.dom.clearBtn = document.getElementById('chatClearBtn');
    this.dom.badge = document.getElementById('chatBadge');
    
    // Full view elements if on dedicated AI tab
    this.dom.fullContainer = document.getElementById('fullChatContainer');
    this.dom.fullMessages = document.getElementById('fullChatMessages');
    this.dom.fullInput = document.getElementById('fullChatInput');
    this.dom.fullSendBtn = document.getElementById('fullChatSendBtn');
    this.dom.fullChips = document.getElementById('fullChatPromptChips');
    this.dom.fullClearBtn = document.getElementById('fullChatClearBtn');
  }

  bindEvents() {
    // Floating Widget Toggle
    this.dom.toggleBtn?.addEventListener('click', () => this.toggle());
    this.dom.closeBtn?.addEventListener('click', () => this.close());

    // Send floating
    this.dom.sendBtn?.addEventListener('click', () => this.handleSend('widget'));
    this.dom.input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend('widget');
      }
    });

    // Send full tab
    this.dom.fullSendBtn?.addEventListener('click', () => this.handleSend('full'));
    this.dom.fullInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend('full');
      }
    });

    // Clear history
    this.dom.clearBtn?.addEventListener('click', () => this.clearHistory());
    this.dom.fullClearBtn?.addEventListener('click', () => this.clearHistory());

    // Prompt chips
    const handleChipClick = (e) => {
      const chip = e.target.closest('.chat-chip');
      if (chip) {
        const text = chip.getAttribute('data-prompt') || chip.textContent.trim();
        this.ask(text);
      }
    };
    this.dom.chips?.addEventListener('click', handleChipClick);
    this.dom.fullChips?.addEventListener('click', handleChipClick);

    // Global "Ask AI" triggers across the dashboard
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ask-ai]');
      if (btn) {
        const prompt = btn.getAttribute('data-ask-ai');
        if (prompt) {
          this.open();
          this.ask(prompt);
        }
      }
    });
  }

  open() {
    this.isOpen = true;
    this.dom.widget?.classList.add('is-open');
    this.dom.toggleBtn?.classList.add('is-active');
    setTimeout(() => this.dom.input?.focus(), 150);
  }

  close() {
    this.isOpen = false;
    this.dom.widget?.classList.remove('is-open');
    this.dom.toggleBtn?.classList.remove('is-active');
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  renderWelcome() {
    const welcomeMsg = {
      sender: 'bot',
      timestamp: new Date(),
      text: `Hello! I'm your **Institutional Treasury Analyst**.

I can break down live data from this dashboard in depth, explain auction mechanics, analyze yield curve spreads, and diagnose institutional demand signals.

Try asking about:
- **Tenor Analysis:** *"Analyze the latest 10Y auction"* or *"How is the 2Y note performing?"*
- **Yield Curve:** *"Is the 2s10s curve inverted?"* or *"Explain current spreads"*
- **Mechanics:** *"What is Bid-to-Cover?"* or *"Explain Indirect vs Dealer takedown"*
- **Market Summary:** *"Give me an executive demand summary across all benchmarks"*
- **Upcoming Supply:** *"What auctions are scheduled this week?"*`
    };

    this.history = [welcomeMsg];
    this.renderMessages();
  }

  clearHistory() {
    this.renderWelcome();
  }

  handleSend(source = 'widget') {
    const inputEl = source === 'full' ? this.dom.fullInput : this.dom.input;
    if (!inputEl) return;
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    this.ask(text);
  }

  ask(question) {
    if (!question || !question.trim()) return;

    // Add user message
    this.history.push({
      sender: 'user',
      timestamp: new Date(),
      text: question.trim()
    });
    this.renderMessages();

    // Show typing indicator
    this.showTyping();

    // Process query using live state and expert financial heuristics
    setTimeout(() => {
      const answer = this.generateResponse(question.trim());
      this.hideTyping();
      this.history.push({
        sender: 'bot',
        timestamp: new Date(),
        text: answer
      });
      this.renderMessages();
    }, 400);
  }

  showTyping() {
    const typingHtml = `
      <div class="chat-msg bot typing-indicator" id="typingIndicator">
        <div class="msg-avatar">UST</div>
        <div class="msg-bubble">
          <div class="typing-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;
    if (this.dom.messagesContainer) {
      this.dom.messagesContainer.insertAdjacentHTML('beforeend', typingHtml);
      this.dom.messagesContainer.scrollTop = this.dom.messagesContainer.scrollHeight;
    }
    if (this.dom.fullMessages) {
      this.dom.fullMessages.insertAdjacentHTML('beforeend', typingHtml);
      this.dom.fullMessages.scrollTop = this.dom.fullMessages.scrollHeight;
    }
  }

  hideTyping() {
    document.querySelectorAll('#typingIndicator').forEach(el => el.remove());
  }

  renderMessages() {
    const renderTarget = (container) => {
      if (!container) return;
      container.innerHTML = this.history.map((msg) => {
        const isBot = msg.sender === 'bot';
        const formattedText = this.formatMarkdown(msg.text);
        const timeStr = msg.timestamp ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
          <div class="chat-msg ${isBot ? 'bot' : 'user'}">
            <div class="msg-avatar">${isBot ? 'UST' : 'You'}</div>
            <div class="msg-content">
              <div class="msg-bubble">${formattedText}</div>
              <div class="msg-time">${timeStr}</div>
            </div>
          </div>
        `;
      }).join('');
      container.scrollTop = container.scrollHeight;
    };

    renderTarget(this.dom.messagesContainer);
    renderTarget(this.dom.fullMessages);
  }

  formatMarkdown(text) {
    if (!text) return '';
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Inline code / metric
      .replace(/`([^`]+)`/g, '<code class="chat-code">$1</code>')
      // Bullet lists
      .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
      // Numbered lists
      .replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li><strong>$1.</strong> $2</li>');

    // Wrap list items in <ul>
    html = html.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/gs, '<ul class="chat-list">$1</ul>');

    // Paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p>');
    html = `<p>${html}</p>`.replace(/<p><\/p>/g, '');

    // Quality badges formatting
    html = html.replace(/\[STRONG\]/g, '<span class="chat-badge strong">▲ STRONG</span>');
    html = html.replace(/\[SOFT\]/g, '<span class="chat-badge soft">▼ SOFT</span>');
    html = html.replace(/\[IN LINE\]/g, '<span class="chat-badge inline">▬ IN LINE</span>');
    html = html.replace(/\[INVERTED\]/g, '<span class="chat-badge inverted">⚠️ INVERTED</span>');
    html = html.replace(/\[NORMAL\]/g, '<span class="chat-badge normal">✓ NORMAL</span>');

    return html;
  }

  /**
   * Analytical reasoning engine: uses exact numbers from state to generate bespoke institutional answers.
   */
  generateResponse(query) {
    const q = query.toLowerCase();

    // 1. Tenor-specific queries (e.g. "10Y", "2-year", "30Y bond", "5Y")
    const tenorMatch = q.match(/\b(2y|3y|5y|7y|10y|20y|30y)\b/i) ||
                       q.match(/\b(2-year|3-year|5-year|7-year|10-year|20-year|30-year)\b/i);

    if (tenorMatch && (q.includes('auction') || q.includes('demand') || q.includes('yield') || q.includes('stat') || q.includes('analyze') || q.includes('explain') || q.includes('how') || q.includes('detail') || q.includes('what'))) {
      const code = this.normalizeTenorCode(tenorMatch[0]);
      return this.explainTenor(code);
    }

    // 2. Yield curve & spreads queries
    if (q.includes('spread') || q.includes('yield curve') || q.includes('curve') || q.includes('2s10s') || q.includes('10s30s') || q.includes('2s5s') || q.includes('invert') || q.includes('steep')) {
      return this.explainYieldCurve();
    }

    // 3. Bid-to-cover explanation or queries
    if (q.includes('bid to cover') || q.includes('bid-to-cover') || q.includes('btc')) {
      return this.explainBidToCover();
    }

    // 4. Indirect / Direct / Primary dealer allotment takedown queries
    if (q.includes('indirect') || q.includes('dealer') || q.includes('direct') || q.includes('takedown') || q.includes('allotment') || q.includes('share') || q.includes('absorption')) {
      return this.explainTakedownShares();
    }

    // 5. Tail / Stop vs Median / Cut-off dispersion queries
    if (q.includes('tail') || q.includes('stop vs median') || q.includes('cut off') || q.includes('cutoff') || q.includes('dispersion') || q.includes('allotment at high')) {
      return this.explainTailsAndCutoff();
    }

    // 6. Upcoming schedule queries
    if (q.includes('upcoming') || q.includes('next') || q.includes('calendar') || q.includes('schedule') || q.includes('when is') || q.includes('future') || q.includes('issuance')) {
      return this.explainUpcoming();
    }

    // 7. Executive / Market Overview query
    if (q.includes('summary') || q.includes('overview') || q.includes('market') || q.includes('overall') || q.includes('tone') || q.includes('benchmark')) {
      return this.explainMarketOverview();
    }

    // 8. Help / What can you do / How does this dashboard work
    if (q.includes('help') || q.includes('guide') || q.includes('how to use') || q.includes('dashboard') || q.includes('what can you do') || q.includes('who are you')) {
      return this.explainDashboardGuide();
    }

    // 9. Selected auction drilldown (if user clicked a ledger row)
    if (q.includes('selected') || q.includes('inspected') || q.includes('this auction')) {
      return this.explainSelectedAuction();
    }

    // Default intelligent fallback: synthesizes key dashboard insights
    return this.generateGeneralAnalysis(query);
  }

  normalizeTenorCode(str) {
    const s = str.toUpperCase().replace('-YEAR', 'Y').replace('YEAR', 'Y').trim();
    if (['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'].includes(s)) return s;
    return '10Y';
  }

  explainTenor(tenorCode) {
    const stat = state.tenorStatsMap[tenorCode];
    if (!stat) {
      return `I don't have telemetry loaded for the **${tenorCode}** benchmark yet. Please ensure data is loaded or try syncing the feed.`;
    }

    const {
      highYield,
      priorHighYield,
      deltaHighYieldBp,
      bidToCover,
      btcPercentile,
      trailingMeanBtc,
      shares,
      dealerVsMedianDelta,
      stopVsMedianBp,
      allocationAtHighPct,
      quality,
      summary,
      auctionDate,
      offeringAmt,
      isReopening
    } = stat;

    const deltaSign = deltaHighYieldBp > 0 ? '+' : '';
    const btcPctRounded = btcPercentile !== null ? Math.round(btcPercentile) : 'N/A';
    const issueType = isReopening ? 'Reopening' : 'New Issue';

    let qualityExplanation = '';
    if (quality === 'STRONG') {
      qualityExplanation = `This auction earned a [STRONG] rating because Bid-to-Cover landed at the **${btcPctRounded}th percentile** with primary dealer absorption restrained to **${shares.dealerPct?.toFixed(1)}%**, reflecting robust direct/indirect institutional bidding.`;
    } else if (quality === 'SOFT') {
      qualityExplanation = `This auction cleared [SOFT] because Bid-to-Cover settled in the lower quartile (**${btcPctRounded}th percentile**) and primary dealers were forced to absorb **${shares.dealerPct?.toFixed(1)}%** of the issue, indicating end-investor hesitation.`;
    } else {
      qualityExplanation = `This auction settled [IN LINE] with historical norms. Demand was balanced with Bid-to-Cover around the **${btcPctRounded}th percentile** and dealers taking down a typical **${shares.dealerPct?.toFixed(1)}%**.`;
    }

    return `### 🏛️ ${tenorCode} Benchmark Telemetry (${auctionDate})

**Issue Type:** ${issueType} | **Offering Size:** $${(offeringAmt / 1e9).toFixed(1)}B
**Demand Grade:** [${quality}] (${summary})

#### 1. Pricing & Yield Action
- **Clearing High Yield:** \`${highYield?.toFixed(3)}%\`
- **Yield Change vs Prior Auction:** \`${deltaSign}${deltaHighYieldBp?.toFixed(1)} bp\` (Prior: \`${priorHighYield?.toFixed(3)}%\`)
- **Stop vs Median Dispersion:** \`${stopVsMedianBp?.toFixed(1)} bp\` (Allocation at High: \`${allocationAtHighPct?.toFixed(1)}%\`)

#### 2. Demand & Coverage Dynamics
- **Bid-to-Cover:** \`${bidToCover?.toFixed(2)}x\` (${btcPctRounded}th percentile vs trailing 20 auctions norm of \`${trailingMeanBtc?.toFixed(2)}x\`)
- **Foreign / Institutional (Indirect):** \`${shares.indirectPct?.toFixed(1)}%\` of competitive allotment
- **Domestic Non-Dealer (Direct):** \`${shares.directPct?.toFixed(1)}%\`
- **Primary Dealer Absorption:** \`${shares.dealerPct?.toFixed(1)}%\` (${dealerVsMedianDelta > 0 ? '+' : ''}${dealerVsMedianDelta?.toFixed(1)} pp vs trailing median)

#### 3. Institutional Interpretation
${qualityExplanation}

*Tip: Click the **Demand Dynamics** tab to view the trailing 14-auction heatmap and stacked historical takedown chart for ${tenorCode}.*`;
  }

  explainYieldCurve() {
    if (!state.spreads || state.spreads.length === 0) {
      return `Yield curve spreads have not finished calculating. Please verify data feed connectivity.`;
    }

    const s2s10 = state.spreads.find(s => s.name === '2s10s');
    const s2s5 = state.spreads.find(s => s.name === '2s5s');
    const s5s10 = state.spreads.find(s => s.name === '5s10s');
    const s10s30 = state.spreads.find(s => s.name === '10s30s');

    const stat2Y = state.tenorStatsMap['2Y'];
    const stat10Y = state.tenorStatsMap['10Y'];
    const stat30Y = state.tenorStatsMap['30Y'];

    const is2s10Inverted = s2s10 && s2s10.spreadBp < 0;

    return `### 📈 US Treasury Yield Curve & Benchmark Spreads

Here is the current curve telemetry derived from the latest clearing auction yields:

| Benchmark Spread | Value (bp) | Status | Short Tenor | Long Tenor |
| :--- | :---: | :---: | :---: | :---: |
| **2s10s** | \`${s2s10 ? s2s10.spreadBp.toFixed(1) : '—'} bp\` | ${is2s10Inverted ? '[INVERTED]' : '[NORMAL]'} | 2Y: \`${stat2Y?.highYield?.toFixed(3)}%\` | 10Y: \`${stat10Y?.highYield?.toFixed(3)}%\` |
| **2s5s** | \`${s2s5 ? s2s5.spreadBp.toFixed(1) : '—'} bp\` | ${s2s5?.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 2Y | 5Y |
| **5s10s** | \`${s5s10 ? s5s10.spreadBp.toFixed(1) : '—'} bp\` | ${s5s10?.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 5Y | 10Y |
| **10s30s** | \`${s10s30 ? s10s30.spreadBp.toFixed(1) : '—'} bp\` | ${s10s30?.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 10Y | 30Y: \`${stat30Y?.highYield?.toFixed(3)}%\` |

#### Institutional Significance:
1. **The 2s10s Spread:** Historically the bond market's premier bellwether for the business cycle.
   ${is2s10Inverted ? '- Currently **inverted**, meaning short-term borrowing yields exceed long-term yields. This historically reflects monetary policy tightness and anticipation of future rate cuts.' : '- Currently **positively sloped**, showing normal term premium where investors demand higher yield for longer duration risk.'}
2. **The 10s30s Spread:** Reflects fiscal supply expectations, term premia, and long-run inflation risk. A steepening 10s30s curve often indicates the market digesting heavy ultra-long issuance.

*Note: In this monitor, spreads are auction-implied (calculated from the most recent clearing yields of each respective tenor, whose auction dates may differ slightly).*`;
  }

  explainBidToCover() {
    return `### 🎯 Bid-to-Cover Ratio (BTC) Explained

**Formula:**
$$\\text{Bid-to-Cover} = \\frac{\\text{Total Tendered Bids}}{\\text{Total Accepted Bids}}$$

#### Why It Matters:
Bid-to-Cover is the fundamental demand multiplier of a Treasury auction. For example, a **2.50x BTC** means investors submitted \$2.50 in bids for every \$1.00 of debt the U.S. Treasury issued.

#### Institutional Benchmark Standards:
- **> 2.65x (Upper Quartile):** Robust appetite. Suggests broad excess demand and minimal dealer strain.
- **2.40x – 2.60x (Median Norm):** Balanced, orderly clearing. Typical for nominal Notes and Bonds.
- **< 2.30x (Lower Quartile):** Soft demand. Indicates cautious market participation, often forcing Primary Dealers to absorb a larger allotment.

#### Percentile Context on This Dashboard:
Because natural BTC averages differ across maturities (e.g., a 2Y note regularly sees higher BTC than a 30Y bond due to shorter duration), our dashboard evaluates BTC against the **trailing 20 auctions of that exact tenor** to determine whether it is statistically **Strong**, **In Line**, or **Soft**.`;
  }

  explainTakedownShares() {
    return `### 👥 Allotment Takedown Shares (Indirect vs Direct vs Dealers)

Competitive bids accepted by the Treasury are split among three participant categories:

#### 1. Indirect Bidders (Global Institutional & Foreign Central Banks)
- **Who they are:** Foreign central banks, international monetary authorities, and global institutional investors bidding through designated dealer conduits.
- **Healthy Range:** Typically **60% to 75%** of competitive allotment.
- **Signal:** High indirect bidding demonstrates strong international confidence in U.S. dollar sovereign debt.

#### 2. Direct Bidders (Domestic Non-Dealer Institutions)
- **Who they are:** Domestic pension funds, insurance companies, hedge funds, mutual funds, and commercial banks bidding for their own proprietary accounts.
- **Healthy Range:** Typically **10% to 22%**.
- **Signal:** Direct bids highlight real-money domestic appetite for duration.

#### 3. Primary Dealers (Underwriter Absorption / The Residual)
- **Who they are:** The 24 Wall Street trading firms (e.g., Goldman Sachs, JPMorgan, Morgan Stanley) obligated by the Federal Reserve Bank of New York to participate in every Treasury auction.
- **Healthy Range:** Ideally **under 15% to 18%**.
- **The "Dealer Overhang" Warning:** Primary Dealers are underwriters. Whatever end-investors don't purchase, dealers are forced to absorb into inventory. A dealer share above **20%–25%** signals indigestion and soft end-user demand.`;
  }

  explainTailsAndCutoff() {
    return `### ⏱️ Tails & Stop vs Median Dispersion

#### What is an Auction "Tail"?
A **tail** occurs when the final clearing yield (the "stop-out" or high yield) is higher than the prevailing market yield just prior to the 1:00 PM ET bidding deadline (the "When-Issued" or WI yield).
- **Tail (> +0.5 to +2.0 bp):** Dealers had to widen yield concessions to entice enough buyers. This is a clear indicator of **soft demand**.
- **Inside Stop / Negative Tail (-0.5 to -2.0 bp):** The auction stopped through the pre-auction rate, meaning bidding was aggressive and competitive (**strong demand**).

#### What is Stop vs Median Dispersion?
$$\\text{Stop vs Median} = (\\text{High Yield} - \\text{Average/Median Yield}) \\times 100 \\text{ (in basis points)}$$
- Measures cut-off dispersion across the bidder spectrum.
- In tightly grouped, aggressive auctions, this spread is near zero (0.0 to 0.5 bp).
- A wide dispersion (> 1.5 bp) means the Treasury had to accept bids at significantly higher yields to clear the total offering amount.

#### Allocation at High %
- The fraction of bids awarded at the final clearing high yield.
- If an auction stops at 4.435% with **15% allocation at high**, it means only 15% of bids at 4.435% were accepted because demand was nearly filled above that yield.
- If allocation is **100%**, every bidder at that cut-off received an allocation, indicating softer pricing tension.`;
  }

  explainUpcoming() {
    if (!state.upcomingAuctions || state.upcomingAuctions.length === 0) {
      return `No upcoming Treasury note or bond auctions are currently scheduled in the Fiscal Data feed.`;
    }

    const items = state.upcomingAuctions.slice(0, 6);
    const rows = items.map(item => {
      const isReopen = String(item.reopening || '').toLowerCase() === 'yes';
      const tenor = item.tenorCode || item.security_term;
      return `- **${item.auction_date} (1:00 PM ET):** **${tenor}** (${isReopen ? 'Reopening' : 'New Issue'}) — Size: **${item.offeringDisplay}** (CUSIP: \`${item.cusip || 'Pending'}\`)`;
    }).join('\n');

    return `### 📅 Upcoming Treasury Benchmark Issuances

Here are the next scheduled auctions from the U.S. Department of the Treasury:

${rows}

*Tip: Head over to the **Upcoming Schedule** tab to see live ET countdowns and offering size announcements.*`;
  }

  explainMarketOverview() {
    const codes = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
    let strongCount = 0;
    let softCount = 0;
    let inLineCount = 0;

    const breakdown = codes.map(code => {
      const s = state.tenorStatsMap[code];
      if (!s) return null;
      if (s.quality === 'STRONG') strongCount++;
      else if (s.quality === 'SOFT') softCount++;
      else inLineCount++;

      return `- **${code}:** Yield \`${s.highYield?.toFixed(3)}%\` | BTC \`${s.bidToCover?.toFixed(2)}x\` | Dealer \`${s.shares?.dealerPct?.toFixed(1)}%\` | [${s.quality}]`;
    }).filter(Boolean).join('\n');

    const total = strongCount + softCount + inLineCount;
    let sentiment = 'balanced and orderly';
    if (strongCount > softCount && strongCount >= 3) sentiment = 'robust with strong international & end-investor absorption';
    if (softCount > strongCount && softCount >= 2) sentiment = 'cautious with pockets of dealer inventory buildup';

    return `### 📊 Cross-Benchmark Executive Summary

Overall market tone is **${sentiment}** across the **${total}** primary nominal benchmarks:

- [STRONG] Benchmarks: **${strongCount}**
- [IN LINE] Benchmarks: **${inLineCount}**
- [SOFT] Benchmarks: **${softCount}**

#### Latest Clearing Snapshot:
${breakdown}

*Would you like to examine a specific maturity, or drill into the yield curve slope?*`;
  }

  explainDashboardGuide() {
    return `### 🧭 How to Navigate this Institutional Terminal

This monitor is engineered to deliver institutional-grade clarity without visual clutter:

1. **⚡ Executive Overview:** High-level summary of active benchmark rates, live Next Auction tracker, and key market structure cards.
2. **📈 Yield Curve & Spreads:** Dedicated yield curve plot comparing latest clearings with ~1 month prior, plus real-time benchmark spread matrix (2s5s, 2s10s, 5s10s, 10s30s).
3. **🎯 Demand Dynamics:** Tenor-by-tenor deep dive with a 14-auction demand heatmap, Bid-to-Cover percentile rankings, and 100% stacked takedown bar charts (Indirect vs Direct vs Dealer).
4. **📋 Historical Results Ledger:** Complete searchable database of Treasury Note & Bond auctions with CUSIP search, tenor filters, and side-drawer telemetry.
5. **📅 Upcoming Calendar:** 14-day schedule of future Treasury auctions with live ET countdowns.
6. **💬 AI Analyst (This Chatbot):** Ask any question about bond auctions, curve inversion, dealer tails, or specific tenors!`;
  }

  explainSelectedAuction() {
    const a = state.selectedAuction;
    if (!a) {
      return `No specific auction is currently selected. Click any row in the **Results Ledger** to inspect its full forensics!`;
    }

    const code = getTenorCode(a) || a.security_term;
    const isReopen = String(a.reopening || '').toLowerCase() === 'yes';
    const highYield = parseNum(a.high_yield);
    const btc = parseNum(a.bid_to_cover_ratio);
    const offeringAmt = parseNum(a.offering_amt);

    return `### 🔍 Selected Auction: ${code} (${a.auction_date})

- **CUSIP:** \`${a.cusip}\`
- **Type:** ${isReopen ? 'Reopening' : 'New Issue'}
- **High Yield:** \`${highYield !== null ? highYield.toFixed(3) : '—'}%\`
- **Bid-to-Cover:** \`${btc !== null ? btc.toFixed(2) : '—'}x\`
- **Offering Amount:** $${offeringAmt ? (offeringAmt / 1e9).toFixed(2) : '—'}B
- **Settlement Date:** ${a.issue_date || '—'}
- **Maturity Date:** ${a.maturity_date || '—'}

Click **Open Side Drawer** or ask me any question about this security!`;
  }

  generateGeneralAnalysis(query) {
    const stat10Y = state.tenorStatsMap['10Y'];
    const s2s10 = state.spreads?.find(s => s.name === '2s10s');

    return `I analyzed your inquiry: *"**${query}**"*.

Here are key related insights from current Treasury auction telemetry:
- **10-Year Benchmark:** Currently clearing at \`${stat10Y?.highYield?.toFixed(3)}%\` with a Bid-to-Cover of \`${stat10Y?.bidToCover?.toFixed(2)}x\` ([${stat10Y?.quality || 'IN LINE'}]).
- **2s10s Curve Spread:** Standing at \`${s2s10 ? s2s10.spreadBp.toFixed(1) : '—'} bp\` (${s2s10?.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'}).
- **Allotment Distribution:** Foreign Central Banks & Global Institutions (Indirect) currently account for \`${stat10Y?.shares?.indirectPct?.toFixed(1)}%\` of the 10Y takedown.

Feel free to ask for a deeper drill-down, e.g.:
- *"Explain 10Y auction quality"*
- *"What is Bid-to-Cover?"*
- *"Is the curve inverted?"*
- *"What are dealer tails?"*`;
  }
}

export const chatbot = new AuctionChatbot();

