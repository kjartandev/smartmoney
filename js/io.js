// ── Re-render current tab ─────────────────────────────────────────
function rerenderCurrentTab() {
  if      (currentTab==='oversikt')     renderOversikt();
  else if (currentTab==='transaksjoner')renderTransaksjoner();
  else if (currentTab==='sparing')      renderSparing();
  else if (currentTab==='folk')         renderFolk();
  else if (currentTab==='uker')         renderUker();
  else if (currentTab==='innsikt')      renderInnsikt();
  else if (currentTab==='budsjett')     renderBudsjett();
  else if (currentTab==='maaneder')     renderMaaneder();
  else if (currentTab==='lonnskalk')    renderLonnskalkulator();
  else if (currentTab==='skatt')        renderSkatt();
  else if (currentTab==='verktoy')     renderVerktoy();
}

// ── File handling ─────────────────────────────────────────────────
function processFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try { const t = parseCSV(e.target.result); if (!t.length) throw 0; importTxs(t); }
    catch { const r2 = new FileReader(); r2.onload = e2 => importTxs(parseCSV(e2.target.result)); r2.readAsText(file,'ISO-8859-1'); }
  };
  r.readAsText(file,'UTF-8');
}

function restoreFullBackup(backup) {
  if (backup.txs?.length)    saveStored(backup.txs);
  if (backup.overrides)      saveOverrides(backup.overrides);
  if (backup.budgets)        saveBudgets(backup.budgets);
  if (backup.income != null) saveIncome(backup.income);
  if (backup.notes)          saveNotes(backup.notes);
  if (backup.splits)         saveSplits(backup.splits);
  if (backup.vaktkoder)      saveVaktkoder(backup.vaktkoder);
  if (backup.vakter)         saveVakter(backup.vakter);
  if (backup.vaktsett)       saveVaktSett(backup.vaktsett);
  if (backup.lonn)           saveLonnState(backup.lonn);
  if (backup.fordeling)      saveFordeling(backup.fordeling);
  if (backup.checkpoints)    saveCheckpoints(backup.checkpoints);
  if (backup.monthclose)     saveMonthClose(backup.monthclose);
  if (backup.sparemaal)      saveSparemaal(backup.sparemaal);
  if (backup.customBuckets)  saveCustomBuckets(backup.customBuckets);
  if (backup.nwHistory)      localStorage.setItem('okonomi_nw_history', JSON.stringify(backup.nwHistory));
  if (backup.studielan)      saveStudielanState(backup.studielan);
  const count = backup.txs?.length || 0;
  showToast(`Full backup gjenopprettet · ${count} transaksjoner`);
  boot(false);
}

function processBackupFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const text = e.target.result;
    // Try full JSON backup (v2)
    try {
      const parsed = JSON.parse(text);
      if (parsed.version === 2 && parsed.txs) { restoreFullBackup(parsed); return; }
      // Legacy: plain array of transactions
      if (Array.isArray(parsed) && parsed.length && parsed[0].dato) { restoreFullBackup({txs: parsed}); return; }
    } catch {}
    // Try extracting from exported HTML (new full backup)
    const allKeysMatch = text.match(/const d=(\{.*?\});Object\.entries/s);
    if (allKeysMatch) {
      try {
        const d = JSON.parse(allKeysMatch[1]);
        const backup = {
          txs:       JSON.parse(d[STORAGE_KEY]   || '[]'),
          overrides: JSON.parse(d[OVERRIDES_KEY]  || '{}'),
          budgets:   JSON.parse(d[BUDGET_KEY]     || '{}'),
          income:    parseFloat(d[INCOME_KEY]     || '0'),
          notes:     JSON.parse(d[NOTES_KEY]      || '{}'),
          splits:    JSON.parse(d[SPLIT_KEY]      || '{}'),
          vaktkoder: JSON.parse(d[VAKTKODER_KEY]  || 'null'),
          vakter:    JSON.parse(d[VAKTER_KEY]     || '{}'),
          vaktsett:  JSON.parse(d[VAKTSETT_KEY]   || '{}'),
          lonn:      JSON.parse(d[LONN_KEY]       || '{}'),
          fordeling: JSON.parse(d[FORDELING_KEY]  || '[]'),
          sparemaal: JSON.parse(d[SPAREMAAL_KEY]  || '{}'),
          customBuckets: JSON.parse(d[CUSTOM_BUCKETS_KEY] || '[]'),
          studielan: JSON.parse(d[STUDIELAN_KEY] || 'null'),
        };
        restoreFullBackup(backup); return;
      } catch {}
    }
    // Legacy HTML backup (transactions only)
    const match = text.match(/localStorage\.setItem\("okonomi_txs_v2"\s*,\s*("(?:[^"\\]|\\.)*")\)/);
    if (match) {
      try {
        const txs = JSON.parse(JSON.parse(match[1]));
        if (Array.isArray(txs) && txs.length) { restoreFullBackup({txs}); return; }
      } catch {}
    }
    showToast('Kunne ikke lese backup-filen');
  };
  r.readAsText(file, 'UTF-8');
}

