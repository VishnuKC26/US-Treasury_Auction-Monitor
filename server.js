// server.js - Lightweight local HTTP server with Treasury API proxy & static asset delivery
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const url = require('url');

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

function fetchFiscalData(targetUrl) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, {
      headers: {
        'User-Agent': 'TreasuryAuctionsDashboard/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
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
    }).on('error', reject).on('timeout', () => reject(new Error('Fiscal Data API request timed out')));
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Proxy Endpoint for auctions query (Strictly Live Data)
  if (pathname === '/api/treasury/auctions') {
    const queryString = parsedUrl.search || '?page[size]=1000&filter=original_security_term:in:(2-Year,5-Year,10-Year,20-Year,30-Year)&sort=-issue_date';
    const targetUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query${queryString}`;
    try {
      const response = await fetchFiscalData(targetUrl);
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Data-Source': 'live-api' });
      res.end(response.body);
      return;
    } catch (err) {
      console.error('Proxy live fetch failed:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Live Treasury API unreachable: ${err.message}` }));
      return;
    }
  }

  // API Proxy Endpoint for upcoming auctions (Strictly Live Data)
  if (pathname === '/api/treasury/upcoming') {
    const queryString = parsedUrl.search || '?page[size]=100&sort=-record_date';
    const targetUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions${queryString}`;
    try {
      const response = await fetchFiscalData(targetUrl);
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Data-Source': 'live-api' });
      res.end(response.body);
      return;
    } catch (err) {
      console.error('Upcoming live fetch failed:', err.message);
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Live Upcoming Auctions API unreachable: ${err.message}` }));
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
    res.writeHead(200, { 'Content-Type': contentType });
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
