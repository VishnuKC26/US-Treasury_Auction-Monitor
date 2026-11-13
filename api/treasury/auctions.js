import { reconcileAuctionsWithLatest } from '../../data_reconciliation.js';

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
    const targetUrl = new URL('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query');

    if (parsed.search) {
      targetUrl.search = parsed.search;
    } else {
      targetUrl.searchParams.set('page[size]', '1000');
      targetUrl.searchParams.set('filter', 'security_type:in:(Note,Bond),inflation_index_security:eq:No,floating_rate:eq:No');
      targetUrl.searchParams.set('sort', '-auction_date');
      targetUrl.searchParams.set('fields', 'cusip,security_type,security_term,original_security_term,auction_date,issue_date,maturity_date,record_date,announcemt_date,high_yield,avg_med_yield,low_yield,int_rate,price_per100,bid_to_cover_ratio,offering_amt,total_accepted,comp_accepted,comp_tendered,total_tendered,indirect_bidder_accepted,direct_bidder_accepted,primary_dealer_accepted,noncomp_accepted,soma_accepted,allocation_pctage,reopening,inflation_index_security,floating_rate,pdf_filenm_comp_results,pdf_filenm_announcemt');
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
    const reconciled = reconcileAuctionsWithLatest(json.data || []);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.setHeader('X-Data-Source', 'live-api');
    res.statusCode = 200;
    res.end(JSON.stringify({ data: reconciled, meta: json.meta }));
  } catch (err) {
    // Graceful fallback to reconciled overlay if upstream fails
    const reconciled = reconcileAuctionsWithLatest([]);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('X-Data-Source', 'reconciled-fallback');
    res.end(JSON.stringify({ data: reconciled, meta: { count: reconciled.length } }));
  }
};
