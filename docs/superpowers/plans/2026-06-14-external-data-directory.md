# 数据可携带性修复 — External Data Directory 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户把 SQLite 数据存到任意外部目录(用 File System Access API),目录搬家时数据跟着走;旧 IndexedDB 模式保留作为默认 fallback。

**Architecture:** 新增 `app/data-store.js` 模块(UMD),封装 storage mode ('indexeddb'|'directory') 和读/写 byte 数组。`db.js` 的 `loadFromIndexedDb` / `saveToIndexedDb` 改成委托给 data-store。UI 加一个"📂 数据位置"按钮 + 模态框让用户切模式,切到 directory 模式时把当前数据从 IndexedDB 复制到所选目录的 `ras_crm.sqlite`。

**Tech Stack:** Browser File System Access API (Chrome 86+/Edge 86+),IndexedDB (fallback),SQLite (sql.js),vanilla JS UMD modules.

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `app/data-store.js` (新) | 存储模式 + byte 读写。`getData() / setData() / pickDirectory() / resetToIndexedDB() / init() / getMode() / getDirName() / isSupported()` |
| `app/db.js` (改) | `loadFromIndexedDb` / `saveToIndexedDb` 委托给 `CRM_DATASTORE` |
| `app/ui-save.js` (改) | 加 `openDataLocationModal()` + modal HTML + 事件 |
| `ras_crm.html` (改) | 加载 `data-store.js` + 加"📂 数据位置"按钮 + bump `?v=` |
| `app/styles.css` (改) | Modal 样式 |
| `tests/data-store.test.js` (新) | 模拟 IndexedDB 验证 settings 持久化 |

---

## Task 1: 新建 `app/data-store.js` 骨架

**Files:**
- Create: `app/data-store.js`
- Test: `tests/data-store.test.js`

- [ ] **Step 1: 写失败测试** — 在 `tests/data-store.test.js` 加:
```js
const assert = require('node:assert/strict');
const test = (name, fn) => { try { fn(); console.log('  ok', name); } catch (e) { console.log('  FAIL', name, e.message); process.exit(1); } };
test('data-store exposes init, getData, setData, pickDirectory, resetToIndexedDB, getMode, getDirName, isSupported on global/window', () => {
  global.window = global;
  global.indexedDB = undefined;  // simulate Node
  const mod = require('../app/data-store.js');
  assert.equal(typeof mod.init, 'function');
  assert.equal(typeof mod.getData, 'function');
  assert.equal(typeof mod.setData, 'function');
  assert.equal(typeof mod.pickDirectory, 'function');
  assert.equal(typeof mod.resetToIndexedDB, 'function');
  assert.equal(typeof mod.getMode, 'function');
  assert.equal(typeof mod.getDirName, 'function');
  assert.equal(typeof mod.isSupported, 'function');
  // Also exposed on global
  assert.equal(typeof global.CRM_DATASTORE, 'object');
});
test('isSupported returns false when showDirectoryPicker is not available', () => {
  global.window = global;
  const mod = require('../app/data-store.js');
  assert.equal(mod.isSupported(), false);
});
```

- [ ] **Step 2: 跑测试确认失败** — `node tests/data-store.test.js`,期望:FAIL with "Cannot find module '../app/data-store.js'"

- [ ] **Step 3: 写 `app/data-store.js` 最小骨架**

