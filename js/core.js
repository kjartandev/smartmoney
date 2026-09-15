/* ================================================================
   Økonomi – core.js
   Storage keys, categories, savings buckets, IDB fallback,
   load/save helpers, utility functions, classify, CSV parser.
================================================================ */

// ── Browser back/forward for in-app navigation ─────────────────────
/* Lets the browser's real Back/Forward (and trackpad swipe) walk through
   this single-page app's own views — tab switches, the slide panel, confirm
   dialogs — instead of leaving the page or doing nothing.

   Each opened "layer" pushes one history entry recording its depth. depth
   is the source of truth: on any popstate the currently-open layers are
   reconciled up or down to match wherever the browser actually landed —
   closing what's above, rebuilding what's below.

   One shared listener, not one per binding — layers can nest (a confirm
   dialog on top of the current tab), and a listener each would mean a
   dialog releasing its own entry also fires a popstate its parent hears
   and reacts to. */

/* The browser normally remembers a scroll position per history entry and
   restores it on its own. Wrong here — "entries" are just re-renders of the
   same page, not real documents — so without this, the browser's own
   restore fights any scroll position the app already put back itself, and
   usually wins: the page jumps to the top for no reason on unrelated
   actions. */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const BACK_STACK   = [];   // layers open right now; index === depth - 1
const BACK_ARCHIVE = [];   // every layer by depth, so forward can rebuild one
let BACK_PENDING    = 0;   // programmatic pops still to be swallowed
let BACK_RESTORING  = false;
let BACK_AFTER_UNWIND = null;   // callback waiting on an unwindLayers() to land

window.addEventListener('popstate', () => {
  // A pop we caused ourselves, tidying up after a layer that closed by some
  // other route (its own ✕, Escape, a click outside). Not a user gesture,
  // and the layer is already gone — swallow it and leave the stack alone.
  if (BACK_PENDING > 0) { BACK_PENDING--; return; }

  const target = (history.state && typeof history.state.depth === 'number') ? history.state.depth : 0;

  // Went back — close everything above the entry we landed on.
  while (BACK_STACK.length > target) {
    const layer = BACK_STACK.pop();
    layer.closed = true;                  // so its own cleanup does not pop again
    if (layer.el.isConnected) layer.onBack();
  }

  // Went forward — rebuild what the browser just returned to.
  while (BACK_STACK.length < target) {
    const at    = BACK_STACK.length;
    const layer = BACK_ARCHIVE[at];
    if (!layer || !layer.reopen) break;   // nothing to restore it with
    BACK_RESTORING = true;
    try { layer.reopen(); } finally { BACK_RESTORING = false; }
    if (BACK_STACK.length === at) break;  // reopen did not re-bind; do not spin
  }

  // An unwind finished — do whatever was waiting on it (see unwindLayers).
  if (BACK_AFTER_UNWIND) {
    const then = BACK_AFTER_UNWIND;
    BACK_AFTER_UNWIND = null;
    then();
  }
});

/* Close whatever is drilled into on top of the current tab, then run `then`.
   Used before a nav click walks away to a different tab. Without it, a
   modal/panel's entry would sit below the new tab's entry, and a later Back
   press would land on a view no longer on screen — looks like it does
   nothing.

   Only the trailing non-'nav' layers are closed; the 'nav' layers beneath
   are the tab history itself.

   history.go() is asynchronous, so `then` cannot just run on the next line —
   it waits for the popstate above to land, via BACK_AFTER_UNWIND. One go(-n)
   fires a single popstate, and the reconciliation loop closes all n layers
   at once. */
function unwindLayers(then) {
  let n = 0;
  for (let i = BACK_STACK.length - 1; i >= 0 && BACK_STACK[i].kind !== 'nav'; i--) n++;
  if (!n) { then(); return; }
  BACK_AFTER_UNWIND = then;
  history.go(-n);
}

/* Call every time a layer opens (a tab switch, a modal, a slide panel).
   Returns a cleanup() function — call it when the layer closes through any
   route OTHER than the back gesture (its own ✕, click outside, Escape); it
   consumes the history entry via history.back(), so entries never pile up
   for things closed some other way.

   onBack runs when the browser's back gesture is what closed this layer —
   never both onBack and cleanup() for the same close.

   reopen (optional) lets a forward press rebuild the layer if the user had
   gone back past it. Omit it for anything you'd never want silently
   reappearing, like a confirm dialog.

   kind is a free-form tag ('nav' for a tab switch vs. everything drilled
   into from one) — used by unwindLayers to tell them apart. */
