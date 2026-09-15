/* ================================================================
   Icons – switchable icon system (Emoji / Lucide / Tabler)
   All SVG paths bundled inline — zero external dependencies.
   Persists user choice in localStorage.
================================================================ */

const ICON_PACK_KEY = 'okonomi_icon_pack';
const ICON_PACKS = ['emoji', 'lucide', 'tabler'];
const ICON_PACK_LABELS = { emoji: 'Emoji', lucide: 'Lucide', tabler: 'Tabler' };

function getIconPack() { return localStorage.getItem(ICON_PACK_KEY) || 'emoji'; }
function setIconPack(pack) {
  if (!ICON_PACKS.includes(pack)) return;
  localStorage.setItem(ICON_PACK_KEY, pack);
  applyNavIcons();
  applyStaticIcons();
  // Re-render the picker itself so active state updates
  const pickerWrap = document.getElementById('iconPackPickerWrap');
  if (pickerWrap) { pickerWrap.innerHTML = renderIconPackPicker(); wireIconPackPicker(pickerWrap); }
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof applyDarkMode === 'function') applyDarkMode(document.body.classList.contains('dark'));
  if (typeof rerenderCurrentTab === 'function') rerenderCurrentTab();
}

/** Apply current icon pack to all sidebar nav items */
function applyNavIcons() {
  document.querySelectorAll('.nav-item, .nav-group-head').forEach(nav => {
    const tab = nav.dataset.tab;
    const span = nav.querySelector('.ni-emoji');
    if (span && tab) span.innerHTML = icon(tab);
  });
}

/** Apply current icon pack to static chrome icons outside the nav (topbar, upload screen) */
function applyStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, { size: 14 });
  });
  const uploadIcon = document.getElementById('uploadIconWrap');
  if (uploadIcon) uploadIcon.innerHTML = icon('upload', { size: 32 });
}

