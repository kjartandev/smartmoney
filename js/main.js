// ── Boot ──────────────────────────────────────────────────────────
const LOADING_SCREEN_MIN_MS = 1350;
const _loadingScreenStart = Date.now();
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (!el) return;
  const elapsed = Date.now() - _loadingScreenStart;
  const wait = Math.max(0, LOADING_SCREEN_MIN_MS - elapsed);
  setTimeout(() => el.classList.add('hidden'), wait);
}

function bootWithData(stored, resetTab) {
  document.getElementById('uploadScreen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  hideLoadingScreen();
  allClassified = stored.map(tx => ({ ...tx, cat: classify(tx) }));
  const allKeys  = [...new Set(stored.map(t=>getMonthKey(t.dato)))].sort();
  const allYears = [...new Set(stored.map(t=>t.dato.split('.')[2]))].sort();
  if (!activeYear || !allYears.includes(activeYear)) activeYear = allYears[allYears.length-1];
  const yearKeys = allKeys.filter(k => k.startsWith(activeYear));
  if (!activeMonthFilter || !yearKeys.includes(activeMonthFilter))
    activeMonthFilter = yearKeys.length ? yearKeys[yearKeys.length-1] : allKeys[allKeys.length-1];
  renderSidebarChart();
  updateTopbar();
  if (resetTab) currentTab = 'oversikt';
  rerenderCurrentTab();
}

function boot(resetTab = true) {
  const stored = loadStored();
  if (stored.length) { bootWithData(stored, resetTab); return; }
  idbGet(STORAGE_KEY).then(idbData => {
    if (idbData && idbData.length) {
      saveStored(idbData);
      return Promise.all([
        idbGet(OVERRIDES_KEY).then(v => { if (v) localStorage.setItem(OVERRIDES_KEY, JSON.stringify(v)); }),
        idbGet(BUDGET_KEY).then(v => { if (v) localStorage.setItem(BUDGET_KEY, JSON.stringify(v)); }),
        idbGet(INCOME_KEY).then(v => { if (v) localStorage.setItem(INCOME_KEY, String(v)); }),
        idbGet(NOTES_KEY).then(v => { if (v) localStorage.setItem(NOTES_KEY, JSON.stringify(v)); }),
        idbGet(SPLIT_KEY).then(v => { if (v) localStorage.setItem(SPLIT_KEY, JSON.stringify(v)); }),
        idbGet(SPAREMAAL_KEY).then(v => { if (v) localStorage.setItem(SPAREMAAL_KEY, JSON.stringify(v)); }),
        idbGet(CUSTOM_BUCKETS_KEY).then(v => { if (v) localStorage.setItem(CUSTOM_BUCKETS_KEY, JSON.stringify(v)); }),
      ]).then(() => bootWithData(idbData, resetTab));
    }
    document.getElementById('uploadScreen').style.display = '';
    document.getElementById('app').classList.remove('visible');
    hideLoadingScreen();
    // Try auto-loading transaksjoner.csv
    tryAutoLoad();
  }).catch(() => {
    document.getElementById('uploadScreen').style.display = '';
    document.getElementById('app').classList.remove('visible');
    hideLoadingScreen();
    tryAutoLoad();
  });
}

// ── Auto-load transaksjoner.csv ───────────────────────────────────
function tryAutoLoad() {
  fetch('./transaksjoner.csv')
    .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
    .then(text => {
      const txs = parseCSV(text);
      if (txs.length) {
        saveStored(mergeNewTxs(loadStored(), txs));
        showToast('Fant transaksjoner.csv — lastet inn automatisk', 3500);
        activeMonthFilter = [...new Set(txs.map(t=>getMonthKey(t.dato)))].sort().pop();
        bootWithData(loadStored(), true);
      }
    })
    .catch(() => {}); // silent fail — file not found is normal
}

// ── Events ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved dark mode
  const savedDark = localStorage.getItem(DARK_KEY);
  if (savedDark === '1') applyDarkMode(true);

  // Apply saved icon pack to nav
  applyNavIcons();

  document.getElementById('fileInput').addEventListener('change', e => processFile(e.target.files[0]));
  document.getElementById('fileInputHidden').addEventListener('change', e => { processFile(e.target.files[0]); e.target.value=''; });
  document.getElementById('fileInputBackup').addEventListener('change', e => { processBackupFile(e.target.files[0]); e.target.value=''; });
  document.getElementById('addMonthBtn').addEventListener('click', () => document.getElementById('fileInputHidden').click());
  document.getElementById('toolsBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('toolsMenu').classList.toggle('open');
  });
  document.addEventListener('click', () => document.getElementById('toolsMenu')?.classList.remove('open'));
  document.getElementById('importBackupBtn').addEventListener('click', () => { document.getElementById('toolsMenu').classList.remove('open'); document.getElementById('fileInputBackup').click(); });
  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('panelOverlay').addEventListener('click', closePanel);
  document.getElementById('exportBtn').addEventListener('click', exportToFile);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJSON);
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
  document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

  // Icon pack picker in tools menu
  const iconPickerWrap = document.getElementById('iconPackPickerWrap');
  if (iconPickerWrap) {
    iconPickerWrap.innerHTML = renderIconPackPicker();
    wireIconPackPicker(iconPickerWrap);
  }

  document.getElementById('app').addEventListener('click', e => {
    // Group head click: navigate + toggle group
    const head = e.target.closest('.nav-group-head');
    if (head && head.dataset.tab) {
      const group = head.dataset.group;
      if (navOpenGroups.has(group)) {
        // Already open — collapse without navigating
        navOpenGroups.delete(group);
        applyNavGroups();
      } else {
        // Closed — open and navigate to the group's tab
        navOpenGroups.add(group);
        currentTab = head.dataset.tab;
        rerenderCurrentTab();
      }
      return;
    }
    // Sub-item or standalone nav-item click
    const nav = e.target.closest('.nav-item');
    if (!nav || !nav.dataset.tab) return;
    currentTab = nav.dataset.tab;
    rerenderCurrentTab();
  });

  // Drag-and-drop on upload zone
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor='#2d6a2d'; });
  dz.addEventListener('dragleave', () => dz.style.borderColor='');
  dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor=''; processFile(e.dataTransfer.files[0]); });

  // Close year dropdown on outside click
  document.addEventListener('click', () => {
    document.getElementById('yearMenu')?.classList.remove('open');
    document.getElementById('yearTrigger')?.classList.remove('open');
  });

  boot(false);
});