function bindBackNav(el, onBack, reopen, kind) {
  const depth = BACK_STACK.length + 1;
  const layer = { el, onBack, reopen, kind, closed: false };
  BACK_STACK.push(layer);
  BACK_ARCHIVE[depth - 1] = layer;

  // While restoring, the browser has already moved to this entry: pushing
  // would add a second one and strand the forward history, and truncating
  // the archive would throw away layers a further forward press still has
  // to rebuild. Both are only right for a genuinely new branch.
  if (!BACK_RESTORING) {
    BACK_ARCHIVE.length = depth;          // a new branch drops any forward entries
    history.pushState({ depth }, '');
  }

  return function cleanup() {
    const i = BACK_STACK.indexOf(layer);
    if (i === -1) return;                 // already gone
    BACK_STACK.splice(i, 1);
    if (layer.closed) return;             // the gesture already consumed the entry
    BACK_PENDING++;
    history.back();
  };
}

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
// Studielån/stipend fra Lånekassen bokføres av banken med Type = "Lønn", akkurat
// som vanlig lønn. Uten denne listen ville støtten blitt talt som inntekt.
const STUDIELAN_KW = ['lånekasse','lanekasse','lånekassen','statens lånekasse','utdanningsstøtte','utdanningsstotte'];
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
    ...custom.map(c => ({ id: c.id, label: c.label, emoji: c.emoji, iconId: c.iconId, emojiLocked: c.emojiLocked, color: c.color || '#6366f1', kw: [], isCustom: true }))
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
  // Sjekkes før lønn-regelen: banken merker også Lånekassen som "Lønn".
  if (tx.inn > 0 && STUDIELAN_KW.some(w => k.includes(w))) return 'studielan';
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
// ── Studielån ────────────────────────────────────────────────────
// The loan is a running total across the whole history — never scoped to the
// active month filter, and never mixed into income (see classify()).
const STUDIELAN_KEY = 'okonomi_studielan_v1';
function loadStudielanState() {
  try {
    const v = JSON.parse(localStorage.getItem(STUDIELAN_KEY) || '{}');
    return {
      prior:    Number.isFinite(+v.prior) ? +v.prior : 0,   // lån tatt opp før appen
      // Utbetalinger før denne datoen teller ikke — støtte fra videregående var
      // stipend, ikke lån, og skal ikke ligge i lånesummen. ISO 'YYYY-MM-DD'.
      fromDate: typeof v.fromDate === 'string' ? v.fromDate : '',
    };
  } catch { return { prior: 0, fromDate: '' }; }
}
function saveStudielanState(v) { localStorage.setItem(STUDIELAN_KEY, JSON.stringify(v)); idbSet(STUDIELAN_KEY, v); }

function studielanPayouts() {
  const src = (typeof allClassified !== 'undefined' && allClassified.length)
    ? allClassified
    : loadStored().map(t => ({ ...t, cat: classify(t) }));
  const from = loadStudielanState().fromDate;
  const fromT = from ? new Date(from + 'T00:00:00').getTime() : null;
  return src
    .filter(t => t.cat === 'studielan' && t.inn > 0)
    .filter(t => !fromT || pd(t.dato).getTime() >= fromT)
    .sort((a,b) => pd(a.dato) - pd(b.dato));
}
/** Everything borrowed and counted (payouts from the start date on, plus any
    loan taken before the app was tracking it). */
function studielanTotal() {
  return loadStudielanState().prior + studielanPayouts().reduce((s,t) => s + t.inn, 0);
}

/** Buckets the user has marked as funded with loan money — {b, bal, funded}. */
function studielanFundedBuckets() {
  const saved = loadSparemaal();
  return getVisibleBuckets()
    .map(b => ({ b, bal: (typeof saved[b.id]?.balance === 'number' ? saved[b.id].balance : 0),
                    funded: (typeof saved[b.id]?.loanFunded === 'number' ? saved[b.id].loanFunded : 0),
                    own:    (typeof saved[b.id]?.ownFunded  === 'number' ? saved[b.id].ownFunded  : 0) }))
    .filter(x => x.funded > 0);
}

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