// ── Inline SVG paths (Lucide-style, 24x24 viewBox, stroke) ──────
// Only the icons we actually use — keeps the file small.
const SVG_PATHS = {
  // Navigation
  'bar-chart-3':    'M3 3v18h18 M7 16v-3 M12 16V8 M17 16v-6',
  'tags':           'M9 5H2v7l7 7 7-7V5h-7z M14 5l7 7-7 7',
  'list':           'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  'piggy-bank':     'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8.5 3.4 1.3 4.6L8 19h2l1-2h6l1 2h2l-1.7-2.4c.9-1.2 1.4-2.8 1.4-4.6 0-.8-.1-1.5-.3-2.2.5-.3 1-.8 1.2-1.3L22 8l-3-3z M2 9v2c0 1.1.9 2 2 2h1',
  'money-bag':      'M9.5 3h5a1.5 1.5 0 011.5 1.5A3.5 3.5 0 0112.5 8h-1A3.5 3.5 0 018 4.5 1.5 1.5 0 019.5 3z M4 17v-1a8 8 0 1116 0v1a4 4 0 01-4 4H8a4 4 0 01-4-4z M12 11v6 M10.5 12.5h2.2a1.3 1.3 0 010 2.6h-1.4a1.3 1.3 0 000 2.6h2.2',
  'calculator':     'M4 2a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V4a2 2 0 00-2-2H4zM8 10V6 M6 8h4 M14 7h4 M6 14h4 M14 14h4 M6 18h4 M14 18h4',
  'calendar-days':  'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01',
  'lightbulb':      'M9 18h6 M10 22h4 M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z',
  'target':         'M12 12m-1 0a1 1 0 102 0 1 1 0 10-2 0 M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0 M12 12m-9 0a9 9 0 1018 0 9 9 0 10-18 0',
  'users':          'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M22 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75',
  'calendar':       'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  // Actions
  'settings':       'M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z M12 15a3 3 0 100-6 3 3 0 000 6z',
  'plus':           'M5 12h14 M12 5v14',
  'upload':         'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  'download':       'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  'trash-2':        'M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2 M10 11v6 M14 11v6',
  'x':              'M18 6L6 18 M6 6l12 12',
  'search':         'M11 3a8 8 0 100 16 8 8 0 000-16z M21 21l-4.35-4.35',
  'pencil':         'M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z',
  'save':           'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8 M7 3v5h8',
  // Categories
  'shopping-cart':   'M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6 M9 22a1 1 0 100-2 1 1 0 000 2z M20 22a1 1 0 100-2 1 1 0 000 2z',
  'fuel':           'M3 22V5a2 2 0 012-2h8a2 2 0 012 2v17 M13 10h2a2 2 0 012 2v3a1.5 1.5 0 003 0V8l-4-4',
  'smartphone':     'M5 2h14a2 2 0 012 2v16a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2z M12 18h.01',
  'dumbbell':       'M6.5 6.5L17.5 17.5 M21 21L20 20 M3 3L4 4 M18 22L22 18 M2 6L6 2 M3 10L10 3 M14 21L21 14',
  'pill':           'M10.5 1.5L3 9a4.95 4.95 0 007 7l7.5-7.5a4.95 4.95 0 00-7-7z M9 9l6 6',
  'shopping-bag':   'M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0',
  'utensils':       'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2 M7 2v20 M21 15V2v0a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
  'tag':            'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z M7 7h.01',
  'credit-card':    'M1 4h22v16H1z M1 10h22',
  'landmark':       'M3 22h18 M6 18v-7 M10 18v-7 M14 18v-7 M18 18v-7 M2 11l10-7 10 7',
  'briefcase':      'M2 7a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V7z M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16',
  // Finance
  'wallet':         'M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a1 1 0 100 2 1 1 0 000-2z',
  'trending-down':  'M22 17l-8.5-8.5-5 5L2 7 M16 17h6v-6',
  'graduation-cap': 'M22 10L12 5 2 10l10 5 10-5z M22 10v5 M6 12.2V16c0 1.1 2.7 3 6 3s6-1.9 6-3v-3.8',
  'trending-up':    'M22 7l-8.5 8.5-5-5L2 17 M16 7h6v6',
  // Savings buckets
  'home':           'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
  'shield':         'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'coins':          'M8 12m-6 0a6 6 0 1012 0 6 6 0 10-12 0 M16 8a6 6 0 110 8',
  'sprout':         'M7 20h10 M10 20c5.5-2.5.8-6.4 3-10 M12 10c-2.2 3.6-2.5 7.5 0 10 M9.7 9.7c-1 .5-3.7-.4-5.3 1.3 M14.3 9.7c1 .5 3.7-.4 5.3 1.3',
  // Misc
  'moon':           'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  'sun':            'M12 12m-5 0a5 5 0 1010 0 5 5 0 10-10 0 M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  'trophy':         'M6 9H4.5a2.5 2.5 0 010-5H6 M18 9h1.5a2.5 2.5 0 000-5H18 M4 22h16 M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22 M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22 M18 2H6v7a6 6 0 0012 0V2z',
  'medal':          'M12 17a5 5 0 100-10 5 5 0 000 10z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  'award':          'M12 15a7 7 0 100-14 7 7 0 000 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  'check':          'M20 6L9 17l-5-5',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01',
  'arrow-up':       'M12 19V5 M5 12l7-7 7 7',
  'arrow-down':     'M12 5v14 M19 12l-7 7-7-7',
  'arrow-right':    'M5 12h14 M12 5l7 7-7 7',
  'split':          'M16 3h5v5 M8 3H3v5 M12 22v-8.3a4 4 0 00-1.172-2.872L3 3 M15 9l6-6',
  'user':           'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z',
  'repeat':         'M17 2l4 4-4 4 M3 11V9a4 4 0 014-4h14 M7 22l-4-4 4-4 M21 13v2a4 4 0 01-4 4H3',
  'corner-up-left': 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 015.5 5.5 5.5 5.5 0 01-5.5 5.5H11',
  'umbrella':       'M22 12a10 10 0 10-20 0z M12 12v8a2 2 0 004 0',
  'plane':          'M17.8 19.2L16 11l3.5-3.5c1.5-1.5 2-3.5 1.5-4.5-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1.5 3 1 1 3 1.5-1v-3l3-2 4.5 4.5c.3.4.9.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z',
  'arrows-lr':      'M8 3L4 7l4 4 M4 7h16 M16 21l4-4-4-4 M20 17H4',
  'car':            'M19 17h2v-6l-2-5H5L3 11v6h2 M5 17a2 2 0 104 0 2 2 0 00-4 0z M15 17a2 2 0 104 0 2 2 0 00-4 0z M3 11h18',
  'smile':          'M12 2a10 10 0 100 20 10 10 0 000-20z M8 14s1.5 2 4 2 4-2 4-2 M9 9v.01 M15 9v.01',
  'party-popper':   'M5.8 14.3 2 22l7.7-3.8 M4 8V6a2 2 0 012-2h1 M17.5 3.5a2.5 2.5 0 010 5 M9.5 8.5a2.5 2.5 0 010 5 M6 12l4-4 6 6-4 4z M14 3v.01 M20 10v.01 M18.5 16v.01',
  'maximize':       'M8 3H5a2 2 0 00-2 2v3 M16 3h3a2 2 0 012 2v3 M21 16v3a2 2 0 01-2 2h-3 M3 16v3a2 2 0 002 2h3',
  'minimize':       'M8 3v3a2 2 0 01-2 2H3 M21 8h-3a2 2 0 01-2-2V3 M3 16h3a2 2 0 012 2v3 M16 21v-3a2 2 0 012-2h3',
};

