// ── Budsjett ──────────────────────────────────────────────────────
const BUDGET_ACTIVE_CATS_KEY = 'okonomi_budget_active_cats_v1';
const CUSTOM_BUDGET_CATS_KEY = 'okonomi_custom_budget_cats_v1';
const SAVING_IDS = ['bsu','krisefond','shortterm','nordnet'];
// Every built-in category available to budget against — the real spending
// categories the app already classifies transactions into, plus the four
// savings buckets. User-defined categories (see CUSTOM_BUDGET_CATS_KEY) are
// merged on top by budgetAllCats() — same pattern as Sparing's "Ny bøtte".
const BUDGET_BUILTIN_CATS = [
  ...CATS.filter(c => c.id !== 'reselling').map(c => ({ id:c.id, label:c.label, color:c.color })),
  { id:'bsu',       label:'BSU',                   color:'#26a69a' },
  { id:'krisefond', label:'Krisefond',              color:'#ef5350' },
  { id:'shortterm', label:'Short-term savings',     color:'#42a5f5' },
  { id:'nordnet',   label:'Nordnet (fond)',          color:'#66bb6a' },
];
function loadCustomBudgetCats()  { try { return JSON.parse(localStorage.getItem(CUSTOM_BUDGET_CATS_KEY)||'[]'); } catch { return []; } }
function saveCustomBudgetCats(v) { localStorage.setItem(CUSTOM_BUDGET_CATS_KEY, JSON.stringify(v)); }
function budgetAllCats() { return [...BUDGET_BUILTIN_CATS, ...loadCustomBudgetCats()]; }
// Custom cats carry their own emoji (no entry in ICON_MAP), so render through
// this instead of icon(cat.id) directly — mirrors Sparing's resolveBucketIcon.
function budgetCatIcon(cat, size) { return cat.custom ? (cat.emoji || '🏷️') : icon(cat.id,{size}); }
// Every category — built-in or custom — can be dragged between Utgifter and
// Sparing; the choice is stored here per id so it works the same regardless
// of where the category came from. Falls back to SAVING_IDS for built-ins
// (which have real transaction data backing that classification) and to
// Utgifter for anything else never touched.
const BUDGET_GROUP_OVERRIDE_KEY = 'okonomi_budget_cat_group_v1';
function loadBudgetGroupOverrides()  { try { return JSON.parse(localStorage.getItem(BUDGET_GROUP_OVERRIDE_KEY)||'{}'); } catch { return {}; } }
function saveBudgetGroupOverrides(v) { localStorage.setItem(BUDGET_GROUP_OVERRIDE_KEY, JSON.stringify(v)); }
function isCatSaving(cat) {
  const overrides = loadBudgetGroupOverrides();
  if (cat.id in overrides) return overrides[cat.id] === 'saving';
  if (cat.custom && 'saving' in cat) return !!cat.saving; // legacy field from before overrides existed
  return !cat.custom && SAVING_IDS.includes(cat.id);
}
// Drag-and-drop handler for the "Fordel budsjettet" list: sets the dragged
// category's group and its position in one go. targetId anchors the new
// position — inserted right before/after it in the active-cats order (which
// is what BUDGET_CATS renders in) — or appended to the very end when
// targetId is null (dropped on empty space rather than on another row).
function applyCategoryMove(draggedId, targetId, insertAfter, saving) {
  const overrides = loadBudgetGroupOverrides();
  overrides[draggedId] = saving ? 'saving' : 'expense';
  saveBudgetGroupOverrides(overrides);

  const ids = loadActiveBudgetCats().filter(id => id !== draggedId);
  let idx = targetId ? ids.indexOf(targetId) : -1;
  if (idx === -1) idx = ids.length;
  else if (insertAfter) idx += 1;
  ids.splice(idx, 0, draggedId);
  saveActiveBudgetCats(ids);

  renderBudsjett();
}
// Separate axis from Utgifter/Sparing: whether a category is billed monthly
// (subscriptions, gym memberships, etc.) rather than something you'd spend
// week to week — those don't belong in "hva du kan bruke per uke" math.
// Only 'abo' (the built-in Abonnementer category) defaults to monthly; any
// other category (built-in or custom, e.g. a gym or pool subscription) is
// weekly until dragged into "Månedlige utgifter".
const BUDGET_WEEKLY_OVERRIDE_KEY = 'okonomi_budget_cat_weekly_v1';
function loadBudgetWeeklyOverrides()  { try { return JSON.parse(localStorage.getItem(BUDGET_WEEKLY_OVERRIDE_KEY)||'{}'); } catch { return {}; } }
function saveBudgetWeeklyOverrides(v) { localStorage.setItem(BUDGET_WEEKLY_OVERRIDE_KEY, JSON.stringify(v)); }
function isCatMonthly(cat) {
  const overrides = loadBudgetWeeklyOverrides();
  if (cat.id in overrides) return overrides[cat.id] === 'monthly';
  return cat.id === 'abo';
}
function setCatWeekly(catId, monthly) {
  const overrides = loadBudgetWeeklyOverrides();
  overrides[catId] = monthly ? 'monthly' : 'weekly';
  saveBudgetWeeklyOverrides(overrides);
  renderBudsjett();
}
function loadActiveBudgetCats() {
  try {
    const raw = JSON.parse(localStorage.getItem(BUDGET_ACTIVE_CATS_KEY) || 'null');
    if (Array.isArray(raw)) return raw;
  } catch {}
  // First run: default to whatever already has a budget amount set, so
  // nothing existing silently disappears.
  return Object.keys(loadBudgets());
}
function saveActiveBudgetCats(ids) { localStorage.setItem(BUDGET_ACTIVE_CATS_KEY, JSON.stringify(ids)); }