// ── Fun: falling money + cha-ching, for a positive quick-add ──────
function celebrateMoneyAdd() {
  playCoinSound();   // fire first — the 140-element DOM loop below takes a moment
  const emojis = ['💵','💰','🤑','💸'];
  const count = 140;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    const left     = Math.random() * 100;
    const duration = 1.3 + Math.random() * 0.9;
    const delay    = Math.random() * 3;   // spread across ~3s so it rains instead of bursting
    const size     = 48 + Math.random() * 40;
    const drift    = Math.round(Math.random() * 80 - 40);
    el.style.cssText = `position:fixed;top:-140px;left:${left}vw;font-size:${size}px;z-index:99999;pointer-events:none;--drift:${drift}px;animation:moneyFall ${duration}s ease-in ${delay}s forwards`;
    document.body.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), (duration + delay + 0.5) * 1000); // fallback if animationend never fires
  }
}

// ── Fun: screen shake + red flash + hit sound, for a withdrawal ──
function shockMoneyLoss() {
  playHitSound();

  document.body.classList.remove('shake-effect');
  void document.body.offsetWidth;   // restart the animation if triggered again quickly
  document.body.classList.add('shake-effect');
  setTimeout(() => document.body.classList.remove('shake-effect'), 400);

  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(239,68,68,0.35);pointer-events:none;animation:redFlash 0.4s ease-out forwards';
  document.body.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove());
  setTimeout(() => flash.remove(), 500);
}

// Pre-created (not per-call) so the browser has it decoded and ready — same
// reasoning as _coinAudio below.
const _hitAudio = new Audio('mp4/hit.MP3');
_hitAudio.preload = 'auto';
function playHitSound() {
  try {
    _hitAudio.currentTime = 0;
    _hitAudio.play().catch(() => {});
  } catch {}
}

