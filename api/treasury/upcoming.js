export default async function handler(req, res) {
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
    const targetUrl = new URL('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions');

    if (parsed.search) {
      targetUrl.search = parsed.search;
    } else {
      targetUrl.searchParams.set('page[size]', '100');
      targetUrl.searchParams.set('sort', '-record_date');
    }

    const upstream = await fetch(targetUrl.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TreasuryAuctionsVercel/1.0'
      }
    });

    const data = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('X-Data-Source', 'live-api');
    res.statusCode = upstream.status;
    res.end(data);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: `Live Upcoming API unreachable: ${err.message}` }));
  }
};
