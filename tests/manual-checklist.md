# Manual Test Checklist

Run through this checklist before each release. Test environment: Windows + Chrome or Edge.

## Setup

- [ ] Open `ras_crm.html` (double-click)
- [ ] Verify topbar shows 5 tabs and "未打开" file info
- [ ] Verify "保存" button click shows the toast (Task 16 replaces this with real flow)
- [ ] Open DevTools console, no errors should appear

## Open File

- [ ] Click "打开", select `tests/fixtures/test-data.xlsx`
- [ ] Verify file name appears in topbar
- [ ] Verify list tab auto-switches
- [ ] Verify 53 rows appear (50 valid + 3 malformed/dangling/bad)
- [ ] Verify 3 rows are highlighted in red (parseError)
- [ ] Verify 1 row shows win rate 150% with row-error style (or similar)
- [ ] Open a fresh tab, repeat — verify second open is independent

## List & Filters

- [ ] Filter by team "基础业务" — verify only matching rows show
- [ ] Filter by 2 teams simultaneously — verify OR logic
- [ ] Search "测试商机1" — verify only #1 row shows
- [ ] Click "清空" — verify all rows return
- [ ] Toggle "显示已删除" — verify no rows change (none deleted yet)

## Add

- [ ] Click "新增" tab
- [ ] Fill all required fields with valid data
- [ ] Click 保存
- [ ] Verify list tab auto-switches
- [ ] Verify new row appears
- [ ] Verify "已修改" indicator is orange

## Edit

- [ ] Click "编辑" on a row (need to add this button to list — if not present, use "新增" flow)
- [ ] Change amount, click 保存
- [ ] Verify list shows updated value

## Delete (soft)

- [ ] Click "删除" on a row, confirm
- [ ] Verify row disappears from list
- [ ] Toggle "显示已删除" — verify deleted row appears with strikethrough
- [ ] Toggle off "显示已删除" — verify deleted row disappears

## Validation

- [ ] Click "新增" tab
- [ ] Try to save with empty form
- [ ] Verify error messages on required fields
- [ ] Verify submit was blocked
- [ ] Fill team, leave amount negative
- [ ] Verify amount error
- [ ] Fill all correctly, save successfully

## Cascading filter

- [ ] Click "新增" tab
- [ ] Select PL1 product line
- [ ] Verify product dropdown only shows P1xx options
- [ ] Switch to PL2
- [ ] Verify product dropdown only shows P2xx options

## Dictionary

- [ ] Click "字典" tab
- [ ] Switch through all 6 tabs, verify content
- [ ] Add a new team, verify it appears
- [ ] Try to delete a team with references — verify count dialog
- [ ] Confirm delete, verify references become "未分类"
- [ ] Try to add a duplicate — verify warning

## Dashboard

- [ ] Click "仪表盘" tab
- [ ] Verify 4 KPI cards show non-zero values
- [ ] Verify stage funnel renders (5 stages)
- [ ] Verify TOP 5 teams and TOP 5 products render

## Analysis

- [ ] Click "分析" tab
- [ ] Click through all 8 views, verify each renders
- [ ] In view 4 (Pareto), verify 80% line is highlighted
- [ ] Go to "商机" tab, apply a team filter
- [ ] Back to "分析", verify filter is reflected

## Save / Reload

- [ ] Make a change (e.g. delete a row)
- [ ] Click "保存"
- [ ] First save: verify the style-loss warning appears, accept
- [ ] Verify file downloads to `Downloads/ras_crm_YYYYMMDD_HHmmss.xlsx`
- [ ] Open downloaded file in Excel
- [ ] Verify data is intact
- [ ] Copy downloaded file back over the original
- [ ] Reload `ras_crm.html`, open the (now updated) original
- [ ] Verify changes are visible
- [ ] Verify "已修改" indicator is NOT orange (no unsaved changes)

## Roundtrip

- [ ] In a fresh terminal: `node tools/compare-xlsx.js --roundtrip tests/fixtures/test-data.xlsx`
- [ ] Expected: `MATCHED` with `exit 0`

## Unsaved Changes Guard

- [ ] Make a change
- [ ] Try to close the browser tab
- [ ] Verify browser shows "leave site?" dialog

## Cross-File

- [ ] Open real file `RAS CRM（template） (version0529).xlsx`
- [ ] Verify it loads (might have different column layout — let Claude know if it doesn't)
- [ ] Make a small change, save
- [ ] Run `node tools/compare-xlsx.js "<original>" "<downloaded>"` to verify data preservation
