// ── Sidebar chart ────────────────────────────────────────────────
function renderSidebarChart() {
  const monthly = {};
  for (const tx of allClassified) {
    const key  = getMonthKey(tx.dato);
    const year = tx.dato.split('.')[2];
    if (!monthly[key]) monthly[key] = { key, year, month: +tx.dato.split('.')[1], income: 0, expenses: 0 };
    if (tx.cat === 'income') monthly[key].income += tx.inn;
    else if (!['income','studielan','savings','internal','transfer_in'].includes(tx.cat) && tx.ut > 0) monthly[key].expenses += tx.ut;
  }
  const allMonths = Object.values(monthly).sort((a,b) => a.key.localeCompare(b.key));
  const years     = [...new Set(allMonths.map(m => m.year))].sort();
  if (!activeYear || !years.includes(activeYear)) activeYear = years[years.length - 1];

  const wrap    = document.getElementById('yearDropdownWrap');
  const trigger = document.getElementById('yearTrigger');
  const menu    = document.getElementById('yearMenu');
  const labelEl = document.getElementById('yearLabel');
  if (wrap) {
    wrap.style.display = years.length > 1 ? 'block' : 'none';
    if (labelEl) labelEl.textContent = activeYear;
    if (menu) {
      menu.innerHTML = years.map(y =>
        `<div class="year-option${y === activeYear ? ' active' : ''}" data-year="${y}">${y}</div>`
      ).join('');
      menu.querySelectorAll('.year-option').forEach(opt => {
        opt.addEventListener('click', () => {
          activeYear = opt.dataset.year;
          const ym = allMonths.filter(m => m.year === activeYear);
          if (ym.length && (!activeMonthFilter || !ym.find(m => m.key === activeMonthFilter)))
            activeMonthFilter = ym[ym.length - 1].key;
          menu.classList.remove('open');
          trigger.classList.remove('open');
          renderSidebarChart(); updateTopbar(); rerenderCurrentTab();
        });
      });
    }
    if (trigger) {
      trigger.onclick = e => {
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        menu.classList.toggle('open', !isOpen);
        trigger.classList.toggle('open', !isOpen);
      };
    }
  }

  const grid = document.getElementById('sidebarBarChart');
  grid.innerHTML = '';
  const yearData = {};
  allMonths.filter(m => m.year === activeYear).forEach(m => yearData[m.month] = m);
  const maxVal = Math.max(...Object.values(yearData).flatMap(m => [m.income, m.expenses]), 1);

  for (let mo = 1; mo <= 12; mo++) {
    const m      = yearData[mo];
    const key    = activeYear + '-' + String(mo).padStart(2, '0');
    const isActive = key === activeMonthFilter;
    const cell   = document.createElement('div');
    cell.className = 'month-cell' + (isActive ? ' active' : '') + (!m ? ' no-data' : '');
    const scale  = v => v > 0 ? Math.max(3, Math.pow(v / maxVal, 0.6) * 34) : 2;
    const ih     = m ? scale(m.income)   : 2;
    const eh     = m ? scale(m.expenses) : 2;
    cell.innerHTML = `<div class="mc-label">${monthsShort[mo-1]}</div><div class="mc-bars"><div class="mc-bar income" style="height:${ih}px"></div><div class="mc-bar expense" style="height:${eh}px"></div></div>`;
    if (m) {
      cell.addEventListener('click', () => {
        activeMonthFilter = key;
        renderSidebarChart(); updateTopbar(); rerenderCurrentTab();
      });
    }
    grid.appendChild(cell);
  }
}

