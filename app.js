"use strict";
/* =========================================================
   SalesFlow — app.js
   Single-file application logic: IndexedDB layer, business
   rules, and UI rendering. No build step, no framework.
   ========================================================= */

/* ---------------------------------------------------------
   0. Small utilities
   --------------------------------------------------------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $all = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const escapeHtml = (str) =>
  String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

function toPersianSafeNumber(val) {
  if (val === null || val === undefined) return NaN;
  if (typeof val === "number") return val;
  let s = String(val).trim();
  if (s === "") return NaN;
  const persianDigits = "۰۱۲۳۴۵۶۷۸۹";
  s = s.replace(/[۰-۹]/g, (d) => String(persianDigits.indexOf(d)));
  s = s.replace(/,/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

function normalizeStr(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function isValidColumnLetter(v) {
  return /^[A-Za-z]{1,3}$/.test(String(v || "").trim());
}

/* ---------------------------------------------------------
   1. Toasts
   --------------------------------------------------------- */
function showToast(message, type = "neutral", timeout = 3600) {
  const region = $("#toast-region");
  const el = document.createElement("div");
  el.className = `toast ${type === "neutral" ? "" : type}`;
  const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : type === "warning" ? "⚠️" : "ℹ️";
  el.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  region.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 200ms ease";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 220);
  }, timeout);
}

/* ---------------------------------------------------------
   2. Modal (confirm / info / custom)
   --------------------------------------------------------- */
function openModal({ icon = "❓", title, body, listItems = null, actions }) {
  const region = $("#modal-region");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const listHtml = listItems && listItems.length
    ? `<div class="modal-list">${listItems.map((i) => `<span class="badge badge-neutral">${escapeHtml(i)}</span>`).join("")}</div>`
    : "";
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-icon">${icon}</div>
      <div class="modal-title">${escapeHtml(title)}</div>
      <div class="modal-body">${body}</div>
      ${listHtml}
      <div class="modal-actions" id="modal-actions-slot"></div>
    </div>`;
  region.appendChild(overlay);
  const actionsSlot = $("#modal-actions-slot", overlay);
  actions.forEach((a) => {
    const btn = document.createElement("button");
    btn.className = `btn ${a.className || "btn-secondary"}`;
    btn.textContent = a.label;
    btn.onclick = () => {
      overlay.remove();
      if (a.onClick) a.onClick();
    };
    actionsSlot.appendChild(btn);
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && actions.some((a) => a.dismissOnBackdrop !== false)) {
      // only close on backdrop if there's a cancel-like action
    }
  });
  return overlay;
}

function confirmModal({ icon, title, body, confirmLabel, confirmClass = "btn-danger", listItems = null }) {
  return new Promise((resolve) => {
    openModal({
      icon, title, body, listItems,
      actions: [
        { label: "انصراف", className: "btn-secondary", onClick: () => resolve(false) },
        { label: confirmLabel, className: confirmClass, onClick: () => resolve(true) },
      ],
    });
  });
}

/* ---------------------------------------------------------
   3. IndexedDB layer
   --------------------------------------------------------- */
const DB_NAME = "salesflow-db";
const DB_VERSION = 1;
let dbInstance = null;

function openDb() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains("groups")) {
        db.createObjectStore("groups", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("products")) {
        db.createObjectStore("products", { keyPath: "code" });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };
    req.onsuccess = (ev) => { dbInstance = ev.target.result; resolve(dbInstance); };
    req.onerror = (ev) => reject(ev.target.error);
  });
}

function txStore(storeName, mode = "readonly") {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const Store = {
  async getAll(storeName) {
    const store = await txStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async get(storeName, key) {
    const store = await txStore(storeName);
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async put(storeName, value) {
    const store = await txStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async delete(storeName, key) {
    const store = await txStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  },
  async clear(storeName) {
    const store = await txStore(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  },
};

async function getSetting(key, fallback) {
  const rec = await Store.get("settings", key);
  return rec ? rec.value : fallback;
}
async function setSetting(key, value) {
  return Store.put("settings", { key, value });
}

/* ---------------------------------------------------------
   4. App state (in-memory cache, hydrated from IndexedDB)
   --------------------------------------------------------- */
const state = {
  groups: [],           // [{id, name, order}]
  products: [],          // [{code, group, cartonQty}]
  columnMap: { code: "", qty: "", carton: "", line: "", customer: "", invoice: "" },
  lines: {
    line1: { label: "لاین یک", excelValue: "" },
    line2: { label: "لاین دو", excelValue: "" },
  },
  lineGroups: { line1: [], line2: [] }, // arrays of group ids
  fontScale: 1.1,
  salesWorkbookSheet: null, // current parsed worksheet (for report)
  salesFileLoaded: false,
};

async function hydrateState() {
  state.groups = (await Store.getAll("groups")).sort((a, b) => a.order - b.order);
  state.products = await Store.getAll("products");
  // shallow-merge over defaults so older saved settings (from before a field
  // like "invoice" existed) don't lose the new key entirely.
  state.columnMap = { ...state.columnMap, ...(await getSetting("columnMap", {})) };
  state.lines = await getSetting("lines", state.lines);
  state.lineGroups = await getSetting("lineGroups", state.lineGroups);
  state.fontScale = await getSetting("fontScale", 1.1);
}

function groupById(id) { return state.groups.find((g) => g.id === id); }
function groupByName(name) { return state.groups.find((g) => g.name === name); }
function productCountForGroup(groupId) {
  return state.products.filter((p) => p.group === groupId).length;
}

/* ---------------------------------------------------------
   5. Navigation
   --------------------------------------------------------- */
const VIEW_META = {
  reports: { title: "گزارش‌گیری", sub: "تولید گزارش فروش از فایل روزانه" },
  management: { title: "مدیریت", sub: "گروه‌ها، کدهای کالا و تعریف گزارش کلی" },
  settings: { title: "تنظیمات", sub: "پیکربندی ستون‌ها، لاین‌ها و ظاهر برنامه" },
};

function switchView(viewKey) {
  $all(".sidebar-nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === viewKey));
  $all(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${viewKey}`));
  $("#topbar-title").textContent = VIEW_META[viewKey].title;
  $("#topbar-sub").textContent = VIEW_META[viewKey].sub;
}