function openAddBudgetCatModal() {
  const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';
  const activeIds = loadActiveBudgetCats();
  const availableCats = budgetAllCats().filter(c => !activeIds.includes(c.id));
  const availUtgifter = availableCats.filter(c => !isCatSaving(c));
  const availSparing  = availableCats.filter(c => isCatSaving(c));
  const selected = new Set();
  const catChips = list => list.map(c=>`<button class="cat-pick-btn" data-cat="${c.id}" style="padding:6px 12px;background:var(--chip-bg);border:1.5px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;color:var(--text)">${budgetCatIcon(c,14)} ${c.label}</button>`).join('');
  const catGroupHtml = (label, list) => list.length ? `
    <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">${label}</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">${catChips(list)}</div>` : '';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:confirmFadeIn 0.15s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg);color:var(--text);border-radius:18px;padding:22px 24px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit;animation:confirmPop 0.22s cubic-bezier(.34,1.56,.64,1)';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700">Legg til kategori</div>
      <button id="addCatCloseBtn" style="padding:2px 8px;font-size:18px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer">×</button>
    </div>
    ${availableCats.length
      ? catGroupHtml('Utgifter', availUtgifter) + catGroupHtml('Sparing', availSparing) +
        `<button id="addCatConfirmBtn" disabled style="width:100%;padding:9px;background:var(--border);color:var(--text-muted);border:none;border-radius:8px;font-size:13px;cursor:not-allowed;font-weight:600;transition:background 0.15s,color 0.15s">Legg til</button>`
      : `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:12px 0">Alle kategorier er allerede lagt til</div>`}
    <div style="border-top:1px solid var(--border);margin:16px 0 14px"></div>
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Egendefinert</div>
    <div style="display:grid;grid-template-columns:60px 1fr;gap:6px;margin-bottom:8px">
      <div style="position:relative">
        <input id="newCatEmoji" type="text" maxlength="4" style="${iSt};text-align:center;font-size:18px">
        <span id="newCatEmojiHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:var(--text-muted)">${icon('pick-icon',{size:18})}</span>
      </div>
      <input id="newCatName" type="text" placeholder="Navn på kategori…" style="${iSt}">
    </div>
    <div id="newCatEmojiPickerSlot"></div>
    <button id="newCatCreateBtn" style="width:100%;padding:7px;background:var(--green-accent);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600">Opprett</button>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let backNav = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (backNav) { const c = backNav; backNav = null; c(); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  box.querySelector('#addCatCloseBtn').addEventListener('click', close);
  const escHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  backNav = bindBackNav(overlay, close);

  const confirmBtn = box.querySelector('#addCatConfirmBtn');
  const updateConfirmBtn = () => {
    if (!confirmBtn) return;
    const n = selected.size;
    confirmBtn.disabled = n === 0;
    confirmBtn.textContent = n > 0 ? `Legg til (${n})` : 'Legg til';
    confirmBtn.style.background = n > 0 ? 'var(--green-accent)' : 'var(--border)';
    confirmBtn.style.color = n > 0 ? '#fff' : 'var(--text-muted)';
    confirmBtn.style.cursor = n > 0 ? 'pointer' : 'not-allowed';
  };

  box.querySelectorAll('.cat-pick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      if (selected.has(cat)) {
        selected.delete(cat);
        btn.style.background = 'var(--chip-bg)';
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--text)';
      } else {
        selected.add(cat);
        btn.style.background = 'var(--green-accent)';
        btn.style.borderColor = 'var(--green-accent)';
        btn.style.color = '#fff';
      }
      updateConfirmBtn();
    });
  });

  confirmBtn?.addEventListener('click', () => {
    if (selected.size === 0) return;
    const ids = loadActiveBudgetCats();
    selected.forEach(id => { if (!ids.includes(id)) ids.push(id); });
    saveActiveBudgetCats(ids);
    close();
    renderBudsjett();
  });

  const newCatEmojiInput = box.querySelector('#newCatEmoji');
  const newCatEmojiHint  = box.querySelector('#newCatEmojiHint');
  const newCatEmojiSlot  = box.querySelector('#newCatEmojiPickerSlot');
  const newCatNameInput  = box.querySelector('#newCatName');
  newCatEmojiInput.addEventListener('input', () => {
    newCatEmojiHint.style.display = newCatEmojiInput.value ? 'none' : 'flex';
  });
  newCatEmojiInput.addEventListener('click', () => {
    openEmojiPicker(newCatEmojiSlot, newCatEmojiInput, emoji => {
      newCatEmojiInput.value = emoji;
      newCatEmojiHint.style.display = 'none';
    });
  });
  const createCustomCat = () => {
    const name = newCatNameInput.value.trim();
    if (!name) { showToast('Skriv inn et navn'); return; }
    const emoji = newCatEmojiInput.value.trim();
    close();
    addCustomBudgetCat(name, emoji);
  };
  box.querySelector('#newCatCreateBtn').addEventListener('click', createCustomCat);
  newCatNameInput.addEventListener('keydown', e => { if (e.key === 'Enter') createCustomCat(); });
}

