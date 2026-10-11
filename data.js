/**
 * data.js - Resilient Treasury Fiscal Data Client
 * Proxies first with Cache-Control, falls back to direct API, then offline sample data.
 */

import { isNominalCoupon } from './analytics.js';

const PROXY_AUCTIONS_URL = '/api/treasury/auctions';
const PROXY_UPCOMING_URL = '/api/treasury/upcoming';
const DIRECT_AUCTIONS_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?page[size]=1000&filter=original_security_term:in:(2-Year,3-Year,5-Year,7-Year,10-Year,20-Year,30-Year),security_type:in:(Note,Bond),inflation_index_security:eq:No,floating_rate:eq:No&sort=-auction_date&fields=cusip,security_type,security_term,original_security_term,auction_date,issue_date,maturity_date,record_date,announcemt_date,high_yield,avg_med_yield,low_yield,int_rate,price_per100,bid_to_cover_ratio,offering_amt,total_accepted,comp_accepted,comp_tendered,total_tendered,indirect_bidder_accepted,direct_bidder_accepted,primary_dealer_accepted,noncomp_accepted,soma_accepted,allocation_pctage,reopening,inflation_index_security,floating_rate,pdf_filenm_comp_results,pdf_filenm_announcemt';
const DIRECT_UPCOMING_URL = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/upcoming_auctions?page[size]=100&sort=-record_date';

const SAMPLE_AUCTIONS_URL = './data/sample_auctions.json';
const SAMPLE_UPCOMING_URL = './data/upcoming_auctions.json';
const WHEN_ISSUED_URL = './data/when_issued.json';

const FETCH_TIMEOUT_MS = 9000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

/**
 * Fetch historical nominal bond auctions.
 * Sequence: Proxy -> Direct API -> Offline Sample fallback.
 */
export async function loadAuctionsData() {
  let source = 'live-proxy';
  let data = null;

  // 1. Try proxy
  try {
    const res = await fetchWithTimeout(PROXY_AUCTIONS_URL);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0) {
        data = json.data;
        source = 'live-proxy';
      }
    }
  } catch {
    // Proxy failed or unavailable (e.g. running static)
  }

  // 2. Try direct Fiscal Data API if proxy failed
  if (!data) {
    try {
      const res = await fetchWithTimeout(DIRECT_AUCTIONS_URL);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          data = json.data;
          source = 'live-direct';
        }
      }
    } catch {
      // Direct API failed
    }
  }

  // 3. Fallback to offline sample data
  if (!data) {
    const res = await fetchWithTimeout(SAMPLE_AUCTIONS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} reading sample auctions`);
    const json = await res.json();
    data = json.data || [];
    source = 'stale-sample';
  }

  // Strictly filter nominal notes & bonds
  const nominalOnly = data.filter(isNominalCoupon);

  return {
    raw: data,
    nominals: nominalOnly,
    source,
    timestamp: new Date()
  };
}

/**
 * Fetch upcoming auctions schedule.
 * Sequence: Proxy -> Direct API -> Offline Sample fallback.
 */
export async function loadUpcomingData() {
  let source = 'live-proxy';
  let data = null;

  try {
    const res = await fetchWithTimeout(PROXY_UPCOMING_URL);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json?.data) && json.data.length > 0) {
        data = json.data;
        source = 'live-proxy';
      }
    }
  } catch {
    // Proxy failed
  }

  if (!data) {
    try {
      const res = await fetchWithTimeout(DIRECT_UPCOMING_URL);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          data = json.data;
          source = 'live-direct';
        }
      }
    } catch {
      // Direct API failed
    }
  }

  if (!data) {
    const res = await fetchWithTimeout(SAMPLE_UPCOMING_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} reading upcoming sample`);
    const json = await res.json();
    data = json.data || [];
    source = 'stale-sample';
  }

  return {
    raw: data,
    source,
    timestamp: new Date()
  };
}

/**
 * Optional When-Issued yield lookup.
 */
export async function loadWhenIssuedData() {
  try {
    const res = await fetchWithTimeout(WHEN_ISSUED_URL, {}, 3000);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Optional file; ignore if missing
  }
  return {};
}