function switchManagementTab(tabKey) {
  $all("#management-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.mtab === tabKey));
  $all(".mtab-panel").forEach((p) => (p.style.display = p.id === `mtab-${tabKey}` ? "" : "none"));
}

/* ---------------------------------------------------------
   6. GROUPS management (add / reorder / delete)
   --------------------------------------------------------- */
function renderGroupAddForm() {
  const slot = $("#group-add-form-slot");
  slot.innerHTML = `
    <div style="margin-bottom: var(--space-5); display:none" id="group-add-row">
      <div class="row">
        <div class="field" style="flex:1">
          <input type="text" id="new-group-name" placeholder="نام گروه کالا را وارد کنید" />
          <div class="field-error" id="group-add-error" style="display:none"></div>
        </div>
        <button class="btn btn-primary" id="btn-confirm-add-group">افزودن</button>
        <button class="btn btn-secondary" id="btn-cancel-add-group">انصراف</button>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="new-group-nonsellable" />
        <label for="new-group-nonsellable">غیرقابل فروش (مثل استند) — این گروه هرگز جزو فروش و تعداد مشتری حساب نشود</label>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="new-group-sellbyunit" />
        <label for="new-group-sellbyunit">فروش به قوطی — گزارش این گروه با واحد کوچک (تعداد خام) محاسبه شود، نه تقسیم بر تعداد در کارتن</label>
      </div>
    </div>`;
}

function toggleGroupAddRow(show) {
  const row = $("#group-add-row");
  row.style.display = show ? "block" : "none";
  if (show) {
    $("#new-group-name").value = "";
    $("#new-group-nonsellable").checked = false;
    $("#new-group-sellbyunit").checked = false;
    $("#group-add-error").style.display = "none";
    $("#new-group-name").focus();
  }
}

async function handleAddGroup() {
  const input = $("#new-group-name");
  const errorEl = $("#group-add-error");
  const nonSellable = $("#new-group-nonsellable").checked;
  const sellByUnit = $("#new-group-sellbyunit").checked;
  const name = normalizeStr(input.value);
  if (!name) {
    errorEl.textContent = "نام گروه کالا را وارد کنید.";
    errorEl.style.display = "block";
    return;
  }
  const duplicate = state.groups.some((g) => g.name === name);
  if (duplicate) {
    errorEl.textContent = "⚠️ این گروه کالا قبلاً ثبت شده است.";
    errorEl.style.display = "block";
    return;
  }
  const maxOrder = state.groups.reduce((m, g) => Math.max(m, g.order), -1);
  const rec = { name, order: maxOrder + 1, nonSellable, sellByUnit };
  const id = await Store.put("groups", rec);
  rec.id = id;
  state.groups.push(rec);
  toggleGroupAddRow(false);
  showToast("گروه کالا با موفقیت اضافه شد", "success");
  renderGroupsList();
  refreshAllGroupDependentUI();
}

async function handleToggleGroupNonSellable(id) {
  const group = groupById(id);
  if (!group) return;
  group.nonSellable = !group.nonSellable;
  await Store.put("groups", group);
  if (group.nonSellable) {
    // a group just marked non-sellable can no longer be part of any line's
    // report definition — strip it out and persist the cleanup.
    state.lineGroups.line1 = state.lineGroups.line1.filter((gid) => gid !== id);
    state.lineGroups.line2 = state.lineGroups.line2.filter((gid) => gid !== id);
    await setSetting("lineGroups", state.lineGroups);
  }
  showToast(
    group.nonSellable ? "گروه به‌عنوان «غیرقابل فروش» علامت‌گذاری شد" : "گروه به فروش عادی بازگشت",
    "success"
  );
  renderGroupsList();
  refreshAllGroupDependentUI();
}

async function handleToggleGroupSellByUnit(id) {
  const group = groupById(id);
  if (!group) return;
  group.sellByUnit = !group.sellByUnit;
  await Store.put("groups", group);
  showToast(
    group.sellByUnit ? "گروه به‌صورت «فروش به قوطی» محاسبه می‌شود" : "گروه به محاسبه بر اساس کارتن بازگشت",
    "success"
  );
  renderGroupsList();
}

function renderGroupsList() {
  const slot = $("#groups-list-slot");
  if (!state.groups.length) {
    slot.innerHTML = `
      <div class="empty-state">
        <div class="icon">📦</div>
        <div class="title">هنوز گروهی ثبت نشده است</div>
        <div>با دکمه «افزودن گروه کالا» شروع کنید</div>
      </div>`;
    return;
  }
  const sorted = [...state.groups].sort((a, b) => a.order - b.order);
  slot.innerHTML = `<div class="order-list" id="order-list">${sorted
    .map(
      (g, idx) => `
      <div class="order-item" draggable="true" data-group-id="${g.id}">
        <span class="drag-handle">⠿</span>
        <span class="name" data-open-group="${g.id}" style="cursor:pointer">${escapeHtml(g.name)}</span>
        ${g.nonSellable ? `<span class="badge badge-neutral">غیرقابل فروش</span>` : ""}
        ${g.sellByUnit ? `<span class="badge badge-neutral">فروش به قوطی</span>` : ""}
        <span class="count">${productCountForGroup(g.id)} کالا</span>
        <div class="move-btns">
          <button class="btn btn-icon btn-sm btn-secondary" data-move="up" data-id="${g.id}" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button class="btn btn-icon btn-sm btn-secondary" data-move="down" data-id="${g.id}" ${idx === sorted.length - 1 ? "disabled" : ""}>▼</button>
        </div>
        <button class="btn btn-sm btn-secondary" data-toggle-sellbyunit="${g.id}">${g.sellByUnit ? "بازگشت به کارتن" : "فروش به قوطی"}</button>
        <button class="btn btn-sm btn-secondary" data-toggle-nonsellable="${g.id}">${g.nonSellable ? "بازگشت به فروش عادی" : "غیرقابل فروش"}</button>
        <button class="btn btn-icon btn-sm btn-danger" data-delete-group="${g.id}">🗑</button>
      </div>`
    )
    .join("")}</div>`;

  // move buttons
  $all("[data-move]", slot).forEach((btn) => {
    btn.addEventListener("click", () => moveGroup(Number(btn.dataset.id), btn.dataset.move));
  });
  // delete buttons
  $all("[data-delete-group]", slot).forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteGroup(Number(btn.dataset.deleteGroup)));
  });
  // non-sellable toggle
  $all("[data-toggle-nonsellable]", slot).forEach((btn) => {
    btn.addEventListener("click", () => handleToggleGroupNonSellable(Number(btn.dataset.toggleNonsellable)));
  });
  // sell-by-unit toggle
  $all("[data-toggle-sellbyunit]", slot).forEach((btn) => {
    btn.addEventListener("click", () => handleToggleGroupSellByUnit(Number(btn.dataset.toggleSellbyunit)));
  });
  // open group products modal
  $all("[data-open-group]", slot).forEach((el) => {
    el.addEventListener("click", () => openGroupProductsModal(Number(el.dataset.openGroup)));
  });
  // drag & drop reordering
  let dragId = null;
  $all(".order-item", slot).forEach((item) => {
    item.addEventListener("dragstart", () => {
      dragId = Number(item.dataset.groupId);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => e.preventDefault());
    item.addEventListener("drop", async (e) => {
      e.preventDefault();
      const targetId = Number(item.dataset.groupId);
      if (dragId === null || dragId === targetId) return;
      await reorderGroups(dragId, targetId);
    });
  });
}

async function moveGroup(id, direction) {
  const sorted = [...state.groups].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((g) => g.id === id);
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  const tmp = a.order; a.order = b.order; b.order = tmp;
  await Store.put("groups", a);
  await Store.put("groups", b);
  renderGroupsList();
}

async function reorderGroups(dragId, targetId) {
  const sorted = [...state.groups].sort((a, b) => a.order - b.order);
  const fromIdx = sorted.findIndex((g) => g.id === dragId);
  const toIdx = sorted.findIndex((g) => g.id === targetId);
  const [moved] = sorted.splice(fromIdx, 1);
  sorted.splice(toIdx, 0, moved);
  for (let i = 0; i < sorted.length; i++) {
    sorted[i].order = i;
    await Store.put("groups", sorted[i]);
  }
  renderGroupsList();
}

async function handleDeleteGroup(id) {
  const group = groupById(id);
  if (!group) return;
  const count = productCountForGroup(id);
  if (count > 0) {
    const ok = await confirmModal({
      icon: "⚠️",
      title: "هشدار حذف گروه",
      body: `با حذف گروه «${escapeHtml(group.name)}»، تمام کدهای کالای مربوط به این گروه نیز حذف خواهند شد. آیا مطمئن هستید؟`,
      confirmLabel: "حذف گروه و کالاها",
      confirmClass: "btn-danger",
    });
    if (!ok) return;
    const toDelete = state.products.filter((p) => p.group === id);
    for (const p of toDelete) await Store.delete("products", p.code);
    state.products = state.products.filter((p) => p.group !== id);
  }
  await Store.delete("groups", id);
  state.groups = state.groups.filter((g) => g.id !== id);
  // clean up line-group selections referencing this group
  state.lineGroups.line1 = state.lineGroups.line1.filter((gid) => gid !== id);
  state.lineGroups.line2 = state.lineGroups.line2.filter((gid) => gid !== id);
  await setSetting("lineGroups", state.lineGroups);
  showToast("گروه کالا حذف شد", "success");
  renderGroupsList();
  refreshAllGroupDependentUI();
}

