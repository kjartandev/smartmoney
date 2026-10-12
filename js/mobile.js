/* ════════════════════════════════════════════════════════════════════
   Mobile shell — header, segmented sub-nav, month sheet

   Desktop keeps the green topbar and the 210px sidebar it has always had.
   At phone width both are out of the way (css/responsive.css) and this
   builds the shell in their place:

     ┌──────────────────────────────────────────┐
     │  Oversikt             [Okt 2026 ⌄]  [⚙] │  #mobileHeader
     │  ╭──────────┬─────────╮                 │   · title  = section
     │  │ Oversikt │ Innsikt │                 │   · segmented control =
     │  ╰──────────┴─────────╯                 │     the pages in it
     ├──────────────────────────────────────────┤
     │  content                                 │
     ├──────────────────────────────────────────┤
     │  Oversikt    Lønn    Trans.    Verktøy   │  .sidebar as a tab bar
     └──────────────────────────────────────────┘

   What this replaces, and why:
   - The brand row (logo + "SmartMoney" + period). An app does not show you
     its own name on every screen — the home-screen icon already did that.
     The space goes to the one thing that does change: where you are.
   - The ‹ Måned › row. It was a permanent row on every tab, including the
     ones that ignore the month filter entirely. Now it is a chip in the
     header, only on the tabs that actually filter by month, and it opens a
     picker so any month is one tap away instead of one tap per month.
   - The sibling-pill strip. Pills read as filters, not navigation; a
     segmented control is unambiguously "pick which of these views".

   The nav structure itself is still read straight out of the sidebar markup
   in index.html, so adding a tab there remains a one-place edit.
════════════════════════════════════════════════════════════════════ */

const MOBILE_MQ = window.matchMedia('(max-width: 768px)');
function isMobileShell() { return MOBILE_MQ.matches; }

/* Tabs whose content is filtered by the active month — i.e. the ones that
   read getFiltered() (js/core.js). Every other tab (Lønn, Skatt, Budsjett,
   Innsikt, Måneder, Verktøy) ignores it, so a month chip there would
   promise a filter that does nothing. */
const MONTH_AWARE_TABS = new Set(['oversikt', 'transaksjoner', 'sparing', 'folk', 'uker']);

/* Sidebar labels are written for a 210px column. A segmented control gives
   each page about a quarter of a phone's width, so the longest names get a
   shorter one here. Only the names that differ need an entry — the rest
   come from the sidebar as-is. */
const MOBILE_SEG_LABELS = {
  transaksjoner: 'Alle',
  folk:          'Privat',
  uker:          'Uker',
  lonnskalk:     'Lønn',
};

/* Track padding in .mh-seg (css/responsive.css) — the thumb is inset by it
   on every side, so its travel is measured from the same origin. */
const SEG_PAD = 3;

function navLabelOf(el) {
  return el?.querySelector('.nav-label')?.textContent.trim() || '';
}

/* The section a tab belongs to: its title (the group's own name) and every
   page in it, in sidebar order. A standalone .nav-item outside any group
   (Verktøy) is a section of one — no segmented control. */
function mobileSection(tab) {
  const el = document.querySelector(`.nav-group-head[data-tab="${tab}"]`)
          || document.querySelector(`.nav-item[data-tab="${tab}"]`);
  if (!el) return null;
  const group = el.closest('.nav-group');
  if (!group) return { title: navLabelOf(el), pages: [{ tab, label: navLabelOf(el) }] };

  const head  = group.querySelector('.nav-group-head');
  const items = [head, ...group.querySelectorAll('.nav-item.nav-sub')];
  return {
    title: navLabelOf(head),
    pages: items.map(i => ({
      tab:   i.dataset.tab,
      label: MOBILE_SEG_LABELS[i.dataset.tab] || navLabelOf(i),
    })),
  };
}

function activeMonthLabel() {
  if (!activeMonthFilter) return 'Hele ' + (activeYear || new Date().getFullYear());
  const [y, m] = activeMonthFilter.split('-').map(Number);
  return monthsShort[m - 1] + ' ' + y;
}

