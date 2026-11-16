/**
 * chatbot.js - Institutional US Treasury Auction AI Analyst
 * Provides in-depth financial explanations of dashboard data, yield curve dynamics,
 * auction mechanics (tails, bid-to-cover, allotment shares), and live market telemetry.
 */

import { state } from './state.js';
import { getTenorCode, parseNum, calculateTakedownShares, calculateStopVsMedianBps, getAllocationAtHighPct, isProjectTopic, getOffTopicRefusal } from './analytics.js';

const DEFAULT_GROQ_KEY = '';

function safeFixed(val, digits = 1) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? Number(num.toFixed(digits)) : null;
}

function safeRound(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class AuctionChatbot {
  constructor() {
    this.history = [];
    this.isOpen = false;
    this.dom = {};
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('ff_groq_api_key') : null;
    this.groqApiKey = stored !== null && stored !== '' ? stored : DEFAULT_GROQ_KEY;
  }

  init() {
    this.cacheDom();
    this.bindEvents();
    this.updateGroqStatusUI();
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

    // Groq configuration elements
    this.dom.groqStatusPillStudio = document.getElementById('groqStatusPillStudio');
    this.dom.groqDotStudio = document.getElementById('groqDotStudio');
    this.dom.groqLabelStudio = document.getElementById('groqLabelStudio');
    this.dom.btnGroqConfigStudio = document.getElementById('btnGroqConfigStudio');
    this.dom.btnGroqConfigFloat = document.getElementById('btnGroqConfigFloat');
    this.dom.groqModal = document.getElementById('groqKeyModal');
    this.dom.groqModalClose = document.getElementById('btnGroqModalClose');
    this.dom.groqModalBackdrop = document.getElementById('groqModalBackdrop');
    this.dom.inputGroqApiKey = document.getElementById('inputGroqApiKey');
    this.dom.btnToggleGroqEye = document.getElementById('btnToggleGroqEye');
    this.dom.btnSaveGroqKey = document.getElementById('btnSaveGroqKey');
    this.dom.btnTestGroqKey = document.getElementById('btnTestGroqKey');
    this.dom.btnClearGroqKey = document.getElementById('btnClearGroqKey');
    this.dom.groqTestFeedback = document.getElementById('groqTestFeedback');
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

    // Groq configuration modal triggers
    this.dom.btnGroqConfigStudio?.addEventListener('click', () => this.openGroqModal());
    this.dom.btnGroqConfigFloat?.addEventListener('click', () => this.openGroqModal());
    this.dom.groqModalClose?.addEventListener('click', () => this.closeGroqModal());
    this.dom.groqModalBackdrop?.addEventListener('click', () => this.closeGroqModal());

    // Toggle Eye (Show / Hide Key)
    this.dom.btnToggleGroqEye?.addEventListener('click', () => {
      if (!this.dom.inputGroqApiKey) return;
      const isPwd = this.dom.inputGroqApiKey.type === 'password';
      this.dom.inputGroqApiKey.type = isPwd ? 'text' : 'password';
      this.dom.btnToggleGroqEye.textContent = isPwd ? '🔒' : '👁️';
    });

    // Save Groq key
    this.dom.btnSaveGroqKey?.addEventListener('click', () => {
      const val = this.dom.inputGroqApiKey?.value.trim() || '';
      if (val) {
        this.setGroqKey(val);
        this.showGroqFeedback('✓ Key saved successfully. Groq AI connected!', 'success');
        setTimeout(() => this.closeGroqModal(), 800);
      } else {
        this.showGroqFeedback('Please paste your Groq API key from console.groq.com/keys', 'error');
      }
    });

    // Test Groq key
    this.dom.btnTestGroqKey?.addEventListener('click', async () => {
      const val = this.dom.inputGroqApiKey?.value.trim() || this.groqApiKey;
      if (!val) {
        this.showGroqFeedback('Please enter an API key to test.', 'error');
        return;
      }
      this.showGroqFeedback('Testing connection to Groq LPU (qwen/qwen3.8-27b)...', 'loading');
      try {
        const start = performance.now();
        await this.testGroqKey(val);
        const elapsed = Math.round(performance.now() - start);
        this.showGroqFeedback(`✓ Verified! Connected to Groq LPU in ${elapsed}ms (qwen/qwen3.8-27b).`, 'success');
      } catch (err) {
        this.showGroqFeedback(`✕ Connection failed: ${err.message}`, 'error');
      }
    });

    // Clear Groq key
    this.dom.btnClearGroqKey?.addEventListener('click', () => {
      this.clearGroqKey();
      if (this.dom.inputGroqApiKey) this.dom.inputGroqApiKey.value = '';
      this.showGroqFeedback('Key removed. Reverted to built-in telemetry analysis.', 'loading');
      setTimeout(() => this.closeGroqModal(), 800);
    });

    // Enter key saves in input
    this.dom.inputGroqApiKey?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.dom.btnSaveGroqKey?.click();
      }
    });

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

  openGroqModal() {
    if (this.dom.groqModal) {
      if (this.dom.inputGroqApiKey) {
        this.dom.inputGroqApiKey.value = this.getGroqKey();
      }
      if (this.dom.groqTestFeedback) {
        this.dom.groqTestFeedback.style.display = 'none';
        this.dom.groqTestFeedback.className = 'groq-test-feedback';
        this.dom.groqTestFeedback.textContent = '';
      }
      this.dom.groqModal.classList.add('is-open');
      setTimeout(() => this.dom.inputGroqApiKey?.focus(), 150);
    }
  }

  closeGroqModal() {
    this.dom.groqModal?.classList.remove('is-open');
  }

  showGroqFeedback(msg, type = 'loading') {
    if (!this.dom.groqTestFeedback) return;
    this.dom.groqTestFeedback.style.display = 'block';
    this.dom.groqTestFeedback.className = `groq-test-feedback ${type}`;
    this.dom.groqTestFeedback.textContent = msg;
  }

  getGroqKey() {
    if (this.groqApiKey !== undefined && this.groqApiKey !== null) return this.groqApiKey;
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('ff_groq_api_key');
      if (stored !== null) {
        this.groqApiKey = stored;
        return stored;
      }
    }
    return DEFAULT_GROQ_KEY;
  }

  setGroqKey(key) {
    this.groqApiKey = (key || '').trim();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ff_groq_api_key', this.groqApiKey);
    }
    this.updateGroqStatusUI();
  }

  clearGroqKey() {
    this.groqApiKey = '';
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ff_groq_api_key');
    }
    this.updateGroqStatusUI();
  }

  updateGroqStatusUI() {
    const hasKey = Boolean(this.getGroqKey());
    if (this.dom.groqDotStudio) {
      this.dom.groqDotStudio.classList.toggle('active', hasKey);
      this.dom.groqDotStudio.classList.toggle('standby', !hasKey);
    }
    if (this.dom.groqLabelStudio) {
      this.dom.groqLabelStudio.textContent = hasKey ? 'Groq LPU: Active' : 'Groq AI: Add Key';
    }
    if (this.dom.btnGroqConfigStudio) {
      this.dom.btnGroqConfigStudio.title = hasKey ? 'Groq Key Active (Click to edit)' : 'Configure Groq API Key (console.groq.com/keys)';
    }
  }

  async testGroqKey(candidateKey) {
    const key = candidateKey || this.getGroqKey();
    if (!key) throw new Error('Missing API key');

    // First attempt through server proxy with 5s timeout
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'Ping. Output only: OK',
          apiKey: key,
          context: { ping: true }
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        return await res.json();
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    } catch (apiErr) {
      // Direct call fallback for standalone client with 5s timeout
      const direct = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [{ role: 'user', content: 'Ping. Output only: OK' }],
          max_completion_tokens: 10
        }),
        signal: AbortSignal.timeout(5000)
      });
      if (!direct.ok) {
        const dErr = await direct.json().catch(() => ({}));
        throw new Error(dErr.error?.message || `HTTP ${direct.status}`);
      }
      return await direct.json();
    }
  }

  buildTelemetryContext() {
    const context = {
      asOf: new Date().toISOString(),
      dataSource: state.dataSource || 'Treasury Fiscal Data REST API',
      benchmarks: {},
      spreads: (state.spreads || []).map(s => {
        const bp = safeFixed(s.spreadBp, 1);
        return {
          name: s.name,
          spreadBp: bp,
          isInverted: bp !== null && bp < 0,
          shortYield: safeFixed(s.shortYield, 3),
          longYield: safeFixed(s.longYield, 3)
        };
      }),
      selectedAuction: state.selectedAuction ? {
        cusip: state.selectedAuction.cusip,
        tenor: getTenorCode(state.selectedAuction) || state.selectedAuction.security_term,
        auctionDate: state.selectedAuction.auction_date,
        highYield: safeFixed(parseNum(state.selectedAuction.high_yield), 3),
        avgYield: safeFixed(parseNum(state.selectedAuction.avg_med_yield), 3),
        btc: safeFixed(parseNum(state.selectedAuction.bid_to_cover_ratio), 2),
        offeringAmt: parseNum(state.selectedAuction.offering_amt),
        reopening: state.selectedAuction.reopening
      } : null,
      upcomingSchedule: (state.upcomingAuctions || []).slice(0, 5).map(u => ({
        tenor: u.tenorCode || u.security_term,
        date: u.auction_date,
        offering: u.offeringDisplay || u.offering_amt,
        reopening: u.reopening
      }))
    };

    const benchmarkCodes = ['2Y', '3Y', '5Y', '7Y', '10Y', '20Y', '30Y'];
    for (const code of benchmarkCodes) {
      const stat = state.tenorStatsMap?.[code];
      if (stat) {
        const indPct = safeFixed(stat.indirectPct ?? stat.shares?.indirectPct, 1);
        const dirPct = safeFixed(stat.directPct ?? stat.shares?.directPct, 1);
        const dlrPct = safeFixed(stat.dealerPct ?? stat.shares?.dealerPct, 1);

        context.benchmarks[code] = {
          highYield: safeFixed(stat.highYield, 3),
          priorHighYield: safeFixed(stat.priorHighYield, 3),
          deltaBp: safeFixed(stat.deltaHighYieldBp, 1),
          bidToCover: safeFixed(stat.bidToCover, 2),
          btcPercentile: safeRound(stat.btcPercentile),
          trailingMeanBtc: safeFixed(stat.trailingMeanBtc, 2),
          shares: {
            indirectPct: indPct,
            directPct: dirPct,
            dealerPct: dlrPct
          },
          stopVsMedianBp: safeFixed(stat.stopVsMedianBp, 1),
          allocationAtHighPct: safeFixed(stat.allocationAtHighPct, 1),
          quality: typeof stat.quality === 'object' ? stat.quality?.label : (stat.quality || 'IN LINE'),
          auctionDate: stat.auctionDate,
          offeringAmtB: stat.offeringAmt ? safeFixed(stat.offeringAmt / 1e9, 1) : null
        };
      }
    }

    return context;
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

  async ask(question) {
    if (!question || !question.trim()) return;

    const trimmed = question.trim();

    // Add user message
    this.history.push({
      sender: 'user',
      timestamp: new Date(),
      text: trimmed
    });
    this.renderMessages();

    // Show typing indicator
    this.showTyping();

    // Ensure browser paints typing indicator before network requests begin
    await new Promise(r => setTimeout(r, 250));

    const groqKey = (this.getGroqKey() && this.getGroqKey().trim()) ? this.getGroqKey().trim() : DEFAULT_GROQ_KEY;
    let botResponse = '';
    let sourceTag = '';
    let answered = false;

    // Strict project topic boundary guardrail
    if (!this.isProjectTopic(trimmed)) {
      botResponse = this.explainOffTopic();
      sourceTag = '🏛️ Institutional Guardrail';
      answered = true;
    }

    try {
      // 1. Attempt Groq API Inference via /api/chat backend proxy (5s timeout)
      if (!answered) {
        try {
          const historyForBackend = this.history.slice(0, -1).slice(-6);
          const payload = {
            query: trimmed,
            apiKey: groqKey,
            model: 'qwen/qwen3.8-27b',
            context: this.buildTelemetryContext(),
            history: historyForBackend
          };

          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000)
          });

          if (res.ok) {
            const data = await res.json();
            if (data.answer) {
              botResponse = data.answer;
              sourceTag = `⚡ Groq LPU (${data.model || 'qwen/qwen3.8-27b'})`;
              answered = true;
            }
          } else {
            console.warn(`/api/chat returned status ${res.status}, falling back to direct browser Groq API`);
          }
        } catch (err) {
          console.warn('/api/chat unreachable or timed out (5s), falling back to direct browser Groq API:', err.message);
        }
      }

      // 2. If /api/chat did not answer, query Groq API directly from browser (6s timeout)
      if (!answered && groqKey) {
        try {
          console.log('Querying Groq API directly from browser...');
          const directResult = await this.queryGroqDirect(trimmed, groqKey);
          if (directResult && directResult.content) {
            botResponse = directResult.content;
            sourceTag = `⚡ Groq LPU (${directResult.model || 'qwen/qwen3.8-27b'})`;
            answered = true;
          }
        } catch (directErr) {
          console.error('Direct Groq API query failed:', directErr.message);
        }
      }

      // 3. Deterministic Institutional Rule Engine fallback if Groq was unreachable or timed out
      if (!answered) {
        console.warn('Groq unavailable, generating deterministic institutional response');
        botResponse = this.generateResponse(trimmed);
        sourceTag = '🏛️ Built-in Telemetry Engine';
      }

    } catch (globalErr) {
      console.error('Chatbot ask error:', globalErr);
      try {
        botResponse = this.generateResponse(trimmed);
        sourceTag = '🏛️ Built-in Telemetry Engine';
      } catch (genErr) {
        console.error('generateResponse fallback error:', genErr);
        botResponse = `### 🏛️ Institutional Telemetry Notice\n\nI was unable to complete the analysis for *"**${trimmed}**"*. Please verify data feed connectivity or try asking about a specific benchmark (e.g. 2Y, 10Y, 30Y).`;
        sourceTag = '⚠️ Diagnostic Notice';
      }
    } finally {
      // ALWAYS hide typing indicator even if network stalls or throws
      this.hideTyping();
    }

    this.history.push({
      sender: 'bot',
      timestamp: new Date(),
      text: botResponse,
      sourceTag
    });
    this.renderMessages();
  }

  async queryGroqDirect(query, apiKey) {
    const key = apiKey || this.getGroqKey() || DEFAULT_GROQ_KEY;
    const context = this.buildTelemetryContext();
    const systemPrompt = `You are the Institutional US Treasury & Macro Telemetry Analyst.
You specialize strictly in fixed-income debt capital markets, Treasury note & bond auctions (2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y), primary dealer takedown dynamics, and yield curve term structure.
Important: In U.S. Treasury debt capital markets, "BTC" strictly refers to the "Bid-to-Cover" demand ratio (total tendered bids divided by total accepted bids), NEVER cryptocurrency.

Here is the LIVE, REAL-TIME U.S. Treasury auction data currently loaded on the dashboard:
${JSON.stringify(context, null, 2)}

STRICT SCOPE POLICY & TOPIC GUARDRAILS:
You must ONLY answer questions directly related to:
1. U.S. Treasury note and bond auctions (2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y) and debt issuance mechanics.
2. Auction demand metrics: Bid-to-Cover (BTC), high clearing yield, median yield, cut-off tails, stop vs. median dispersion, allocation at high %.
3. Competitive bidding allotments: Indirect bidders (foreign central banks/institutions), Direct bidders, and Primary Dealer absorption/overhang.
4. Yield curve dynamics and benchmark spreads (2s5s, 2s10s, 5s10s, 10s30s, inversion, curve steepening/flattening, term premium).
5. CUSIP lookups, historical auction ledger data, and upcoming Treasury issuance calendars.
6. Macroeconomic factors and Federal Reserve monetary policy directly impacting Treasury debt auctions and duration appetite.

STRICT REFUSAL RULE FOR OFF-TOPIC QUESTIONS:
If the user asks ANY question outside this domain (including but not limited to: general programming, writing code in other languages, recipes, weather, general trivia, history, pop culture, sports, creative writing, poetry, personal advice, unrelated financial assets like individual equities or cryptocurrencies, or casual chit-chat unrelated to Treasuries):
YOU MUST STRICTLY REFUSE TO ANSWER.
Do NOT fulfill the off-topic request. Do NOT provide code, recipes, trivia, or answers to off-topic questions.
Reply ONLY with a firm institutional refusal:
"I am specialized exclusively in U.S. Treasury Securities auctions, yield curve dynamics, and fixed-income market telemetry. I strictly refrain from answering off-topic questions. Please ask a question related to Treasury auctions (2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y), auction mechanics (Bid-to-Cover, tails, dealer takedown), or benchmark spreads."

Instructions:
1. Ground your answers in the exact live numbers above whenever relevant.
2. Structure your answers with clear markdown headings, bullet points, and concise institutional clarity.
3. Use signal tags when appropriate: [STRONG], [IN LINE], [SOFT], [INVERTED], [NORMAL].
4. Provide sophisticated institutional insight (dealer overhang, cut-off tails, duration supply, term premium).
5. FORMATTED LATEX RESPONSES: Format mathematical formulas, spreads, ratios, and bond calculations using standard LaTeX notation:
   - Use display math blocks $$...$$ for key equations (e.g. Bid-to-Cover ratio, Stop vs Median dispersion, Dealer absorption %, spread bp calculations, DV01/duration).
   - Use inline math $...$ or \\(...\\) for variables and formulas within sentences (e.g. $BTC = 2.52x$, $\\Delta y = +2.0\\text{ bp}$, $2s10s = y_{10Y} - y_{2Y}$).
   - Never write raw unformatted text fractions like "(High - Median) * 100" when explaining calculations—always write formatted LaTeX:
     $$\\text{Stop vs Median (bp)} = (y_{\\text{high}} - y_{\\text{median}}) \\times 100$$
6. Be concise, sharp, and helpful like a senior Wall Street fixed-income strategist.`;

    const messages = [{ role: 'system', content: systemPrompt }];
    const priorHistory = this.history.slice(0, -1).slice(-6);
    for (const h of priorHistory) {
      if (h.sender === 'user') messages.push({ role: 'user', content: h.text });
      else if (h.sender === 'bot') messages.push({ role: 'assistant', content: h.text });
    }
    messages.push({ role: 'user', content: query });

    const modelsToTry = ['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    for (const model of modelsToTry) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.3,
            max_completion_tokens: 1024
          }),
          signal: AbortSignal.timeout(6000)
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) return { content, model: data.model || model };
        } else {
          console.warn(`Direct Groq call with model ${model} returned HTTP ${res.status}`);
        }
      } catch (fetchErr) {
        console.warn(`Direct Groq call error with model ${model}:`, fetchErr.message);
      }
    }
    return null;
  }

  showTyping() {
    this.hideTyping();
    const typingHtml = `
      <div class="chat-msg bot typing-indicator" id="typingIndicator">
        <div class="msg-avatar">UST</div>
        <div class="msg-bubble typing-bubble">
          <div class="typing-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </div>
          <span class="typing-label">Analyzing auction telemetry with Groq LPU...</span>
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
    if (typeof document !== 'undefined') {
      document.querySelectorAll('#typingIndicator').forEach(el => el.remove());
    }
  }

  renderMessages() {
    const renderTarget = (container) => {
      if (!container) return;
      container.innerHTML = this.history.map((msg) => {
        const isBot = msg.sender === 'bot';
        const formattedText = this.formatMarkdown(msg.text);
        const timeStr = msg.timestamp ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const sourceHtml = msg.sourceTag ? `<span class="msg-source-tag">${msg.sourceTag}</span>` : '';
        return `
          <div class="chat-msg ${isBot ? 'bot' : 'user'}">
            <div class="msg-avatar">${isBot ? 'UST' : 'You'}</div>
            <div class="msg-content">
              <div class="msg-bubble">${formattedText}</div>
              <div class="msg-meta-row">
                <span class="msg-time">${timeStr}</span>
                ${isBot ? sourceHtml : ''}
              </div>
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

    const mathTokens = [];

    // Helper to render math via KaTeX if available, else semantic fallback
    const renderMath = (mathCode, isBlock) => {
      let rendered = '';
      const hasKaTeX = typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function';
      if (hasKaTeX) {
        try {
          rendered = window.katex.renderToString(mathCode, {
            displayMode: isBlock,
            throwOnError: false
          });
        } catch (err) {
          rendered = `<code class="math-fallback">${escapeHtml(mathCode)}</code>`;
        }
      } else {
        rendered = `<code class="math-fallback ${isBlock ? 'math-block' : 'math-inline'}">${escapeHtml(mathCode)}</code>`;
      }

      const token = isBlock ? `___MATH_BLOCK_${mathTokens.length}___` : `___MATH_INLINE_${mathTokens.length}___`;
      const wrapper = isBlock ? `<div class="chat-math-block">${rendered}</div>` : `<span class="chat-math-inline">${rendered}</span>`;
      mathTokens.push({ token, html: wrapper });
      return token;
    };

    // 1. Fenced Code Blocks (protect against math / markdown parser)
    const codeBlockTokens = [];
    let s = text.replace(/```([a-z0-9_-]*)\n([\s\S]*?)```/gi, (match, lang, code) => {
      const token = `___CODE_BLOCK_${codeBlockTokens.length}___`;
      const safeCode = escapeHtml(code.trim());
      codeBlockTokens.push({
        token,
        html: `<pre class="chat-pre"><code class="chat-code-block lang-${lang || 'text'}">${safeCode}</code></pre>`
      });
      return token;
    });

    // 2. Block LaTeX: $$...$$ or \[...\]
    s = s.replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]/g, (match, p1, p2) => {
      const math = (p1 !== undefined ? p1 : p2 || '').trim();
      return renderMath(math, true);
    });

    // 3. Inline LaTeX: \(...\) or $...$ (ignoring currency like $42.0B or $100)
    s = s.replace(/\\\(([\s\S]*?)\\\)|\$(?!\s|\d)([^$\n\r]*?[^\s$\n\r])\$/g, (match, p1, p2) => {
      const math = (p1 !== undefined ? p1 : p2 || '').trim();
      return renderMath(math, false);
    });

    // 5. Escape HTML for the remaining markdown prose
    s = escapeHtml(s);

    // 6. Markdown Headings
    s = s.replace(/^#### (.*)$/gm, '<h5 class="chat-subheading">$1</h5>');
    s = s.replace(/^### (.*)$/gm, '<h4 class="chat-heading">$1</h4>');
    s = s.replace(/^## (.*)$/gm, '<h3 class="chat-heading-lg">$1</h3>');

    // 7. Horizontal Rules
    s = s.replace(/^---+$/gm, '<hr class="chat-hr">');

    // 8. Markdown Tables
    s = s.replace(/((?:^[ \t]*\|.+?\|[ \t]*\r?\n)+(?:^[ \t]*\|[-: |]+\|[ \t]*\r?\n)(?:^[ \t]*\|.+?\|[ \t]*(?:\r?\n|$))+)/gm, (tableMatch) => {
      const lines = tableMatch.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return tableMatch;

      const parseRow = row => row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const headerCols = parseRow(lines[0]);
      const bodyRows = lines.slice(2).map(parseRow);

      const ths = headerCols.map(c => `<th>${c}</th>`).join('');
      const trs = bodyRows.map(row => {
        const tds = row.map(c => `<td>${c}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');

      return `<div class="chat-table-wrap"><table class="chat-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
    });

    // 9. Bold & Italics & Inline Code & Links & Quotes
    s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g, '<code class="chat-code">$1</code>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="chat-link">$1</a>');
    s = s.replace(/^&gt;\s+(.*)$/gm, '<blockquote class="chat-quote">$1</blockquote>');

    // 10. Lists
    s = s.replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>');
    s = s.replace(/^\s*(\d+)\.\s+(.*)$/gm, '<li><strong>$1.</strong> $2</li>');
    s = s.replace(/(<li>.*?<\/li>(\s*<li>.*?<\/li>)*)/gs, '<ul class="chat-list">$1</ul>');

    // 11. Quality Badges
    s = s.replace(/\[STRONG\]/g, '<span class="chat-badge strong">▲ STRONG</span>');
    s = s.replace(/\[SOFT\]/g, '<span class="chat-badge soft">▼ SOFT</span>');
    s = s.replace(/\[IN LINE\]/g, '<span class="chat-badge inline">▬ IN LINE</span>');
    s = s.replace(/\[INVERTED\]/g, '<span class="chat-badge inverted">⚠️ INVERTED</span>');
    s = s.replace(/\[NORMAL\]/g, '<span class="chat-badge normal">✓ NORMAL</span>');

    // 12. Paragraph breaks
    s = s.replace(/\n\n+/g, '</p><p>');
    s = `<p>${s}</p>`.replace(/<p><\/p>/g, '');

    // 13. Restore Code Blocks
    codeBlockTokens.forEach(t => {
      s = s.replace(t.token, t.html);
    });

    // 14. Restore Math Tokens
    mathTokens.forEach(t => {
      s = s.replace(t.token, t.html);
    });

    return s;
  }

  isProjectTopic(query) {
    return isProjectTopic(query);
  }

  explainOffTopic() {
    return getOffTopicRefusal();
  }

  /**
   * Analytical reasoning engine: uses exact numbers from state to generate bespoke institutional answers.
   */
  generateResponse(query) {
    if (!this.isProjectTopic(query)) {
      return this.explainOffTopic();
    }
    const q = query.toLowerCase();

    // 0. Direct CUSIP Lookup (e.g. "91282CRX1")
    const cusipMatch = query.match(/\b([0-9]{3}[0-9a-zA-Z]{5}[0-9a-zA-Z])\b/i);
    if (cusipMatch) {
      const targetCusip = cusipMatch[1].toUpperCase();
      const match = state.nominalAuctions?.find(a => String(a.cusip || '').toUpperCase() === targetCusip);
      if (match) {
        return this.explainAuctionByRow(match);
      }
    }

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
    const stat = state.tenorStatsMap?.[tenorCode];
    if (!stat) {
      return `I don't have telemetry loaded for the **${tenorCode}** benchmark yet. Please ensure data is loaded or try syncing the feed.`;
    }

    const highYield = stat.highYield;
    const priorHighYield = stat.priorHighYield;
    const deltaHighYieldBp = stat.deltaHighYieldBp;
    const bidToCover = stat.bidToCover;
    const btcPercentile = stat.btcPercentile;
    const trailingMeanBtc = stat.trailingMeanBtc;
    const dealerVsMedianDelta = stat.dealerVsMedianDelta;
    const stopVsMedianBp = stat.stopVsMedianBp;
    const allocationAtHighPct = stat.allocationAtHighPct;
    const quality = typeof stat.quality === 'object' ? stat.quality?.label : (stat.quality || 'IN LINE');
    const summary = stat.summary || (quality === 'STRONG' ? 'Robust demand' : quality === 'SOFT' ? 'Weak demand' : 'Balanced demand');
    const auctionDate = stat.auctionDate || 'Recent';
    const offeringAmt = stat.offeringAmt;
    const isReopening = stat.isReopening;

    const indirectPct = stat.indirectPct ?? stat.shares?.indirectPct;
    const directPct = stat.directPct ?? stat.shares?.directPct;
    const dealerPct = stat.dealerPct ?? stat.shares?.dealerPct;

    const deltaSign = (deltaHighYieldBp !== null && deltaHighYieldBp !== undefined && deltaHighYieldBp > 0) ? '+' : '';
    const btcPctRounded = btcPercentile !== null && btcPercentile !== undefined ? Math.round(btcPercentile) : 'N/A';
    const issueType = isReopening ? 'Reopening' : 'New Issue';

    let qualityExplanation = '';
    const dealerDisplay = (dealerPct !== null && dealerPct !== undefined) ? `${dealerPct.toFixed(1)}%` : 'typical levels';
    if (quality === 'STRONG') {
      qualityExplanation = `This auction earned a [STRONG] rating because Bid-to-Cover landed at the **${btcPctRounded}th percentile** with primary dealer absorption restrained to **${dealerDisplay}**, reflecting robust direct/indirect institutional bidding.`;
    } else if (quality === 'SOFT') {
      qualityExplanation = `This auction cleared [SOFT] because Bid-to-Cover settled in the lower quartile (**${btcPctRounded}th percentile**) and primary dealers were forced to absorb **${dealerDisplay}** of the issue, indicating end-investor hesitation.`;
    } else {
      qualityExplanation = `This auction settled [IN LINE] with historical norms. Demand was balanced with Bid-to-Cover around the **${btcPctRounded}th percentile** and dealers taking down a typical **${dealerDisplay}**.`;
    }

    const deltaStr = (deltaHighYieldBp !== null && deltaHighYieldBp !== undefined) ? `${deltaSign}${deltaHighYieldBp.toFixed(1)} bp` : '—';
    const priorStr = (priorHighYield !== null && priorHighYield !== undefined) ? `${priorHighYield.toFixed(3)}%` : '—';
    const stopVsMedStr = (stopVsMedianBp !== null && stopVsMedianBp !== undefined) ? `${stopVsMedianBp.toFixed(1)} bp` : '—';
    const allocHighStr = (allocationAtHighPct !== null && allocationAtHighPct !== undefined) ? `${allocationAtHighPct.toFixed(1)}%` : '—';
    const btcStr = (bidToCover !== null && bidToCover !== undefined) ? `${bidToCover.toFixed(2)}x` : '—';
    const trailBtcStr = (trailingMeanBtc !== null && trailingMeanBtc !== undefined) ? `${trailingMeanBtc.toFixed(2)}x` : '—';
    const indStr = (indirectPct !== null && indirectPct !== undefined) ? `${indirectPct.toFixed(1)}%` : '—';
    const dirStr = (directPct !== null && directPct !== undefined) ? `${directPct.toFixed(1)}%` : '—';
    const dlrDeltaStr = (dealerVsMedianDelta !== null && dealerVsMedianDelta !== undefined) ? `${dealerVsMedianDelta > 0 ? '+' : ''}${dealerVsMedianDelta.toFixed(1)} pp vs trailing median` : 'in line with trailing median';

    return `### 🏛️ ${tenorCode} Benchmark Telemetry (${auctionDate})

**Issue Type:** ${issueType} | **Offering Size:** $${offeringAmt ? (offeringAmt / 1e9).toFixed(1) : '—'}B
**Demand Grade:** [${quality}] (${summary})

#### 1. Pricing & Yield Action
- **Clearing High Yield:** \`${highYield !== null && highYield !== undefined ? highYield.toFixed(3) : '—'}%\`
- **Yield Change vs Prior Auction:** \`${deltaStr}\` (Prior: \`${priorStr}\`)
- **Stop vs Median Dispersion:** \`${stopVsMedStr}\` (Allocation at High: \`${allocHighStr}\`)

#### 2. Demand & Coverage Dynamics
- **Bid-to-Cover:** \`${btcStr}\` (${btcPctRounded}th percentile vs trailing 20 auctions norm of \`${trailBtcStr}\`)
- **Foreign / Institutional (Indirect):** \`${indStr}\` of competitive allotment
- **Domestic Non-Dealer (Direct):** \`${dirStr}\`
- **Primary Dealer Absorption:** \`${dealerDisplay}\` (${dlrDeltaStr})

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

    const stat2Y = state.tenorStatsMap?.['2Y'];
    const stat10Y = state.tenorStatsMap?.['10Y'];
    const stat30Y = state.tenorStatsMap?.['30Y'];

    const is2s10Inverted = s2s10 && s2s10.spreadBp !== null && s2s10.spreadBp < 0;

    const fmtBp = s => (s && s.spreadBp !== null && s.spreadBp !== undefined) ? `${s.spreadBp.toFixed(1)} bp` : '—';
    const fmtYield = stat => (stat && stat.highYield !== null && stat.highYield !== undefined) ? `${stat.highYield.toFixed(3)}%` : '—';

    return `### 📈 US Treasury Yield Curve & Benchmark Spreads

$$\\text{Spread (bp)} = (y_{\\text{long}} - y_{\\text{short}}) \\times 100$$

Here is the current curve telemetry derived from the latest clearing auction yields:

| Benchmark Spread | Value (bp) | Status | Short Tenor | Long Tenor |
| :--- | :---: | :---: | :---: | :---: |
| **2s10s** | \`${fmtBp(s2s10)}\` | ${is2s10Inverted ? '[INVERTED]' : '[NORMAL]'} | 2Y: \`${fmtYield(stat2Y)}\` | 10Y: \`${fmtYield(stat10Y)}\` |
| **2s5s** | \`${fmtBp(s2s5)}\` | ${s2s5 && s2s5.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 2Y | 5Y |
| **5s10s** | \`${fmtBp(s5s10)}\` | ${s5s10 && s5s10.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 5Y | 10Y |
| **10s30s** | \`${fmtBp(s10s30)}\` | ${s10s30 && s10s30.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'} | 10Y | 30Y: \`${fmtYield(stat30Y)}\` |

#### Institutional Significance:
1. **The 2s10s Spread:** Historically the bond market's premier bellwether for the business cycle.
   ${is2s10Inverted ? '- Currently **inverted**, meaning short-term borrowing yields exceed long-term yields. This historically reflects monetary policy tightness and anticipation of future rate cuts.' : '- Currently **positively sloped**, showing normal term premium where investors demand higher yield for longer duration risk.'}
2. **The 10s30s Spread:** Reflects fiscal supply expectations, term premia, and long-run inflation risk. A steepening 10s30s curve often indicates the market digesting heavy ultra-long issuance.

*Note: In this monitor, spreads are auction-implied (calculated from the most recent clearing yields of each respective tenor, whose auction dates may differ slightly).*`;
  }

  explainBidToCover() {
    return `### 🎯 Bid-to-Cover Ratio (BTC) Explained

**Formula:**
$$\\text{Bid-to-Cover (BTC)} = \\frac{\\text{Total Tendered Bids}}{\\text{Total Accepted Bids}}$$

#### Why It Matters:
Bid-to-Cover is the fundamental demand multiplier of a Treasury auction. For example, a **2.50x BTC** means investors submitted \$2.50 in bids for every \$1.00 of debt the U.S. Treasury issued.

#### Institutional Benchmark Standards:
- **Upper Quartile ($BTC > 2.65x$):** Robust appetite. Suggests broad excess demand and minimal dealer strain.
- **Median Norm ($2.40x \\le BTC \\le 2.60x$):** Balanced, orderly clearing. Typical for nominal Notes and Bonds.
- **Lower Quartile ($BTC < 2.30x$):** Soft demand. Indicates cautious market participation, often forcing Primary Dealers to absorb a larger allotment.

#### Percentile Context on This Dashboard:
Because natural BTC averages differ across maturities (e.g., a 2Y note regularly sees higher BTC than a 30Y bond due to shorter duration), our dashboard evaluates BTC against the **trailing 20 auctions of that exact tenor** to determine whether it is statistically **Strong**, **In Line**, or **Soft**.`;
  }

  explainTakedownShares() {
    return `### 👥 Allotment Takedown Shares (Indirect vs Direct vs Dealers)

$$\\text{Takedown Share (\\%)} = \\frac{\\text{Accepted Category Volume}}{\\text{Total Competitive Accepted}} \\times 100$$

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
A **tail** occurs when the final clearing yield ($y_{\\text{stop}}$) is higher than the prevailing market yield just prior to the 1:00 PM ET bidding deadline (the "When-Issued" or $y_{\\text{WI}}$ yield):
$$\\text{Tail (bp)} = (y_{\\text{stop}} - y_{\\text{WI}}) \\times 100$$

- **Tail ($> +0.5\\text{ bp}$):** Dealers had to widen yield concessions to entice enough buyers (**soft demand**).
- **Inside Stop / Negative Tail ($< -0.5\\text{ bp}$):** The auction stopped through the pre-auction rate, meaning bidding was aggressive and competitive (**strong demand**).

#### Stop vs Median Dispersion Formula:
$$\\text{Stop vs Median (bp)} = (y_{\\text{high}} - y_{\\text{median}}) \\times 100$$

- In tightly grouped, aggressive auctions, this spread is near zero ($0.0\\text{ to }0.5\\text{ bp}$).
- A wide dispersion ($> 1.5\\text{ bp}$) means the Treasury had to accept bids at significantly higher yields to clear the total offering amount.

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
      const s = state.tenorStatsMap?.[code];
      if (!s) return null;
      const q = typeof s.quality === 'object' ? s.quality?.label : (s.quality || 'IN LINE');
      if (q === 'STRONG') strongCount++;
      else if (q === 'SOFT') softCount++;
      else inLineCount++;

      const yldStr = s.highYield !== null && s.highYield !== undefined ? `${s.highYield.toFixed(3)}%` : '—';
      const btcStr = s.bidToCover !== null && s.bidToCover !== undefined ? `${s.bidToCover.toFixed(2)}x` : '—';
      const dlr = s.dealerPct ?? s.shares?.dealerPct;
      const dlrStr = dlr !== null && dlr !== undefined ? `${dlr.toFixed(1)}%` : '—';

      return `- **${code}:** Yield \`${yldStr}\` | BTC \`${btcStr}\` | Dealer \`${dlrStr}\` | [${q}]`;
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

  explainAuctionByRow(a) {
    const code = getTenorCode(a) || a.security_term;
    const isReopen = String(a.reopening || '').toLowerCase() === 'yes';
    const highYield = parseNum(a.high_yield);
    const avgYield = parseNum(a.avg_med_yield);
    const btc = parseNum(a.bid_to_cover_ratio);
    const offeringAmt = parseNum(a.offering_amt);
    const stopVsMed = calculateStopVsMedianBps(a);
    const allocHigh = getAllocationAtHighPct(a);
    const shares = calculateTakedownShares(a);
    const coupon = parseNum(a.int_rate);
    const price = parseNum(a.price_per100);

    return `### 🏛️ Treasury Security Telemetry: ${code} (CUSIP: \`${a.cusip}\`)

**Auction Date:** ${a.auction_date} | **Settles:** ${a.issue_date || '—'}
**Issue Type:** ${isReopen ? 'Reopening' : 'New Issue'} | **Offering Size:** $${offeringAmt ? (offeringAmt / 1e9).toFixed(2) : '—'}B

#### 1. Pricing & Cut-off
- **Clearing High Yield:** \`${highYield !== null ? highYield.toFixed(3) : '—'}%\`
- **Median Yield:** \`${avgYield !== null ? avgYield.toFixed(3) : '—'}%\`
- **Stop vs Median Dispersion:** \`${stopVsMed !== null ? stopVsMed.toFixed(1) : '—'} bp\`
- **Allocation at High:** \`${allocHigh !== null ? allocHigh.toFixed(1) : '—'}%\`
- **Coupon:** \`${coupon !== null ? coupon.toFixed(3) : '—'}%\` | **Price:** \`${price !== null ? price.toFixed(3) : '—'}\`

#### 2. Demand & Takedown Allotment
- **Bid-to-Cover Ratio:** \`${btc !== null ? btc.toFixed(2) : '—'}x\`
- **Indirect Bidders (Foreign / Inst):** \`${shares.indirectPct !== null ? shares.indirectPct.toFixed(1) : '—'}%\`
- **Direct Bidders (Domestic Funds):** \`${shares.directPct !== null ? shares.directPct.toFixed(1) : '—'}%\`
- **Primary Dealers (Underwriter Absorption):** \`${shares.dealerPct !== null ? shares.dealerPct.toFixed(1) : '—'}%\`

${shares.dealerPct !== null && shares.dealerPct < 15 ? '✓ **Low dealer absorption** indicates healthy organic appetite from direct and indirect accounts.' : '⚠️ **Elevated dealer take** indicates softer end-user demand.'}`;
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
    const stat10Y = state.tenorStatsMap?.['10Y'];
    const s2s10 = state.spreads?.find(s => s.name === '2s10s');
    const q10Y = typeof stat10Y?.quality === 'object' ? stat10Y.quality?.label : (stat10Y?.quality || 'IN LINE');
    const yld10Y = (stat10Y && stat10Y.highYield !== null && stat10Y.highYield !== undefined) ? `${stat10Y.highYield.toFixed(3)}%` : '—';
    const btc10Y = (stat10Y && stat10Y.bidToCover !== null && stat10Y.bidToCover !== undefined) ? `${stat10Y.bidToCover.toFixed(2)}x` : '—';
    const bp2s10 = (s2s10 && s2s10.spreadBp !== null && s2s10.spreadBp !== undefined) ? `${s2s10.spreadBp.toFixed(1)} bp` : '—';
    const ind10Y = stat10Y?.indirectPct ?? stat10Y?.shares?.indirectPct;
    const ind10YStr = (ind10Y !== null && ind10Y !== undefined) ? `${ind10Y.toFixed(1)}%` : '—';

    return `I analyzed your inquiry: *"**${query}**"*.

Here are key related insights from current Treasury auction telemetry:
- **10-Year Benchmark:** Currently clearing at \`${yld10Y}\` with a Bid-to-Cover of \`${btc10Y}\` ([${q10Y}]).
- **2s10s Curve Spread:** Standing at \`${bp2s10}\` (${s2s10?.spreadBp < 0 ? '[INVERTED]' : '[NORMAL]'}).
- **Allotment Distribution:** Foreign Central Banks & Global Institutions (Indirect) currently account for \`${ind10YStr}\` of the 10Y takedown.

Feel free to ask for a deeper drill-down, e.g.:
- *"Explain 10Y auction quality"*
- *"What is Bid-to-Cover?"*
- *"Is the curve inverted?"*
- *"What are dealer tails?"*`;
  }
}

export const chatbot = new AuctionChatbot();