function importTxs(newTxs) {
  if (!newTxs.length) { showToast('Ingen transaksjoner funnet'); return; }
  // Finn kontoeierens navn første gang en utskrift uten Type-kolonne lastes
  // inn — classify() trenger det for å skille egne overføringer fra betalinger
  // til andre. Settes bare når det ikke allerede står noe, så et navn brukeren
  // har rettet selv aldri blir overskrevet av en senere import.
  if (!loadKontoeier()) {
    const eier = detectKontoeier(newTxs);
    if (eier) saveKontoeier(eier);
  }
  const newMonths = [...new Set(newTxs.map(t=>getMonthKey(t.dato)))];
  saveStored(mergeNewTxs(loadStored(), newTxs));
  activeMonthFilter = newMonths[newMonths.length-1];
  boot(false);
  showToast('Måned lagt til');
}

// ── Export: HTML (with embedded data) ────────────────────────────
function collectFullBackup() {
  return {
    txs:       loadStored(),
    overrides: loadOverrides(),
    budgets:   loadBudgets(),
    income:    loadIncome(),
    notes:     loadNotes(),
    splits:    loadSplits(),
    vaktkoder: loadVaktkoder(),
    vakter:    loadVakter(),
    vaktsett:  loadVaktSett(),
    lonn:      loadLonnState(),
    fordeling:    loadFordeling(),
    checkpoints:  loadCheckpoints(),
    monthclose:   loadMonthClose(),
    sparemaal:    loadSparemaal(),
    customBuckets: loadCustomBuckets(),
    nwHistory: JSON.parse(localStorage.getItem('okonomi_nw_history') || '[]'),
    studielan: loadStudielanState(),
    exportedAt: new Date().toISOString(),
    version: 2,
  };
}

