/* ================================================================
   Økonomi – core.js
   Storage keys, categories, savings buckets, IDB fallback,
   load/save helpers, utility functions, classify, CSV parser.
================================================================ */

// ── Storage Keys ────────────────────────────────────────────────
const STORAGE_KEY   = 'okonomi_txs_v2';
const OVERRIDES_KEY = 'okonomi_cat_overrides_v1';
const BUDGET_KEY    = 'okonomi_budsjett_v1';
const INCOME_KEY    = 'okonomi_budsjett_income_v1';
const NOTES_KEY     = 'okonomi_notes_v1';
const SPLIT_KEY     = 'okonomi_split_v1';
const DARK_KEY      = 'okonomi_dark_mode';

// ── Categories ──────────────────────────────────────────────────
const CATS = [
  { id:'mat',       label:'Mat & Dagligvare',      emoji:'🛒', color:'#4caf50', match:['kiwi','rema','coop','bunnpris','meny','joker','extra '] },
  { id:'transport', label:'Transport & Drivstoff', emoji:'⛽', color:'#2196f3', match:['circle k','shell','uno-x','esso','st1 ','best ','7-eleven langs','ruter','atb','vy ','buss','tog','parkering','easypark','europark'] },
  { id:'abo',       label:'Abonnementer',           emoji:'📱', color:'#9c27b0', match:['netflix','spotify','apple.com/bill','youtube','google *','openai','chatgpt','chess.com','playstation','xbox','viaplay','hbo','disney','tidal','deezer'] },
  { id:'trening',   label:'Trening & Sport',        emoji:'🏋️', color:'#e91e63', match:['gym','sport outlet','intersport','sats','elixia','nyx*','funksjonell'] },
  { id:'helse',     label:'Helse & Apotek',         emoji:'💊', color:'#f44336', match:['apotek','vitusapotek','legevakt','lege','tannlege','optiker','sykehus','røntgen','roentgen','ekspedisjon p2'] },
  { id:'shopping',  label:'Shopping',               emoji:'🛍️', color:'#ff9800', match:['temu','netonnet','komplett','power','elkjøp','h&m','zara','primark','cubus','weekday','carlings','family nett','zalando','vipps*netonnet'] },
  { id:'spiseute',  label:'Spise ute / Kafe',       emoji:'🍽️', color:'#ff5722', match:['mcdonald','burger king','kfc','subway','pizz','thai','sushi','restaurant','kafe','cafe','pub ','bakeri','braud','7-eleven '] },
  { id:'reselling', label:'Salg / Reselling',       emoji:'🏷️', color:'#26a69a', match:[] },
  { id:'kredittkort',label:'Kredittkort',            emoji:'💳', color:'#546e7a', match:['kredittbanken'] },
  { id:'bankgebyr',  label:'Bankgebyrer',            emoji:'🏛️', color:'#90a4ae', match:['omkostning'] },
  { id:'diverse',    label:'Diverse',                emoji:'💼', color:'#78909c', match:[] },
];
const SAVINGS_KW = ['overføring til','overføring fra','sparing','trustly','nordnet'];
const SPARING_BUCKETS_ALL = [];
// Keep SPARING_BUCKETS as alias for backward compat (used by spareBucket for tx classification)
const SPARING_BUCKETS = SPARING_BUCKETS_ALL;
const CUSTOM_BUCKETS_KEY  = 'okonomi_custom_buckets_v1';
const HIDDEN_DEFAULTS_KEY = 'okonomi_hidden_defaults_v1';
function loadCustomBuckets()   { try { return JSON.parse(localStorage.getItem(CUSTOM_BUCKETS_KEY)||'[]'); } catch { return []; } }
function saveCustomBuckets(v)  { localStorage.setItem(CUSTOM_BUCKETS_KEY, JSON.stringify(v)); idbSet(CUSTOM_BUCKETS_KEY, v); }
function loadHiddenDefaults()  { try { return JSON.parse(localStorage.getItem(HIDDEN_DEFAULTS_KEY)||'[]'); } catch { return []; } }
function saveHiddenDefaults(v) { localStorage.setItem(HIDDEN_DEFAULTS_KEY, JSON.stringify(v)); idbSet(HIDDEN_DEFAULTS_KEY, v); }
const BUCKET_COLORS = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
function getVisibleBuckets() {
  const hiddenDefaults = new Set(loadHiddenDefaults());
  const defaults = SPARING_BUCKETS_ALL.filter(b => b.visible && !hiddenDefaults.has(b.id));
  const custom = loadCustomBuckets().filter(b => !b.hidden);
  return [
    ...defaults.map(b => ({ ...b, isCustom: false })),
    ...custom.map(c => ({ id: c.id, label: c.label, emoji: c.emoji, color: c.color || '#6366f1', kw: [], isCustom: true }))
  ];
}
function spareBucket(tx) {
  const k = tx.beskr.toLowerCase();
  for (const b of SPARING_BUCKETS_ALL) if (b.kw.length && b.kw.some(w => k.includes(w))) return b.id;
  return 'annet';
}
const monthsNo    = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
const monthsShort = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Des'];