```js
// app/data-store.js
// Storage backend for the SQLite database. Two modes:
//   - 'indexeddb' (default): bytes live in the browser's IndexedDB, scoped to
//     the page's origin. For file:// URLs Chrome partitions by file path,
//     so data is lost when the user moves the HTML file to a new folder.
//   - 'directory': bytes live in a user-picked directory as `ras_crm.sqlite`.
//     Data follows the directory, not the page. Powered by File System
//     Access API (Chrome 86+, Edge 86+).
(function (global) {
  'use strict';

  // Detect File System Access API support (Node + unsupported browsers → false)
  const FSAA_SUPPORTED = (typeof global !== 'undefined' && typeof global.showDirectoryPicker === 'function');

  // Settings are persisted in a separate, well-known IndexedDB so they survive
  // a data-store switch (the main IDB might be wiped on switch).
  const SETTINGS_DB = 'ras-crm-settings';
  const SETTINGS_STORE = 'kv';
  const SETTINGS_KEY = 'data-location';

  // Where the main SQLite bytes live
  const MAIN_DB = 'ras-crm-db';
  const MAIN_STORE = 'kv';
  const MAIN_KEY = 'crm-sqlite';

  // The actual file name when using directory mode
  const DATA_FILENAME = 'ras_crm.sqlite';

  let mode = 'indexeddb';          // 'indexeddb' | 'directory'
  let dirHandle = null;             // FileSystemDirectoryHandle (browser only)
  let dirName = null;               // human-readable directory name
  let needPermission = false;       // true if dirHandle needs permission re-request

  // ---- IndexedDB helpers (settings) ----
  function openIdb(name, store) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains(store)) idb.createObjectStore(store);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbGet(name, store, key) {
    return openIdb(name, store).then(idb => new Promise((resolve) => {
      const tx = idb.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    }));
  }
  function idbPut(name, store, key, value) {
    return openIdb(name, store).then(idb => new Promise((resolve, reject) => {
      const tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
  function idbDelete(name, store, key) {
    return openIdb(name, store).then(idb => new Promise((resolve) => {
      const tx = idb.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    }));
  }

  // ---- Public: init() — load settings, restore prior mode ----
  async function init() {
    if (typeof indexedDB === 'undefined') {
      // Node or unsupported env
      mode = 'indexeddb';
      return { mode, dirName: null, needPermission: false };
    }
    let settings = null;
    try { settings = await idbGet(SETTINGS_DB, SETTINGS_STORE, SETTINGS_KEY); } catch (e) { /* ignore */ }
    if (settings && settings.mode === 'directory' && settings.dirHandle) {
      try {
        dirHandle = settings.dirHandle;
        dirName = settings.dirName || (dirHandle.name || null);
        const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          mode = 'directory';
          return { mode, dirName, needPermission: false };
        }
        // Need to prompt the user to re-grant permission
        mode = 'directory';
        needPermission = true;
        return { mode, dirName, needPermission: true };
      } catch (e) { /* fall through to indexeddb */ }
    }
    mode = 'indexeddb';
    dirHandle = null;
    dirName = null;
    return { mode, dirName: null, needPermission: false };
  }

  // ---- Public: read / write the SQLite bytes ----
  async function getData() {
    if (mode === 'directory' && dirHandle) {
      // Re-check permission
      if (needPermission) {
        const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') {
          throw new Error('需要文件读写权限 (在弹窗中点击"允许")');
        }
        needPermission = false;
      }
      try {
        const fileHandle = await dirHandle.getFileHandle(DATA_FILENAME);
        const file = await fileHandle.getFile();
        const buf = await file.arrayBuffer();
        return buf.byteLength > 0 ? new Uint8Array(buf) : null;
      } catch (e) {
        if (e && e.name === 'NotFoundError') return null;  // file doesn't exist yet
        throw e;
      }
    }
    // IndexedDB mode
    if (typeof indexedDB === 'undefined') return null;
    try {
      const bytes = await idbGet(MAIN_DB, MAIN_STORE, MAIN_KEY);
      return bytes || null;
    } catch (e) { return null; }
  }

  async function setData(bytes) {
    if (mode === 'directory' && dirHandle) {
      if (needPermission) {
        const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') {
          throw new Error('需要文件读写权限 (在弹窗中点击"允许")');
        }
        needPermission = false;
      }
      const fileHandle = await dirHandle.getFileHandle(DATA_FILENAME, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(bytes);
      await writable.close();
      return;
    }
    // IndexedDB mode
    if (typeof indexedDB === 'undefined') return;
    try {
      await idbPut(MAIN_DB, MAIN_STORE, MAIN_KEY, bytes);
    } catch (e) { /* swallow */ }
  }

  // ---- Public: pick a directory and migrate data ----
  async function pickDirectory() {
    if (!FSAA_SUPPORTED) {
      throw new Error('当前浏览器不支持选择目录,需要 Chrome 86+ 或 Edge 86+');
    }
    const handle = await global.showDirectoryPicker({ mode: 'readwrite' });
    // Read current bytes from whichever mode we're in
    let currentBytes = null;
    if (mode === 'indexeddb') {
      try { currentBytes = await idbGet(MAIN_DB, MAIN_STORE, MAIN_KEY); } catch (e) { /* ignore */ }
    } else if (mode === 'directory' && dirHandle) {
      try {
        const fh = await dirHandle.getFileHandle(DATA_FILENAME);
        const f = await fh.getFile();
        const buf = await f.arrayBuffer();
        currentBytes = buf.byteLength > 0 ? new Uint8Array(buf) : null;
      } catch (e) { /* ignore */ }
    }
    // Write to the new directory
    const fileHandle = await handle.getFileHandle(DATA_FILENAME, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(currentBytes || new Uint8Array(0));
    await writable.close();
    // Commit
    dirHandle = handle;
    dirName = handle.name || null;
    mode = 'directory';
    needPermission = false;
    try {
      await idbPut(SETTINGS_DB, SETTINGS_STORE, SETTINGS_KEY, { mode, dirHandle, dirName });
    } catch (e) { /* settings persistence is best-effort */ }
    return { mode, dirName };
  }

  // ---- Public: switch back to IndexedDB and copy data over ----
  async function resetToIndexedDB() {
    let currentBytes = null;
    if (mode === 'directory' && dirHandle) {
      try {
        const fh = await dirHandle.getFileHandle(DATA_FILENAME);
        const f = await fh.getFile();
        const buf = await f.arrayBuffer();
        currentBytes = buf.byteLength > 0 ? new Uint8Array(buf) : null;
      } catch (e) { /* ignore */ }
    }
    mode = 'indexeddb';
    dirHandle = null;
    dirName = null;
    needPermission = false;
    // Write the bytes we carried over (if any) into IndexedDB
    if (currentBytes) {
      try { await idbPut(MAIN_DB, MAIN_STORE, MAIN_KEY, currentBytes); } catch (e) { /* ignore */ }
    }
    try { await idbDelete(SETTINGS_DB, SETTINGS_STORE, SETTINGS_KEY); } catch (e) { /* ignore */ }
    return { mode, dirName: null };
  }

  // ---- Public: getters / state ----
  function getMode() { return mode; }
  function getDirName() { return dirName; }
  function isSupported() { return FSAA_SUPPORTED; }
  function isNeedPermission() { return needPermission; }

  // ---- Export ----
  const api = { init, getData, setData, pickDirectory, resetToIndexedDB, getMode, getDirName, isSupported, isNeedPermission };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CRM_DATASTORE = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
```