// ── Topbar ───────────────────────────────────────────────────────
function updateTopbar() {
  const data       = getFiltered();
  const income     = data.filter(t => t.cat === 'income');
  const savings    = data.filter(t => t.cat === 'savings');
  const expenses   = data.filter(t => !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);
  const withdrawals= data.filter(t => t.cat === 'withdrawal');
  const studielan  = data.filter(t => t.cat === 'studielan');
  const ti  = income.reduce((s,t) => s+t.inn, 0);
  const ts  = savings.reduce((s,t) => s+t.ut, 0);
  const tw  = withdrawals.reduce((s,t) => s+t.inn, 0);
  const te  = expenses.reduce((s,t) => s+t.ut, 0);
  const tsl = studielan.reduce((s,t) => s+t.inn, 0);
  const net = ti - te;
  const tsNetto = ts - tw;
  const assets = getTotalManualAssets();
  const useAssets = assets.count > 0;
  document.getElementById('hdrIncome').textContent   = '+' + fmt(ti);
  document.getElementById('hdrExpenses').textContent = '-' + fmt(te);
  const hdrSavEl = document.getElementById('hdrSavings');
  hdrSavEl.textContent  = (tsNetto >= 0 ? '+' : '-') + fmt(tsNetto);
  hdrSavEl.style.color  = tsNetto >= 0 ? '#7dd3fc' : '#ffb347';
  document.getElementById('hdrNet').textContent      = (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
  document.getElementById('hdrNet').style.color      = net >= 0 ? '#b8f07a' : '#ffb347';
  document.getElementById('hdrIncomeAvg').textContent   = `${income.length} kilde${income.length !== 1 ? 'r' : ''}`
    + (tsl > 0 ? ` · +${fmt(tsl)} studielån` : '');
  document.getElementById('hdrExpensesAvg').textContent = `${expenses.length} transaksjoner`;
  document.getElementById('hdrSavingsAvg').textContent  = withdrawals.length > 0
    ? `${savings.length} inn · ${withdrawals.length} ut`
    : `${savings.length} overføringer`;

  const dates = [...new Set(data.map(t => t.dato))].sort((a,b) => pd(a)-pd(b));
  if (dates.length) {
    const fp = dates[0].split('.'), lp = dates[dates.length-1].split('.');
    document.getElementById('periodLabel').textContent = (fp[1]===lp[1]&&fp[2]===lp[2])
      ? monthsNo[+fp[1]-1]+' '+fp[2]
      : dates[0]+' – '+dates[dates.length-1];
  }
}

// ── Nav ──────────────────────────────────────────────────────────
const NAV_TAB_GROUP = {
  oversikt: 'oversikt', innsikt: 'oversikt',
  lonnskalk: 'okonomi', skatt: 'okonomi', budsjett: 'okonomi', sparing: 'okonomi',
  transaksjoner: 'transaksjoner', folk: 'transaksjoner', maaneder: 'transaksjoner',
  uker: 'transaksjoner',
};
const navOpenGroups = new Set(['oversikt']);

function applyNavGroups() {
  document.querySelectorAll('.nav-group-body').forEach(body => {
    const gid = body.dataset.group;
    const isOpen = navOpenGroups.has(gid);
    body.style.display = isOpen ? 'block' : 'none';
    const head = document.querySelector(`.nav-group-head[data-group="${gid}"]`);
    if (head) { const a = head.querySelector('.navg-arrow'); if (a) a.textContent = isOpen ? '▾' : '▸'; }
  });
}

let lastActiveTab = null;
function setActiveNav(tab) {
  currentTab = tab;
  try { localStorage.setItem('okonomi_current_tab', tab); } catch {}
  document.querySelectorAll('.nav-item, .nav-group-head').forEach(n =>
    n.classList.toggle('active', n.dataset.tab === tab)
  );
  // Only touch group state on an actual navigation (tab change) — not on every
  // re-render of the same tab, so a manual close (e.g. click outside) sticks.
  if (tab !== lastActiveTab) {
    const group = NAV_TAB_GROUP[tab];
    const lastGroup = lastActiveTab ? NAV_TAB_GROUP[lastActiveTab] : null;
    if (group && group !== lastGroup) {
      // Switched to a different group — accordion: close everything else, open only this one
      navOpenGroups.clear();
      navOpenGroups.add(group);
    } else if (group) {
      navOpenGroups.add(group);
    }
  }
  lastActiveTab = tab;
  applyNavGroups();
}
