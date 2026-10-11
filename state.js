/**
 * state.js - Central State Management
 */

export const state = {
  rawAuctions: [],
  nominalAuctions: [],
  upcomingAuctions: [],
  whenIssuedMap: {},
  dataSource: 'loading',
  dataTimestamp: null,
  activeTenor: '10Y',
  tenorStatsMap: {},
  spreads: [],
  filteredLedger: [],
  ledgerFilters: {
    search: '',
    tenor: 'ALL',
    reopening: 'ALL',
    page: 1,
    pageSize: 15
  },
  selectedAuction: null,
  error: null,
  charts: {
    activeTakedown: null,
    yieldCurve: null
  }
};
