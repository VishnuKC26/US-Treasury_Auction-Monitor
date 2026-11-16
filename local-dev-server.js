// local-dev-server.js - Lightweight local HTTP server with Treasury API proxy & static asset delivery
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { reconcileAuctionsWithLatest, reconcileUpcomingWithLatest } from './data_reconciliation.js';
import { isProjectTopic, getOffTopicRefusal } from './analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env file if present
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx !== -1) {
          const key = trimmed.slice(0, idx).trim();
          let val = trimmed.slice(idx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {}
  }
}
loadEnv();

const DEFAULT_GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const DEFAULT_PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function fetchFiscalData(targetUrl, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`Fiscal Data API returned status ${res.statusCode}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Fiscal Data API request timed out'));
    });
    req.on('error', (err) => {
      req.destroy();
      reject(err);
    });
  });
}

const memoryCache = {
  auctions: null,
  auctionsTime: 0,
  upcoming: null,
  upcomingTime: 0
};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Proxy Endpoint for Groq AI Chat
  if (pathname === '/api/chat' && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => rawBody += chunk);
    req.on('end', async () => {
      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const { query, apiKey, context, history = [], model: reqModel } = body;
        const activeKey = apiKey || process.env.GROQ_API_KEY || DEFAULT_GROQ_API_KEY;
        const chosenModel = reqModel || 'qwen/qwen3.8-27b';

        if (!activeKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'Missing Groq API Key. Get a key at https://console.groq.com/keys'
          }));
          return;
        }

        // Strict project topic restriction guardrail
        if (!isProjectTopic(query)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
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

        const messages = [{ role: 'system', content: systemPrompt }];
        if (Array.isArray(history)) {
          for (const h of history.slice(-6)) {
            if (h.sender === 'user') messages.push({ role: 'user', content: h.text });
            else if (h.sender === 'bot') messages.push({ role: 'assistant', content: h.text });
          }
        }
        messages.push({ role: 'user', content: query });

        const candidateModels = Array.from(new Set([chosenModel, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b']));
        let lastError = null;
        let successData = null;

        for (const m of candidateModels) {
          try {
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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

            if (groqRes.ok) {
              successData = await groqRes.json();
              break;
            } else {
              const errText = await groqRes.text();
              let parsedErr = errText;
              try {
                const j = JSON.parse(errText);
                parsedErr = j.error?.message || errText;
              } catch (e) {}
              lastError = `Groq error (${groqRes.status}): ${parsedErr}`;
            }
          } catch (fetchErr) {
            lastError = fetchErr.message;
          }
        }

        if (!successData) {
          if (!res.writableEnded) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: lastError || 'All Groq models failed.' }));
          }
          return;
        }

        const answer = successData.choices?.[0]?.message?.content || 'No response from Groq.';
        if (!res.writableEnded) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            answer,
            model: successData.model || chosenModel
          }));
        }

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Server error: ${err.message}` }));
      }
    });
    return;
  }

  // API Proxy Endpoint for auctions query
  if (pathname === '/api/treasury/auctions') {
    const now = Date.now();
    if (memoryCache.auctions && (now - memoryCache.auctionsTime < CACHE_TTL_MS)) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        'X-Data-Source': 'memory-cache'
      });
      res.end(JSON.stringify(memoryCache.auctions));
      return;
    }

    const defaultQuery = '?page[size]=1000&filter=security_type:in:(Note,Bond),inflation_index_security:eq:No,floating_rate:eq:No&sort=-auction_date&fields=cusip,security_type,security_term,original_security_term,auction_date,issue_date,maturity_date,record_date,announcemt_date,high_yield,avg_med_yield,low_yield,int_rate,price_per100,bid_to_cover_ratio,offering_amt,total_accepted,comp_accepted,comp_tendered,total_tendered,indirect_bidder_accepted,direct_bidder_accepted,primary_dealer_accepted,noncomp_accepted,soma_accepted,allocation_pctage,reopening,inflation_index_security,floating_rate,pdf_filenm_comp_results,pdf_filenm_announcemt';
    const queryString = parsedUrl.search || defaultQuery;
    const targetUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query${queryString}`;
    try {
      const response = await fetchFiscalData(targetUrl, 4000);
      const json = JSON.parse(response.body);
      const reconciled = reconcileAuctionsWithLatest(json.data || []);
      const payload = { data: reconciled, meta: json.meta };
      memoryCache.auctions = payload;
      memoryCache.auctionsTime = now;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=900, stale-while-revalidate=3600',
        'X-Data-Source': 'live-api'
      });
      res.end(JSON.stringify(payload));
      return;
    } catch (err) {
      console.log(`ℹ️ [Fiscal Data API] Live endpoint delayed (${err.message}). Serving reconciled offline cache.`);
      const sample = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data', 'sample_auctions.json'), 'utf8'));
      const reconciled = reconcileAuctionsWithLatest(sample.data || []);
      const payload = { data: reconciled, meta: { count: reconciled.length } };
      memoryCache.auctions = payload;
      memoryCache.auctionsTime = now;
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Data-Source': 'reconciled-fallback' });
      res.end(JSON.stringify(payload));
      return;
    }
  }

  // API Proxy Endpoint for upcoming auctions
  if (pathname === '/api/treasury/upcoming') {
    const now = Date.now();
    if (memoryCache.upcoming && (now - memoryCache.upcomingTime < CACHE_TTL_MS)) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
        'X-Data-Source': 'memory-cache'
      });
      res.end(JSON.stringify(memoryCache.upcoming));
      return;
    }

    const queryString = parsedUrl.search || '?page[size]=100&sort=-record_date';
    const targetUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions${queryString}`;
    try {
      const response = await fetchFiscalData(targetUrl, 4000);
      const json = JSON.parse(response.body);
      const reconciled = reconcileUpcomingWithLatest(json.data || []);
      const payload = { data: reconciled, meta: json.meta };
      memoryCache.upcoming = payload;
      memoryCache.upcomingTime = now;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=900, stale-while-revalidate=3600',
        'X-Data-Source': 'live-api'
      });
      res.end(JSON.stringify(payload));
      return;
    } catch (err) {
      console.log(`ℹ️ [Fiscal Data API] Upcoming endpoint delayed (${err.message}). Serving reconciled offline schedule.`);
      const sample = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data', 'upcoming_auctions.json'), 'utf8'));
      const reconciled = reconcileUpcomingWithLatest(sample.data || []);
      const payload = { data: reconciled, meta: { count: reconciled.length } };
      memoryCache.upcoming = payload;
      memoryCache.upcomingTime = now;
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Data-Source': 'reconciled-fallback' });
      res.end(JSON.stringify(payload));
      return;
    }
  }

  // Static File Serving
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`\n===============================================================`);
    console.log(`  U.S. TREASURY BOND AUCTION DASHBOARD`);
    console.log(`  Live Server running at: http://localhost:${port}`);
    console.log(`  Data Source: https://fiscaldata.treasury.gov/`);
    console.log(`===============================================================\n`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(DEFAULT_PORT);
