(() => {
  'use strict';

  const DEFAULT_CATEGORIES = ['Business Meals', 'Travel', 'Mileage', 'Equipment', 'Supplies', 'Home Office', 'Professional Services', 'Other'];
  const MAX_IMAGE_DIM = 1400;

  const state = {
    settings: { apiKey: '' },
    allExpenses: [], // every expense ever logged, across every year
    selectedYear: new Date().getFullYear(),
    editingId: null,
    pendingPhoto: null,   // dataURL currently attached in the expense modal
    pendingAddress: null, // address text currently attached in the expense modal (from a scanned receipt)
  };

  // ---------- element refs ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    bigNumber: $('bigNumber'), bigSub: $('bigSub'),
    yearLabel: $('yearLabel'), yearPrevBtn: $('yearPrevBtn'), yearNextBtn: $('yearNextBtn'),
    expenseList: $('expenseList'), emptyState: $('emptyState'), countPill: $('countPill'),
    addBtn: $('addBtn'), scanBtn: $('scanBtn'), menuBtn: $('menuBtn'), settingsBtn: $('settingsBtn'),

    expenseModalOverlay: $('expenseModalOverlay'), expenseModalTitle: $('expenseModalTitle'),
    amountInput: $('amountInput'), vendorInput: $('vendorInput'), notesInput: $('notesInput'), dateInput: $('dateInput'),
    categoryInput: $('categoryInput'), categoryChipRow: $('categoryChipRow'), categoryDropdown: $('categoryDropdown'),
    receiptPreviewWrap: $('receiptPreviewWrap'), receiptPreviewImg: $('receiptPreviewImg'),
    attachPhotoBtn: $('attachPhotoBtn'), removePhotoBtn: $('removePhotoBtn'), photoFileInput: $('photoFileInput'),
    saveExpenseBtn: $('saveExpenseBtn'), deleteExpenseBtn: $('deleteExpenseBtn'), aiReadBtn: $('aiReadBtn'),

    scanModalOverlay: $('scanModalOverlay'),
    scanChooseStep: $('scanChooseStep'), scanLoadingStep: $('scanLoadingStep'), scanErrorStep: $('scanErrorStep'),
    scanCameraBtn: $('scanCameraBtn'), scanLibraryBtn: $('scanLibraryBtn'),
    scanCameraInput: $('scanCameraInput'), scanLibraryInput: $('scanLibraryInput'),
    scanLoadingImg: $('scanLoadingImg'), scanErrorText: $('scanErrorText'), scanErrorManualBtn: $('scanErrorManualBtn'),
    scanNoKeyNote: $('scanNoKeyNote'), scanNoKeySettingsLink: $('scanNoKeySettingsLink'),

    mileageBtn: $('mileageBtn'), mileageModalOverlay: $('mileageModalOverlay'),
    mileageHomeStep: $('mileageHomeStep'), mileageCaptureStep: $('mileageCaptureStep'),
    mileageLoadingStep: $('mileageLoadingStep'), mileageConfirmStep: $('mileageConfirmStep'),
    mileageHomeFooter: $('mileageHomeFooter'), mileageConfirmFooter: $('mileageConfirmFooter'),
    mileagePendingCard: $('mileagePendingCard'), mileagePendingThumb: $('mileagePendingThumb'),
    mileagePendingMeta: $('mileagePendingMeta'), mileageLogEndingBtn: $('mileageLogEndingBtn'),
    mileageDiscardBtn: $('mileageDiscardBtn'), mileageStartTripSection: $('mileageStartTripSection'),
    mileageStartTripBtn: $('mileageStartTripBtn'),
    mileageMilesInput: $('mileageMilesInput'), mileageRateInput: $('mileageRateInput'),
    mileageAmountPreview: $('mileageAmountPreview'), mileageContinueBtn: $('mileageContinueBtn'),
    mileageCaptureHint: $('mileageCaptureHint'), mileageCameraBtn: $('mileageCameraBtn'),
    mileageLibraryBtn: $('mileageLibraryBtn'), mileageCameraInput: $('mileageCameraInput'),
    mileageLibraryInput: $('mileageLibraryInput'), mileageSkipPhotoBtn: $('mileageSkipPhotoBtn'),
    mileageLoadingImg: $('mileageLoadingImg'),
    mileageConfirmPhotoWrap: $('mileageConfirmPhotoWrap'), mileageConfirmPhotoImg: $('mileageConfirmPhotoImg'),
    mileageConfirmLabel: $('mileageConfirmLabel'), mileageReadingInput: $('mileageReadingInput'),
    mileageConfirmBackBtn: $('mileageConfirmBackBtn'), mileageConfirmSaveBtn: $('mileageConfirmSaveBtn'),

    settingsModalOverlay: $('settingsModalOverlay'),
    apiKeyInput: $('apiKeyInput'), saveSettingsBtn: $('saveSettingsBtn'),
    loadSampleBtn: $('loadSampleBtn'),

    reportModalOverlay: $('reportModalOverlay'), reportBody: $('reportBody'), printReportBtn: $('printReportBtn'),
    exportReportCsvBtn: $('exportReportCsvBtn'),

    googleSignedOutView: $('googleSignedOutView'), googleSignedInView: $('googleSignedInView'),
    googleSignInBtn: $('googleSignInBtn'), googleBackupStatus: $('googleBackupStatus'),
    driveBackupBtn: $('driveBackupBtn'), driveRestoreBtn: $('driveRestoreBtn'),
    googleSignOutBtn: $('googleSignOutBtn'),

    toast: $('toast'),
  };

  let scanPendingPhoto = null; // dataURL being scanned
  let scanFillTarget = 'new';  // 'new' opens a fresh Add Expense modal prefilled with the result. 'inline' fills the fields of the modal that's already open (Read from Photo).
  let currentReportContext = null; // { year, expenses } for whatever the report modal is currently showing

  // ---------- mileage state ----------
  let mileagePendingTrip = null;   // { startOdometer, startPhoto, startDate, createdAt } — persisted in meta so it survives closing the app
  let mileageCaptureMode = 'start'; // 'start' | 'end' — which odometer reading is currently being captured
  let mileageCapturedPhoto = null;  // dataURL just captured/read, awaiting confirm
  let mileageCompletedTrip = null;  // { startOdometer, startPhoto, endOdometer, endPhoto } — set once a trip's ending mileage is confirmed, used to build the final expense's notes/photo, then cleared

  // ---------- utils ----------
  const fmtMoney = (n) => `$${(Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtMoneyShort = (n) => {
    const rounded = Math.round(n * 100) / 100;
    return `$${rounded % 1 === 0 ? rounded.toLocaleString('en-US') : rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtTimestamp = (ms) => {
    const d = new Date(ms);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${date} ${time}`;
  };
  const locationLabel = (e) => e.address || (e.lat != null ? `${e.lat.toFixed(5)}, ${e.lng.toFixed(5)}` : '');
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function showToast(msg, ms = 2600) {
    el.toast.textContent = msg;
    el.toast.classList.add('visible');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.toast.classList.remove('visible'), ms);
  }

  function openModal(overlay) { overlay.classList.add('open'); }
  function closeModal(overlay) { overlay.classList.remove('open'); }

  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal($(btn.dataset.close)));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(overlay); });
  });

  function downscaleImage(dataUrl, maxDim = MAX_IMAGE_DIM, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = dataUrl;
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  // ---------- derived data ----------
  function expensesForYear(year) {
    return state.allExpenses
      .filter((e) => e.date && e.date.startsWith(String(year)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function activeExpenses() {
    return expensesForYear(state.selectedYear);
  }

  function totalSpent(expenses = activeExpenses()) {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  // Categories you've typed that aren't one of the fixed defaults, across every year —
  // not just the current one, so something like "Camera Rental" used last year still
  // shows up as a suggestion this year instead of having to be retyped from scratch.
  function customCategories() {
    const used = new Set(state.allExpenses.map((e) => e.category).filter(Boolean));
    for (const cat of DEFAULT_CATEGORIES) used.delete(cat);
    return Array.from(used).sort((a, b) => a.localeCompare(b));
  }

  // ---------- render ----------
  function renderHero() {
    el.yearLabel.textContent = String(state.selectedYear);
    const spent = totalSpent();
    el.bigNumber.textContent = fmtMoneyShort(spent);
    const count = activeExpenses().length;
    el.bigSub.textContent = `deductible in ${state.selectedYear} · ${count} expense${count === 1 ? '' : 's'}`;

    el.bigNumber.classList.add('pulse');
    setTimeout(() => el.bigNumber.classList.remove('pulse'), 280);
  }

  const CATEGORY_EMOJI = {
    'Business Meals': '🍽️', 'Travel': '✈️', 'Mileage': '🚗', 'Equipment': '🎥', 'Supplies': '📎',
    'Home Office': '🏠', 'Professional Services': '💼', 'Other': '🧾',
  };

  function renderList() {
    const expenses = activeExpenses();
    el.expenseList.innerHTML = '';
    el.emptyState.classList.toggle('visible', expenses.length === 0);
    el.countPill.textContent = String(expenses.length);

    for (const expense of expenses) {
      const li = document.createElement('li');
      li.className = 'expense-item';
      li.dataset.id = expense.id;

      const thumbHtml = expense.photo
        ? `<img class="expense-thumb" src="${expense.photo}" alt="Receipt">`
        : `<div class="expense-thumb-fallback">${CATEGORY_EMOJI[expense.category] || '🧾'}</div>`;

      const dateStr = expense.date ? new Date(expense.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

      li.innerHTML = `
        ${thumbHtml}
        <div class="expense-main">
          <div class="expense-vendor">${escapeHtml(expense.vendor || 'Expense')}</div>
          <div class="expense-meta">
            <span class="category-tag">${escapeHtml(expense.category || 'Other')}</span>
            <span>${dateStr}</span>
          </div>
        </div>
        <div class="expense-amount">${fmtMoney(expense.amount)}</div>
      `;
      li.addEventListener('click', () => openExpenseModal(expense));
      el.expenseList.appendChild(li);
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderAll() { renderHero(); renderList(); }

  // ---------- year navigation ----------
  el.yearPrevBtn.addEventListener('click', () => {
    state.selectedYear -= 1;
    renderAll();
  });
  el.yearNextBtn.addEventListener('click', () => {
    state.selectedYear += 1;
    renderAll();
  });

  // ---------- expense modal ----------
  // Category picking has two parts: a fixed row of one-tap chips for the small set of
  // defaults (never grows), plus a scrollable, filter-as-you-type dropdown below the
  // text field for anything custom you've typed before — so a year of custom categories
  // doesn't turn into an ever-growing wall of buttons.
  function renderCategoryChips(selected) {
    el.categoryChipRow.innerHTML = '';
    for (const cat of DEFAULT_CATEGORIES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'category-chip' + (cat === selected ? ' selected' : '');
      chip.textContent = `${CATEGORY_EMOJI[cat] || ''} ${cat}`.trim();
      chip.addEventListener('click', () => {
        el.categoryInput.value = cat;
        renderCategoryChips(cat);
        closeCategoryDropdown();
      });
      el.categoryChipRow.appendChild(chip);
    }
  }

  function closeCategoryDropdown() {
    el.categoryDropdown.style.display = 'none';
    el.categoryDropdown.innerHTML = '';
  }

  function renderCategoryDropdown(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const matches = customCategories().filter((cat) => !q || cat.toLowerCase().includes(q));

    if (matches.length === 0) { closeCategoryDropdown(); return; }

    el.categoryDropdown.innerHTML = '';
    for (const cat of matches) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'combo-item';
      item.textContent = `${CATEGORY_EMOJI[cat] || '🏷️'} ${cat}`;
      // mousedown (not click) fires before the input's blur, so the tap registers
      // before the dropdown gets hidden by the blur handler below.
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        el.categoryInput.value = cat;
        renderCategoryChips(cat);
        closeCategoryDropdown();
      });
      el.categoryDropdown.appendChild(item);
    }
    el.categoryDropdown.style.display = '';
  }

  el.categoryInput.addEventListener('focus', () => renderCategoryDropdown(el.categoryInput.value));
  el.categoryInput.addEventListener('input', () => {
    renderCategoryDropdown(el.categoryInput.value);
    renderCategoryChips(el.categoryInput.value);
  });
  el.categoryInput.addEventListener('blur', () => {
    setTimeout(closeCategoryDropdown, 150);
  });

  function openExpenseModal(existing = null, prefill = null) {
    state.editingId = existing ? existing.id : null;
    state.pendingPhoto = existing ? (existing.photo || null) : (prefill && prefill.photo) || null;
    state.pendingAddress = existing ? (existing.address || null) : (prefill && prefill.address) || null;

    el.expenseModalTitle.textContent = existing ? 'Edit Expense' : 'Add Expense';
    el.deleteExpenseBtn.style.display = existing ? '' : 'none';

    const source = existing || prefill || {};
    el.amountInput.value = source.amount != null ? source.amount : '';
    el.vendorInput.value = source.vendor || '';
    el.notesInput.value = source.notes || '';
    el.dateInput.value = source.date || (state.selectedYear === new Date().getFullYear() ? todayISO() : `${state.selectedYear}-01-01`);
    el.categoryInput.value = source.category || '';
    renderCategoryChips(source.category || '');
    closeCategoryDropdown();

    if (state.pendingPhoto) {
      el.receiptPreviewImg.src = state.pendingPhoto;
      el.receiptPreviewWrap.style.display = '';
      el.removePhotoBtn.style.display = '';
    } else {
      el.receiptPreviewWrap.style.display = 'none';
      el.removePhotoBtn.style.display = 'none';
    }

    openModal(el.expenseModalOverlay);
    setTimeout(() => el.amountInput.focus(), 200);
  }

  el.addBtn.addEventListener('click', () => openExpenseModal());

  el.attachPhotoBtn.addEventListener('click', () => el.photoFileInput.click());
  el.photoFileInput.addEventListener('change', async () => {
    const file = el.photoFileInput.files[0];
    el.photoFileInput.value = '';
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleImage(raw);
      state.pendingPhoto = small;
      el.receiptPreviewImg.src = small;
      el.receiptPreviewWrap.style.display = '';
      el.removePhotoBtn.style.display = '';
    } catch (e) {
      showToast(e.message || 'Could not attach that photo.');
    }
  });
  el.removePhotoBtn.addEventListener('click', () => {
    state.pendingPhoto = null;
    el.receiptPreviewWrap.style.display = 'none';
    el.removePhotoBtn.style.display = 'none';
  });

  el.saveExpenseBtn.addEventListener('click', async () => {
    if (el.saveExpenseBtn.disabled) return; // guards against a fast double-tap creating a duplicate
    const amount = parseFloat(el.amountInput.value);
    if (!amount || amount <= 0) { showToast('Enter an amount greater than $0.'); el.amountInput.focus(); return; }

    el.saveExpenseBtn.disabled = true;
    try {
      const existing = state.editingId ? state.allExpenses.find((e) => e.id === state.editingId) : null;
      const isNew = !existing;

      const expense = {
        ...existing,
        id: state.editingId || uid(),
        amount,
        vendor: el.vendorInput.value.trim() || 'Expense',
        notes: el.notesInput.value.trim(),
        category: el.categoryInput.value.trim() || 'Other',
        date: el.dateInput.value || todayISO(),
        photo: state.pendingPhoto || null,
        address: state.pendingAddress || null,
        createdAt: existing ? existing.createdAt : Date.now(),
      };

      await DB.putExpense(expense);
      const idx = state.allExpenses.findIndex((e) => e.id === expense.id);
      if (idx >= 0) state.allExpenses[idx] = expense; else state.allExpenses.unshift(expense);

      // Jump to whatever year the expense actually falls in, so it's visible right away.
      const expenseYear = parseInt(expense.date.slice(0, 4), 10);
      if (!isNaN(expenseYear)) state.selectedYear = expenseYear;

      closeModal(el.expenseModalOverlay);
      renderAll();
      showToast(state.editingId ? 'Expense updated' : `Logged ${fmtMoney(amount)}`);
      autoBackupIfSignedIn();

      // Prefer the address printed on a scanned receipt — it's the actual vendor location,
      // more accurate than GPS. Only fall back to device location when scanning didn't give us one.
      if (isNew && !expense.address) captureLocationForExpense(expense.id);
    } finally {
      el.saveExpenseBtn.disabled = false;
    }
  });

  el.deleteExpenseBtn.addEventListener('click', async () => {
    if (!state.editingId) return;
    await DB.deleteExpense(state.editingId);
    state.allExpenses = state.allExpenses.filter((e) => e.id !== state.editingId);
    closeModal(el.expenseModalOverlay);
    renderAll();
    showToast('Expense deleted');
    autoBackupIfSignedIn();
  });

  // Captures where you were when an expense was logged, purely for the CSV export.
  // Silent best-effort: no permission prompt nagging, no toast on failure — if the
  // user denies location or it times out, the expense just has no location on it.
  async function captureLocationForExpense(expenseId) {
    if (!('geolocation' in navigator)) return;

    let position;
    try {
      position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000, maximumAge: 60000 });
      });
    } catch (e) {
      return; // permission denied, unavailable, or timed out — fine, leave it blank
    }

    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    let address = null;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`);
      if (res.ok) {
        const data = await res.json();
        address = data.display_name || null;
      }
    } catch (e) {
      // offline or the geocoder is unreachable — coordinates alone are still useful
    }

    const expense = state.allExpenses.find((e) => e.id === expenseId);
    if (!expense) return; // deleted before this resolved
    if (expense.address) return; // a receipt scan already gave us the real vendor address in the meantime
    expense.lat = lat;
    expense.lng = lng;
    expense.address = address;
    await DB.putExpense(expense);
  }

  // ---------- scan flow ----------
  function resetScanModal() {
    el.scanChooseStep.style.display = '';
    el.scanLoadingStep.style.display = 'none';
    el.scanErrorStep.style.display = 'none';
    el.scanNoKeyNote.style.display = state.settings.apiKey ? 'none' : '';
  }

  function applyPhotoToOpenExpenseModal(photoDataUrl) {
    state.pendingPhoto = photoDataUrl;
    el.receiptPreviewImg.src = photoDataUrl;
    el.receiptPreviewWrap.style.display = '';
    el.removePhotoBtn.style.display = '';
  }

  function applyParsedToOpenExpenseModal(parsed, photoDataUrl) {
    applyPhotoToOpenExpenseModal(photoDataUrl);
    if (parsed.total != null) el.amountInput.value = parsed.total;
    if (parsed.vendor) el.vendorInput.value = parsed.vendor;
    if (parsed.date) el.dateInput.value = parsed.date;
    if (parsed.category) el.categoryInput.value = parsed.category;
    if (parsed.address) state.pendingAddress = parsed.address;
    renderCategoryChips(el.categoryInput.value);
    closeCategoryDropdown();
  }

  el.scanBtn.addEventListener('click', () => { scanFillTarget = 'new'; resetScanModal(); openModal(el.scanModalOverlay); });
  el.aiReadBtn.addEventListener('click', () => { scanFillTarget = 'inline'; resetScanModal(); openModal(el.scanModalOverlay); });
  el.scanCameraBtn.addEventListener('click', () => el.scanCameraInput.click());
  el.scanLibraryBtn.addEventListener('click', () => el.scanLibraryInput.click());
  el.scanNoKeySettingsLink.addEventListener('click', () => {
    closeModal(el.scanModalOverlay);
    openSettingsModal();
  });

  async function handleScanFile(file) {
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleImage(raw);
      scanPendingPhoto = small;

      if (!state.settings.apiKey) {
        closeModal(el.scanModalOverlay);
        if (scanFillTarget === 'inline') {
          applyPhotoToOpenExpenseModal(small);
          showToast('Photo attached — add an API key in Settings to auto-fill details.');
        } else {
          openExpenseModal(null, { photo: small });
        }
        return;
      }

      el.scanChooseStep.style.display = 'none';
      el.scanErrorStep.style.display = 'none';
      el.scanLoadingStep.style.display = '';
      el.scanLoadingImg.src = small;

      const parsed = await ClaudeReceipts.parseReceipt(small, state.settings.apiKey);
      closeModal(el.scanModalOverlay);

      if (scanFillTarget === 'inline') {
        applyParsedToOpenExpenseModal(parsed, small);
      } else {
        openExpenseModal(null, {
          photo: small,
          amount: parsed.total != null ? parsed.total : undefined,
          vendor: parsed.vendor || undefined,
          date: parsed.date || undefined,
          category: parsed.category || undefined,
          address: parsed.address || undefined,
        });
      }
      const missing = ['vendor', 'total', 'date', 'category'].filter((k) => parsed[k] == null);
      showToast(missing.length ? 'Got most of it — check the highlighted fields.' : 'Receipt read. Review and save.');
    } catch (e) {
      el.scanChooseStep.style.display = 'none';
      el.scanLoadingStep.style.display = 'none';
      el.scanErrorStep.style.display = '';
      el.scanErrorText.textContent = e.message || 'Something went wrong reading that receipt.';
    }
  }

  el.scanCameraInput.addEventListener('change', () => { handleScanFile(el.scanCameraInput.files[0]); el.scanCameraInput.value = ''; });
  el.scanLibraryInput.addEventListener('change', () => { handleScanFile(el.scanLibraryInput.files[0]); el.scanLibraryInput.value = ''; });

  el.scanErrorManualBtn.addEventListener('click', () => {
    closeModal(el.scanModalOverlay);
    if (scanFillTarget === 'inline') {
      if (scanPendingPhoto) applyPhotoToOpenExpenseModal(scanPendingPhoto);
    } else {
      openExpenseModal(null, scanPendingPhoto ? { photo: scanPendingPhoto } : null);
    }
  });

  // ---------- work mileage ----------
  function showMileageStep(step) {
    el.mileageHomeStep.style.display = step === 'home' ? '' : 'none';
    el.mileageCaptureStep.style.display = step === 'capture' ? '' : 'none';
    el.mileageLoadingStep.style.display = step === 'loading' ? '' : 'none';
    el.mileageConfirmStep.style.display = step === 'confirm' ? '' : 'none';
    el.mileageHomeFooter.style.display = step === 'home' ? '' : 'none';
    el.mileageConfirmFooter.style.display = step === 'confirm' ? '' : 'none';
  }

  function renderMileageHome() {
    if (mileagePendingTrip) {
      el.mileagePendingCard.style.display = '';
      el.mileageStartTripSection.style.display = 'none';
      if (mileagePendingTrip.startPhoto) {
        el.mileagePendingThumb.src = mileagePendingTrip.startPhoto;
        el.mileagePendingThumb.style.display = '';
      } else {
        el.mileagePendingThumb.style.display = 'none';
      }
      el.mileagePendingMeta.textContent = `Started at ${mileagePendingTrip.startOdometer.toLocaleString('en-US')} mi on ${fmtShortDate(mileagePendingTrip.startDate)}`;
    } else {
      el.mileagePendingCard.style.display = 'none';
      el.mileageStartTripSection.style.display = '';
    }
  }

  function fmtShortDate(iso) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  async function updateMileageAmountPreview() {
    const miles = parseFloat(el.mileageMilesInput.value) || 0;
    const rate = parseFloat(el.mileageRateInput.value) || 0;
    el.mileageAmountPreview.textContent = fmtMoney(miles * rate);
  }
  el.mileageMilesInput.addEventListener('input', updateMileageAmountPreview);
  el.mileageRateInput.addEventListener('input', updateMileageAmountPreview);

  async function openMileageModal() {
    mileageCompletedTrip = null;
    el.mileageMilesInput.value = '';
    const lastRate = await DB.getMeta('lastMileageRate', null);
    el.mileageRateInput.value = lastRate != null ? lastRate : '';
    updateMileageAmountPreview();
    renderMileageHome();
    showMileageStep('home');
    openModal(el.mileageModalOverlay);
  }
  el.mileageBtn.addEventListener('click', openMileageModal);

  el.mileageStartTripBtn.addEventListener('click', () => {
    mileageCaptureMode = 'start';
    el.mileageCaptureHint.textContent = 'Take a photo of your STARTING odometer, or choose one from your library.';
    showMileageStep('capture');
  });
  el.mileageLogEndingBtn.addEventListener('click', () => {
    mileageCaptureMode = 'end';
    el.mileageCaptureHint.textContent = 'Take a photo of your ENDING odometer, or choose one from your library.';
    showMileageStep('capture');
  });

  el.mileageDiscardBtn.addEventListener('click', async () => {
    if (!confirm('Discard this trip? The starting mileage will be cleared.')) return;
    mileagePendingTrip = null;
    await DB.setMeta('pendingMileageTrip', null);
    renderMileageHome();
    showToast('Trip discarded');
  });

  el.mileageCameraBtn.addEventListener('click', () => el.mileageCameraInput.click());
  el.mileageLibraryBtn.addEventListener('click', () => el.mileageLibraryInput.click());

  function openMileageConfirmStep(photoDataUrl, reading) {
    el.mileageConfirmLabel.textContent = mileageCaptureMode === 'start' ? 'Starting Mileage' : 'Ending Mileage';
    if (photoDataUrl) {
      el.mileageConfirmPhotoImg.src = photoDataUrl;
      el.mileageConfirmPhotoWrap.style.display = '';
    } else {
      el.mileageConfirmPhotoWrap.style.display = 'none';
    }
    el.mileageReadingInput.value = reading != null ? reading : '';
    showMileageStep('confirm');
    setTimeout(() => el.mileageReadingInput.focus(), 200);
  }

  async function handleMileagePhoto(file) {
    if (!file) return;
    try {
      const raw = await fileToDataUrl(file);
      const small = await downscaleImage(raw);
      mileageCapturedPhoto = small;

      if (!state.settings.apiKey) {
        openMileageConfirmStep(small, null);
        showToast('Photo attached — add an API key in Settings to auto-fill the reading.');
        return;
      }

      showMileageStep('loading');
      el.mileageLoadingImg.src = small;
      const { reading } = await ClaudeReceipts.parseOdometerReading(small, state.settings.apiKey);
      openMileageConfirmStep(small, reading);
      if (reading == null) showToast('Could not read that odometer — check and enter it manually.');
    } catch (e) {
      showToast(e.message || 'Something went wrong reading that photo.');
      openMileageConfirmStep(mileageCapturedPhoto, null);
    }
  }
  el.mileageCameraInput.addEventListener('change', () => { handleMileagePhoto(el.mileageCameraInput.files[0]); el.mileageCameraInput.value = ''; });
  el.mileageLibraryInput.addEventListener('change', () => { handleMileagePhoto(el.mileageLibraryInput.files[0]); el.mileageLibraryInput.value = ''; });

  el.mileageSkipPhotoBtn.addEventListener('click', () => {
    mileageCapturedPhoto = null;
    openMileageConfirmStep(null, null);
  });

  el.mileageConfirmBackBtn.addEventListener('click', () => {
    renderMileageHome();
    showMileageStep('home');
  });

  el.mileageConfirmSaveBtn.addEventListener('click', async () => {
    if (el.mileageConfirmSaveBtn.disabled) return;
    const reading = parseFloat(el.mileageReadingInput.value);
    if (!reading || reading <= 0) { showToast('Enter a valid odometer reading.'); el.mileageReadingInput.focus(); return; }

    el.mileageConfirmSaveBtn.disabled = true;
    try {
      if (mileageCaptureMode === 'start') {
        mileagePendingTrip = { startOdometer: reading, startPhoto: mileageCapturedPhoto || null, startDate: todayISO(), createdAt: Date.now() };
        await DB.setMeta('pendingMileageTrip', mileagePendingTrip);
        renderMileageHome();
        showMileageStep('home');
        showToast('Starting mileage saved');
      } else {
        const miles = Math.round((reading - mileagePendingTrip.startOdometer) * 10) / 10;
        if (miles <= 0) { showToast('Ending mileage should be higher than the starting mileage.'); return; }

        mileageCompletedTrip = {
          startOdometer: mileagePendingTrip.startOdometer,
          startPhoto: mileagePendingTrip.startPhoto,
          endOdometer: reading,
          endPhoto: mileageCapturedPhoto || null,
        };
        mileagePendingTrip = null;
        await DB.setMeta('pendingMileageTrip', null);

        el.mileageMilesInput.value = miles;
        updateMileageAmountPreview();
        renderMileageHome(); // now shows the "start a trip" section again, since the trip is done
        showMileageStep('home');
        showToast('Trip logged — review and add the expense below.');
      }
    } finally {
      el.mileageConfirmSaveBtn.disabled = false;
    }
  });

  el.mileageContinueBtn.addEventListener('click', async () => {
    if (el.mileageContinueBtn.disabled) return;
    const miles = parseFloat(el.mileageMilesInput.value);
    const rate = parseFloat(el.mileageRateInput.value);
    if (!miles || miles <= 0) { showToast('Enter the miles driven.'); el.mileageMilesInput.focus(); return; }
    if (!rate || rate <= 0) { showToast('Enter a rate per mile.'); el.mileageRateInput.focus(); return; }

    el.mileageContinueBtn.disabled = true;
    try {
      await DB.setMeta('lastMileageRate', rate);
      const amount = Math.round(miles * rate * 100) / 100;

      let notes = `${miles} mi @ ${fmtMoney(rate)}/mi`;
      let photo = null;
      if (mileageCompletedTrip) {
        notes += ` (odometer ${mileageCompletedTrip.startOdometer.toLocaleString('en-US')} → ${mileageCompletedTrip.endOdometer.toLocaleString('en-US')})`;
        photo = mileageCompletedTrip.endPhoto || mileageCompletedTrip.startPhoto || null;
      }

      closeModal(el.mileageModalOverlay);
      openExpenseModal(null, { amount, vendor: 'Business Mileage', category: 'Mileage', notes, photo, date: todayISO() });

      mileageCompletedTrip = null;
    } finally {
      el.mileageContinueBtn.disabled = false;
    }
  });

  // ---------- settings ----------
  function openSettingsModal() {
    el.apiKeyInput.value = state.settings.apiKey || '';
    updateGoogleUI();
    openModal(el.settingsModalOverlay);
  }
  el.settingsBtn.addEventListener('click', openSettingsModal);
  el.menuBtn.addEventListener('click', () => openReportModal());

  el.saveSettingsBtn.addEventListener('click', async () => {
    state.settings.apiKey = el.apiKeyInput.value.trim();
    await DB.setMeta('apiKey', state.settings.apiKey);
    closeModal(el.settingsModalOverlay);
    showToast('Settings saved');
  });


  // ---------- sample data (testing helper) ----------
  function makeSampleReceiptImage(vendor, addr, lines, total) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 60 + lines.length * 24 + 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fdfdfb'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center';
    ctx.font = 'bold 17px monospace';
    ctx.fillText(vendor.toUpperCase(), canvas.width / 2, 30);
    ctx.font = '11px monospace'; ctx.fillStyle = '#555';
    ctx.fillText(addr, canvas.width / 2, 48);
    ctx.strokeStyle = '#ccc';
    ctx.beginPath(); ctx.moveTo(20, 62); ctx.lineTo(canvas.width - 20, 62); ctx.stroke();
    let y = 84;
    ctx.font = '12px monospace'; ctx.fillStyle = '#222';
    for (const [label, amt] of lines) {
      ctx.textAlign = 'left'; ctx.fillText(label, 24, y);
      ctx.textAlign = 'right'; ctx.fillText(amt, canvas.width - 24, y);
      y += 24;
    }
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(canvas.width - 20, y); ctx.stroke();
    y += 26;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'left'; ctx.fillText('TOTAL', 24, y);
    ctx.textAlign = 'right'; ctx.fillText(total, canvas.width - 24, y);
    return canvas.toDataURL('image/jpeg', 0.85);
  }

  el.loadSampleBtn.addEventListener('click', async () => {
    if (!confirm(`Add 7 fake sample expenses (with mock receipt photos) to ${state.selectedYear} so you can preview the report? You can clear them afterward with "Clear ${state.selectedYear}'s expenses".`)) return;

    const mk = makeSampleReceiptImage;
    const sample = [
      { vendor: 'The Capital Grille', category: 'Business Meals', amount: 128.40, offsetDays: -12,
        photo: mk('Capital Grille', '123 Main St, Atlanta GA', [['Client Lunch x2', '$118.00'], ['Tax', '$10.40']], '$128.40') },
      { vendor: 'Delta Air Lines', category: 'Travel', amount: 342.00, offsetDays: -30, photo: null },
      { vendor: 'B&H Photo', category: 'Equipment', amount: 649.00, offsetDays: -22,
        photo: mk('B&H Photo', '420 9th Ave, New York NY', [['Camera Lens', '$649.00']], '$649.00') },
      { vendor: 'The Home Depot', category: 'Supplies', amount: 64.32, offsetDays: -8,
        photo: mk('The Home Depot', '1801 Howell Mill Rd, Atlanta GA', [['Shelving Unit', '$56.99'], ['Tax', '$7.33']], '$64.32') },
      { vendor: 'Adobe', category: 'Professional Services', amount: 54.99, offsetDays: -20, photo: null },
      { vendor: 'Starbucks', category: 'Business Meals', amount: 14.75, offsetDays: -3,
        photo: mk('Starbucks', '55 Ivan Allen Jr Blvd, Atlanta GA', [['Coffee Meeting x2', '$13.50'], ['Tax', '$1.25']], '$14.75') },
      { vendor: 'Staples', category: 'Home Office', amount: 89.10, offsetDays: -15, photo: null },
    ];

    const today = new Date(`${state.selectedYear}-06-15T12:00:00`);
    let createdAt = Date.now();
    for (const s of sample) {
      const d = new Date(today);
      d.setDate(d.getDate() + s.offsetDays);
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const expense = {
        id: uid(), amount: s.amount, vendor: s.vendor,
        category: s.category, date, photo: s.photo, createdAt: createdAt++,
      };
      await DB.putExpense(expense);
      state.allExpenses.unshift(expense);
    }

    closeModal(el.settingsModalOverlay);
    renderAll();
    showToast('Sample expenses added — try Export Report');
  });

  // ---------- export: CSV ----------
  function csvEscape(val) {
    const s = String(val ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  function exportCsv(year = state.selectedYear, expenses = activeExpenses()) {
    if (expenses.length === 0) { showToast('No expenses to export yet.'); return; }
    const rows = [['Date', 'Logged At', 'Vendor', 'Category', 'Amount', 'Notes', 'Location', 'Has Photo']];
    const sorted = [...expenses].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    for (const e of sorted) {
      rows.push([e.date, fmtTimestamp(e.createdAt), e.vendor, e.category, e.amount.toFixed(2), e.notes || '', locationLabel(e), e.photo ? 'Yes' : 'No']);
    }
    const spent = totalSpent(expenses);
    rows.push([]);
    rows.push(['', '', '', 'Total deductible', spent.toFixed(2), '', '', '']);

    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
    const filename = `write-off-tracker-${year}-expenses.csv`;
    downloadBlob(new Blob([csv], { type: 'text/csv' }), filename);
    showToast('CSV downloaded');
  }

  $('exportCsvBtn').addEventListener('click', () => exportCsv());
  el.exportReportCsvBtn.addEventListener('click', () => {
    if (currentReportContext) exportCsv(currentReportContext.year, currentReportContext.expenses);
  });

  // ---------- export: printable report ----------
  function reportItemHtml(e) {
    return `
      <div class="report-item">
        ${e.photo ? `<img src="${e.photo}" alt="Receipt">` : ''}
        <div class="report-item-main">
          <div class="report-item-row">
            <div>
              <div class="report-item-vendor">${escapeHtml(e.vendor || 'Expense')}</div>
              <div class="report-item-meta">${escapeHtml(e.category || 'Other')} · ${e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
            </div>
            <div class="report-item-amount">${fmtMoney(e.amount)}</div>
          </div>
          ${e.notes ? `<div class="report-item-notes">${escapeHtml(e.notes)}</div>` : ''}
        </div>
      </div>
    `;
  }

  function categoryTotals(expenses) {
    const totals = {};
    for (const e of expenses) {
      const cat = e.category || 'Other';
      totals[cat] = (totals[cat] || 0) + e.amount;
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1]); // biggest category first
  }

  function reportCategoryBreakdownHtml(expenses) {
    if (expenses.length === 0) return '';
    const rows = categoryTotals(expenses);
    return `
      <div class="report-breakdown">
        <div class="report-section-title">By Category</div>
        ${rows.map(([cat, total]) => `
          <div class="report-breakdown-row">
            <span>${escapeHtml(cat)}</span>
            <span>${fmtMoney(total)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderReportItemsHtml(expenses, mode) {
    if (expenses.length === 0) return '<p style="text-align:center;color:#888;">No expenses logged.</p>';
    const byDate = (a, b) => (a.date || '').localeCompare(b.date || '');

    if (mode === 'category') {
      return categoryTotals(expenses).map(([cat, total]) => `
        <div class="report-group">
          <div class="report-group-header"><span>${escapeHtml(cat)}</span><span>${fmtMoney(total)}</span></div>
          ${expenses.filter((e) => (e.category || 'Other') === cat).sort(byDate).map(reportItemHtml).join('')}
        </div>
      `).join('');
    }
    return [...expenses].sort(byDate).map(reportItemHtml).join('');
  }

  let reportSortMode = 'date';

  function renderReportItemsSection() {
    if (!currentReportContext) return;
    const container = $('reportItemsContainer');
    if (container) container.innerHTML = renderReportItemsHtml(currentReportContext.expenses, reportSortMode);
  }

  function openReportModal(year = state.selectedYear, expenses = activeExpenses()) {
    currentReportContext = { year, expenses };
    reportSortMode = 'date';

    const spent = totalSpent(expenses);

    el.reportBody.innerHTML = `
      <div class="report-cover">
        <h1>Write-Off Report</h1>
        <div class="report-dates">Tax Year ${year}</div>
      </div>
      <div class="report-summary">
        <div><div class="num">${fmtMoney(spent)}</div><div class="lbl">Total Deductible</div></div>
      </div>
      ${reportCategoryBreakdownHtml(expenses)}
      ${expenses.length ? `
        <div class="report-sort-row no-print">
          <span class="report-section-title">Sort</span>
          <div class="report-sort-toggle">
            <button type="button" class="report-sort-btn selected" id="reportSortDateBtn">📅 Date</button>
            <button type="button" class="report-sort-btn" id="reportSortCategoryBtn">🏷️ Category</button>
          </div>
        </div>
      ` : ''}
      <div id="reportItemsContainer">${renderReportItemsHtml(expenses, 'date')}</div>
    `;

    if (expenses.length) {
      $('reportSortDateBtn').addEventListener('click', () => {
        reportSortMode = 'date';
        $('reportSortDateBtn').classList.add('selected');
        $('reportSortCategoryBtn').classList.remove('selected');
        renderReportItemsSection();
      });
      $('reportSortCategoryBtn').addEventListener('click', () => {
        reportSortMode = 'category';
        $('reportSortCategoryBtn').classList.add('selected');
        $('reportSortDateBtn').classList.remove('selected');
        renderReportItemsSection();
      });
    }

    openModal(el.reportModalOverlay);
  }

  $('exportReportBtn').addEventListener('click', () => {
    if (activeExpenses().length === 0) { showToast('No expenses to report yet.'); return; }
    openReportModal();
  });
  el.printReportBtn.addEventListener('click', () => window.print());

  // ---------- Google Drive backup ----------
  // Backs up to a single JSON file this app creates in the user's own Google Drive
  // (drive.file scope — the app can only ever see files it created, nothing else in
  // their Drive). Never goes through any server; never includes the Anthropic API key.
  const GOOGLE_CLIENT_ID = '324499494473-n0m48riklpl2e1rajniop7v55363ptjf.apps.googleusercontent.com';
  const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const BACKUP_FILENAME = 'write-off-tracker-backup.json';

  let googleTokenClient = null;
  let googleAccessToken = null;
  let googleAccessTokenExpiresAt = 0;

  function initGoogleAuth() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      setTimeout(initGoogleAuth, 300); // the GIS script loads with `defer`, may not be ready yet
      return;
    }
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_DRIVE_SCOPE,
      callback: () => {}, // replaced per-call in ensureGoogleAccessToken
    });
  }

  function ensureGoogleAccessToken() {
    return new Promise((resolve, reject) => {
      if (!googleTokenClient) { reject(new Error('Google sign-in isn\'t ready yet — try again in a moment.')); return; }
      if (googleAccessToken && Date.now() < googleAccessTokenExpiresAt - 60000) {
        resolve(googleAccessToken);
        return;
      }
      googleTokenClient.callback = (response) => {
        if (response.error) { reject(new Error(`Google sign-in failed (${response.error}).`)); return; }
        googleAccessToken = response.access_token;
        googleAccessTokenExpiresAt = Date.now() + (response.expires_in * 1000);
        resolve(googleAccessToken);
      };
      googleTokenClient.requestAccessToken({});
    });
  }

  async function updateGoogleUI() {
    const connected = await DB.getMeta('googleConnected', false);
    el.googleSignedOutView.style.display = connected ? 'none' : '';
    el.googleSignedInView.style.display = connected ? '' : 'none';
    if (connected) {
      const lastBackup = await DB.getMeta('lastBackupAt', null);
      el.googleBackupStatus.textContent = lastBackup
        ? `Last backed up ${fmtTimestamp(lastBackup)}`
        : 'Not backed up yet.';
    }
  }

  async function driveFindBackupFile(token) {
    const q = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Could not reach Google Drive.');
    const data = await res.json();
    return (data.files && data.files[0]) || null;
  }

  function buildBackupPayload() {
    return {
      version: 1,
      exportedAt: Date.now(),
      expenses: state.allExpenses,
    };
  }

  async function driveUploadBackup(token, fileId, payload) {
    const json = JSON.stringify(payload);
    if (fileId) {
      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: json,
      });
      if (!res.ok) throw new Error('Drive upload failed.');
      return res.json();
    }
    const boundary = 'writeofftracker' + Date.now();
    const metadata = JSON.stringify({ name: BACKUP_FILENAME, mimeType: 'application/json' });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n` +
      `--${boundary}--`;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error('Drive upload failed.');
    return res.json();
  }

  // Silent best-effort backup triggered after every save/delete while signed in. Only
  // runs when a still-valid access token is already cached — never requests a fresh
  // one, so it can't pop a surprise Google sign-in prompt in the middle of logging an
  // expense. Falls back to the next auto-trigger or a manual "Back Up Now".
  async function autoBackupIfSignedIn() {
    try {
      const connected = await DB.getMeta('googleConnected', false);
      if (!connected) return;
      if (!googleAccessToken || Date.now() >= googleAccessTokenExpiresAt - 60000) return;
      const existing = await driveFindBackupFile(googleAccessToken);
      await driveUploadBackup(googleAccessToken, existing ? existing.id : null, buildBackupPayload());
      await DB.setMeta('lastBackupAt', Date.now());
    } catch (e) {
      // silent — this is a background convenience, not a user-initiated action
    }
  }

  async function driveDownloadBackup(token, fileId) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Could not download the backup file.');
    return res.json();
  }

  async function restoreFromBackupPayload(payload) {
    if (!payload || !Array.isArray(payload.expenses)) throw new Error('That backup file looks invalid.');

    const currentExpenses = await DB.getAllExpenses();
    for (const e of currentExpenses) await DB.deleteExpense(e.id);
    for (const e of payload.expenses) await DB.putExpense(e);

    state.allExpenses = await DB.getAllExpenses();
    renderAll();
  }

  el.googleSignInBtn.addEventListener('click', async () => {
    try {
      await ensureGoogleAccessToken();
      await DB.setMeta('googleConnected', true);
      await updateGoogleUI();
      showToast('Connected to Google');
      autoBackupIfSignedIn().then(updateGoogleUI);
    } catch (e) {
      showToast(e.message || 'Google sign-in failed.');
    }
  });

  el.driveBackupBtn.addEventListener('click', async () => {
    if (el.driveBackupBtn.disabled) return;
    el.driveBackupBtn.disabled = true;
    try {
      const token = await ensureGoogleAccessToken();
      const existing = await driveFindBackupFile(token);
      await driveUploadBackup(token, existing ? existing.id : null, buildBackupPayload());
      await DB.setMeta('lastBackupAt', Date.now());
      await updateGoogleUI();
      showToast('Backed up to Google Drive');
    } catch (e) {
      showToast(e.message || 'Backup failed.');
    } finally {
      el.driveBackupBtn.disabled = false;
    }
  });

  el.driveRestoreBtn.addEventListener('click', async () => {
    if (el.driveRestoreBtn.disabled) return;
    if (!confirm('This replaces ALL expense data currently on this device with your Google Drive backup. This cannot be undone. Continue?')) return;
    el.driveRestoreBtn.disabled = true;
    try {
      const token = await ensureGoogleAccessToken();
      const file = await driveFindBackupFile(token);
      if (!file) { showToast('No backup found in Google Drive yet.'); return; }
      const payload = await driveDownloadBackup(token, file.id);
      await restoreFromBackupPayload(payload);
      closeModal(el.settingsModalOverlay);
      showToast('Restored from Google Drive');
    } catch (e) {
      showToast(e.message || 'Restore failed.');
    } finally {
      el.driveRestoreBtn.disabled = false;
    }
  });

  el.googleSignOutBtn.addEventListener('click', async () => {
    if (googleAccessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(googleAccessToken, () => {});
    }
    googleAccessToken = null;
    googleAccessTokenExpiresAt = 0;
    await DB.setMeta('googleConnected', false);
    await updateGoogleUI();
    showToast('Disconnected from Google');
  });

  // ---------- init ----------
  async function init() {
    state.settings.apiKey = await DB.getMeta('apiKey', '');
    state.allExpenses = await DB.getAllExpenses();
    mileagePendingTrip = await DB.getMeta('pendingMileageTrip', null);

    // Default to the most recent year with expenses on it, or this calendar year if empty.
    if (state.allExpenses.length) {
      const years = state.allExpenses.map((e) => parseInt((e.date || '').slice(0, 4), 10)).filter((y) => !isNaN(y));
      if (years.length) state.selectedYear = Math.max(...years);
    }

    renderAll();
    initGoogleAuth();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
  }

  init().catch((err) => {
    console.error('init failed', err);
    showToast(err.message || 'Could not load your expense data.', 6000);
  });
})();