// SVG rendering styles per pack
const SVG_STYLE = {
  lucide: { strokeWidth: 1.5, linecap: 'round', linejoin: 'round' },
  tabler: { strokeWidth: 2,   linecap: 'round', linejoin: 'round' },
};
// Build SVG string from path data
function _svg(pathD, size, pack) {
  const s = SVG_STYLE[pack] || SVG_STYLE.lucide;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${s.strokeWidth}" stroke-linecap="${s.linecap}" stroke-linejoin="${s.linejoin}" style="display:inline-block;vertical-align:middle">${pathD.split(' M').map((seg, i) => '<path d="' + (i === 0 ? seg : 'M' + seg) + '"/>').join('')}</svg>`;
}

// ── Icon map: name -> { emoji, svg key } ─────────────────────────
const ICON_MAP = {
  // Navigation
  'oversikt':       { emoji: '📊', svg: 'bar-chart-3' },
  'kategorier':     { emoji: '🏷️', svg: 'tags' },
  'transaksjoner':  { emoji: '📋', svg: 'list' },
  'sparing':        { emoji: '🏦', svg: 'piggy-bank' },
  'kalkulator':     { emoji: '🧮', svg: 'calculator' },
  'lonn':           { emoji: '💰', svg: 'money-bag' },
  'lonnskalk':      { emoji: '💰', svg: 'money-bag' },
  'skatt':          { emoji: '📈', svg: 'landmark' },
  'uker':           { emoji: '📆', svg: 'calendar-days' },
  'innsikt':        { emoji: '💡', svg: 'lightbulb' },
  'budsjett':       { emoji: '🎯', svg: 'target' },
  'folk':           { emoji: '👥', svg: 'users' },
  'maaneder':       { emoji: '📅', svg: 'calendar' },
  'verktoy':        { emoji: '🧰', svg: 'settings' },
  // Actions
  'settings':       { emoji: '⚙',  svg: 'settings' },
  'add':            { emoji: '+',  svg: 'plus' },
  'upload':         { emoji: '📂', svg: 'upload' },
  'download':       { emoji: '⬇',  svg: 'download' },
  'import':         { emoji: '↑',  svg: 'upload' },
  'delete':         { emoji: '×',  svg: 'trash-2' },
  'close':          { emoji: '×',  svg: 'x' },
  'search':         { emoji: '🔍', svg: 'search' },
  'note':           { emoji: '📝', svg: 'pencil' },
  'split':          { emoji: '½',  svg: 'split' },
  'save':           { emoji: '💾', svg: 'save' },
  // Categories
  'mat':            { emoji: '🛒', svg: 'shopping-cart' },
  'transport':      { emoji: '⛽', svg: 'fuel' },
  'abo':            { emoji: '📱', svg: 'smartphone' },
  'trening':        { emoji: '🏋️', svg: 'dumbbell' },
  'helse':          { emoji: '💊', svg: 'pill' },
  'shopping':       { emoji: '🛍️', svg: 'shopping-bag' },
  'spiseute':       { emoji: '🍽️', svg: 'utensils' },
  'reselling':      { emoji: '🏷️', svg: 'tag' },
  'kredittkort':    { emoji: '💳', svg: 'credit-card' },
  'bankgebyr':      { emoji: '🏛️', svg: 'landmark' },
  'diverse':        { emoji: '💼', svg: 'briefcase' },
  // Finance
  'income':         { emoji: '💰', svg: 'wallet' },
  'studielan':      { emoji: '🎓', svg: 'graduation-cap' },
  'savings':        { emoji: '🏦', svg: 'piggy-bank' },
  'expense':        { emoji: '💸', svg: 'trending-down' },
  // Savings buckets
  'vekstfond':      { emoji: '🌱', svg: 'sprout' },
  'annet':          { emoji: '🏦', svg: 'landmark' },
  // Misc
  'dark':           { emoji: '🌙', svg: 'moon' },
  'light':          { emoji: '☀️', svg: 'sun' },
  'maximize':       { emoji: '⛶',  svg: 'maximize' },
  'minimize':       { emoji: '⛶',  svg: 'minimize' },
  'medal1':         { emoji: '🥇', svg: 'trophy' },
  'medal2':         { emoji: '🥈', svg: 'medal' },
  'medal3':         { emoji: '🥉', svg: 'award' },
  'check':          { emoji: '✓',  svg: 'check' },
  'warning':        { emoji: '⚠️', svg: 'alert-triangle' },
  'arrow-up':       { emoji: '↑',  svg: 'arrow-up' },
  'arrow-down':     { emoji: '↓',  svg: 'arrow-down' },
  'arrow-right':    { emoji: '→',  svg: 'arrow-right' },
  // Transaction kinds / misc entities
  'person':         { emoji: '👤', svg: 'user' },
  'internal':       { emoji: '🔄', svg: 'repeat' },
  'withdrawal':     { emoji: '↩️', svg: 'corner-up-left' },
  // Budget: default savings goals
  'bsu':            { emoji: '🏠', svg: 'home' },
  'krisefond':      { emoji: '🛡️', svg: 'shield' },
  'shortterm':      { emoji: '💰', svg: 'wallet' },
  'nordnet':        { emoji: '📈', svg: 'trending-up' },
  // Verktøy calculators
  'feriepenger':    { emoji: '🏖️', svg: 'umbrella' },
  'valuta':         { emoji: '💱', svg: 'arrows-lr' },
  'reise':          { emoji: '✈️', svg: 'plane' },
  'abonnement':     { emoji: '💳', svg: 'credit-card' },
  'empty-bucket':   { emoji: '🪣', svg: 'piggy-bank' },
  // Sparing bucket presets
  'bil':            { emoji: '🚗', svg: 'car' },
  'pensjon':        { emoji: '👴', svg: 'user' },
  'pick-icon':      { emoji: '😀', svg: 'smile' },
  'goal-reached':   { emoji: '🎉', svg: 'party-popper' },
};