- [ ] **Step 4: 跑测试确认通过** — `node tests/data-store.test.js`,期望:`ok` x 2

- [ ] **Step 5: Commit** —
```bash
git add app/data-store.js tests/data-store.test.js
git commit -m "feat(datastore): add data-store module skeleton (init/getData/setData/pickDirectory/resetToIndexedDB)"
```

---

## Task 2: 让 `app/db.js` 委托给 data-store

**Files:**
- Modify: `app/db.js:165-208` (replace `saveToIndexedDb` / `loadFromIndexedDb` / helpers)

- [ ] **Step 1: 替换 `loadFromIndexedDb` / `saveToIndexedDb` 实现**

找到 `app/db.js` 第 165-208 行的 `saveToIndexedDb` / `loadFromIndexedDb` / `openIdb` / `idbPut` / `idbGet`,整体替换为:

```js
  // ---- Persistence (delegated to data-store) ----
  function getDataStore() {
    if (typeof window !== 'undefined' && window.CRM_DATASTORE) return window.CRM_DATASTORE;
    if (typeof require !== 'undefined') return require('./data-store.js');
    return null;
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToIndexedDb, 500);
  }

  async function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await saveToIndexedDb();
  }

  async function saveToIndexedDb() {
    const ds = getDataStore();
    if (!ds) return;
    try {
      const bytes = db.export();
      await ds.setData(bytes);
    } catch (e) { /* swallow */ }
  }

  async function loadFromIndexedDb() {
    const ds = getDataStore();
    if (!ds) return null;
    try {
      return await ds.getData();
    } catch (e) { return null; }
  }
```