function openGroupProductsModal(groupId) {
  const group = groupById(groupId);
  if (!group) return;
  const region = $("#modal-region");
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px">
      <div class="modal-title">${escapeHtml(group.name)}</div>
      <div class="card-subtitle" style="margin-bottom:var(--space-4)">تعداد کالا: ${productCountForGroup(groupId)}</div>
      <div class="search-input-wrap" style="margin-bottom:var(--space-4)">
        <input type="text" id="group-modal-search" placeholder="جستجوی کد کالا..." />
        <span class="icon">🔍</span>
      </div>
      <div class="table-wrap" style="max-height:320px">
        <table class="data-table"><thead><tr><th>کد کالا</th><th class="num">تعداد در کارتن</th></tr></thead>
        <tbody id="group-modal-tbody"></tbody></table>
      </div>
      <div class="modal-actions" style="margin-top:var(--space-5)">
        <button class="btn btn-secondary" id="group-modal-close">بستن</button>
        <button class="btn btn-primary" id="group-modal-add">+ افزودن کالا به این گروه</button>
      </div>
    </div>`;
  region.appendChild(overlay);

  function renderRows(filter) {
    const rows = state.products
      .filter((p) => p.group === groupId)
      .filter((p) => !filter || p.code.toLowerCase().includes(filter.toLowerCase()));
    const tbody = $("#group-modal-tbody", overlay);
    tbody.innerHTML = rows.length
      ? rows.map((p) => `<tr><td>${escapeHtml(p.code)}</td><td class="num">${formatNumber(p.cartonQty)}</td></tr>`).join("")
      : `<tr><td colspan="2" style="text-align:center;color:var(--color-text-faint)">موردی یافت نشد</td></tr>`;
  }
  renderRows("");
  $("#group-modal-search", overlay).addEventListener("input", (e) => renderRows(e.target.value));
  $("#group-modal-close", overlay).addEventListener("click", () => overlay.remove());
  $("#group-modal-add", overlay).addEventListener("click", () => {
    overlay.remove();
    switchView("management");
    switchManagementTab("products");
    $all("#product-entry-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.ptab === "manual"));
    $("#ptab-excel").style.display = "none";
    $("#ptab-manual").style.display = "";
    populateManualGroupSelect();
    $("#manual-product-group").value = String(groupId);
    $("#manual-product-code").focus();
  });
}

function refreshAllGroupDependentUI() {
  populateManualGroupSelect();
  renderLineGroupCheckboxes();
  populateSingleReportSelectors();
}

/* ---------------------------------------------------------
   7. PRODUCTS management (manual entry + Excel import + list)
   --------------------------------------------------------- */
function populateManualGroupSelect() {
  const sel = $("#manual-product-group");
  if (!sel) return;
  const sorted = [...state.groups].sort((a, b) => a.order - b.order);
  sel.innerHTML = sorted.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("");
  if (!sorted.length) sel.innerHTML = `<option value="">— ابتدا گروه کالا تعریف کنید —</option>`;
}

async function handleSaveManualProduct() {
  const codeInput = $("#manual-product-code");
  const groupSel = $("#manual-product-group");
  const cartonInput = $("#manual-product-carton");
  const errorSlot = $("#manual-product-error-slot");
  errorSlot.innerHTML = "";

  const code = normalizeStr(codeInput.value);
  const groupId = Number(groupSel.value);
  const carton = toPersianSafeNumber(cartonInput.value);

  if (!state.groups.length) {
    errorSlot.innerHTML = `<div class="field-error">ابتدا باید حداقل یک گروه کالا تعریف کنید.</div>`;
    return;
  }
  if (!code) {
    errorSlot.innerHTML = `<div class="field-error">کد کالا را وارد کنید.</div>`;
    return;
  }
  const existing = state.products.find((p) => p.code === code);
  if (existing) {
    errorSlot.innerHTML = `<div class="field-error">⚠️ این کد کالا قبلاً ثبت شده است.</div>`;
    return;
  }
  if (!groupId) {
    errorSlot.innerHTML = `<div class="field-error">گروه کالا را انتخاب کنید.</div>`;
    return;
  }
  if (isNaN(carton) || carton <= 0) {
    errorSlot.innerHTML = `<div class="field-error">تعداد در کارتن باید عددی بزرگ‌تر از صفر باشد.</div>`;
    return;
  }
  const rec = { code, group: groupId, cartonQty: carton };
  await Store.put("products", rec);
  state.products.push(rec);
  codeInput.value = "";
  cartonInput.value = "";
  showToast("کالا با موفقیت ذخیره شد", "success");
  renderProductsList();
  renderGroupsList();
}

function renderProductsList(filterText) {
  const slot = $("#products-table-slot");
  const sub = $("#products-count-sub");
  sub.textContent = `${state.products.length.toLocaleString("fa-IR")} کالا ثبت شده`;
  let list = state.products;
  if (filterText) {
    const f = filterText.toLowerCase();
    list = list.filter((p) => {
      const g = groupById(p.group);
      return p.code.toLowerCase().includes(f) || (g && g.name.toLowerCase().includes(f));
    });
  }
  if (!list.length) {
    slot.innerHTML = `<div class="empty-state"><div class="icon">🧾</div><div class="title">موردی یافت نشد</div></div>`;
    return;
  }
  list = [...list].sort((a, b) => a.code.localeCompare(b.code, "en"));
  slot.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>کد کالا</th><th>گروه کالا</th><th class="num">تعداد در کارتن</th><th>عملیات</th></tr></thead>
        <tbody>
          ${list
            .map((p) => {
              const g = groupById(p.group);
              return `<tr>
                <td>${escapeHtml(p.code)}</td>
                <td>${g ? escapeHtml(g.name) : "—"}</td>
                <td class="num">${formatNumber(p.cartonQty)}</td>
                <td><button class="btn btn-icon btn-sm btn-danger" data-delete-product="${escapeHtml(p.code)}">🗑</button></td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
  $all("[data-delete-product]", slot).forEach((btn) => {
    btn.addEventListener("click", () => handleDeleteProduct(btn.dataset.deleteProduct));
  });
}

async function handleDeleteProduct(code) {
  const ok = await confirmModal({
    icon: "🗑",
    title: "حذف کالا",
    body: `آیا از حذف کد کالا «${escapeHtml(code)}» مطمئن هستید؟`,
    confirmLabel: "حذف کالا",
  });
  if (!ok) return;
  await Store.delete("products", code);
  state.products = state.products.filter((p) => p.code !== code);
  showToast("کالا حذف شد", "success");
  renderProductsList($("#products-search").value);
  renderGroupsList();
}