/**
 * Get an icon by name.
 * Emoji pack: returns emoji string.
 * Lucide/Tabler pack: returns inline <svg> — no external deps needed.
 */
function icon(name, opts = {}) {
  const pack = opts.pack || getIconPack();
  const entry = ICON_MAP[name];
  if (!entry) return name;
  if (pack === 'emoji') return entry.emoji;
  const size = opts.size || 18;
  const pathD = SVG_PATHS[entry.svg];
  if (!pathD) return entry.emoji;
  return _svg(pathD, size, pack);
}

/** No-op — icons are inline SVG, no post-render step needed */
function refreshIcons() {}

/** Render icon pack picker for settings UI */
function renderIconPackPicker() {
  const current = getIconPack();
  // Show a preview icon for each pack
  const p = {
    emoji:  icon('oversikt', { pack: 'emoji' }),
    lucide: icon('oversikt', { pack: 'lucide', size: 16 }),
    tabler: icon('oversikt', { pack: 'tabler', size: 16 }),
  };
  return `
    <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Ikonpakke</div>
    <div style="display:flex;gap:6px">
      ${ICON_PACKS.map(pk => `
        <button class="icon-pack-btn${pk === current ? ' active' : ''}" data-pack="${pk}"
          style="padding:5px 12px;border-radius:6px;border:1px solid ${pk === current ? 'var(--green-accent)' : 'var(--border)'};
          background:${pk === current ? 'var(--green-accent)' : 'var(--card-bg)'};
          color:${pk === current ? '#fff' : 'var(--text)'};font-size:12px;cursor:pointer;font-weight:${pk === current ? '600' : '400'};
          display:flex;align-items:center;gap:5px">
          <span>${p[pk]}</span> ${ICON_PACK_LABELS[pk]}
        </button>
      `).join('')}
    </div>`;
}

/** Wire icon pack picker buttons */
function wireIconPackPicker(container) {
  container.querySelectorAll('.icon-pack-btn').forEach(btn => {
    btn.addEventListener('click', () => setIconPack(btn.dataset.pack));
  });
}

