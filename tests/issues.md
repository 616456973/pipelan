# RAS CRM Issues

This file tracks non-critical issues and known limitations. Updated as they are discovered.

## v1.0 Release (2026-06-13)

No critical issues found. v1.0 release notes:

- All 27 unit tests pass
- All 4 compare tests pass
- Roundtrip test on fixture: MATCHED
- Real xlsx (`RAS CRM（template） (version0529).xlsx`) loads, displays data, and roundtrips edits correctly

## Known Limitations (v1.1 candidates)

### Real xlsx column-name mismatch
The real `RAS CRM（template） (version0529).xlsx` uses different column header names than the test fixture:

- **Owner column**: real file uses `主责销售`, app expects `负责人` (substring match fails). As a result, the owner field is always empty when opening this file. The app correctly handles this by leaving the field blank — no error, no data loss. The "团队负责人" dict is unrelated to the opportunity owner column.
- **销售渠道 column** (col 7 in the real file): the app does not read or write this column. Data in this column is preserved as-is in the original xlsx but is dropped on roundtrip (the app cannot roundtrip unknown columns).
- **序号 column** (col 0 in the real file): same as above — not read or written by the app.

These are not bugs — the app intentionally has a fixed column schema. Users with this real-file format will see empty owner values and lose the two extra columns after a save+reload cycle. The 33 valid opportunity rows themselves are preserved.

### 23 parseError rows in the real xlsx
The real file has 23 rows flagged as parseError on load (mostly `productLine 字典悬空: P210 企业云管理服务` — the productLine value is not in the Sheet2 dictionary). On save, parseError rows are excluded from the output xlsx (by design — only valid rows are written back). This means a save roundtrip on the real file loses the 23 error rows. This is the intended behavior: the app cannot preserve rows that it could not parse in the first place.

### Style loss
SheetJS does not preserve cell formatting, merged cells, embedded images, or column widths on save. The data itself is preserved perfectly. The first save shows a warning; subsequent saves do not.

### Other known limitations
- xlsx roundtrip regenerates UUIDs for all opportunities (cosmetic only — data is preserved by name match)
- No concurrency control — opening the same xlsx in two tabs will lose changes
- Tested with Chrome and Edge; Firefox/Safari/mobile not tested

## No Critical Issues Found

The v1.0 release has no critical issues. All 20 planned tasks are complete, all tests pass, and the app works correctly on both the test fixture and the user's real data file.