/* ----- Excel import for products ----- */
async function handleProductsFileSelected(file) {
  $("#products-file-status").textContent = "";
  $("#products-file-status").className = "file-drop-status";
  if (!file) return;
  let workbook;
  try {
    const buf = await file.arrayBuffer();
    workbook = readWorkbookSmart(buf);
  } catch (err) {
    showToast("خطا در خواندن فایل", "error");
    return;
  }
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws["!ref"]) {
    showToast("فایل معتبر نیست", "error");
    return;
  }
  const rows = XLSX.utils.sheet_to_json(ws, { header: "A", raw: true, defval: "" });
  const dataRows = rows.slice(1); // skip header row

  let registered = 0, duplicate = 0, invalid = 0;
  let blankRows = 0, missingFieldRows = 0, undefinedGroupRows = 0, invalidCartonRows = 0;
  const undefinedGroups = new Set();
  const groupNameToId = new Map(state.groups.map((g) => [g.name, g.id]));
  const seenCodes = new Set(state.products.map((p) => p.code));

  for (const row of dataRows) {
    const code = normalizeStr(row.A);
    const groupName = normalizeStr(row.B);
    const cartonRaw = normalizeStr(row.C);
    const carton = toPersianSafeNumber(row.C);

    // Excel often applies formatting (borders/background) far below the
    // real data, which stretches the sheet's used range and produces
    // hundreds/thousands of phantom fully-empty rows. These are not real
    // import attempts, so they're skipped silently instead of counted.
    if (!code && !groupName && !cartonRaw) { blankRows++; continue; }

    if (!code || !groupName) { invalid++; missingFieldRows++; continue; }
    if (!groupNameToId.has(groupName)) { undefinedGroups.add(groupName); invalid++; undefinedGroupRows++; continue; }
    if (isNaN(carton) || carton <= 0) { invalid++; invalidCartonRows++; continue; }
    if (seenCodes.has(code)) { duplicate++; continue; }

    const rec = { code, group: groupNameToId.get(groupName), cartonQty: carton };
    await Store.put("products", rec);
    state.products.push(rec);
    seenCodes.add(code);
    registered++;
  }

  $("#products-file-status").textContent = "✅ فایل بررسی شد";
  $("#products-file-status").className = "file-drop-status ok";
  renderProductsList();
  renderGroupsList();

  const reasonLines = [];
  if (missingFieldRows) reasonLines.push(`کد یا گروه کالا خالی: ${missingFieldRows.toLocaleString("fa-IR")} ردیف`);
  if (undefinedGroupRows) reasonLines.push(`گروه تعریف‌نشده: ${undefinedGroupRows.toLocaleString("fa-IR")} ردیف`);
  if (invalidCartonRows) reasonLines.push(`تعداد در کارتن نامعتبر (خالی، صفر یا منفی): ${invalidCartonRows.toLocaleString("fa-IR")} ردیف`);

  openModal({
    icon: registered > 0 ? "✅" : "⚠️",
    title: "نتیجه ورود کالا از Excel",
    body: `
      <div class="stack">
        <div class="row-between"><span>تعداد ثبت‌شده</span><span class="badge badge-success">${registered.toLocaleString("fa-IR")}</span></div>
        <div class="row-between"><span>تعداد تکراری</span><span class="badge badge-warning">${duplicate.toLocaleString("fa-IR")}</span></div>
        <div class="row-between"><span>تعداد نامعتبر</span><span class="badge badge-danger">${invalid.toLocaleString("fa-IR")}</span></div>
      </div>
      ${reasonLines.length ? `<div class="field-hint" style="margin-top:var(--space-4);text-align:right">علت نامعتبر بودن:<br>${reasonLines.join("<br>")}</div>` : ""}`,
    listItems: undefinedGroups.size
      ? [`گروه‌های تعریف‌نشده: ${Array.from(undefinedGroups).join("، ")}`]
      : null,
    actions: [{ label: "باشه", className: "btn-primary" }],
  });
}

/* ---------------------------------------------------------
   8. تعریف گزارش کلی — per-line group selection AND ordering
   --------------------------------------------------------- */
// Working (unsaved) order per line while the user is editing this screen.
// Each is an array of group ids: included groups in the exact order they
// will appear in that line's report ("مجموع" is always appended last
// separately, never stored in this array).
const pendingLineOrder = { line1: [], line2: [] };

function initPendingLineOrder(lineKey) {
  // keep previously-saved order, drop any group that no longer exists or
  // has since been marked "غیرقابل فروش" (non-sellable groups can never
  // contribute to a report, so they don't belong in a line's definition).
  const sellableIds = new Set(state.groups.filter((g) => !g.nonSellable).map((g) => g.id));
  pendingLineOrder[lineKey] = (state.lineGroups[lineKey] || []).filter((id) => sellableIds.has(id));
}

function renderLineGroupCheckboxes() {
  const globalSorted = [...state.groups].filter((g) => !g.nonSellable).sort((a, b) => a.order - b.order);
  ["line1", "line2"].forEach((lineKey) => {
    initPendingLineOrder(lineKey);
    renderLineOrderList(lineKey, globalSorted);
  });
}

function renderLineOrderList(lineKey, globalSorted) {
  const slot = $(`#${lineKey}-groups-slot`);
  if (!slot) return;
  if (!globalSorted.length) {
    slot.innerHTML = `<div class="empty-state"><div class="icon">📦</div><div class="title">ابتدا گروه کالا تعریف کنید</div></div>`;
    return;
  }

  const selectedIds = pendingLineOrder[lineKey];
  const selectedSet = new Set(selectedIds);
  const selectedGroups = selectedIds.map((id) => groupById(id)).filter(Boolean);
  const unselectedGroups = globalSorted.filter((g) => !selectedSet.has(g.id));

  const selectedHtml = selectedGroups.length
    ? `<div class="order-list" data-line-order-list="${lineKey}">${selectedGroups
        .map(
          (g, idx) => `
          <div class="order-item" draggable="true" data-line="${lineKey}" data-group-id="${g.id}">
            <span class="drag-handle">⠿</span>
            <input type="checkbox" data-line-toggle="${lineKey}" data-group-id="${g.id}" checked />
            <span class="name">${escapeHtml(g.name)}</span>
            <div class="move-btns">
              <button class="btn btn-icon btn-sm btn-secondary" data-line-move="up" data-line="${lineKey}" data-group-id="${g.id}" ${idx === 0 ? "disabled" : ""}>▲</button>
              <button class="btn btn-icon btn-sm btn-secondary" data-line-move="down" data-line="${lineKey}" data-group-id="${g.id}" ${idx === selectedGroups.length - 1 ? "disabled" : ""}>▼</button>
            </div>
          </div>`
        )
        .join("")}
        <div class="order-item table-row-total" style="cursor:default">
          <span class="name">مجموع</span>
          <span class="count">همیشه آخرین ردیف گزارش</span>
        </div>
      </div>`
    : `<div class="field-hint" style="margin-bottom:var(--space-3)">هنوز گروهی برای این لاین انتخاب نشده است</div>`;

  const unselectedHtml = unselectedGroups.length
    ? `<div class="card-section-label" style="margin-top:var(--space-4)">سایر گروه‌ها</div>
       ${unselectedGroups
         .map(
           (g) => `
        <div class="checkbox-row">
          <input type="checkbox" id="${lineKey}-chk-${g.id}" data-line-toggle="${lineKey}" data-group-id="${g.id}" />
          <label for="${lineKey}-chk-${g.id}">${escapeHtml(g.name)}</label>
        </div>`
         )
         .join("")}`
    : "";

  slot.innerHTML = `
    <div class="field-hint" style="margin-bottom:var(--space-3)">با دستگیره ⠿ یا دکمه‌های ▲▼ ترتیب نمایش گروه‌ها در گزارش این لاین را تعیین کنید. ردیف «مجموع» همیشه آخرین ردیف باقی می‌ماند.</div>
    ${selectedHtml}
    ${unselectedHtml}`;

  // toggle include/exclude
  $all(`[data-line-toggle="${lineKey}"]`, slot).forEach((chk) => {
    chk.addEventListener("change", () => {
      const gid = Number(chk.dataset.groupId);
      if (chk.checked) {
        if (!pendingLineOrder[lineKey].includes(gid)) pendingLineOrder[lineKey].push(gid);
      } else {
        pendingLineOrder[lineKey] = pendingLineOrder[lineKey].filter((id) => id !== gid);
      }
      renderLineOrderList(lineKey, globalSorted);
    });
  });

  // up/down reordering
  $all(`[data-line-move]`, slot).forEach((btn) => {
    btn.addEventListener("click", () => {
      const gid = Number(btn.dataset.groupId);
      const arr = pendingLineOrder[lineKey];
      const idx = arr.indexOf(gid);
      const swapIdx = btn.dataset.lineMove === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= arr.length) return;
      [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
      renderLineOrderList(lineKey, globalSorted);
    });
  });

  // drag & drop reordering
  let dragId = null;
  $all(".order-item[draggable='true']", slot).forEach((item) => {
    item.addEventListener("dragstart", () => {
      dragId = Number(item.dataset.groupId);
      item.classList.add("dragging");
    });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", (e) => e.preventDefault());
    item.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetId = Number(item.dataset.groupId);
      if (dragId === null || dragId === targetId) return;
      const arr = pendingLineOrder[lineKey];
      const fromIdx = arr.indexOf(dragId);
      const toIdx = arr.indexOf(targetId);
      if (fromIdx < 0 || toIdx < 0) return;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      renderLineOrderList(lineKey, globalSorted);
    });
  });
}

