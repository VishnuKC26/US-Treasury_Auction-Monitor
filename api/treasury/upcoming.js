import { reconcileUpcomingWithLatest } from '../../data_reconciliation.js';

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

    if (!upstream.ok) {
      throw new Error(`Upstream returned ${upstream.status}`);
    }

    const json = await upstream.json();
    const reconciled = reconcileUpcomingWithLatest(json.data || []);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('X-Data-Source', 'live-api');
    res.statusCode = 200;
    res.end(JSON.stringify({ data: reconciled, meta: json.meta }));
  } catch (err) {
    const reconciled = reconcileUpcomingWithLatest([]);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Data-Source', 'reconciled-fallback');
    res.end(JSON.stringify({ data: reconciled, meta: { count: reconciled.length } }));
  }
};