// ── Patch CATS & SPARING_BUCKETS to use dynamic icons ────────────
// Replaces the static .emoji property with a getter so cat.emoji
// automatically returns icon(cat.id) using the active icon pack.
// This means zero changes needed in any tab renderer.
(function patchIconGetters() {
  function patchList(list) {
    for (const item of list) {
      const fallback = item.emoji;
      Object.defineProperty(item, 'emoji', {
        get() { return icon(item.id, { size: 16 }) || fallback; },
        configurable: true,
      });
    }
  }
  if (typeof CATS !== 'undefined') patchList(CATS);
  if (typeof SPARING_BUCKETS_ALL !== 'undefined') patchList(SPARING_BUCKETS_ALL);
})();

// ── Emoji picker ──────────────────────────────────────────────────
// Full searchable emoji grid (data in emoji-data.js) for the free-text
// emoji fields (Sparing's "Ny bøtte", Budsjett's "Legg til kategori") —
// a stand-in for the OS emoji picker (ctrl+cmd+space) for people who
// can't invoke it. Renders inline into `slotEl` (part of the modal's own
// scroll flow, right under the field it belongs to) instead of a
// position:fixed popover — that used to end up detached at the bottom
// of the screen when the field sat low in a tall/scrolled modal.
// Browsable by category when empty, filtered to a flat grid while
// typing — same shape as the native picker's search.
function openEmojiPicker(slotEl, anchorEl, onSelect) {
  if (slotEl.firstChild) { slotEl.querySelector('.ep-search')?.focus(); return; }

  const box = document.createElement('div');
  box.style.cssText = 'margin-top:6px;border:1px solid var(--border);border-radius:10px;'
    + 'background:var(--input-bg);display:flex;flex-direction:column;max-height:220px;overflow:hidden;'
    + 'animation:confirmPop 0.15s cubic-bezier(.34,1.56,.64,1)';
  box.innerHTML = `
    <div style="padding:8px 8px 6px;flex-shrink:0">
      <input type="text" class="ep-search" placeholder="Søk emoji…" autocomplete="off"
        style="width:100%;padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--card-bg);color:var(--text);outline:none;box-sizing:border-box">
    </div>
    <div class="ep-grid" style="overflow-y:auto;padding:0 8px 8px;flex:1"></div>`;
  slotEl.appendChild(box);
  box.scrollIntoView({ block: 'nearest' });

  const grid = box.querySelector('.ep-grid');
  const search = box.querySelector('.ep-search');

  const emojiBtnHtml = e => `<button class="emoji-pick-btn" data-emoji="${e}" style="width:32px;height:32px;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;background:none;border:none;border-radius:7px;cursor:pointer">${e}</button>`;

  function wireButtons() {
    grid.querySelectorAll('.emoji-pick-btn').forEach(btn => {
      btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--chip-bg)'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
      btn.addEventListener('click', () => { onSelect(btn.dataset.emoji); close(); });
    });
  }

  function renderAll() {
    grid.innerHTML = EMOJI_FULL_DATA.map(group => `
      <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.4px;text-transform:uppercase;margin:8px 0 4px">${group.cat}</div>
      <div style="display:flex;flex-wrap:wrap;gap:2px">${group.items.map(it => emojiBtnHtml(it[0])).join('')}</div>`).join('');
    wireButtons();
  }

  function renderFiltered(query) {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const matches = [];
    for (const group of EMOJI_FULL_DATA) {
      for (const item of group.items) {
        const hay = item[1];
        if (words.every(w => hay.includes(w))) matches.push(item[0]);
      }
    }
    grid.innerHTML = matches.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:6px">${matches.map(emojiBtnHtml).join('')}</div>`
      : `<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:24px 0">Ingen treff</div>`;
    wireButtons();
  }

  renderAll();
  search.addEventListener('input', () => {
    const q = search.value;
    if (!q.trim()) renderAll(); else renderFiltered(q);
  });
  setTimeout(() => search.focus(), 20);

  function outsideClick(e) { if (!slotEl.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) close(); }
  function escHandler(e) { if (e.key === 'Escape') close(); }
  function close() {
    slotEl.innerHTML = '';
    document.removeEventListener('mousedown', outsideClick, true);
    document.removeEventListener('keydown', escHandler);
  }
  // Deferred so the click that opened this picker doesn't immediately close it.
  setTimeout(() => document.addEventListener('mousedown', outsideClick, true), 0);
  document.addEventListener('keydown', escHandler);
}
