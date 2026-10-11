module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const parsed = new URL(req.url, 'http://localhost');
    const targetUrl = new URL('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query');

    if (parsed.search) {
      targetUrl.search = parsed.search;
    } else {
      targetUrl.searchParams.set('page[size]', '1000');
      targetUrl.searchParams.set('filter', 'original_security_term:in:(2-Year,5-Year,10-Year,20-Year,30-Year)');
      targetUrl.searchParams.set('sort', '-issue_date');
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TreasuryAuctionsVercel/1.0'
      }
    });

    const data = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Data-Source', 'live-api');
    res.statusCode = upstream.status;
    res.end(data);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Live Treasury API unreachable: ${err.message}` }));
  }
};
