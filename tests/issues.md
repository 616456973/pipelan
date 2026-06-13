# Known Issues & Follow-ups (v2.0)

## Resolved in v2.0

- ~~Amount display blank in Excel~~ → **Fixed** in v2.0: `buildXlsxFromState` uses canonical schema + `stripStyles` for clean Excel render
- ~~Owner column "主责销售" empty~~ → **Fixed** in v2.0: column name aliases (COLUMN_ALIASES) handle 5+ variants per field
- ~~Dictionary layout parsing fragile~~ → **Fixed** in v2.0: `parseSheet2Smart` classifies by value patterns, not column position
- ~~"Where did the file save?" confusion~~ → **Fixed** in v2.0: auto-save to IndexedDB, no manual save action
- ~~SheetJS write loses xlsx styles~~ → **Mitigated** in v2.0: canonical schema + strip styles; exported xlsx is always in our clean format

## v2.0 Open Items (v2.1 candidates)

- [ ] XSS: opportunity data still interpolated into `innerHTML` in ui-*.js. Should add `esc()` helper.
- [ ] Form validation message id mismatch for team field (err-team vs err-team-sel)
- [ ] Multi-select filter UX is poor (`<select multiple size="1">`)
- [ ] Modified indicator polling (already removed in v2.0 — auto-save status is the new indicator)
- [ ] wasm fetch fails on `file://` (workaround: serve via local HTTP, or bundle wasm as data URL)
- [ ] No concurrency control between tabs (still a single-tab constraint, document this)

## v2.0 Scope Simplifications (deliberate, in spec, simplified in v2.0)

- View 7 (多维透视): fixed groupBy=product, no user-pickable X/Y axes (was a v1.0 issue too)
- View 8 (ST4 vs ST5 对比): total + average only, no TOP customers/products
- YoY/MoM in view 2: assumes consecutive months