async function handleSaveLineGroups(lineKey) {
  state.lineGroups[lineKey] = [...pendingLineOrder[lineKey]];
  await setSetting("lineGroups", state.lineGroups);
  showToast(`تنظیمات ${lineKey === "line1" ? "لاین یک" : "لاین دو"} ذخیره شد`, "success");
}

/* ---------------------------------------------------------
   9. SETTINGS — columns, lines, appearance
   --------------------------------------------------------- */
function loadSettingsFormFromState() {
  $("#col-code").value = state.columnMap.code || "";
  $("#col-qty").value = state.columnMap.qty || "";
  $("#col-carton").value = state.columnMap.carton || "";
  $("#col-line").value = state.columnMap.line || "";
  $("#col-customer").value = state.columnMap.customer || "";
  $("#col-invoice").value = state.columnMap.invoice || "";
  $("#line1-excel-value").value = state.lines.line1.excelValue || "";
  $("#line2-excel-value").value = state.lines.line2.excelValue || "";
  $all("#font-size-tabs .tab-btn").forEach((b) =>
    b.classList.toggle("active", Number(b.dataset.fontScale) === state.fontScale)
  );
}

async function handleSaveColumns() {
  const fields = {
    code: { input: $("#col-code"), label: "کد کالا" },
    qty: { input: $("#col-qty"), label: "تعداد فروش" },
    carton: { input: $("#col-carton"), label: "تعداد در کارتن" },
    line: { input: $("#col-line"), label: "لاین" },
    customer: { input: $("#col-customer"), label: "کد مشتری" },
    invoice: { input: $("#col-invoice"), label: "شماره پیش‌فاکتور" },
  };
  const errorSlot = $("#columns-error-slot");
  errorSlot.innerHTML = "";
  const errors = [];
  const newMap = {};
  Object.entries(fields).forEach(([key, f]) => {
    const v = normalizeStr(f.input.value).toUpperCase();
    if (!isValidColumnLetter(v)) errors.push(`ستون «${f.label}» باید یک حرف معتبر ستون Excel باشد (مثلاً C).`);
    newMap[key] = v;
  });
  if (errors.length) {
    errorSlot.innerHTML = errors.map((e) => `<div class="field-error">${escapeHtml(e)}</div>`).join("");
    return;
  }
  state.columnMap = newMap;
  await setSetting("columnMap", state.columnMap);
  showToast("تنظیمات ستون‌ها ذخیره شد", "success");
}

async function handleSaveLines() {
  const v1 = normalizeStr($("#line1-excel-value").value);
  const v2 = normalizeStr($("#line2-excel-value").value);
  if (!v1 || !v2) {
    showToast("مقدار دقیق Excel برای هر دو لاین باید وارد شود", "error");
    return;
  }
  state.lines.line1.excelValue = v1;
  state.lines.line2.excelValue = v2;
  await setSetting("lines", state.lines);
  showToast("تنظیمات لاین‌ها ذخیره شد", "success");
}