注意:删除原来的 `openIdb` / `idbPut` / `idbGet` 函数(整段),data-store.js 已经实现。

- [ ] **Step 2: 跑所有测试** — `node tests/run-all.js`,期望全部通过(`db.test.js` 的 IndexedDB 测试可能因为 module 改动要看看,但 data-store 在 Node 下没有 indexedDB 应该都走 noop 路径,行为不变)

- [ ] **Step 3: Commit** —
```bash
git add app/db.js
git commit -m "refactor(db): delegate persistence to data-store module"
```

---

## Task 3: 在 `app/ui-save.js` 加 "数据位置" 按钮 + 模态框

**Files:**
- Modify: `app/ui-save.js` (加 `openDataLocationModal` 函数 + `wireDataLocationButton` + `updateDataLocationButton`)

- [ ] **Step 1: 在 `wireImportExport` 末尾加数据位置按钮的 wiring**

找到 `wireImportExport` 函数,在 `document.getElementById('restore-input').onchange = onRestoreFile;` 之后加:

```js
    const dlBtn = document.getElementById('data-location-btn');
    if (dlBtn) dlBtn.onclick = openDataLocationModal;
    updateDataLocationButton();
```

- [ ] **Step 2: 加 `updateDataLocationButton` 函数** (放在 `updateDbStatus` 旁边)

```js
  function updateDataLocationButton() {
    const btn = document.getElementById('data-location-btn');
    if (!btn || !window.CRM_DATASTORE) return;
    const ds = window.CRM_DATASTORE;
    const mode = ds.getMode();
    if (mode === 'directory') {
      const name = ds.getDirName() || '外部目录';
      btn.textContent = '📂 ' + name;
      btn.title = '数据存储在外部目录: ' + name + ' (点击管理)';
      btn.classList.add('active');
    } else {
      btn.textContent = '📂 浏览器存储';
      btn.title = '数据存储在浏览器内置 IndexedDB (跟随应用文件位置)。点击切换到外部目录,数据就能跟着文件夹搬家。';
      btn.classList.remove('active');
    }
  }
```

并在 `setInterval` 列表里也调用 `updateDataLocationButton()`(每 1 秒,跟 db-status 一样):

```js
    setInterval(() => { updateDbStatus(); updateDataLocationButton(); }, 1000);
```

- [ ] **Step 3: 加 `openDataLocationModal` 函数** (放在 `openDataLocationModal` 后)

```js
  async function openDataLocationModal() {
    const ds = window.CRM_DATASTORE;
    if (!ds) {
      Notify.error('数据存储模块未加载');
      return;
    }
    const mode = ds.getMode();
    const dirName = ds.getDirName();
    const supported = ds.isSupported();
    const needPerm = ds.isNeedPermission();

    // Build modal HTML
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'data-location-overlay';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3>📂 数据存储位置</h3>
          <button class="modal-close" aria-label="关闭">×</button>
        </div>
        <div class="modal-body">
          <p class="muted">默认情况下,数据存储在浏览器的 IndexedDB 里,跟着 <code>ras_crm.html</code> 的位置走 — 移动 HTML 文件到别的文件夹后,数据会留在原位置的浏览器中,新位置会显示空数据。</p>
          <p class="muted">把数据存到外部目录(随你选),目录搬家时数据跟着走。</p>
          <div class="data-location-status">
            <div class="kv"><span>当前模式</span><b>${mode === 'directory' ? '外部目录' : '浏览器内置'}</b></div>
            ${mode === 'directory' ? `<div class="kv"><span>目录名</span><b>${escapeHtml(dirName || '(未知)')}</b></div>` : ''}
            ${needPerm ? '<div class="warn-banner">⚠️ 浏览器要求重新授权文件读写权限,点下面的"打开"按钮后选"允许"。</div>' : ''}
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" id="dl-cancel">关闭</button>
          ${mode === 'directory'
            ? `<button class="btn btn-danger" id="dl-reset">切回浏览器存储</button>`
            : (supported ? `<button class="btn btn-primary" id="dl-pick">📂 选择外部目录…</button>` : `<button class="btn" disabled title="需要 Chrome 86+ / Edge 86+">当前浏览器不支持</button>`)}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); };
    overlay.querySelector('.modal-close').onclick = close;
    overlay.querySelector('#dl-cancel').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const pickBtn = overlay.querySelector('#dl-pick');
    if (pickBtn) pickBtn.onclick = async () => {
      try {
        Notify.info('请在弹窗中选择一个目录…');
        const r = await ds.pickDirectory();
        close();
        Notify.info('已切换到外部目录: ' + r.dirName);
        updateDataLocationButton();
        // Reload the page so the new data is read
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        Notify.error('切换失败: ' + e.message);
      }
    };

    const resetBtn = overlay.querySelector('#dl-reset');
    if (resetBtn) resetBtn.onclick = async () => {
      if (!confirm('确定切回浏览器存储?当前外部目录的文件不会被删除,但应用将不再写它。')) return;
      try {
        await ds.resetToIndexedDB();
        close();
        Notify.info('已切回浏览器存储');
        updateDataLocationButton();
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        Notify.error('切换失败: ' + e.message);
      }
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  }
```

