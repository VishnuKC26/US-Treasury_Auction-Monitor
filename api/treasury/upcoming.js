const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const queryIndex = req.url ? req.url.indexOf('?') : -1;
  const queryString = queryIndex !== -1 ? req.url.substring(queryIndex) : '?page[size]=100&sort=-record_date';
  const targetUrl = `https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions${queryString}`;

  return new Promise((resolve) => {
    https.get(targetUrl, {
      headers: {
        'User-Agent': 'TreasuryAuctionsVercel/1.0',
        'Accept': 'application/json'
      },
      timeout: 10000
    }, (upstreamRes) => {
      let data = '';
      upstreamRes.on('data', chunk => data += chunk);
      upstreamRes.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Data-Source', 'live-api');
        res.statusCode = upstreamRes.statusCode || 200;
        res.end(data);
        resolve();
      });
    }).on('error', (err) => {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: `Live Upcoming API unreachable: ${err.message}` }));
      resolve();
    });
  });
};