// Lightens (positive percent) or darkens (negative) a "#rrggbb" color —
// used to build the gold gradient's highlight/shadow stops per particle.
function shadeColor(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const r = Math.max(0, Math.min(255, (num >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

// A brief warm gold flash across the whole screen — the "pop" moment before
// the confetti/money take over. Plain DOM + CSS transition since it's a
// one-shot fade, not something that needs per-frame control.
function flashScreenGold() {
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;inset:0;z-index:99998;pointer-events:none;
    background:rgba(255,210,90,0.65);
    opacity:1;transition:opacity 0.6s ease-out;`;
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = '0'; });
  setTimeout(() => flash.remove(), 700);
}

// Celebration-only bill denominations — bolder/more numerous than the
// ambient loading-screen rain (which stays locked to the plain $1 look).
const CELEBRATION_DENOMS = [10, 20, 100];

// A big "Mål nådd!" banner over the confetti — DOM, not canvas, since it's one
// static (if bouncy) element, not something that needs per-frame physics.
function showGoalReachedBanner(bucketLabel) {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position:fixed;top:18%;left:50%;transform:translate(-50%,0);z-index:100000;
    pointer-events:none;text-align:center;
    animation:goalBannerPop 0.5s cubic-bezier(.34,1.56,.64,1), goalBannerOut 0.4s ease-in 3.1s forwards;`;
  banner.innerHTML = `
    <div style="display:inline-flex;align-items:center;gap:12px;background:rgba(20,20,20,0.82);backdrop-filter:blur(6px);color:#fff;padding:16px 28px;border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,0.4);border:1px solid rgba(255,215,90,0.4)">
      <span style="color:#ffd75a;display:flex">${typeof icon === 'function' ? icon('goal-reached', { size: 30 }) : '🎉'}</span>
      <span style="font-size:20px;font-weight:800;letter-spacing:-0.2px">Mål nådd!${bucketLabel ? ' <span style="color:#ffd75a">' + bucketLabel + '</span>' : ''}</span>
    </div>`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 3600);
}

// ── Fun: real physics confetti + fireworks + fanfare, for reaching a sparemål ─
/* Canvas-based, not CSS keyframes — each piece gets its own gravity, sway and
   spin simulated per frame (requestAnimationFrame), so no two pieces ever
   move identically. This is the "raining down" celebration only; it replaces
   the normal money-rain for the add that crosses the goal, it never plays
   alongside it — a distinct sound (playFanfareSound) marks the difference too.
   A screen flash and banner kick it off, then gold confetti, diamonds, cash,
   and rising firework shells that burst into color all run together. */
function celebrateGoalReached(bucketLabel) {
  playConfettiSound();
  flashScreenGold();
  showGoalReachedBanner(bucketLabel);

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const colors = ['#D4AF37','#C9A227','#E6C351','#B8860B','#F1C232'];
  const FIREWORK_COLORS = ['#ff5e5e','#5ec8ff','#8dff5e','#ff5ec8','#ffd75a','#c05eff'];
  const GRAVITY = 380; // px/s²
  const SPAWN_MS = 4500;
  // Concurrent-count ceilings — without these, a high spawn rate can let the
  // live particle count run away (each is redrawn, gradient and all, every
  // single frame), which is what was freezing the tab on the last "way more
  // confetti" pass. Once a ceiling is hit, spawning just pauses until pieces
  // fall off-screen and make room — the burst still reads as dense.
  const MAX_PARTICLES = 260;
  const MAX_GEMS = 90;
  const MAX_BILLS = 130;
  const MAX_SPARKS = 600; // bigger, more frequent bursts need more headroom
  const particles = [];
  const gems = [];
  const bills = [];
  const shells = [];
  const sparks = [];
  const startTime = performance.now();
  let lastTime = startTime;
  let spawnAcc = 0;
  let gemAcc = 0;
  let billAcc = 0;
  let fireworkAcc = 0;

  function spawnParticle() {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 40,
      vy: 60 + Math.random() * 60,
      rot: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 6,
      w: 6 + Math.random() * 6,
      h: 10 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 1.5 + Math.random() * 1.5,
      swayAmp: 30 + Math.random() * 40,
    });
  }

  // Sparkling diamonds mixed into the fall — same edge-on "catches the
  // light" trick as the gold foil, just an icy white/blue palette and a
  // faceted rhombus silhouette instead of a flat rectangle.
  function spawnGem() {
    gems.push({
      x: Math.random() * canvas.width,
      y: -20,
      vx: (Math.random() - 0.5) * 40,
      vy: 50 + Math.random() * 55,
      rot: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * 6,
      w: 9 + Math.random() * 7,
      h: 12 + Math.random() * 8,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 1.2 + Math.random() * 1.3,
      swayAmp: 25 + Math.random() * 35,
    });
  }

  // Cash bills falling alongside the gold confetti — reuses the same
  // hand-drawn note/bundle art as the loading-screen money rain in main.js,
  // just at full opacity, $10/$20/$100 denominations, and a much heavier
  // spawn rate since this is the "way more money" celebration burst.
  function spawnBill() {
    const isBundle = Math.random() < 0.3;
    const w = 32 + Math.random() * 16;
    bills.push({
      x: Math.random() * canvas.width,
      y: -40,
      vx: (Math.random() - 0.5) * 50,
      vy: 90 + Math.random() * 70,
      rot: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * (isBundle ? 1 : 2),
      w, h: w * 0.44,
      denom: CELEBRATION_DENOMS[Math.floor(Math.random() * CELEBRATION_DENOMS.length)],
      isBundle,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 1 + Math.random() * 1.2,
      swayAmp: 25 + Math.random() * 30,
    });
  }

  // A shell launched from near the bottom that rises, decelerating under
  // gravity, then bursts into `sparks` at its own chosen apex — a real flight
  // rather than a timer, so taller/shorter launches still burst exactly at
  // the top of their own arc.
  function spawnShell() {
    const x = canvas.width * (0.15 + Math.random() * 0.7);
    const targetY = canvas.height * (0.15 + Math.random() * 0.3);
    const y = canvas.height + 10;
    // Apex velocity from the same projectile-motion formula as the cork used
    // to use: v² = 2·g·Δh, so it always tops out right at targetY.
    const vy = -Math.sqrt(2 * GRAVITY * (y - targetY));
    shells.push({ x, y, vy, color: FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)], trail: [] });
  }

  function burstShell(shell) {
    // A real firework shell is a mix of two or three colors, not one flat
    // hue — pick a small palette per burst (biased toward the shell's own
    // launch color so trail → burst still reads as one connected event).
    const paletteSize = 2 + Math.floor(Math.random() * 2); // 2-3 colors
    const palette = [shell.color];
    while (palette.length < paletteSize) {
      const c = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
      if (!palette.includes(c)) palette.push(c);
    }
    const count = 60 + Math.floor(Math.random() * 30); // bigger, denser burst
    for (let i = 0; i < count; i++) {
      if (sparks.length >= MAX_SPARKS) break;
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.15;
      const speed = 130 + Math.random() * 210; // bigger radius
      sparks.push({
        x: shell.x, y: shell.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 2.6 + Math.random() * 1.8, // bigger sparks
        life: 0,
        maxLife: 0.8 + Math.random() * 0.6,
      });
    }
  }

  function frame(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    const elapsed = now - startTime;

    if (elapsed < SPAWN_MS) {
      spawnAcc += dt;
      const spawnRate = 240; // gold confetti/sec — "way more" per feedback
      while (spawnAcc > 1 / spawnRate) {
        if (particles.length < MAX_PARTICLES) spawnParticle();
        spawnAcc -= 1 / spawnRate;
      }

      gemAcc += dt;
      const gemRate = 18; // gems/sec
      while (gemAcc > 1 / gemRate) {
        if (gems.length < MAX_GEMS) spawnGem();
        gemAcc -= 1 / gemRate;
      }

      billAcc += dt;
      const billRate = 45; // bills/sec — "way more money"
      while (billAcc > 1 / billRate) {
        if (bills.length < MAX_BILLS) spawnBill();
        billAcc -= 1 / billRate;
      }

      fireworkAcc += dt;
      const fireworkRate = 3.2; // shells/sec — "more fireworks" per feedback
      while (fireworkAcc > 1 / fireworkRate) {
        if (shells.length < 6) spawnShell();
        fireworkAcc -= 1 / fireworkRate;
      }
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = bills.length - 1; i >= 0; i--) {
      const p = bills[i];
      p.vy += GRAVITY * dt;
      p.swayPhase += p.swaySpeed * dt;
      p.x += p.vx * dt + Math.sin(p.swayPhase) * p.swayAmp * dt;
      p.y += p.vy * dt;
      p.rot += p.angVel * dt;

      if (p.y > canvas.height + 40) { bills.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const flip = Math.max(0.12, Math.abs(Math.cos(p.rot)));
      if (p.isBundle) drawBillBundle(ctx, p.w, p.h, p.denom, flip);
      else drawBillNote(ctx, p.w, p.h, p.denom, flip);
      ctx.restore();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      // Spray droplets: their own quick physics + fade, no foil rendering.
      if (p.spray) {
        p.vy += GRAVITY * 1.4 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life += dt;
        if (p.life > p.maxLife) { particles.splice(i, 1); continue; }
        const alpha = 1 - p.life / p.maxLife;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,248,225,${alpha})`;
        ctx.fill();
        continue;
      }

      p.vy += GRAVITY * dt;
      p.swayPhase += p.swaySpeed * dt;
      p.x += p.vx * dt + Math.sin(p.swayPhase) * p.swayAmp * dt;
      p.y += p.vy * dt;
      p.rot += p.angVel * dt;

      if (p.y > canvas.height + 30) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // Width narrows toward the rotation's edge-on point — a 2D trick that
      // reads as a flat piece of paper flipping in the air as it falls.
      const flip = Math.max(0.15, Math.abs(Math.cos(p.rot)));
      const w = p.w * flip;
      // Metallic foil look: a highlight band down the middle of the piece,
      // darker toward the edges — brighter still right as it flips edge-on,
      // which mimics how real gold foil catches a flash of light mid-spin.
      // Three flat fillRects, not a gradient — ctx.createLinearGradient() per
      // particle per frame is the same class of cost as shadowBlur was, and
      // at up to 260 of these alive at once it was the other big piece of
      // the freeze/lag.
      const edgeOn = flip < 0.35;
      ctx.fillStyle = shadeColor(p.color, edgeOn ? 70 : 30);
      ctx.fillRect(-w / 2, -p.h / 2, w, p.h);
      const bandW = w * 0.28;
      ctx.fillStyle = shadeColor(p.color, -35);
      ctx.fillRect(-w / 2, -p.h / 2, bandW, p.h);
      ctx.fillRect(w / 2 - bandW, -p.h / 2, bandW, p.h);
      if (edgeOn) {
        ctx.fillStyle = `rgba(255,255,255,${(0.35 - flip) * 1.8})`;
        ctx.fillRect(-w / 2, -p.h / 2, w, p.h);
      }
      ctx.strokeStyle = shadeColor(p.color, -50);
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-w / 2, -p.h / 2, w, p.h);
      ctx.restore();
    }

    // Diamonds — faceted rhombus shape with the same edge-on light-catching
    // trick as the gold foil, just an icy white/blue palette so they read as
    // gemstones rather than more confetti.
    for (let i = gems.length - 1; i >= 0; i--) {
      const p = gems[i];
      p.vy += GRAVITY * dt;
      p.swayPhase += p.swaySpeed * dt;
      p.x += p.vx * dt + Math.sin(p.swayPhase) * p.swayAmp * dt;
      p.y += p.vy * dt;
      p.rot += p.angVel * dt;

      if (p.y > canvas.height + 30) { gems.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const flip = Math.max(0.15, Math.abs(Math.cos(p.rot)));
      const w = p.w * flip;
      const edgeOn = flip < 0.35;
      ctx.beginPath();
      ctx.moveTo(0, -p.h / 2);
      ctx.lineTo(w / 2, 0);
      ctx.lineTo(0, p.h / 2);
      ctx.lineTo(-w / 2, 0);
      ctx.closePath();
      // Flat blue base + a smaller light facet on top, not a gradient — same
      // reasoning as the confetti foil above (still reads as a faceted gem:
      // blue rim, light center, brighter still when edge-on).
      ctx.fillStyle = '#8fc6e8';
      ctx.fill();
      ctx.strokeStyle = '#5f9ec2';
      ctx.lineWidth = 0.6;
      ctx.stroke();      // stroke the outer rim now, while it's still the current path
      ctx.beginPath();
      ctx.moveTo(0, -p.h * 0.25);
      ctx.lineTo(w * 0.25, 0);
      ctx.lineTo(0, p.h * 0.25);
      ctx.lineTo(-w * 0.25, 0);
      ctx.closePath();
      ctx.fillStyle = edgeOn ? '#ffffff' : '#eaf7ff';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -p.h / 2); ctx.lineTo(0, p.h / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      if (edgeOn) {
        ctx.fillStyle = `rgba(255,255,255,${(0.35 - flip) * 2.2})`;
        ctx.fill();
      }
      ctx.restore();
    }

    // Firework shells — real rockets now: a short history of past positions
    // drawn as a tapering, fading tail behind a glowing white-hot head, not
    // just a single line segment redrawn each frame. 'lighter' compositing
    // makes overlapping trail segments and the head add brightness instead of
    // just alpha-blending, which is what makes real fireworks read as
    // glowing against the dark sky rather than flat colored shapes.
    const TRAIL_LEN = 14;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = shells.length - 1; i >= 0; i--) {
      const s = shells[i];
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > TRAIL_LEN) s.trail.shift();
      s.vy += GRAVITY * dt;
      s.y += s.vy * dt;
      if (s.vy >= 0) {              // apex reached — was still rising last frame, isn't now
        burstShell(s);
        shells.splice(i, 1);
        continue;
      }
      for (let t = 1; t < s.trail.length; t++) {
        const age = t / s.trail.length;         // 0 near the tail, 1 at the head
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = age * 0.8;
        ctx.lineWidth = 1 + age * 2.5;
        ctx.beginPath();
        ctx.moveTo(s.trail[t - 1].x, s.trail[t - 1].y);
        ctx.lineTo(s.trail[t].x, s.trail[t].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // White-hot head with a cheap glow: a bigger, dim colored disc under a
      // small bright core, both additive (`lighter`) — not ctx.shadowBlur,
      // which is a real per-call software blur and far too slow at this
      // particle count (that was the source of the lag/freeze).
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff8e6';
      ctx.fill();
    }

    // Firework bursts — radiating sparks with real gravity (they arc, not
    // just fly straight and fade), an alpha fade over their lifetime, and the
    // same cheap two-layer glow (dim wide disc + bright core) as the rocket
    // head so a dense cluster blooms brighter at its center like a real burst,
    // without the per-particle cost of ctx.shadowBlur.
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.vy += GRAVITY * 0.5 * dt;   // lighter than confetti's gravity — sparks hang a beat longer
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
      if (p.life > p.maxLife) { sparks.splice(i, 1); continue; }
      const alpha = 1 - p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha * 0.4;
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      // A tiny bright-white core on top of the color — real spark embers are
      // white-hot at the center, colored only at the fading edge.
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    if (elapsed < SPAWN_MS || particles.length > 0 || gems.length > 0 || bills.length > 0 || shells.length > 0 || sparks.length > 0)
      requestAnimationFrame(frame);
    else
      canvas.remove();
  }
  requestAnimationFrame(frame);
}

// Pre-created (not per-call) so the browser has it decoded and ready — avoids
// a first-play fetch/decode lag between the click and the sound.
const _confettiAudio = new Audio('mp4/confetti.MP3');
_confettiAudio.preload = 'auto';
function playConfettiSound() {
  try {
    _confettiAudio.currentTime = 0;
    _confettiAudio.play().catch(() => {});
  } catch {}
}

const _coinAudio = new Audio('mp4/0809.MP3');
_coinAudio.preload = 'auto';
function playCoinSound() {
  try {
    _coinAudio.currentTime = 0;
    _coinAudio.play().catch(() => {});
  } catch {}
}

// ── Confirm dialog (in-app, replaces browser confirm()) ───────────
function showConfirmDialog(message, onConfirm, opts = {}) {
  const title        = opts.title        || 'Er du sikker?';
  const confirmLabel = opts.confirmLabel || 'Slett';
  const cancelLabel  = opts.cancelLabel  || 'Avbryt';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:confirmFadeIn 0.15s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg);color:var(--text);border-radius:18px;padding:26px 24px 22px;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit;text-align:center;animation:confirmPop 0.22s cubic-bezier(.34,1.56,.64,1)';
  box.innerHTML = `
    <div style="width:52px;height:52px;border-radius:50%;background:rgba(239,68,68,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px;color:#ef4444">${icon('delete', { size: 24 })}</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:8px">${title}</div>
    <div style="font-size:13px;line-height:1.55;color:var(--text-muted);margin-bottom:22px">${message}</div>
    <div style="display:flex;gap:8px">
      <button id="confirmCancelBtn" style="flex:1;padding:10px 16px;border-radius:10px;border:1px solid var(--border);background:none;color:var(--text);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background 0.15s">${cancelLabel}</button>
      <button id="confirmOkBtn" style="flex:1;padding:10px 16px;border-radius:10px;border:none;background:#ef4444;color:#fff;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background 0.15s;box-shadow:0 4px 14px rgba(239,68,68,0.35)">${confirmLabel}</button>
    </div>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  const cancelBtn = box.querySelector('#confirmCancelBtn');
  const okBtn = box.querySelector('#confirmOkBtn');
  cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = 'var(--chip-bg)'; });
  cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = 'none'; });
  okBtn.addEventListener('mouseenter', () => { okBtn.style.background = '#dc2626'; });
  okBtn.addEventListener('mouseleave', () => { okBtn.style.background = '#ef4444'; });

  // Dismissing is always the safe half of a confirm, so a back gesture
  // cancels — it can never be the thing that confirms.
  let backNav = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (backNav) { const c = backNav; backNav = null; c(); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  cancelBtn.addEventListener('click', close);
  okBtn.addEventListener('click', () => { close(); onConfirm(); });
  const escHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  backNav = bindBackNav(overlay, close);
  okBtn.focus();
}

// ── Dark mode ───────────────────────────────────────────────────
function applyDarkMode(dark) {
  document.body.classList.toggle('dark', dark);
  const btn = document.getElementById('darkModeToggle');
  if (!btn) return;
  const iconSpan = btn.querySelector('.ti-icon');
  const iconName = dark ? 'light' : 'dark';
  if (iconSpan) {
    iconSpan.dataset.icon = iconName;
    iconSpan.innerHTML = typeof icon === 'function' ? icon(iconName, { size: 14 }) : (dark ? '☀️' : '🌙');
  } else {
    btn.textContent = dark ? '☀️ Bytt tema' : '🌙 Bytt tema';
  }
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