- [ ] **Step 4: 把 `openDataLocationModal` 和 `updateDataLocationButton` 暴露到 global**

在文件底部 `global.wireImportExport = wireImportExport;` 之后加:
```js
  global.openDataLocationModal = openDataLocationModal;
  global.updateDataLocationButton = updateDataLocationButton;
```

- [ ] **Step 5: 跑测试** — `node tests/run-all.js`,期望全部通过(UI 改动不影响 Node 测试)

- [ ] **Step 6: Commit** —
```bash
git add app/ui-save.js
git commit -m "feat(ui-save): add '📂 数据位置' button + modal for switching storage mode"
```

---

## Task 4: 在 `ras_crm.html` 加按钮 + 加载 data-store.js + bump version

**Files:**
- Modify: `ras_crm.html`

- [ ] **Step 1: 加 "📂 数据位置" 按钮**

在 `ras_crm.html` 第 25 行 (`<button class="btn" id="restore-btn">📂 恢复</button>`) 之后加:
```html
    <button class="btn btn-ghost" id="data-location-btn" title="数据存储位置" style="margin-left:4px;">📂 浏览器存储</button>
```

- [ ] **Step 2: 加载 `app/data-store.js`** — 必须在 `app/db.js` 之前

在 `<script src="app/xlsx-io.js?v=...">` 之后、`<script src="app/db.js?v=...">` 之前加:
```html
  <script src="app/data-store.js?v=20260614-8"></script>
```

- [ ] **Step 3: Bump 所有 `?v=`** — 把 `20260614-7` 替换为 `20260614-8`

`sed -i 's/v=20260614-7/v=20260614-8/g' ras_crm.html`

- [ ] **Step 4: Commit** —
```bash
git add ras_crm.html
git commit -m "chore(html): add data-location button + load data-store.js; bump ?v= to 20260614-8"
```

---

## Task 5: Modal 样式

**Files:**
- Modify: `app/styles.css` (append new section at end)

- [ ] **Step 1: Append modal styles**

在 `app/styles.css` 末尾(最后一行 `}` 之后)追加:

```css
/* === v3.0.2 数据位置 modal === */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  animation: fadeIn var(--dur) var(--ease);
}
.modal {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  max-width: 520px;
  width: calc(100% - 32px);
  max-height: 85vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-header h3 { margin: 0; font-size: 16px; }
.modal-close {
  background: none;
  border: 0;
  font-size: 22px;
  color: var(--muted);
  cursor: pointer;
  padding: 0 6px;
  line-height: 1;
  border-radius: 4px;
  transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
}
.modal-close:hover { background: var(--surface-2); color: var(--text); }
.modal-body { padding: 20px; line-height: 1.7; }
.modal-body p { margin: 0 0 12px; font-size: 13px; }
.modal-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.data-location-status {
  margin-top: 12px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.data-location-status .kv {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}
.data-location-status .kv span { color: var(--muted); }
.data-location-status .kv b { color: var(--text); }
.data-location-status .warn-banner {
  margin-top: 8px;
  padding: 8px 10px;
  background: #fef3c7;
  border-left: 3px solid #f59e0b;
  border-radius: 4px;
  font-size: 12px;
  color: #92400e;
}
#data-location-btn.active { background: #ecfdf5; color: #047857; border-color: #6ee7b7; }
#data-location-btn.active:hover { background: #d1fae5; }
```