// ── Classify ────────────────────────────────────────────────────
function classify(tx) {
  const overrides = loadOverrides();
  const id = txId(tx);
  if (overrides[id]) return overrides[id];
  const k = (tx.beskr + ' ' + tx.type + ' ' + tx.subtype).toLowerCase();
  if (tx.type === 'lønn') return 'income';
  if (tx.type === 'omkostning') return 'bankgebyr';
  if (tx.subtype === 'innskuddsautomat') return 'internal';
  const SAVINGS_EXCLUDE = ['pasientreiser','adyen','filial af banking circle'];
  if (!SAVINGS_EXCLUDE.some(s => k.includes(s)) && SAVINGS_KW.some(s => k.includes(s))) {
    if (tx.inn > 0) return 'withdrawal';
    return 'savings';
  }
  if (k.includes('kredittbanken')) return 'kredittkort';
  const INTERNAL_INN = ['filial af banking circle','buypass','revolut','adyen','paypal'];
  if (tx.inn > 0 && INTERNAL_INN.some(s => k.includes(s))) return 'internal';
  if (tx.inn > 0 && (k.includes('skatteetaten') || k.includes('forsvaret') || k.includes('nav '))) return 'income';
  if (tx.inn > 0 && tx.type === 'immediate' && (tx.beskr.toLowerCase().includes('vipps') || tx.subtype.toLowerCase().includes('vipps'))) return 'reselling';
  if (tx.inn > 0 && tx.type === 'immediate') return 'folk';
  if (tx.ut > 0 && tx.type === 'immediate') return 'folk';
  if (tx.inn > 0 && tx.type === 'overføring') return 'internal';
  for (const cat of CATS.slice(0,-1)) if (cat.match.some(m => k.includes(m))) return cat.id;
  return 'diverse';
}

// ── CSV Parser ──────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const hdr = lines[0].split(';').map(h => h.trim().toLowerCase());
  const i = n => hdr.indexOf(n);
  const idx = { dato: i('utført dato'), beskr: i('beskrivelse'), type: i('type'), subtype: i('undertype'), inn: i('beløp inn'), ut: i('beløp ut'), status: i('status') };
  const parseAmt = v => v && v.trim() ? parseFloat(v.replace(/\s/g,'').replace(',','.')) || 0 : 0;
  return lines.slice(1).filter(l => {
    const c = l.split(';');
    return c.length >= 10 && /^\d{2}\.\d{2}\.\d{4}/.test((c[idx.dato]||'').trim());
  }).map(l => {
    const c = l.split(';');
    return {
      dato:     c[idx.dato].trim(),
      beskr:    (c[idx.beskr]||'').trim(),
      type:     (c[idx.type]||'').trim().toLowerCase(),
      subtype:  (c[idx.subtype]||'').trim().toLowerCase(),
      inn:      parseAmt(c[idx.inn]),
      ut:       Math.abs(parseAmt(c[idx.ut])),
      reserved: (c[idx.status]||'').trim().toLowerCase() === 'reservert'
    };
  });
}

// ── IndexedDB fallback (Safari clears localStorage for file:// URIs) ──
const IDB_NAME  = 'okonomi_db';
const IDB_STORE = 'kv';
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
  });
}
function idbGet(key) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));
}
function idbSet(key, val) {
  return idbOpen().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  })).catch(() => {});
}