async function handleSetFontScale(scale) {
  state.fontScale = scale;
  document.documentElement.style.setProperty("--font-scale", String(scale));
  await setSetting("fontScale", scale);
  $all("#font-size-tabs .tab-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.fontScale) === scale));
}

/* ---------------------------------------------------------
   9b. پشتیبان‌گیری — export / import all groups, products, and settings
   --------------------------------------------------------- */
function handleExportBackup() {
  const payload = {
    app: "SalesFlow",
    backupVersion: 1,
    exportedAt: new Date().toISOString(),
    groups: state.groups,
    products: state.products,
    columnMap: state.columnMap,
    lines: state.lines,
    lineGroups: state.lineGroups,
    fontScale: state.fontScale,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const dateStr = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `salesflow-backup-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("فایل پشتیبان دانلود شد", "success");
}

async function handleImportBackupFile(file) {
  if (!file) return;
  let payload;
  try {
    const text = await file.text();
    payload = JSON.parse(text);
  } catch (err) {
    showToast("فایل پشتیبان معتبر نیست", "error");
    return;
  }
  if (!payload || !Array.isArray(payload.groups) || !Array.isArray(payload.products)) {
    showToast("ساختار فایل پشتیبان معتبر نیست", "error");
    return;
  }

  const ok = await confirmModal({
    icon: "⚠️",
    title: "بازیابی فایل پشتیبان",
    body: "با این کار تمام گروه‌های کالا، کدهای کالا و تنظیمات فعلی حذف و با اطلاعات فایل پشتیبان جایگزین می‌شوند. این عملیات قابل بازگشت نیست. آیا مطمئن هستید؟",
    confirmLabel: "بازیابی و جایگزینی",
    confirmClass: "btn-danger",
  });
  if (!ok) return;

  try {
    await Store.clear("groups");
    await Store.clear("products");
    await Store.clear("settings");

    for (const g of payload.groups) await Store.put("groups", g);
    for (const p of payload.products) await Store.put("products", p);
    if (payload.columnMap) await setSetting("columnMap", payload.columnMap);
    if (payload.lines) await setSetting("lines", payload.lines);
    if (payload.lineGroups) await setSetting("lineGroups", payload.lineGroups);
    if (payload.fontScale) await setSetting("fontScale", payload.fontScale);

    await hydrateState();
    document.documentElement.style.setProperty("--font-scale", String(state.fontScale));

    renderGroupsList();
    renderProductsList();
    populateManualGroupSelect();
    renderLineGroupCheckboxes();
    loadSettingsFormFromState();
    populateSingleReportSelectors();
    handleRemoveSalesFile();

    showToast("بازیابی با موفقیت انجام شد", "success");
  } catch (err) {
    showToast("خطا در بازیابی فایل پشتیبان", "error");
  }
}

/* ---------------------------------------------------------
   10. REPORT ENGINE
   --------------------------------------------------------- */
/**
 * Many accounting/ERP systems (common with Iranian سیستم‌های حسابداری/فروش)
 * export a ".xls"/".xlsx" file that is not actually a binary Excel file at
 * all. Two variants show up in practice, and both silently produce an
 * empty/garbled sheet (all-zero report) if handed straight to SheetJS's
 * binary reader — it doesn't throw, so the failure is invisible:
 *
 *   1. An HTML table saved with an .xls extension.
 *   2. Plain delimited text (tab- or comma-separated), frequently encoded
 *      in a legacy Persian/Arabic codepage (Windows-1256) rather than
 *      UTF-8, saved with an .xls extension.
 *
 * Opening either in Excel and using "Save As → xlsx" works because Excel
 * itself converts the content into a real workbook first. This function
 * detects a genuine binary workbook by its real file signature, and
 * otherwise decodes the bytes as text (respecting a declared HTML
 * <meta charset>, falling back through common encodings) to build a
 * proper sheet directly — so the person never has to do that manual
 * "open and re-save" step themselves.
 */
function readWorkbookSmart(buf) {
  const sigBytes = new Uint8Array(buf.slice(0, 8));
  const isZip = sigBytes[0] === 0x50 && sigBytes[1] === 0x4b; // "PK.." — real .xlsx
  const isOle2 = sigBytes[0] === 0xd0 && sigBytes[1] === 0xcf && sigBytes[2] === 0x11 && sigBytes[3] === 0xe0; // real binary .xls
  if (isZip || isOle2) {
    return XLSX.read(buf, { type: "array" });
  }

  const headPeek = new TextDecoder("iso-8859-1").decode(buf.slice(0, 4000));
  const looksLikeHtml = /<html[\s>]|<table[\s>]|<!doctype html/i.test(headPeek);
  const charsetMatch = headPeek.match(/charset\s*=\s*["']?([\w-]+)/i);
  const declaredEncoding = charsetMatch ? charsetMatch[1].toLowerCase() : null;
  const candidates = [...new Set([declaredEncoding, "utf-8", "windows-1256", "windows-1252"].filter(Boolean))];

  let text = null;
  for (const enc of candidates) {
    try {
      const decoded = new TextDecoder(enc).decode(buf);
      if (text === null) text = decoded; // keep the first successful decode as a fallback
      if (!decoded.includes("\uFFFD")) { text = decoded; break; } // clean decode, no replacement chars
    } catch (err) {
      // unsupported encoding label — try the next candidate
    }
  }
  if (text === null) text = new TextDecoder("utf-8").decode(buf);

  if (looksLikeHtml) {
    return XLSX.read(text, { type: "string" });
  }

  const delimitedWorkbook = buildWorkbookFromDelimitedText(text);
  if (delimitedWorkbook) return delimitedWorkbook;

  // Last resort — let the binary reader try anyway so a real error surfaces
  // instead of the file being silently treated as empty.
  return XLSX.read(buf, { type: "array" });
}

/**
 * Builds a workbook from plain delimited text (tab, comma, or semicolon —
 * whichever appears most on the first line). Used when a ".xls"/".xlsx"
 * file turns out to be a flat text export rather than a real workbook.
 */
function buildWorkbookFromDelimitedText(text) {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  if (!lines.length) return null;

  const sample = lines[0];
  const delimiterCounts = {
    "\t": (sample.match(/\t/g) || []).length,
    ",": (sample.match(/,/g) || []).length,
    ";": (sample.match(/;/g) || []).length,
  };
  const [bestDelimiter, bestCount] = Object.entries(delimiterCounts).sort((a, b) => b[1] - a[1])[0];
  if (bestCount === 0) return null; // doesn't look like delimited data at all

  const aoa = lines.map((line) => line.split(bestDelimiter));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  return { SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } };
}

function readWorkbookFromArrayBuffer(buf) {
  return readWorkbookSmart(buf);
}

function getFirstSheetInfo(workbook) {
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return null;
  const range = XLSX.utils.decode_range(ws["!ref"]);
  const rows = XLSX.utils.sheet_to_json(ws, { header: "A", raw: true, defval: "" });
  return { ws, range, rows: rows.slice(1) }; // skip header row
}

function validateColumnsExist(range, columnMap) {
  const labels = { code: "کد کالا", qty: "تعداد فروش", carton: "تعداد در کارتن", line: "لاین", customer: "کد مشتری", invoice: "شماره پیش‌فاکتور" };
  for (const key of Object.keys(columnMap)) {
    const letter = columnMap[key];
    if (!letter) return { ok: false, field: labels[key], letter };
    const idx = XLSX.utils.decode_col(letter);
    if (idx > range.e.c) return { ok: false, field: labels[key], letter };
  }
  return { ok: true };
}

/**
 * Computes exact (unrounded) per-group sums, per-line totals, unique
 * customer counts, and the set of undefined product codes encountered.
 * Rounding is intentionally NOT applied here (section 22/38 of spec).
 */
/**
 * Computes exact (unrounded) per-group sums, per-line totals, unique
 * customer counts, and the set of undefined product codes encountered.
 * Rounding is intentionally NOT applied here (section 22/38 of spec).
 *
 * Each group is tracked in TWO parallel sums:
 *   - groupSumsDisplay: what a group's own report row shows — respects
 *     "فروش به قوطی" (sellByUnit), so such a group's row is the raw sold
 *     quantity (e.g. "بایودنت 1500 قوطی"), not divided by carton size.
 *   - groupSumsCartonEquivalent: ALWAYS qty ÷ carton size, regardless of
 *     sellByUnit. "مجموع" is built from this one only, so every group is
 *     converted to the same carton unit before being added together —
 *     otherwise a قوطی-based group's raw count would inflate the total.
 *
 * `groupsById` maps groupId -> group record, used to detect groups marked
 * "غیرقابل فروش" (non-sellable, e.g. display stands) — rows for such
 * products are excluded entirely: not in any group sum, not in the line
 * total, and not counted toward unique customers either.
 */
function computeSalesReport(rows, columnMap, lines, productMap, groupsById) {
  const result = {
    line1: { groupSumsDisplay: {}, groupSumsCartonEquivalent: {}, customers: new Set() },
    line2: { groupSumsDisplay: {}, groupSumsCartonEquivalent: {}, customers: new Set() },
  };
  const undefinedCodes = new Set();

  for (const row of rows) {
    // پیش‌فاکتور تسویه‌نشده (مقدار ستون برابر صفر) یعنی فاکتور نهایی نشده و
    // اصلاً جزو فروش نیست — این سطر باید کاملاً از گزارش کنار گذاشته شود
    // (نه در جمع گروه‌ها، نه در تعداد مشتری، نه در کدهای تعریف‌نشده).
    const invoiceNum = toPersianSafeNumber(row[columnMap.invoice]);
    if (invoiceNum === 0) continue;

    const lineVal = normalizeStr(row[columnMap.line]);
    let lineKey = null;
    if (lineVal === lines.line1.excelValue) lineKey = "line1";
    else if (lineVal === lines.line2.excelValue) lineKey = "line2";
    if (!lineKey) continue; // other lines are ignored entirely

    const code = normalizeStr(row[columnMap.code]);
    const product = productMap.get(code);

    // کالاهای گروه «غیرقابل فروش» (مثل استند) هرگز جزو فروش نیستند —
    // نه در جمع گروه‌ها، نه در مجموع لاین، نه در تعداد مشتری.
    if (product && groupsById.get(product.group)?.nonSellable) continue;

    const customerVal = normalizeStr(row[columnMap.customer]);
    if (customerVal) result[lineKey].customers.add(customerVal);

    if (!product) {
      if (code) undefinedCodes.add(code);
      continue; // row not calculated further — no group is guessed
    }

    const qty = toPersianSafeNumber(row[columnMap.qty]);
    const cartonFromFile = toPersianSafeNumber(row[columnMap.carton]);
    let cartonQty = 0;
    if (!isNaN(cartonFromFile) && cartonFromFile > 0) cartonQty = cartonFromFile;
    else if (product.cartonQty > 0) cartonQty = product.cartonQty;

    // carton-equivalent is always computed the same way, no matter the
    // group's display setting — this is what "مجموع" is built from.
    const cartonEquivalentSales = cartonQty > 0 && !isNaN(qty) ? qty / cartonQty : 0;

    const productGroup = groupsById.get(product.group);
    const displaySales = productGroup?.sellByUnit
      ? (!isNaN(qty) ? qty : 0) // «فروش به قوطی» — نمایش با واحد خام
      : cartonEquivalentSales;

    const g = product.group;
    result[lineKey].groupSumsDisplay[g] = (result[lineKey].groupSumsDisplay[g] || 0) + displaySales;
    result[lineKey].groupSumsCartonEquivalent[g] = (result[lineKey].groupSumsCartonEquivalent[g] || 0) + cartonEquivalentSales;
  }

  return { ...result, undefinedCodes };
}

/**
 * Builds report rows in the exact order the user configured for this line
 * (section 8 UI — "تعریف گزارش کلی"), NOT the global group-management order.
 *
 * Each row's own value uses groupSumsDisplay (so a "فروش به قوطی" group
 * shows its raw quantity). "مجموع" is built from groupSumsCartonEquivalent
 * instead — every sellable group converted to the same carton unit — so it
 * always reflects the line's true carton-equivalent sales, whether or not
 * a group is included in the displayed rows, and without a قوطی-based
 * group inflating it. Non-sellable ("غیرقابل فروش") groups never enter
 * either sum to begin with (computeSalesReport already excludes them).
 * "مجموع" is always rendered as the final row by the caller.
 */
function buildLineReportRows(groupSumsDisplay, groupSumsCartonEquivalent, selectedGroupIds) {
  const rows = selectedGroupIds
    .map((gid) => groupById(gid))
    .filter(Boolean)
    .map((g) => {
      const exact = groupSumsDisplay[g.id] || 0;
      return { groupId: g.id, name: g.name, exact, rounded: Math.round(exact) };
    });
  const totalExact = Object.values(groupSumsCartonEquivalent).reduce((sum, v) => sum + v, 0);
  const totalRounded = Math.round(totalExact);
  return { rows, totalExact, totalRounded };
}

/* ---------------------------------------------------------
   11. REPORTS VIEW — file loading + گزارش کلی + گزارش تکی
   --------------------------------------------------------- */
let currentSalesRows = null; // cached parsed rows of the currently selected sales file
let lastUndefinedCodes = [];

async function handleSalesFileSelected(file) {
  const statusEl = $("#sales-file-status");
  const dropEl = $("#sales-file-drop");
  const removeBtn = $("#btn-remove-sales-file");
  statusEl.textContent = "";
  dropEl.classList.remove("has-file");
  removeBtn.style.display = "none";
  currentSalesRows = null;
  $("#btn-generate-report").disabled = true;
  $("#sales-file-warning-slot").innerHTML = "";
  if (!file) return;

  try {
    const buf = await file.arrayBuffer();
    const workbook = readWorkbookFromArrayBuffer(buf);
    const info = getFirstSheetInfo(workbook);
    if (!info) {
      showToast("فایل معتبر نیست", "error");
      return;
    }
    currentSalesRows = info;
    statusEl.textContent = "✅ فایل انتخاب شد";
    dropEl.classList.add("has-file");
    removeBtn.style.display = "inline-flex";
    $("#btn-generate-report").disabled = false;
  } catch (err) {
    showToast("خطا در خواندن فایل", "error");
  }
}

function handleRemoveSalesFile() {
  currentSalesRows = null;
  lastUndefinedCodes = [];
  $("#sales-file-input").value = "";
  $("#sales-file-status").textContent = "";
  $("#sales-file-drop").classList.remove("has-file");
  $("#btn-remove-sales-file").style.display = "none";
  $("#btn-generate-report").disabled = true;
  $("#sales-file-warning-slot").innerHTML = "";
  $("#undefined-codes-alert-slot").innerHTML = "";
  $("#report-output").innerHTML = `
    <div class="empty-state">
      <div class="icon">📄</div>
      <div class="title">هنوز گزارشی تولید نشده است</div>
      <div>فایل فروش را انتخاب کرده و روی «تولید گزارش» کلیک کنید</div>
    </div>`;
  showToast("فایل حذف شد — می‌توانید فایل جدید انتخاب کنید", "success");
}

function showColumnValidationError(field) {
  $("#sales-file-warning-slot").innerHTML = `
    <div class="alert alert-warning">
      <span>⚠️</span>
      <span>خطا در فایل فروش — ستون «${escapeHtml(field)}» که در تنظیمات مشخص شده، در فایل واردشده وجود ندارد. لطفاً فایل یا تنظیمات ستون‌ها را بررسی کنید.</span>
    </div>`;
}

async function handleGenerateReport() {
  if (!currentSalesRows) {
    showToast("لطفاً ابتدا فایل فروش را انتخاب کنید", "error");
    return;
  }
  $("#sales-file-warning-slot").innerHTML = "";
  $("#undefined-codes-alert-slot").innerHTML = "";

  const valid = validateColumnsExist(currentSalesRows.range, state.columnMap);
  if (!valid.ok) { showColumnValidationError(valid.field); return; }
  if (!state.lines.line1.excelValue || !state.lines.line2.excelValue) {
    showToast("ابتدا مقدار دقیق لاین‌ها را در تنظیمات وارد کنید", "error");
    return;
  }
  if (!state.groups.length) {
    showToast("ابتدا گروه‌های کالا را در بخش مدیریت تعریف کنید", "error");
    return;
  }

  $("#report-loading").style.display = "flex";
  $("#report-output").innerHTML = "";
  await new Promise((r) => setTimeout(r, 30)); // let loading paint before heavy sync work

  const productMap = new Map(state.products.map((p) => [p.code, p]));
  const groupsById = new Map(state.groups.map((g) => [g.id, g]));
  const { line1, line2, undefinedCodes } = computeSalesReport(
    currentSalesRows.rows, state.columnMap, state.lines, productMap, groupsById
  );

  const r1 = buildLineReportRows(line1.groupSumsDisplay, line1.groupSumsCartonEquivalent, state.lineGroups.line1);
  const r2 = buildLineReportRows(line2.groupSumsDisplay, line2.groupSumsCartonEquivalent, state.lineGroups.line2);

  $("#report-loading").style.display = "none";
  renderFullReport({
    line1: { ...r1, customerCount: line1.customers.size },
    line2: { ...r2, customerCount: line2.customers.size },
  });

  lastUndefinedCodes = Array.from(undefinedCodes);
  if (lastUndefinedCodes.length) {
    $("#undefined-codes-alert-slot").innerHTML = `
      <div class="alert alert-warning">
        <span>⚠️</span>
        <span>${lastUndefinedCodes.length.toLocaleString("fa-IR")} کد کالا تعریف نشده‌اند —
          <button class="link" id="btn-show-undefined-codes">نمایش لیست</button>
        </span>
      </div>`;
    $("#btn-show-undefined-codes").addEventListener("click", () => {
      openModal({
        icon: "⚠️",
        title: "کدهای کالای تعریف‌نشده",
        body: "این کدها در بانک کالا ثبت نشده‌اند و در محاسبه گزارش لحاظ نشده‌اند:",
        listItems: lastUndefinedCodes,
        actions: [{ label: "باشه", className: "btn-primary" }],
      });
    });
  }
}

function renderLineReportCard(lineKey, lineLabel, dotClass, data) {
  const rowsHtml = data.rows.length
    ? data.rows
        .map(
          (r) => `<tr class="${r.rounded === 0 ? "table-row-zero" : ""}"><td>${escapeHtml(r.name)}</td><td class="num">${formatNumber(r.rounded)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="2" style="text-align:center;color:var(--color-text-faint)">هیچ گروهی برای نمایش در این لاین تعریف نشده است</td></tr>`;

  return `
    <div class="line-block">
      <div class="line-block-header">
        <div class="line-block-title"><span class="line-dot ${dotClass}"></span> ${lineLabel}</div>
        <span class="customer-count">تعداد مشتری: ${data.customerCount.toLocaleString("fa-IR")}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>گروه کالا</th><th class="num">فروش</th></tr></thead>
          <tbody>
            ${rowsHtml}
            <tr class="table-row-total"><td>مجموع</td><td class="num">${formatNumber(data.totalRounded)}</td></tr>
          </tbody>
        </table>
      </div>
      <button class="btn btn-secondary btn-sm" data-copy-line="${lineKey}">📋 کپی گزارش ${lineLabel}</button>
    </div>`;
}

function renderFullReport(data) {
  const out = $("#report-output");
  out.innerHTML = `
    <div class="stack" style="gap:var(--space-6)">
      ${renderLineReportCard("line1", "لاین یک", "line1", data.line1)}
      <div class="divider"></div>
      ${renderLineReportCard("line2", "لاین دو", "line2", data.line2)}
    </div>`;
  out.dataset.hasReport = "1";

  $all("[data-copy-line]", out).forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.copyLine;
      const d = data[key];
      const lines = [...d.rows.map((r) => String(r.rounded)), String(d.totalRounded)];
      copyToClipboard(lines.join("\n"));
    });
  });
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("در کلیپ‌بورد کپی شد", "success");
  } catch (err) {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); showToast("در کلیپ‌بورد کپی شد", "success"); }
    catch { showToast("کپی با خطا مواجه شد", "error"); }
    ta.remove();
  }
}

/* ----- گزارش تکی ----- */
function populateSingleReportSelectors() {
  const lineSel = $("#single-line-select");
  const groupSel = $("#single-group-select");
  if (!lineSel || !groupSel) return;
  lineSel.innerHTML = `<option value="line1">لاین یک</option><option value="line2">لاین دو</option>`;
  const sorted = [...state.groups].filter((g) => !g.nonSellable).sort((a, b) => a.order - b.order);
  groupSel.innerHTML = sorted.length
    ? sorted.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join("")
    : `<option value="">— گروهی تعریف نشده —</option>`;
}

function handleSingleReport() {
  const out = $("#single-report-output");
  out.innerHTML = "";
  if (!currentSalesRows) {
    showToast("لطفاً ابتدا فایل فروش را در بخش «گزارش کلی» انتخاب کنید", "error");
    return;
  }
  const valid = validateColumnsExist(currentSalesRows.range, state.columnMap);
  if (!valid.ok) { showColumnValidationError(valid.field); return; }
  if (!state.lines.line1.excelValue || !state.lines.line2.excelValue) {
    showToast("ابتدا مقدار دقیق لاین‌ها را در تنظیمات وارد کنید", "error");
    return;
  }
  const lineKey = $("#single-line-select").value;
  const groupId = Number($("#single-group-select").value);
  const group = groupById(groupId);
  if (!group) {
    showToast("ابتدا حداقل یک گروه کالا تعریف کنید", "error");
    return;
  }

  const productMap = new Map(state.products.map((p) => [p.code, p]));
  const groupsById = new Map(state.groups.map((g) => [g.id, g]));
  const { line1, line2 } = computeSalesReport(currentSalesRows.rows, state.columnMap, state.lines, productMap, groupsById);
  const target = lineKey === "line1" ? line1 : line2;
  const exact = target.groupSumsDisplay[groupId] || 0;
  const rounded = Math.round(exact);

  out.innerHTML = `
    <div class="card" style="background:var(--color-surface-alt)">
      <div class="row-between">
        <span>لاین: <strong>${lineKey === "line1" ? "لاین یک" : "لاین دو"}</strong></span>
        <span>گروه: <strong>${escapeHtml(group.name)}</strong></span>
        <span>تعداد فروش: <strong class="num">${formatNumber(rounded)}</strong></span>
      </div>
    </div>`;
}

/* ---------------------------------------------------------
   12. Wiring — event bindings & init
   --------------------------------------------------------- */
function bindNavigation() {
  $all(".sidebar-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });
  $all("#management-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchManagementTab(btn.dataset.mtab));
  });
}

function bindReportsView() {
  $("#btn-pick-sales-file").addEventListener("click", () => $("#sales-file-input").click());
  $("#sales-file-input").addEventListener("change", (e) => handleSalesFileSelected(e.target.files[0]));
  $("#btn-remove-sales-file").addEventListener("click", handleRemoveSalesFile);
  $("#btn-generate-report").addEventListener("click", handleGenerateReport);
  $("#btn-single-report").addEventListener("click", handleSingleReport);
}

function bindManagementView() {
  $("#btn-add-group").addEventListener("click", () => toggleGroupAddRow(true));
  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btn-confirm-add-group") handleAddGroup();
    if (e.target && e.target.id === "btn-cancel-add-group") toggleGroupAddRow(false);
  });
  $("#new-group-name") && $("#new-group-name").addEventListener("keydown", () => {});
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && document.activeElement && document.activeElement.id === "new-group-name") {
      handleAddGroup();
    }
  });

  // product entry tabs
  $all("#product-entry-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      $all("#product-entry-tabs .tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $("#ptab-excel").style.display = btn.dataset.ptab === "excel" ? "" : "none";
      $("#ptab-manual").style.display = btn.dataset.ptab === "manual" ? "" : "none";
    });
  });

  $("#btn-pick-products-file").addEventListener("click", () => $("#products-file-input").click());
  $("#products-file-input").addEventListener("change", (e) => handleProductsFileSelected(e.target.files[0]));
  $("#btn-save-manual-product").addEventListener("click", handleSaveManualProduct);
  $("#products-search").addEventListener("input", (e) => renderProductsList(e.target.value));

  $("#btn-save-line1-def").addEventListener("click", () => handleSaveLineGroups("line1"));
  $("#btn-save-line2-def").addEventListener("click", () => handleSaveLineGroups("line2"));
}

function bindSettingsView() {
  $("#btn-save-columns").addEventListener("click", handleSaveColumns);
  $("#btn-save-lines").addEventListener("click", handleSaveLines);
  $all("#font-size-tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleSetFontScale(Number(btn.dataset.fontScale)));
  });
  $("#btn-export-backup").addEventListener("click", handleExportBackup);
  $("#btn-import-backup-trigger").addEventListener("click", () => $("#backup-file-input").click());
  $("#backup-file-input").addEventListener("change", (e) => {
    handleImportBackupFile(e.target.files[0]);
    e.target.value = "";
  });
}

async function init() {
  await hydrateState();
  document.documentElement.style.setProperty("--font-scale", String(state.fontScale));

  renderGroupAddForm();
  renderGroupsList();
  populateManualGroupSelect();
  renderProductsList();
  renderLineGroupCheckboxes();
  loadSettingsFormFromState();
  populateSingleReportSelectors();

  bindNavigation();
  bindReportsView();
  bindManagementView();
  bindSettingsView();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", init);
