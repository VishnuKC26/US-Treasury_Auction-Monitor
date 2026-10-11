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
      targetUrl.searchParams.set('filter', 'original_security_term:in:(2-Year,3-Year,5-Year,7-Year,10-Year,20-Year,30-Year),security_type:in:(Note,Bond),inflation_index_security:eq:No,floating_rate:eq:No');
      targetUrl.searchParams.set('sort', '-auction_date');
      targetUrl.searchParams.set('fields', 'cusip,security_type,security_term,original_security_term,auction_date,issue_date,maturity_date,record_date,announcemt_date,high_yield,avg_med_yield,low_yield,int_rate,price_per100,bid_to_cover_ratio,offering_amt,total_accepted,comp_accepted,comp_tendered,total_tendered,indirect_bidder_accepted,direct_bidder_accepted,primary_dealer_accepted,noncomp_accepted,soma_accepted,allocation_pctage,reopening,inflation_index_security,floating_rate,pdf_filenm_comp_results,pdf_filenm_announcemt');
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
    res.end(JSON.stringify({ error: `Live Treasury API unreachable: ${err.message}` }));
  }
};