// ── Storage helpers ─────────────────────────────────────────────
function loadStored()    { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function saveStored(txs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  idbSet(STORAGE_KEY,   txs);
  idbSet(OVERRIDES_KEY, loadOverrides());
  idbSet(BUDGET_KEY,    loadBudgets());
  idbSet(INCOME_KEY,    loadIncome());
}
function loadOverrides() { try { return JSON.parse(localStorage.getItem(OVERRIDES_KEY)||'{}'); } catch { return {}; } }
function saveOverrides(o){ localStorage.setItem(OVERRIDES_KEY, JSON.stringify(o)); idbSet(OVERRIDES_KEY, o); }
function loadBudgets()   { try { return JSON.parse(localStorage.getItem(BUDGET_KEY)||'{}'); } catch { return {}; } }
function saveBudgets(b)  { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); idbSet(BUDGET_KEY, b); }
function loadIncome()    { return parseFloat(localStorage.getItem(INCOME_KEY)||'0') || 0; }
function saveIncome(v)   { localStorage.setItem(INCOME_KEY, String(v)); idbSet(INCOME_KEY, v); }
const CHECKPOINTS_KEY = 'okonomi_checkpoints_v1';
const MONTHCLOSE_KEY  = 'okonomi_monthclose_v1';
const SPAREMAAL_KEY   = 'okonomi_sparemaal_v1';
function loadCheckpoints()  { try{return JSON.parse(localStorage.getItem(CHECKPOINTS_KEY)||'{}')}catch{return{}} }
function saveCheckpoints(v) { localStorage.setItem(CHECKPOINTS_KEY,JSON.stringify(v)); idbSet(CHECKPOINTS_KEY,v); }
function loadMonthClose()   { try{return JSON.parse(localStorage.getItem(MONTHCLOSE_KEY)||'{}')}catch{return{}} }
function saveMonthClose(v)  { localStorage.setItem(MONTHCLOSE_KEY,JSON.stringify(v)); idbSet(MONTHCLOSE_KEY,v); }
function loadSparemaal()    { try{return JSON.parse(localStorage.getItem(SPAREMAAL_KEY)||'{}')}catch{return{}} }
function saveSparemaal(v)   { localStorage.setItem(SPAREMAAL_KEY,JSON.stringify(v)); idbSet(SPAREMAAL_KEY,v); }
function loadNotes()     { try { return JSON.parse(localStorage.getItem(NOTES_KEY)||'{}'); } catch { return {}; } }
function saveNotes(n)    { localStorage.setItem(NOTES_KEY, JSON.stringify(n)); idbSet(NOTES_KEY, n); }
function loadSplits()    { try { return JSON.parse(localStorage.getItem(SPLIT_KEY)||'{}'); } catch { return {}; } }
function saveSplits(s)   { localStorage.setItem(SPLIT_KEY, JSON.stringify(s)); idbSet(SPLIT_KEY, s); }

// ── Utility ──────────────────────────────────────────────────────
function txId(tx)       { return tx.dato+'|'+tx.beskr+'|'+tx.ut+'|'+tx.inn; }
function getMonthKey(d) { const p = d.split('.'); return p[2] + '-' + p[1]; }
function mergeNewTxs(existing, incoming) {
  const inMonths = [...new Set(incoming.map(t => getMonthKey(t.dato)))];
  return [...existing.filter(t => !inMonths.includes(getMonthKey(t.dato))), ...incoming];
}
const pd  = d => { const [dd,mm,yyyy] = d.split('.'); return new Date(+yyyy, +mm-1, +dd); };
const fmt = n => Math.round(Math.abs(n)).toLocaleString('nb-NO') + ' kr';
const parseAmountInput = v => {
  if (v == null) return null;
  const cleaned = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
function getTotalManualAssets() {
  const goals = loadSparemaal();
  const visible = getVisibleBuckets();
  const visibleIds = new Set(visible.map(b => b.id));
  let sum = 0, count = 0;
  for (const [bid, val] of Object.entries(goals)) {
    if (!visibleIds.has(bid)) continue;
    if (!val || typeof val !== 'object') continue;
    if (typeof val.balance === 'number' && Number.isFinite(val.balance)) {
      sum += val.balance;
      count++;
    }
  }
  return { sum, count };
}

function showToast(msg, duration = 2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Dark mode ───────────────────────────────────────────────────
function applyDarkMode(dark) {
  document.body.classList.toggle('dark', dark);
  const btn = document.getElementById('darkModeToggle');
  if (btn) btn.textContent = dark ? '☀️ Bytt tema' : '🌙 Bytt tema';
}
function toggleDarkMode() {
  const dark = !document.body.classList.contains('dark');
  localStorage.setItem(DARK_KEY, dark ? '1' : '0');
  applyDarkMode(dark);
}

// ── State ────────────────────────────────────────────────────────
let allClassified    = [];
let activeMonthFilter = null;
let activeYear        = null;
let currentTab        = localStorage.getItem('okonomi_current_tab') || 'oversikt';

function getFiltered() {
  if (activeMonthFilter) return allClassified.filter(t => getMonthKey(t.dato) === activeMonthFilter);
  if (activeYear)        return allClassified.filter(t => t.dato.split('.')[2] === activeYear);
  return allClassified;
}