- [ ] **Step 2: CSS 语法检查** — `node -e "const s=require('fs').readFileSync('app/styles.css','utf8'); const o=(s.match(/\{/g)||[]).length; const c=(s.match(/\}/g)||[]).length; console.log('lines:',s.split('\n').length,'braces:',o,'/',c,o===c?'OK':'MISMATCH')"` 期望:`OK`

- [ ] **Step 3: Commit** —
```bash
git add app/styles.css
git commit -m "style(modal): add data-location modal styles + active state for the data-location button"
```

---

## Task 6: 端到端测试 + 验证

**Files:**
- Read: 现有测试

- [ ] **Step 1: 跑所有测试** — `node tests/run-all.js`,期望:30 + 25 + 14 + 4 + roundtrip = 73+ passed

- [ ] **Step 2: Node 模块加载 smoke test** — 验证 data-store.js / db.js / ui-save.js 能 require

```js
global.window = global;
global.indexedDB = undefined;
require('./app/data-store.js');
require('./app/db.js');
require('./app/core.js');
console.log('CRM_DATASTORE:', typeof global.CRM_DATASTORE);
console.log('openDataLocationModal:', typeof global.openDataLocationModal);
console.log('updateDataLocationButton:', typeof global.updateDataLocationButton);
```

`node -e "..."` 期望输出 3 行 `function` 或 `object`

- [ ] **Step 3: JS 语法检查** — 5 个改过的文件:
```bash
for f in app/data-store.js app/db.js app/ui-save.js; do node -c $f 2>&1 && echo "$f: OK"; done
```

---

## Task 7: 提交 + 推送

- [ ] **Step 1: 最终 commit(如果还有未提交)** — `git status` 检查

- [ ] **Step 2: Push** — `git push origin master`

- [ ] **Step 3: 浏览器验证清单**(在用户机器上)
- F5 刷新 → 顶栏右上角多一个 "📂 浏览器存储" 按钮
- 点按钮 → modal 弹出,显示当前模式 + 说明
- 点 "📂 选择外部目录…" → 系统目录选择器弹出 → 选个目录
- 应看到 "已切换到外部目录: <dirName>" 通知
- 自动刷新页面 → 按钮变成 "📂 <dirName>" 绿色
- 打开所选目录 → 看到 `ras_crm.sqlite` 文件
- 把整个 `ras_crm.html` + `ras_crm.sqlite` 文件夹复制到别的路径
- 在新路径打开 → 数据还在!
- 切回浏览器存储:点 "📂 <dirName>" 按钮 → "切回浏览器存储" → 确认

---

## Self-Review

**Spec coverage**:
- ✅ 数据存储到外部目录 (Task 1, 3, 4)
- ✅ 目录搬家数据跟着走 (FSAA mode, by design)
- ✅ IndexedDB 模式保留 (default fallback)
- ✅ 模式切换 + 数据迁移 (Task 1: `pickDirectory` carries bytes over)
- ✅ 浏览器不支持时优雅降级 (Task 1: `isSupported` check, Task 3: button disabled)
- ✅ 权限重新请求 (Task 1: `needPermission` flag)

**Placeholder scan**: 无 TBD / TODO / 模糊描述

**Type consistency**: 整个 plan 用 `mode: 'indexeddb'|'directory'`,`dirHandle: FileSystemDirectoryHandle | null`,签名一致

**风险**:
- Firefox/Safari: FSAA 不可用 → modal 提示"当前浏览器不支持",仍可继续用 IndexedDB 模式(只是换目录不能保留数据)
- 文件被锁: 用户选了 system 文件夹可能没写权限 → pickDirectory try/catch 抛错
- 已存在的 `db.js` 测试可能依赖旧的 `openIdb` 等函数存在 → Task 2 已删除这些函数,需要确认测试不依赖它们(看测试文件:只依赖 `CRM_DB.initDb` API,API 没变,应该 OK)

