/**
 * api/chat.js - Groq AI Proxy Endpoint (Vercel Serverless Function)
 * Connects to Groq LPU Inference API (llama-3.3-70b-versatile)
 */

import { isProjectTopic, getOffTopicRefusal } from '../analytics.js';

const DEFAULT_GROQ_API_KEY = process.env.GROQ_API_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
    return;
  }

  try {
    let body = {};
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      // Buffer stream read
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }

    const { query, apiKey, context, history = [], model: reqModel } = body;
    const activeKey = apiKey || process.env.GROQ_API_KEY || (process.env.NODE_ENV === 'test' && !process.env.GROQ_API_KEY ? undefined : DEFAULT_GROQ_API_KEY);
    const chosenModel = reqModel || 'qwen/qwen3.8-27b';

    if (!activeKey) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Missing Groq API Key. Provide apiKey or set GROQ_API_KEY environment variable. Get a free key at https://console.groq.com/keys'
      }));
      return;
    }

    if (!query) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing query in request body' }));
      return;
    }

    // Strict project topic restriction guardrail
    if (!isProjectTopic(query)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        answer: getOffTopicRefusal(),
        model: 'institutional-guardrail'
      }));
      return;
    }

    const systemPrompt = `You are the Institutional US Treasury & Macro Telemetry Analyst.
You specialize strictly in fixed-income debt capital markets, Treasury note & bond auctions (2Y, 3Y, 5Y, 7Y, 10Y, 20Y, 30Y), primary dealer takedown dynamics, and yield curve term structure.
Important: In U.S. Treasury debt capital markets, "BTC" strictly refers to the "Bid-to-Cover" demand ratio (total tendered bids divided by total accepted bids), NEVER cryptocurrency.

Here is the LIVE, REAL-TIME U.S. Treasury auction data currently loaded on the dashboard:
${JSON.stringify(context || {}, null, 2)}

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

Instructions for in-topic answers:
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

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Include recent history if available
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        if (h.sender === 'user') {
          messages.push({ role: 'user', content: h.text });
        } else if (h.sender === 'bot') {
          messages.push({ role: 'assistant', content: h.text });
        }
      }
    }

    messages.push({ role: 'user', content: query });

    const candidateModels = Array.from(new Set([chosenModel, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']));
    let lastError = null;
    let successData = null;

    for (const m of candidateModels) {
      try {
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: m,
            messages,
            temperature: 0.3,
            max_completion_tokens: 1024
          }),
          signal: AbortSignal.timeout(6000)
        });

        if (groqResponse.ok) {
          successData = await groqResponse.json();
          break;
        } else {
          const errText = await groqResponse.text();
          let errMsg = errText;
          try {
            const j = JSON.parse(errText);
            errMsg = j.error?.message || errText;
          } catch (e) {}
          lastError = `Groq error (${groqResponse.status}): ${errMsg}`;
        }
      } catch (fErr) {
        lastError = fErr.message;
      }
    }

    if (!successData) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: lastError || 'All Groq models failed.' }));
      return;
    }

    const answer = successData.choices?.[0]?.message?.content || 'No response generated from Groq.';

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      answer,
      model: successData.model || chosenModel,
      usage: successData.usage
    }));

  } catch (err) {
    console.error('Chat endpoint error:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Server error: ${err.message}` }));
  }
}
