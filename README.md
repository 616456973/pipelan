# RAS CRM

A zero-dependency single-file HTML Web App for managing RAS CRM opportunity/sales data. The .xlsx file is the database.

## Quick Start

1. Double-click `ras_crm.html` to open in Chrome or Edge.
2. Click **"打开"** and select your `.xlsx` file.
3. Edit / add / delete records.
4. Click **"保存"** to download the updated xlsx. **Manually copy the downloaded file back over your original** (the app can't write to disk directly from the browser).

## Features

- 5 pages: Dashboard, Opportunity List, Add/Edit Form, Analysis (8 views), Dictionary Manager
- 8 analysis views: Stage Funnel, Trend + YoY/MoM, TOP N, Pareto, Stage Conversion, Lose Reason, Multi-dim Pivot, ST4 vs ST5
- Soft delete with "show deleted" toggle
- Cascading product filter (selecting PL1 limits products to P1xx)
- Validation on form submit
- Beforeunload guard against losing unsaved changes

## Important Limitations

### Style loss
The xlsx library used (SheetJS) does NOT preserve formatting when writing. After saving:
- Cell styles, fonts, colors are lost
- Merged cells are lost
- Embedded images are lost
- Column widths may change
- **The data itself is preserved perfectly.**

The first time you save, you'll get a warning dialog. After that, no more warnings.

If you need to preserve the original visual layout, maintain formatting in Excel and use the Web App for data entry / analysis only.

### No concurrent editing
Do not open the same xlsx in two browser tabs. The app has no concurrency control and you will lose changes.

### xlsx compatibility
- Tested with Chrome and Edge (latest 2 major versions)
- Not tested with Firefox or Safari
- Not tested on mobile
- The xlsx file is a standard OOXML file; you can always open it in Excel

## File Layout

```
RAS_CRM\
├── ras_crm.html              # Main entry — double-click this
├── app\
│   ├── core.js               # Data layer
│   ├── ui-*.js               # UI modules
│   └── styles.css
├── vendor\sheetjs\           # xlsx library
├── tests\                    # Test data and unit tests
└── tools\compare-xlsx.js     # xlsx comparison tool
```

## Development

### Run unit tests
```bash
node tests/unit.test.js
```

### Run all tests (unit + roundtrip comparison)
```bash
node tests/run-all.js
```

### Compare two xlsx files
```bash
node tools/compare-xlsx.js <original.xlsx> <exported.xlsx>
```

### Rebuild the test fixture
```bash
node tests/build-fixture.js
```

## Architecture

- `app/core.js` is the only file that knows about xlsx format. It uses a UMD pattern so it can be `require()`d in Node tests.
- `app/ui-*.js` files manipulate the DOM and call core functions. No business logic.
- The xlsx file is the single source of truth. The HTML app holds state in memory only.

## Backup

- The xlsx file is your data. Back it up like any other file.
- For multi-device sync: copy the xlsx to a cloud drive (OneDrive, etc.).
- For multi-user collaboration: use different xlsx files; merge by hand.
