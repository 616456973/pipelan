# RAS CRM (v2.0)

A zero-dependency single-file HTML Web App for managing RAS CRM opportunity/sales data. Uses an in-browser SQLite database (sql.js WASM) auto-persisted to IndexedDB. Excel (.xlsx) is used only for import/export.

## Quick Start

1. Double-click `ras_crm.html` to open in Chrome or Edge (or via local HTTP server for full functionality).
2. First run shows an empty database with a 4-step onboarding guide.
3. Click **"📥 导入"** and select your existing `.xlsx` file (e.g., the original `RAS CRM（template） (version0529).xlsx`). All opportunities and dictionaries are imported.
4. Edit, add, or delete records. **All changes auto-save** to IndexedDB.
5. Click **"📤 导出"** to download an xlsx (for Excel viewing/sharing).
6. Click **"💾 备份"** to download a `.sqlite` backup file (full DB).
7. Click **"📂 恢复"** to load a `.sqlite` backup file (overwrites current DB; will prompt to confirm if DB has data).

## What changed from v1.0

| | v1.0 (old) | v2.0 (new) |
|---|---|---|
| Storage | xlsx file in Downloads | SQLite in IndexedDB (auto-save) |
| Save action | Manual "保存" button → download | None (auto-save) |
| "数据保存到哪了" question | Yes | **Solved** (always in IndexedDB) |
| Amount display in Excel | Sometimes blank (SheetJS bug) | Always correct (canonical schema + style strip) |
| Owner column "主责销售" mapping | Empty (hardcoded "负责人") | Works (column name aliases) |
| Dictionary parsing | Each column = 1 dict (rigid) | Adaptive (value-pattern + alias) |

## Architecture

- `app/core.js` — Facade. State is a mirror of the DB. Pure functions (validate, compute*) unchanged.
- `app/db.js` — SQLite data layer. Schema: 8 tables (meta, 6 dicts, opportunities). Auto-persist to IndexedDB on every commit (debounced 500ms).
- `app/xlsx-io.js` — Smart xlsx parser/builder. Alias-aware column mapping. Adaptive dictionary extraction.
- `app/ui-*.js` — UI modules, unchanged in interface.
- `vendor/sqljs/` — sql.js WASM (~700KB).
- `vendor/sheetjs/` — SheetJS (for xlsx I/O only).

## Database Schema

8 tables in SQLite:
- `meta` (key, value) — schema version, app settings
- `dict_teams`, `dict_product_lines`, `dict_products`, `dict_stages`, `dict_currencies`, `dict_lose_reasons` — dictionaries
- `opportunities` (14 fields + id, deleted, parse_error, position) — main entity

## xlsx Smart Parsing (v2.0)

The xlsx importer handles real-world xlsx files with non-standard layouts:

**Column name aliases** (any of these will be recognized as the corresponding field):
- `team`: 销售团队, 团队
- `owner`: 负责人, **主责销售**, 责任人, Sales Rep, Owner, 销售负责人
- `oppName`: 商机名称, 商机, 项目名称
- `customer`: 客户名称, 客户, 客户公司
- `amount`: 预计合同金额(含税), 含税金额, 合同金额, 金额
- ... (and 8 more fields)

**Adaptive dictionary parsing**: doesn't assume "each column = 1 dict". Classifies by value patterns (P1xx → products, ST\d → stages, USD/SGD/RMB → currencies, PL\d → product lines).

## xlsx Export Schema (v2.0)

The exporter always emits a **canonical 15-column** schema. This guarantees:
- Amount columns are always in the same position
- No malformed number formats
- Consistent layout for re-import

## Development

### Run all tests
```bash
node tests/run-all.js
```

Expected output: 29 unit + 12 db + 8 xlsx-io + 4 compare = 53 tests, plus roundtrip MATCHED.

### Rebuild the test fixture
```bash
node tests/build-fixture.js
```

### Compare two xlsx files
```bash
node tools/compare-xlsx.js <original.xlsx> <exported.xlsx>
```

## Important Notes

### Single user, local only
- Data is in your browser's IndexedDB (per-browser, per-profile)
- No server, no sync, no multi-user
- To share data: use "备份" (export sqlite) → share file → recipient uses "恢复"

### Browser requirements
- Tested on Chrome and Edge (latest 2 versions)
- Requires support for: WebAssembly, IndexedDB, FileReader, Blob, URL.createObjectURL
- wasm must be loadable — `file://` works for most operations except auto-init (use a local HTTP server like `python -m http.server` if you see "○ 空" persistently)

### Backwards compatibility
- v1.0 xlsx files (like the original `RAS CRM（template） (version0529）.xlsx`) are still loadable via 导入
- The smart parser handles different column names (主责销售 etc.) and adaptive dictionary layouts