// Same idea as Sparing's addCustomBucket — a user-typed name/emoji becomes a
// real budget line, added straight to the active category list.
function addCustomBudgetCat(label, emoji) {
  const customCats = loadCustomBudgetCats();
  const id = 'custom_' + Date.now();
  const colorIdx = budgetAllCats().length % BUCKET_COLORS.length;
  customCats.push({ id, label, emoji: emoji || '🏷️', color: BUCKET_COLORS[colorIdx], custom: true });
  saveCustomBudgetCats(customCats);
  const ids = loadActiveBudgetCats();
  ids.push(id);
  saveActiveBudgetCats(ids);
  showToast('Ny kategori opprettet');
  renderBudsjett();
}

function renderBudsjett() {
  setActiveNav('budsjett');
  if (!window._budgetView) window._budgetView = 'plan';

  const allMonthKeys = [...new Set(loadStored().map(t=>getMonthKey(t.dato)))].sort().reverse();
  if (!window._budgetMonth || !allMonthKeys.includes(window._budgetMonth))
    window._budgetMonth = allMonthKeys[0] || null;

  const budgets = loadBudgets();
  const activeCatIds = loadActiveBudgetCats();
  // Order follows activeCatIds (the order categories were added / dragged
  // into), not budgetAllCats()'s fixed built-in-then-custom order — otherwise
  // a custom category could never be dragged above a built-in one.
  const allCatsById = new Map(budgetAllCats().map(c => [c.id, c]));
  const BUDGET_CATS = activeCatIds.map(id => allCatsById.get(id)).filter(Boolean);

  const monthData = (window._budgetView === 'compare' && window._budgetMonth)
    ? allClassified.filter(t => getMonthKey(t.dato) === window._budgetMonth) : [];
  const catSpent = {};
  for (const tx of monthData)
    if (!['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(tx.cat) && tx.ut > 0)
      catSpent[tx.cat] = (catSpent[tx.cat]||0) + tx.ut;

  function netSaving(keyword) {
    const ut  = monthData.filter(t=>t.cat==='savings'&&t.beskr.toLowerCase().includes(keyword)).reduce((s,t)=>s+t.ut,0);
    const inn = monthData.filter(t=>t.cat==='withdrawal'&&t.beskr.toLowerCase().includes(keyword)).reduce((s,t)=>s+t.inn,0);
    return Math.max(0, ut - inn);
  }
  catSpent['bsu']       = netSaving('bsu');
  catSpent['krisefond'] = netSaving('krisefond');
  catSpent['shortterm'] = netSaving('short-term');
  catSpent['nordnet']   = netSaving('trustly') + netSaving('nordnet');

  const totalAllocated = BUDGET_CATS.reduce((s,c)=>s+(budgets[c.id]||0),0);
  const totalSpent     = BUDGET_CATS.reduce((s,c)=>s+(catSpent[c.id]||0),0);
  const actualMonthInc = monthData.filter(t=>t.cat==='income').reduce((s,t)=>s+t.inn,0);
  // Studielån teller ikke som inntekt i statistikken, men det er penger du faktisk
  // kan fordele denne måneden — derfor er det med i budsjettdekningen, tydelig merket.
  const actualMonthSl  = monthData.filter(t=>t.cat==='studielan').reduce((s,t)=>s+t.inn,0);
  const actualMonthAvail = actualMonthInc + actualMonthSl;
  const monthlyInc     = (window._budgetView==='compare' && window._budgetMonth && actualMonthAvail>0) ? actualMonthAvail : loadIncome();
  const unallocated    = monthlyInc - totalAllocated;
  const allocPct       = monthlyInc>0 ? Math.min(totalAllocated/monthlyInc*100,100) : 0;

  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  const modeDiv = document.createElement('div');
  modeDiv.style.cssText = 'display:flex;gap:0;margin-bottom:16px;background:var(--card-bg);border-radius:10px;padding:4px;width:fit-content;border:1px solid var(--border)';
  modeDiv.innerHTML = `
    <button id="modePlan" style="border:none;border-radius:7px;padding:7px 20px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;background:${window._budgetView==='plan'?'#2d6a2d':'transparent'};color:${window._budgetView==='plan'?'#fff':'var(--text-secondary)'}">Planlegg</button>
    <button id="modeCompare" style="border:none;border-radius:7px;padding:7px 20px;font-family:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:all 0.15s;background:${window._budgetView==='compare'?'#2d6a2d':'transparent'};color:${window._budgetView==='compare'?'#fff':'var(--text-secondary)'}">Sammenlign med måned</button>`;
  c.appendChild(modeDiv);

  if (window._budgetView === 'compare') {
    const byYear = {};
    allMonthKeys.forEach(mk => { const y = mk.split('-')[0]; (byYear[y] ||= []).push(mk); });
    const years = Object.keys(byYear).sort().reverse();
    const curMonthKey = window._budgetMonth;
    const curYear = curMonthKey ? curMonthKey.split('-')[0] : (years[0] || '');
    const selSt = 'border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);outline:none;cursor:pointer';

    const monthRow = document.createElement('div');
    monthRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;background:var(--card-bg);border-radius:12px;padding:14px 18px';
    monthRow.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--text-nav);white-space:nowrap">Faktisk forbruk for</div>
      <select id="budgetYearSel" style="${selSt};width:100px">
        ${years.map(y=>`<option value="${y}"${y===curYear?' selected':''}>${y}</option>`).join('')}
      </select>
      <select id="budgetMonthSel" style="${selSt};flex:1">
        <option value="">— velg måned —</option>
        ${(byYear[curYear]||[]).map(mk=>{const p=mk.split('-');return`<option value="${mk}"${mk===curMonthKey?' selected':''}>${monthsNo[+p[1]-1]}</option>`;}).join('')}
      </select>`;
    c.appendChild(monthRow);

    monthRow.querySelector('#budgetYearSel').addEventListener('change', e => {
      const y = e.target.value;
      const first = (byYear[y]||[])[0] || null;
      window._budgetMonth = first;
      renderBudsjett();
    });
  }

  const savedInc = loadIncome();
  const isCompareWithInc = window._budgetView==='compare' && window._budgetMonth;
  const unallocColor = unallocated<0?'#e74c3c':unallocated===0&&monthlyInc>0?'#2d6a2d':'var(--text)';
  const incomeCard = document.createElement('div');
  incomeCard.className = 'card'; incomeCard.style.marginBottom = '16px';

  if (isCompareWithInc) {
    // ── Compare mode: 3 clear metrics ──────────────────────────────
    const gap      = monthlyInc - totalAllocated;
    const gapLabel = gap > 0 ? 'Ledig å fordele' : gap < 0 ? 'Mangler dekning' : 'Helt fordelt';
    const gapColor = gap > 0 ? '#2d6a2d' : gap < 0 ? '#e74c3c' : '#2d6a2d';
    const gapSub   = gap > 0 ? 'inntekt over fordelt budsjett' : gap < 0 ? 'fordelt budsjett over inntekt' : '✓ budsjett og inntekt matcher';
    const catCount = BUDGET_CATS.filter(c => (budgets[c.id]||0) > 0).length;
    incomeCard.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
        <div>
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${actualMonthSl>0?'Tilgjengelig denne måneden':'Inntekt denne måneden'}</div>
          <div style="font-size:22px;font-weight:700;color:#2d6a2d">${actualMonthAvail>0?fmt(actualMonthAvail):(savedInc>0?fmt(savedInc):'—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${actualMonthSl>0?`lønn ${fmt(actualMonthInc)} + studielån ${fmt(actualMonthSl)}`:(actualMonthInc>0?'fra transaksjoner':(savedInc>0?'ingen data — viser forventet':''))}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Totalt fordelt budsjett</div>
          <div style="font-size:22px;font-weight:700;color:var(--text)">${totalAllocated>0?fmt(totalAllocated):'—'}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${catCount>0?catCount+' kategorier budsjettert':'ingen budsjettall satt'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${monthlyInc>0&&totalAllocated>0?gapLabel:'Differanse'}</div>
          <div style="font-size:22px;font-weight:700;color:${monthlyInc>0&&totalAllocated>0?gapColor:'var(--text-muted)'}">${monthlyInc>0&&totalAllocated>0?fmt(Math.abs(gap)):'—'}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${monthlyInc>0&&totalAllocated>0?gapSub:''}</div>
        </div>
      </div>
      ${monthlyInc>0?`<div style="margin-top:14px"><div class="budget-track" style="height:8px"><div class="budget-fill" style="width:${allocPct.toFixed(1)}%;background:${gap<0?'#e74c3c':'#2d6a2d'}"></div></div><div style="font-size:11px;color:var(--text-muted);margin-top:6px;text-align:right">${fmt(totalAllocated)} fordelt av ${fmt(monthlyInc)} · ${allocPct.toFixed(0)}%</div></div>`:''}`;
  } else {
    // ── Plan mode: income input + contextual gap label ──────────────
    const planLabel = unallocated < 0 ? 'Budsjettgap' : unallocated === 0 && monthlyInc > 0 ? 'Helt fordelt' : 'Ledig å fordele';
    incomeCard.innerHTML = `
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Forventet månedsinntekt</div>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="incomeInput" type="number" min="0" step="500" placeholder="25000" value="${savedInc||''}"
              style="border:1.5px solid var(--border);border-radius:10px;padding:10px 14px;font-family:inherit;font-size:20px;font-weight:600;color:#2d6a2d;width:160px;outline:none;background:var(--input-bg)">
            <span style="font-size:14px;color:var(--text-muted);white-space:nowrap">kr / mnd</span>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">${planLabel}</div>
          <div id="unallocatedDisplay" style="font-size:32px;font-weight:700;line-height:1;color:${unallocColor}">${monthlyInc>0?(unallocated<0?'-':'')+fmt(Math.abs(unallocated)):'—'}</div>
          <div id="unallocatedSub" style="font-size:11px;color:var(--text-muted);margin-top:4px">${monthlyInc>0?fmt(totalAllocated)+' fordelt av '+fmt(monthlyInc):''}</div>
          ${monthlyInc>0&&unallocated===0?'<div style="font-size:11px;color:#2d6a2d;font-weight:600;margin-top:4px">✓ Hele inntekten er fordelt</div>':''}
        </div>
      </div>
      ${monthlyInc>0?`<div style="margin-top:14px"><div class="budget-track" style="height:8px"><div class="budget-fill" style="width:${allocPct.toFixed(1)}%;background:${unallocated<0?'#e74c3c':'#2d6a2d'}"></div></div></div>`:''}`;
  }
  c.appendChild(incomeCard);

  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px';
  hd.innerHTML = `<div class="section-head" style="margin:0">Fordel budsjettet</div>
    <div style="display:flex;align-items:center;gap:8px">
      <button id="addBudgetCatBtn" class="sort-btn">+ Legg til kategori</button>
      <button id="resetBudgetBtn" style="background:none;border:1px solid #f5c6cb;color:#c0392b;border-radius:6px;padding:4px 10px;font-family:inherit;font-size:11px;font-weight:500;cursor:pointer;min-height:32px">Nullstill</button>
    </div>`;
  c.appendChild(hd);

  const card = document.createElement('div'); card.className = 'card';
  if (BUDGET_CATS.length === 0) {
    card.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0">Ingen kategorier lagt til enda — klikk «+ Legg til kategori»</div>`;
  }

  // Any category's group can be dragged between the two zones below.
  // Tracked here (not module-level) so it's naturally reset by the next render.
  let draggedCatId = null;

  function buildCatRow(cat, isSaving) {
    const spent  = catSpent[cat.id] || 0;
    const budget = budgets[cat.id]  || 0;
    const pct    = budget>0 ? Math.min((spent/budget)*100,100) : 0;
    const over   = budget>0 && spent>budget;
    const barColor = isSaving ? (over?'#2d6a2d':pct>50?cat.color:'#c5e8a0') : (pct>90?'#e74c3c':pct>70?'#e67e22':cat.color);
    const showActual = window._budgetView==='compare' && window._budgetMonth && budget>0;

    // fmt() already appends "kr" — so the monthly suffix is just "/mnd",
    // not another "kr" (was rendering as "199 kr kr/mnd").
    const amtHtml = val => showActual ? fmt(val) : (val>0 ? `${fmt(val)}<span style="font-weight:400">/mnd</span>` : 'Sett beløp');
    const amtColor = val => val>0 ? (isSaving ? '#7dd3fc' : '#c0392b') : 'var(--text-muted)';

    const row = document.createElement('div'); row.className = 'budget-row';
    row.draggable = true;
    row.style.cursor = 'grab';
    row.innerHTML = `
      <div class="budget-top">
        <div class="budget-name">
          <span class="budget-drag-handle" title="Dra for å flytte mellom Utgifter og Sparing">⠿</span>
          <div class="budget-cat-badge" style="background:${cat.color}33;color:${cat.color}">${budgetCatIcon(cat,16)}</div>
          ${cat.label}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${showActual?`<span style="font-size:12px;font-weight:600;color:${over?(isSaving?'#2d6a2d':'#e74c3c'):'#2d6a2d'}">${fmt(spent)} /</span>`:''}
          <span class="budget-amt-display" style="color:${amtColor(budget)}">${amtHtml(budget)}</span>
          <input class="budget-input" type="number" min="0" step="100" placeholder="kr/mnd" value="${budget||''}" data-cat="${cat.id}" style="width:100px;display:none">
          <button class="rm-budget-cat-btn" data-cat="${cat.id}" title="Fjern kategori" style="padding:2px 7px;font-size:15px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer">×</button>
        </div>
      </div>
      ${showActual?`<div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="budget-status" style="color:${over?(isSaving?'#2d6a2d':'#e74c3c'):'var(--text-muted)'}">
        ${isSaving?(over?'✓ '+fmt(spent-budget)+' over mål — bra!':fmt(budget-spent)+' gjenstår · '+Math.round(pct)+'%'):(over?icon('warning',{size:12})+' '+fmt(spent-budget)+' over budsjett':fmt(budget-spent)+' gjenstår · '+Math.round(pct)+'% brukt')}
      </div>` : ''}`;

    // Amount shows as plain text by default — the input only appears once
    // you click in to edit it, instead of an always-visible bordered box
    // sitting next to a duplicate text readout of the same number.
    const amtDisplay = row.querySelector('.budget-amt-display');
    const amtInput   = row.querySelector('.budget-input');
    amtDisplay.addEventListener('click', () => {
      amtDisplay.style.display = 'none';
      amtInput.style.display = '';
      amtInput.focus(); amtInput.select();
    });
    amtInput.addEventListener('blur', () => {
      const newVal = parseFloat(amtInput.value) || 0;
      amtDisplay.innerHTML = amtHtml(newVal);
      amtDisplay.style.color = amtColor(newVal);
      amtInput.style.display = 'none';
      amtDisplay.style.display = '';
    });

    row.addEventListener('dragstart', e => {
      draggedCatId = cat.id;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => { row.style.opacity = '0.4'; }, 0);
    });
    row.addEventListener('dragend', () => {
      draggedCatId = null;
      card.querySelectorAll('.budget-row').forEach(r => { r.style.opacity = ''; r.style.boxShadow = ''; });
      card.querySelectorAll('.budget-group-zone').forEach(z => z.style.background = '');
    });
    // Dropping on the top vs bottom half of a row decides whether the
    // dragged category lands before or after it — this is what actually
    // lets you position a category between two others (e.g. above/below a
    // specific expense), not just anywhere within Utgifter/Sparing.
    row.addEventListener('dragover', e => {
      if (!draggedCatId || draggedCatId === cat.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const after = (e.clientY - row.getBoundingClientRect().top) > row.getBoundingClientRect().height / 2;
      row.style.boxShadow = after ? 'inset 0 -2px 0 0 var(--green-accent)' : 'inset 0 2px 0 0 var(--green-accent)';
    });
    row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
    row.addEventListener('drop', e => {
      if (!draggedCatId || draggedCatId === cat.id) return;
      e.preventDefault();
      e.stopPropagation();
      const after = (e.clientY - row.getBoundingClientRect().top) > row.getBoundingClientRect().height / 2;
      applyCategoryMove(draggedCatId, cat.id, after, isSaving);
      draggedCatId = null;
    });
    return row;
  }

  // Render all Utgifter first, then all Sparing — regardless of the order
  // categories were added in — so the group header never repeats (a
  // category added after the other group would otherwise reopen it).
  // Each group is its own drop zone: dragging any category's row into the
  // other zone reassigns it there.
  function buildGroupZone(label, cats) {
    const zone = document.createElement('div');
    zone.className = 'budget-group-zone';
    zone.dataset.group = label;
    zone.style.cssText = 'border-radius:8px;transition:background 0.12s';
    const sep = document.createElement('div');
    sep.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:10px 4px 4px';
    sep.textContent = label;
    zone.appendChild(sep);
    if (cats.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size:11px;color:var(--text-muted);text-align:center;padding:10px 4px;margin:2px 4px 6px;border:1.5px dashed var(--border);border-radius:8px';
      hint.textContent = 'Dra en kategori hit';
      zone.appendChild(hint);
    } else {
      // Two equal columns instead of one full-width list — grid stretch
      // makes every row in a pair match the taller one's height, so rows
      // don't end up an arbitrary, inconsistent size.
      const rowsGrid = document.createElement('div');
      rowsGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:0 24px';
      cats.forEach(cat => rowsGrid.appendChild(buildCatRow(cat, label === 'Sparing')));
      zone.appendChild(rowsGrid);
    }
    zone.addEventListener('dragover', e => {
      if (!draggedCatId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.style.background = 'var(--chip-bg)';
    });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.style.background = ''; });
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.style.background = '';
      // Only fires for drops on the zone's own background (rows stop
      // propagation), so this always means "append to the end of this group".
      if (draggedCatId) applyCategoryMove(draggedCatId, null, false, label === 'Sparing');
      draggedCatId = null;
    });
    return zone;
  }

  if (BUDGET_CATS.length > 0) {
    card.appendChild(buildGroupZone('Utgifter', BUDGET_CATS.filter(c => !isCatSaving(c))));
    card.appendChild(buildGroupZone('Sparing',  BUDGET_CATS.filter(c => isCatSaving(c))));
  }
  c.appendChild(card);

  // Weekly breakdown
  {
    const WEEKLY_CATS  = BUDGET_CATS.filter(cat => !isCatSaving(cat) && !isCatMonthly(cat));
    const MONTHLY_CATS = BUDGET_CATS.filter(cat => !isCatSaving(cat) && isCatMonthly(cat));
    const totalMonthly = WEEKLY_CATS.reduce((s,cat)=>s+(budgets[cat.id]||0),0);
    const totalMonthlyBilled = MONTHLY_CATS.reduce((s,cat)=>s+(budgets[cat.id]||0),0);
    const weeklyBudgetRef = totalMonthly > 0 ? totalMonthly / 4.33 : 0;

    if (window._budgetView === 'compare' && window._budgetMonth) {
      const mTxs = allClassified.filter(t =>
        getMonthKey(t.dato) === window._budgetMonth &&
        !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0
      );
      const mp = window._budgetMonth.split('-');
      const mYear = +mp[0], mMon = +mp[1]-1;
      const daysInMonth = new Date(mYear, mMon+1, 0).getDate();
      const numWeeks    = daysInMonth / 7;
      const actualPerCat = {};
      for (const tx of mTxs) actualPerCat[tx.cat] = (actualPerCat[tx.cat]||0) + tx.ut;

      const hasData = WEEKLY_CATS.some(cat => (budgets[cat.id]||0) > 0 || (actualPerCat[cat.id]||0) > 0);
      if (hasData) {
        const wkHead = document.createElement('div'); wkHead.className = 'section-head'; wkHead.style.marginTop = '20px'; wkHead.textContent = 'Budsjett vs faktisk per uke'; c.appendChild(wkHead);
        const wkCard = document.createElement('div'); wkCard.className = 'card';
        const totalBudgetWeekly = WEEKLY_CATS.reduce((s,cat) => s + (budgets[cat.id]||0)/4.33, 0);
        const totalActualWeekly = WEEKLY_CATS.reduce((s,cat) => s + (actualPerCat[cat.id]||0)/numWeeks, 0);
        const totalOver = totalActualWeekly > totalBudgetWeekly && totalBudgetWeekly > 0;

        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border-light)">
            <div style="font-size:13px;font-weight:600;color:var(--text)">Per uke</div>
            <div style="display:flex;gap:16px;font-size:12px">
              <span style="color:var(--text-muted)">Budsjett: <strong style="color:#2d6a2d">${fmt(totalBudgetWeekly)}</strong>/uke</span>
              <span style="color:var(--text-muted)">Faktisk: <strong style="color:${totalOver?'#e74c3c':'var(--text)'}">${fmt(totalActualWeekly)}</strong>/uke</span>
            </div>
          </div>`;

        for (const cat of WEEKLY_CATS) {
          const budgetWeekly = (budgets[cat.id]||0) / 4.33;
          const actualWeekly = (actualPerCat[cat.id]||0) / numWeeks;
          if (budgetWeekly === 0 && actualWeekly === 0) continue;
          const over = budgetWeekly > 0 && actualWeekly > budgetWeekly;
          const pct  = budgetWeekly > 0 ? Math.min((actualWeekly/budgetWeekly)*100, 150) : 100;
          const barColor = over ? '#e74c3c' : pct > 85 ? '#e67e22' : cat.color;
          html += `<div style="padding:10px 0;border-bottom:1px solid var(--border-light)">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">${budgetCatIcon(cat,16)}</span><span style="font-size:13px;font-weight:500;color:var(--text)">${cat.label}</span></div>
              <div style="display:flex;align-items:baseline;gap:12px">
                <span style="font-size:13px;font-weight:700;color:${over?'#e74c3c':'var(--text)'}">${fmt(actualWeekly)}</span>
                <span style="font-size:12px;color:var(--text-muted)">/ ${fmt(budgetWeekly)}</span>
              </div>
            </div>
            ${budgetWeekly > 0 ? `<div style="height:6px;background:var(--budget-track-bg);border-radius:3px;overflow:hidden"><div style="height:100%;width:${Math.min(pct,100).toFixed(1)}%;background:${barColor};border-radius:3px"></div></div>
            <div style="font-size:11px;color:${over?'#e74c3c':'#2d6a2d'};margin-top:4px;text-align:right">${over?'+'+fmt(actualWeekly-budgetWeekly)+' over/uke':fmt(budgetWeekly-actualWeekly)+' under/uke'}</div>` : ''}
          </div>`;
        }
        wkCard.innerHTML = html; c.appendChild(wkCard);
      }
    } else if (totalMonthly > 0 || totalMonthlyBilled > 0) {
      const wkHead = document.createElement('div'); wkHead.className = 'section-head'; wkHead.style.marginTop = '20px'; wkHead.textContent = 'Ukesbudsjett'; c.appendChild(wkHead);

      // Two boxes side by side instead of one long list — subscriptions
      // (drag them here) are billed monthly, not week to week, so they get
      // their own box on the left instead of skewing "hva du kan bruke per
      // uke" on the right.
      let draggedWeeklyCatId = null;
      const wkRow = document.createElement('div');
      wkRow.style.cssText = 'display:flex;gap:16px;flex-wrap:wrap';

      function buildDropZoneCard(monthly) {
        const box = document.createElement('div');
        box.className = 'card';
        box.style.cssText = 'flex:1;min-width:280px;border-radius:12px;transition:background 0.12s';
        box.addEventListener('dragover', e => { if (!draggedWeeklyCatId) return; e.preventDefault(); box.style.background = 'var(--chip-bg)'; });
        box.addEventListener('dragleave', e => { if (!box.contains(e.relatedTarget)) box.style.background = ''; });
        box.addEventListener('drop', e => {
          e.preventDefault();
          box.style.background = '';
          if (draggedWeeklyCatId) setCatWeekly(draggedWeeklyCatId, monthly);
          draggedWeeklyCatId = null;
        });
        return box;
      }
      function wireDrag(row, catId) {
        row.draggable = true;
        row.style.cursor = 'grab';
        row.addEventListener('dragstart', e => {
          draggedWeeklyCatId = catId;
          e.dataTransfer.effectAllowed = 'move';
          setTimeout(() => { row.style.opacity = '0.4'; }, 0);
        });
        row.addEventListener('dragend', () => {
          row.style.opacity = '';
          draggedWeeklyCatId = null;
          [monthlyBox, weeklyBox].forEach(z => z.style.background = '');
        });
      }
      const emptyHint = text => {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:11px;color:var(--text-muted);text-align:center;padding:14px 4px;border:1.5px dashed var(--border);border-radius:8px';
        hint.textContent = text;
        return hint;
      };

      // Left: Månedlige utgifter
      const monthlyBox = buildDropZoneCard(true);
      const monthlyCatsWithBudget = MONTHLY_CATS.filter(cat => budgets[cat.id] > 0);
      const monthlyHeadDiv = document.createElement('div');
      monthlyHeadDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border-light)';
      monthlyHeadDiv.innerHTML = `<div><div style="font-size:13px;font-weight:600;color:var(--text)">Månedlige utgifter</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">Faste, ikke ukentlige — f.eks. abonnementer</div></div>
        <div style="font-size:22px;font-weight:700;color:#2d6a2d">${fmt(totalMonthlyBilled)}</div>`;
      monthlyBox.appendChild(monthlyHeadDiv);
      if (monthlyCatsWithBudget.length === 0) {
        monthlyBox.appendChild(emptyHint('Dra en kategori hit fra Ukesbudsjett'));
      } else {
        monthlyCatsWithBudget.forEach(cat => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)';
          row.innerHTML = `
            <span style="color:var(--text-muted);font-size:12px;letter-spacing:-1px">⠿</span>
            <div class="budget-cat-badge" style="background:${cat.color}33;color:${cat.color}">${budgetCatIcon(cat,16)}</div>
            <div style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${cat.label}</div>
            <div style="font-size:13px;font-weight:600;color:${cat.color}">${fmt(budgets[cat.id])}<span style="font-size:11px;font-weight:400;color:var(--text-muted)">/mnd</span></div>`;
          wireDrag(row, cat.id);
          monthlyBox.appendChild(row);
        });
      }

      // Right: Ukesbudsjett
      const weeklyBox = buildDropZoneCard(false);
      const weeklyCatsWithBudget = WEEKLY_CATS.filter(cat => budgets[cat.id] > 0);
      const weeklyHeadDiv = document.createElement('div');
      weeklyHeadDiv.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-light)';
      weeklyHeadDiv.innerHTML = `<div><div style="font-size:13px;font-weight:600;color:var(--text)">Totalt per uke</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmt(totalMonthly)} / mnd ÷ 4.33 uker</div></div>
        <div style="font-size:28px;font-weight:700;color:#2d6a2d">${fmt(weeklyBudgetRef)}</div>`;
      weeklyBox.appendChild(weeklyHeadDiv);
      if (weeklyCatsWithBudget.length === 0) {
        weeklyBox.appendChild(emptyHint('Dra en kategori hit fra Månedlige utgifter'));
      } else {
        weeklyCatsWithBudget.forEach(cat => {
          const weekly = budgets[cat.id] / 4.33;
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light)';
          row.innerHTML = `
            <span style="color:var(--text-muted);font-size:12px;letter-spacing:-1px">⠿</span>
            <div class="budget-cat-badge" style="background:${cat.color}33;color:${cat.color}">${budgetCatIcon(cat,16)}</div>
            <div style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${cat.label}</div>
            <div style="text-align:right">
              <div style="font-size:14px;font-weight:600;color:${cat.color}">${fmt(weekly)}<span style="font-size:11px;font-weight:400;color:var(--text-muted)">/uke</span></div>
              <div style="font-size:11px;color:var(--text-muted)">${fmt(budgets[cat.id]/30)}/dag</div>
            </div>`;
          wireDrag(row, cat.id);
          weeklyBox.appendChild(row);
        });
      }

      wkRow.appendChild(monthlyBox);
      wkRow.appendChild(weeklyBox);
      c.appendChild(wkRow);
    }
  }

  // Events
  document.getElementById('modePlan')?.addEventListener('click', () => { window._budgetView='plan'; renderBudsjett(); });
  document.getElementById('modeCompare')?.addEventListener('click', () => { window._budgetView='compare'; renderBudsjett(); });
  document.getElementById('budgetMonthSel')?.addEventListener('change', e => { window._budgetMonth = e.target.value || null; renderBudsjett(); });
  document.getElementById('resetBudgetBtn')?.addEventListener('click', () => { localStorage.removeItem(BUDGET_KEY); renderBudsjett(); });
  document.getElementById('incomeInput')?.addEventListener('blur', e => { saveIncome(parseFloat(e.target.value)||0); renderBudsjett(); });
  document.getElementById('incomeInput')?.addEventListener('keydown', e => { if (e.key==='Enter') e.target.blur(); });

  document.getElementById('addBudgetCatBtn')?.addEventListener('click', openAddBudgetCatModal);
  card.querySelectorAll('.rm-budget-cat-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.color = '#ef4444'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = 'var(--text-muted)'; });
    btn.addEventListener('click', () => {
      const cat = budgetAllCats().find(c => c.id === btn.dataset.cat);
      showConfirmDialog('Er du sikker på at du vil fjerne «' + (cat?.label || btn.dataset.cat) + '» fra budsjettet?', () => {
        saveActiveBudgetCats(loadActiveBudgetCats().filter(id => id !== btn.dataset.cat));
        const b = loadBudgets(); delete b[btn.dataset.cat]; saveBudgets(b);
        renderBudsjett();
      });
    });
  });

  card.querySelectorAll('.budget-input').forEach(input => {
    input.addEventListener('blur', () => {
      const b = loadBudgets(); const val = parseFloat(input.value)||0;
      if (val>0) b[input.dataset.cat] = val; else delete b[input.dataset.cat];
      saveBudgets(b);
      const newTotal = Object.values(loadBudgets()).reduce((s,v)=>s+v,0);
      const inc = loadIncome(); const unalloc = inc - newTotal;
      const disp = document.getElementById('unallocatedDisplay');
      const sub  = document.getElementById('unallocatedSub');
      if (disp && inc>0) { disp.textContent = (unalloc<0?'-':'')+fmt(Math.abs(unalloc)); disp.style.color = unalloc<0?'#e74c3c':unalloc===0?'#2d6a2d':'var(--text)'; }
      if (sub && inc>0) sub.textContent = fmt(newTotal)+' fordelt av '+fmt(inc);
    });
    input.addEventListener('keydown', e => { if (e.key==='Enter') { input.blur(); setTimeout(renderBudsjett, 50); } });
  });
}

