// ── Budsjett ──────────────────────────────────────────────────────
function renderBudsjett() {
  setActiveNav('budsjett');
  if (!window._budgetView) window._budgetView = 'plan';

  const allMonthKeys = [...new Set(loadStored().map(t=>getMonthKey(t.dato)))].sort().reverse();
  if (!window._budgetMonth || !allMonthKeys.includes(window._budgetMonth))
    window._budgetMonth = allMonthKeys[0] || null;

  const budgets = loadBudgets();
  if (!budgets['abo']) { budgets['abo'] = 946; saveBudgets(budgets); }

  const BUDGET_CATS = [
    { id:'mat',       label:'Mat & Dagligvare',     emoji:'🛒', color:'#4caf50' },
    { id:'transport', label:'Transport & Drivstoff', emoji:'⛽', color:'#2196f3' },
    { id:'abo',       label:'Abonnementer',           emoji:'📱', color:'#9c27b0' },
    { id:'bsu',       label:'BSU',                   emoji:'🏠', color:'#26a69a' },
    { id:'krisefond', label:'Krisefond',              emoji:'🛡️', color:'#ef5350' },
    { id:'shortterm', label:'Short-term savings',     emoji:'💰', color:'#42a5f5' },
    { id:'nordnet',   label:'Nordnet (fond)',          emoji:'📈', color:'#66bb6a' },
  ];
  const SAVING_IDS = ['bsu','krisefond','shortterm','nordnet'];

  const monthData = (window._budgetView === 'compare' && window._budgetMonth)
    ? allClassified.filter(t => getMonthKey(t.dato) === window._budgetMonth) : [];
  const catSpent = {};
  for (const tx of monthData)
    if (!['income','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(tx.cat) && tx.ut > 0)
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
  const monthlyInc     = (window._budgetView==='compare' && window._budgetMonth && actualMonthInc>0) ? actualMonthInc : loadIncome();
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
    const monthRow = document.createElement('div');
    monthRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:16px;background:var(--card-bg);border-radius:12px;padding:14px 18px';
    monthRow.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:var(--text-nav);white-space:nowrap">Faktisk forbruk for</div>
      <select id="budgetMonthSel" style="flex:1;border:1px solid var(--border);border-radius:8px;padding:7px 12px;font-family:inherit;font-size:13px;color:var(--text);background:var(--input-bg);outline:none;cursor:pointer">
        <option value="">— velg måned —</option>
        ${allMonthKeys.map(mk=>{const p=mk.split('-');return`<option value="${mk}"${mk===window._budgetMonth?' selected':''}>${monthsNo[+p[1]-1]} ${p[0]}</option>`;}).join('')}
      </select>`;
    c.appendChild(monthRow);
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
          <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Inntekt denne måneden</div>
          <div style="font-size:22px;font-weight:700;color:#2d6a2d">${actualMonthInc>0?fmt(actualMonthInc):(savedInc>0?fmt(savedInc):'—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">${actualMonthInc>0?'fra transaksjoner':(savedInc>0?'ingen data — viser forventet':'')}</div>
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

  const resetRow = document.createElement('div');
  resetRow.style.cssText = 'text-align:right;margin-bottom:8px';
  resetRow.innerHTML = '<button id="resetBudgetBtn" style="background:none;border:1px solid #f5c6cb;color:#c0392b;border-radius:8px;padding:6px 14px;font-family:inherit;font-size:12px;cursor:pointer">Nullstill alle budsjettall</button>';
  c.appendChild(resetRow);

  const hd = document.createElement('div');
  hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px';
  hd.innerHTML = `<div class="section-head" style="margin:0">Fordel budsjettet</div><div style="font-size:11px;color:var(--text-muted)">Tab mellom felt · lagres automatisk</div>`;
  c.appendChild(hd);

  const card = document.createElement('div'); card.className = 'card';
  let currentGroup = '';
  for (const cat of BUDGET_CATS) {
    const group = SAVING_IDS.includes(cat.id) ? 'Sparing' : 'Utgifter';
    if (group !== currentGroup) {
      currentGroup = group;
      const sep = document.createElement('div');
      sep.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:1px;text-transform:uppercase;padding:10px 0 4px';
      sep.textContent = group; card.appendChild(sep);
    }
    const spent  = catSpent[cat.id] || 0;
    const budget = budgets[cat.id]  || 0;
    const pct    = budget>0 ? Math.min((spent/budget)*100,100) : 0;
    const over   = budget>0 && spent>budget;
    const isSaving = SAVING_IDS.includes(cat.id);
    const barColor = isSaving ? (over?'#2d6a2d':pct>50?cat.color:'#c5e8a0') : (pct>90?'#e74c3c':pct>70?'#e67e22':cat.color);
    const showActual = window._budgetView==='compare' && window._budgetMonth && budget>0 && cat.id!=='abo';

    const row = document.createElement('div'); row.className = 'budget-row';
    row.innerHTML = `
      <div class="budget-top">
        <div class="budget-name">
          <div style="width:10px;height:10px;border-radius:50%;background:${cat.color};flex-shrink:0"></div>
          ${cat.emoji} ${cat.label}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          ${showActual?`<div style="font-size:12px"><span style="font-weight:600;color:${over?(isSaving?'#2d6a2d':'#e74c3c'):'#2d6a2d'}">${fmt(spent)}</span><span style="font-weight:600;color:${over?(isSaving?'#2d6a2d':'#e74c3c'):'#2d6a2d'}"> / ${fmt(budget)}</span></div>`
            :budget>0?`<div style="font-size:12px;color:var(--text-muted);font-weight:500">${fmt(budget)} kr/mnd</div>`:''}
          ${cat.id==='abo'
            ?`<div style="font-size:13px;font-weight:600;color:#9c27b0;background:#f3e5f5;padding:5px 12px;border-radius:8px">946 kr/mnd 🔒</div>`
            :`<input class="budget-input" type="number" min="0" step="100" placeholder="kr/mnd" value="${budget||''}" data-cat="${cat.id}" style="width:100px">`}
        </div>
      </div>
      ${showActual?`<div class="budget-track"><div class="budget-fill" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="budget-status" style="color:${over?(isSaving?'#2d6a2d':'#e74c3c'):'var(--text-muted)'}">
        ${isSaving?(over?'✓ '+fmt(spent-budget)+' over mål — bra!':fmt(budget-spent)+' gjenstår · '+Math.round(pct)+'%'):(over?'⚠️ '+fmt(spent-budget)+' over budsjett':fmt(budget-spent)+' gjenstår · '+Math.round(pct)+'% brukt')}
      </div>` : budget>0?`<div class="budget-track" style="opacity:0.3"><div class="budget-fill" style="width:100%;background:${cat.color}"></div></div>`:''}`;
    card.appendChild(row);
  }
  c.appendChild(card);

  // Weekly breakdown
  {
    const WEEKLY_CATS  = BUDGET_CATS.filter(cat => !SAVING_IDS.includes(cat.id) && cat.id !== 'abo');
    const totalMonthly = WEEKLY_CATS.reduce((s,cat)=>s+(budgets[cat.id]||0),0);
    const weeklyBudgetRef = totalMonthly > 0 ? totalMonthly / 4.33 : 0;

    if (window._budgetView === 'compare' && window._budgetMonth) {
      const mTxs = allClassified.filter(t =>
        getMonthKey(t.dato) === window._budgetMonth &&
        !['income','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0
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
              <div style="display:flex;align-items:center;gap:8px"><span style="font-size:16px">${cat.emoji}</span><span style="font-size:13px;font-weight:500;color:var(--text)">${cat.label}</span></div>
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
    } else if (totalMonthly > 0) {
      const wkHead = document.createElement('div'); wkHead.className = 'section-head'; wkHead.style.marginTop = '20px'; wkHead.textContent = 'Ukesbudsjett — hva du kan bruke per uke'; c.appendChild(wkHead);
      const wkCard = document.createElement('div'); wkCard.className = 'card';
      wkCard.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--border-light)">
          <div><div style="font-size:13px;font-weight:600;color:var(--text)">Totalt per uke</div><div style="font-size:11px;color:var(--text-muted);margin-top:2px">${fmt(totalMonthly)} / mnd ÷ 4.33 uker</div></div>
          <div style="font-size:28px;font-weight:700;color:#2d6a2d">${fmt(weeklyBudgetRef)}</div>
        </div>
        ${WEEKLY_CATS.filter(cat=>budgets[cat.id]>0).map(cat => {
          const weekly = budgets[cat.id] / 4.33;
          return `<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border-light)">
            <div style="width:28px;text-align:center;font-size:16px">${cat.emoji}</div>
            <div style="flex:1;font-size:13px;font-weight:500;color:var(--text)">${cat.label}</div>
            <div style="text-align:right">
              <div style="font-size:14px;font-weight:600;color:${cat.color}">${fmt(weekly)}<span style="font-size:11px;font-weight:400;color:var(--text-muted)">/uke</span></div>
              <div style="font-size:11px;color:var(--text-muted)">${fmt(budgets[cat.id]/30)}/dag</div>
            </div>
          </div>`;
        }).join('')}`;
      c.appendChild(wkCard);
    }
  }

  // Events
  document.getElementById('modePlan')?.addEventListener('click', () => { window._budgetView='plan'; renderBudsjett(); });
  document.getElementById('modeCompare')?.addEventListener('click', () => { window._budgetView='compare'; renderBudsjett(); });
  document.getElementById('budgetMonthSel')?.addEventListener('change', e => { window._budgetMonth = e.target.value || null; renderBudsjett(); });
  document.getElementById('resetBudgetBtn')?.addEventListener('click', () => { localStorage.removeItem(BUDGET_KEY); renderBudsjett(); });
  document.getElementById('incomeInput')?.addEventListener('blur', e => { saveIncome(parseFloat(e.target.value)||0); renderBudsjett(); });
  document.getElementById('incomeInput')?.addEventListener('keydown', e => { if (e.key==='Enter') e.target.blur(); });

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