// ── Header ───────────────────────────────────────────────────────
function buildMobileHeader() {
  const hdr = document.createElement('header');
  hdr.id = 'mobileHeader';
  hdr.innerHTML = `
    <div class="mh-row">
      <h1 class="mh-title">—</h1>
      <div class="mh-actions">
        <button class="mh-month" id="mhMonthBtn" type="button" aria-label="Velg måned">
          <span class="mh-month-label">—</span><span class="mh-chev" aria-hidden="true">⌄</span>
        </button>
        <button class="mh-icon" id="mhToolsBtn" type="button" aria-label="Verktøy"></button>
      </div>
    </div>
    <div class="mh-seg" id="mhSeg" role="tablist" hidden></div>`;

  const body = document.querySelector('.app-body');
  body.parentNode.insertBefore(hdr, body);

  hdr.querySelector('#mhMonthBtn').addEventListener('click', e => {
    e.stopPropagation();
    openMonthSheet();
  });

  /* Toggles the same #toolsMenu the desktop Verktøy button does (it becomes
     a bottom sheet at this width, css/responsive.css) rather than owning a
     second copy of that menu. stopPropagation because the document-level
     listener that closes the menu on an outside tap (js/main.js) would
     otherwise see this very click and shut it again immediately. */
  hdr.querySelector('#mhToolsBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('toolsMenu').classList.toggle('open');
  });

  hdr.querySelector('#mhSeg').addEventListener('click', e => {
    const btn = e.target.closest('.mh-seg-btn');
    if (btn && btn.dataset.tab !== currentTab) navigateToTab(btn.dataset.tab);
  });

  /* Hairline under the header only once content has actually scrolled under
     it. At rest the header and the page read as one surface, which is what
     stops it looking like a website banner. */
  const content = document.getElementById('mainContent');
  if (content) {
    content.addEventListener('scroll', () => {
      hdr.classList.toggle('scrolled', content.scrollTop > 4);
    }, { passive: true });
  }
  return hdr;
}

/* Called on every tab change (setActiveNav) and every month change
   (renderSidebarChart). Cheap enough to just re-run wholesale — the only
   part rebuilt from scratch is the segmented control, and only when the
   section itself changed, so the thumb can slide between siblings instead
   of being thrown away and re-created mid-animation. */
