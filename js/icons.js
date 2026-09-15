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
  // Re-render the picker itself so active state updates
  const pickerWrap = document.getElementById('iconPackPickerWrap');
  if (pickerWrap) { pickerWrap.innerHTML = renderIconPackPicker(); wireIconPackPicker(pickerWrap); }
  if (typeof updateTopbar === 'function') updateTopbar();
  if (typeof rerenderCurrentTab === 'function') rerenderCurrentTab();
}

/** Apply current icon pack to all sidebar nav items */
function applyNavIcons() {
  document.querySelectorAll('.nav-item').forEach(nav => {
    const tab = nav.dataset.tab;
    const span = nav.querySelector('.ni-emoji');
    if (span && tab) span.innerHTML = icon(tab);
  });
}

// ── Inline SVG paths (Lucide-style, 24x24 viewBox, stroke) ──────
// Only the icons we actually use — keeps the file small.
const SVG_PATHS = {
  // Navigation
  'bar-chart-3':    'M3 3v18h18 M7 16v-3 M12 16V8 M17 16v-6',
  'tags':           'M9 5H2v7l7 7 7-7V5h-7z M14 5l7 7-7 7',
  'list':           'M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01',
  'piggy-bank':     'M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8.5 3.4 1.3 4.6L8 19h2l1-2h6l1 2h2l-1.7-2.4c.9-1.2 1.4-2.8 1.4-4.6 0-.8-.1-1.5-.3-2.2.5-.3 1-.8 1.2-1.3L22 8l-3-3z M2 9v2c0 1.1.9 2 2 2h1',
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
  'dumbbell':       'M14.4 14.4L9.6 9.6 M18.7 5.3l-1.4 1.4 M16.6 7.4l4.1-4.1 M19.3 8.7l1.4-1.4 M5.3 18.7l1.4-1.4 M7.4 16.6l-4.1 4.1 M8.7 19.3l-1.4 1.4',
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
  'lonn':           { emoji: '🧮', svg: 'calculator' },
  'lonnskalk':      { emoji: '🧮', svg: 'calculator' },
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
  'savings':        { emoji: '🏦', svg: 'piggy-bank' },
  'expense':        { emoji: '💸', svg: 'trending-down' },
  // Savings buckets
  'vekstfond':      { emoji: '🌱', svg: 'sprout' },
  'annet':          { emoji: '🏦', svg: 'landmark' },
  // Misc
  'dark':           { emoji: '🌙', svg: 'moon' },
  'light':          { emoji: '☀️', svg: 'sun' },
  'medal1':         { emoji: '🥇', svg: 'trophy' },
  'medal2':         { emoji: '🥈', svg: 'medal' },
  'medal3':         { emoji: '🥉', svg: 'award' },
  'check':          { emoji: '✓',  svg: 'check' },
  'warning':        { emoji: '⚠️', svg: 'alert-triangle' },
  'arrow-up':       { emoji: '↑',  svg: 'arrow-up' },
  'arrow-down':     { emoji: '↓',  svg: 'arrow-down' },
  'arrow-right':    { emoji: '→',  svg: 'arrow-right' },
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