function exportToFile() {
  const stored = loadStored();
  if (!stored.length) { showToast('Ingen data å eksportere'); return; }
  const backup = collectFullBackup();
  const allKeys = {
    [STORAGE_KEY]:   JSON.stringify(backup.txs),
    [OVERRIDES_KEY]: JSON.stringify(backup.overrides),
    [BUDGET_KEY]:    JSON.stringify(backup.budgets),
    [INCOME_KEY]:    String(backup.income),
    [NOTES_KEY]:     JSON.stringify(backup.notes),
    [SPLIT_KEY]:     JSON.stringify(backup.splits),
    [VAKTKODER_KEY]: JSON.stringify(backup.vaktkoder),
    [VAKTER_KEY]:    JSON.stringify(backup.vakter),
    [VAKTSETT_KEY]:  JSON.stringify(backup.vaktsett),
    [LONN_KEY]:      JSON.stringify(backup.lonn),
    [FORDELING_KEY]:  JSON.stringify(backup.fordeling),
    [SPAREMAAL_KEY]:  JSON.stringify(backup.sparemaal),
    [CUSTOM_BUCKETS_KEY]: JSON.stringify(backup.customBuckets),
    [STUDIELAN_KEY]:  JSON.stringify(backup.studielan),
  };
  const injectScript = '<scr'+'ipt>try{const d='+JSON.stringify(allKeys)+';Object.entries(d).forEach(([k,v])=>localStorage.setItem(k,v));}catch(e){}</'+'script>';
  const html = document.documentElement.outerHTML;
  const injected = html.replace('</body>', injectScript + '</body>');
  const blob = new Blob([injected], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const months = [...new Set(stored.map(t=>{const p=t.dato.split('.');return p[2]+'-'+p[1];}))].sort();
  a.download = 'okonomi_backup_'+months[0]+'_til_'+months[months.length-1]+'.html';
  a.href = url; a.click(); URL.revokeObjectURL(url);
  showToast('Full backup eksportert!');
}

// ── Export: JSON ──────────────────────────────────────────────────
function exportToJSON() {
  const stored = loadStored();
  if (!stored.length) { showToast('Ingen data å eksportere'); return; }
  const blob = new Blob([JSON.stringify(collectFullBackup(), null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.download = 'okonomi_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.href = url; a.click(); URL.revokeObjectURL(url);
  showToast('Full JSON backup eksportert!');
}

// ── Export: CSV ───────────────────────────────────────────────────
function exportToCSV() {
  const stored = loadStored();
  if (!stored.length) { showToast('Ingen data å eksportere'); return; }
  const classified = stored.map(t => ({...t, cat: classify(t)}));
  const hdr = ['Dato','Beskrivelse','Type','Undertype','Beløp inn','Beløp ut','Kategori','Status'];
  const rows = classified.map(t => [
    t.dato, t.beskr, t.type, t.subtype,
    t.inn > 0 ? t.inn.toFixed(2).replace('.',',') : '',
    t.ut > 0 ? t.ut.toFixed(2).replace('.',',') : '',
    t.cat,
    t.reserved ? 'Reservert' : ''
  ].map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(';'));
  const csv = [hdr.join(';'), ...rows].join('\r\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.download = 'okonomi_export_' + new Date().toISOString().slice(0,10) + '.csv';
  a.href = url; a.click(); URL.revokeObjectURL(url);
  showToast('CSV eksportert!');
}

// ── Slide panel ───────────────────────────────────────────────────
let panelBackNav = null;
function openPanel(type) {
  const data  = getFiltered();
  const panel = document.getElementById('slidePanel');
  const overlay = document.getElementById('panelOverlay');
  const title = document.getElementById('panelTitle');
  const body  = document.getElementById('panelBody');

  let allTxs = [], heading = '', totalColor = '';
  if (type === 'inntekt') {
    allTxs = data.filter(t => t.cat === 'income');
    heading = 'Inntekt / Lønn'; totalColor = '#2d6a2d';
  } else if (type === 'utgifter') {
    allTxs = data.filter(t => !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);
    heading = 'Utgifter'; totalColor = '#c0392b';
  } else if (type === 'sparing') {
    allTxs = data.filter(t => t.cat === 'savings');
    heading = 'Sparing'; totalColor = '#1a5fa8';
  }

  title.textContent = heading;
  panel.classList.add('open');
  overlay.classList.add('open');
  panelBackNav = bindBackNav(panel, closePanel, () => openPanel(type));

  let sortBy = 'dato', sortDir = 'desc', filterCat = '';
  const cats = type === 'utgifter' ? [...new Set(allTxs.map(t=>t.cat))].map(id => CATS.find(c=>c.id===id)||{id,label:id,emoji:icon('diverse',{size:14})}) : [];

  function renderPanel() {
    let txs = [...allTxs];
    if (filterCat) txs = txs.filter(t => t.cat === filterCat);
    txs.sort((a,b) => {
      let av, bv;
      if (sortBy==='dato')     { av=pd(a.dato); bv=pd(b.dato); }
      else if (sortBy==='amt') { av=a.ut||a.inn; bv=b.ut||b.inn; }
      else if (sortBy==='cat') { av=a.cat; bv=b.cat; }
      if (av<bv) return sortDir==='asc'?-1:1;
      if (av>bv) return sortDir==='asc'?1:-1;
      return 0;
    });
    const totalInn = txs.reduce((s,t)=>s+t.inn,0);
    const totalUt  = txs.reduce((s,t)=>s+t.ut,0);
    const net = totalInn - totalUt;
    const dispTotal = type==='utgifter'?'-'+fmt(totalUt):type==='inntekt'?'+'+fmt(totalInn):type==='sparing'?fmt(totalUt):(net>=0?'+':'-')+fmt(Math.abs(net));
    const arrow = dir => dir==='asc'?'↑':'↓';
    const sortBtn = (col, label) => {
      const isActive = sortBy===col;
      return `<button class="sort-btn${isActive?' sort-active':''}" data-col="${col}">${label}${isActive?' '+arrow(sortDir):''}</button>`;
    };
    body.innerHTML = `
      <div style="font-size:28px;font-weight:700;color:${totalColor};margin-bottom:4px">${dispTotal}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${txs.length} transaksjoner${filterCat?' (filtrert)':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;align-items:center">
        <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Sorter:</span>
        ${sortBtn('dato','Dato')} ${sortBtn('amt','Beløp')} ${type==='utgifter'?sortBtn('cat','Kategori'):''}
      </div>
      ${cats.length > 1 ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border-light)">
        <button class="filter-chip-sm${!filterCat?' active':''}" data-cat="">Alle</button>
        ${cats.map(cat=>`<button class="filter-chip-sm${filterCat===cat.id?' active':''}" data-cat="${cat.id}">${cat.emoji} ${cat.label}</button>`).join('')}
      </div>` : ''}
      <div>${txs.length===0?'<div style="text-align:center;color:var(--text-muted);padding:24px 0">Ingen transaksjoner</div>':
        txs.map(tx => {
          const cat = CATS.find(c=>c.id===tx.cat)||{emoji:icon(tx.cat==='income'?'income':tx.cat==='studielan'?'studielan':tx.cat==='savings'?'savings':'internal',{size:14}),color:'#eee',label:tx.cat};
          const amtColor = tx.inn>0?'#2d6a2d':'var(--text)';
          return `<div class="panel-tx">
            <div style="width:34px;height:34px;border-radius:50%;background:${cat.color}22;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">${cat.emoji}</div>
            <div class="pt-info"><div class="pt-name">${tx.beskr}</div><div class="pt-date">${tx.dato}${type==='utgifter'?' · '+cat.label:''}</div></div>
            <div class="pt-amt" style="color:${amtColor}">${tx.inn>0?'+'+fmt(tx.inn):'-'+fmt(tx.ut)}</div>
          </div>`;
        }).join('')}</div>`;

    body.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (sortBy===btn.dataset.col) sortDir = sortDir==='asc'?'desc':'asc';
        else { sortBy=btn.dataset.col; sortDir='desc'; }
        renderPanel();
      });
    });
    body.querySelectorAll('.filter-chip-sm').forEach(btn => {
      btn.addEventListener('click', () => { filterCat = btn.dataset.cat; renderPanel(); });
    });
  }
  renderPanel();
}

function closePanel() {
  document.getElementById('slidePanel').classList.remove('open');
  document.getElementById('panelOverlay').classList.remove('open');
  if (panelBackNav) { const c = panelBackNav; panelBackNav = null; c(); }
}
