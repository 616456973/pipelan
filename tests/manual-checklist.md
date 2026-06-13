# Manual Test Checklist (v2.0)

Run through this checklist before each release. Test environment: Windows + Chrome or Edge (recommended), served via local HTTP for full wasm support (or `file://` works for most ops).

## Setup

- [ ] Serve via local HTTP: `cd D:\claude\RAS_CRM && python -m http.server 8000` (or just double-click ras_crm.html)
- [ ] Open `http://localhost:8000/ras_crm.html` in Chrome/Edge
- [ ] Verify topbar shows 5 tabs and 4 buttons (导入/导出/备份/恢复)
- [ ] Verify DB status shows "○ 空" (or "● 已加载" if you have data from a previous session)
- [ ] Open DevTools console, no errors should appear (ignore wasm fetch errors if served from file://)

## Import xlsx (核心功能)

- [ ] Click "📥 导入", select `tests/fixtures/test-data.xlsx`
- [ ] Verify DB status changes to "● 已加载"
- [ ] Click "商机" tab: verify 53 rows appear (50 valid + 3 malformed)
- [ ] Verify 3 rows are highlighted in red (parseError)
- [ ] Click "仪表盘" tab: verify 4 KPI cards show non-zero values
- [ ] Click "字典" tab: switch through 6 tabs, verify items display
- [ ] Click "分析" tab: click through 8 views, verify each renders

## Smart Parsing (the v2.0 fix)

- [ ] Click "📥 导入" again, select the real `D:\claude\RAS CRM（template） (version0529).xlsx`
- [ ] Verify the import succeeds (the file uses column "主责销售" which v2.0 aliases to owner)
- [ ] Open "商机" tab, verify the "负责人" column is no longer empty
- [ ] Verify dictionaries (5 teams, 2 productLines, 6 products, 5 stages, 3 currencies) all populated

## Edit / Add / Delete

- [ ] Click "新增" tab, fill form, save — verify new row appears
- [ ] Edit a row, verify save
- [ ] Soft-delete a row, verify it's hidden (toggle "显示已删除" to see)

## Auto-save (no manual save!)

- [ ] Make any change
- [ ] **Close the tab and reopen** (or refresh)
- [ ] Verify your changes are still there (IndexedDB persistence)

## Export xlsx

- [ ] Click "📤 导出" — file downloads
- [ ] Open downloaded file in Excel
- [ ] Verify amount columns display correctly (e.g., "17222.88" not blank)
- [ ] Verify "负责人" column is populated (not empty)
- [ ] Verify dictionaries in Sheet2 are in the 5-dict block layout

## Backup / Restore

- [ ] Click "💾 备份" — `.sqlite` file downloads
- [ ] Note the file size (~50KB for 53 records)
- [ ] Click "📂 恢复", select the backup file
- [ ] Verify the data loads correctly

## Roundtrip

- [ ] In terminal: `node tools/compare-xlsx.js --roundtrip tests/fixtures/test-data.xlsx`
- [ ] Expected: `MATCHED` with `exit 0`
