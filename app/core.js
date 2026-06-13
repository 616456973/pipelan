// Core data layer for RAS CRM. UMD pattern: usable in browser (window.CRM) and Node (require()).
// ONLY this file should know about xlsx format details. UI files only see Opportunity/Dicts objects.

(function (global) {
  'use strict';

  // ---- State ----
  const state = {
    opportunities: [],
    dicts: {
      teams: [], productLines: [], products: [], stages: [], currencies: [], loseReasons: []
    },
    fileName: '',
    fileLoaded: false,
    modified: false
  };

  function reset() {
    state.opportunities = [];
    state.dicts = { teams: [], productLines: [], products: [], stages: [], currencies: [], loseReasons: [] };
    state.fileName = '';
    state.fileLoaded = false;
    state.modified = false;
  }

  function makeOpportunity(partial) {
    return Object.assign({
      id: (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : ('id-' + Date.now() + '-' + Math.random().toString(36).slice(2)),
      team: '', owner: '', oppName: '', customer: '',
      productLine: '', product: '', currency: '',
      stage: 'ST1 线索(Leads)',
      winRate: 0, amount: 0, amountNet: 0,
      expectedDate: null, note: '', loseReason: '',
      deleted: false, parseError: null
    }, partial || {});
  }

  function markModified() { state.modified = true; }

  // ---- Export ----
  const api = { state, reset, makeOpportunity, markModified };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.CRM = api;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