function renderMobileHeader() {
  const section = mobileSection(currentTab);
  if (!section) return;                    // boot, before a tab is resolved
  const hdr = document.getElementById('mobileHeader') || buildMobileHeader();

  hdr.querySelector('.mh-title').textContent = section.title;
  hdr.querySelector('#mhToolsBtn').innerHTML = icon('settings', { size: 19 });

  const monthBtn = hdr.querySelector('#mhMonthBtn');
  monthBtn.hidden = !MONTH_AWARE_TABS.has(currentTab);
  monthBtn.querySelector('.mh-month-label').textContent = activeMonthLabel();

  const seg = hdr.querySelector('#mhSeg');
  if (section.pages.length < 2) {
    seg.hidden = true;
    seg.dataset.section = '';
    return;
  }

  const sig = section.pages.map(p => p.tab).join(',');
  const rebuilt = seg.dataset.section !== sig;
  if (rebuilt) {
    seg.dataset.section = sig;
    seg.innerHTML = '<div class="mh-seg-thumb" aria-hidden="true"></div>'
      + section.pages.map(p =>
          `<button class="mh-seg-btn" type="button" role="tab" data-tab="${p.tab}">${p.label}</button>`
        ).join('');
  }
  seg.hidden = false;
  seg.querySelectorAll('.mh-seg-btn').forEach(b => {
    const on = b.dataset.tab === currentTab;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  // A fresh track has no previous position to slide from — place it silently.
  if (rebuilt) requestAnimationFrame(() => moveSegThumb(seg, false));
  else moveSegThumb(seg, true);
}

function moveSegThumb(seg, animate) {
  const thumb  = seg.querySelector('.mh-seg-thumb');
  const active = seg.querySelector('.mh-seg-btn.active');
  // offsetWidth is 0 while the header is display:none (desktop width) —
  // nothing to measure, and the next render at phone width redoes it.
  if (!thumb || !active || !active.offsetWidth) return;
  if (!animate) thumb.style.transition = 'none';
  thumb.style.width     = active.offsetWidth + 'px';
  thumb.style.transform = `translateX(${active.offsetLeft - SEG_PAD}px)`;
  if (!animate) requestAnimationFrame(() => { thumb.style.transition = ''; });
}

// ── Month sheet ──────────────────────────────────────────────────
let monthSheetBackNav = null;
let monthSheetYear    = null;   // year being browsed, not yet committed

function buildMonthSheet() {
  const overlay = document.createElement('div');
  overlay.id = 'monthSheetOverlay';
  overlay.addEventListener('click', closeMonthSheet);

  const sheet = document.createElement('div');
  sheet.id = 'monthSheet';
  sheet.innerHTML = `
    <div class="ms-grab" aria-hidden="true"></div>
    <div class="ms-head"><h2>Velg måned</h2></div>
    <div class="ms-years" id="msYears"></div>
    <div class="ms-grid" id="msGrid"></div>
    <button class="ms-all" id="msAll" type="button"></button>`;

  document.body.append(overlay, sheet);
  return sheet;
}

/* The same twelve cells as the desktop sidebar chart, reusing its own
   .month-cell markup so the two stay identical in both themes — just laid
   out four across with tap-sized padding instead of three across. */
function renderMonthSheet() {
  const months = getMonthlyTotals();
  const years  = [...new Set(months.map(m => m.year))].sort();
  if (!monthSheetYear || !years.includes(monthSheetYear)) {
    monthSheetYear = (activeYear && years.includes(activeYear))
      ? activeYear
      : years[years.length - 1] || String(new Date().getFullYear());
  }

  const yearsEl = document.getElementById('msYears');
  yearsEl.hidden = years.length < 2;
  yearsEl.innerHTML = years.map(y =>
    `<button class="ms-year${y === monthSheetYear ? ' active' : ''}" type="button" data-year="${y}">${y}</button>`
  ).join('');
  yearsEl.querySelectorAll('.ms-year').forEach(btn => {
    btn.addEventListener('click', () => { monthSheetYear = btn.dataset.year; renderMonthSheet(); });
  });

  const inYear = {};
  months.filter(m => m.year === monthSheetYear).forEach(m => inYear[m.month] = m);
  const maxVal = Math.max(...Object.values(inYear).flatMap(m => [m.income, m.expenses]), 1);
  const scale  = v => v > 0 ? Math.max(3, Math.pow(v / maxVal, 0.6) * 22) : 2;

  const grid = document.getElementById('msGrid');
  grid.innerHTML = '';
  for (let mo = 1; mo <= 12; mo++) {
    const m    = inYear[mo];
    const key  = monthSheetYear + '-' + String(mo).padStart(2, '0');
    const cell = document.createElement('button');
    cell.type      = 'button';
    cell.className = 'month-cell' + (key === activeMonthFilter ? ' active' : '') + (!m ? ' no-data' : '');
    cell.innerHTML = `<div class="mc-label">${monthsShort[mo - 1]}</div>
      <div class="mc-bars">
        <div class="mc-bar income" style="height:${m ? scale(m.income) : 2}px"></div>
        <div class="mc-bar expense" style="height:${m ? scale(m.expenses) : 2}px"></div>
      </div>`;
    if (m) cell.addEventListener('click', () => applyMonthSelection(key, monthSheetYear));
    grid.appendChild(cell);
  }

  /* Desktop reaches the whole-year view by clicking the active month off in
     the sidebar chart; on a phone there was no way to get to it at all. */
  const all = document.getElementById('msAll');
  all.textContent = 'Hele ' + monthSheetYear;
  all.classList.toggle('active', !activeMonthFilter && activeYear === monthSheetYear);
  all.onclick = () => applyMonthSelection(null, monthSheetYear);
}

function applyMonthSelection(key, year) {
  activeMonthFilter = key;
  if (year) activeYear = String(year);
  renderSidebarChart();      // also re-renders this header's month chip
  updateTopbar();
  rerenderCurrentTab();
  closeMonthSheet();
}

function openMonthSheet() {
  const sheet = document.getElementById('monthSheet') || buildMonthSheet();
  monthSheetYear = null;     // reopen on whatever month is live now
  renderMonthSheet();
  sheet.classList.add('open');
  document.getElementById('monthSheetOverlay').classList.add('open');
  monthSheetBackNav = bindBackNav(sheet, closeMonthSheet, openMonthSheet, 'sheet');
}

function closeMonthSheet() {
  document.getElementById('monthSheet')?.classList.remove('open');
  document.getElementById('monthSheetOverlay')?.classList.remove('open');
  if (monthSheetBackNav) { const c = monthSheetBackNav; monthSheetBackNav = null; c(); }
}

// ── Keep the shell in step with the viewport ─────────────────────
/* Crossing the breakpoint (rotating a phone, resizing a desktop window)
   means the header was last measured at a width that no longer applies. */
MOBILE_MQ.addEventListener('change', () => renderMobileHeader());

let _segResizeTimer = null;
window.addEventListener('resize', () => {
  if (!isMobileShell()) return;
  clearTimeout(_segResizeTimer);
  _segResizeTimer = setTimeout(() => {
    const seg = document.getElementById('mhSeg');
    if (seg && !seg.hidden) moveSegThumb(seg, false);
  }, 120);
});
