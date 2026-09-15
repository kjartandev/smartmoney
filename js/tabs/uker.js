// ── Uke for uke ──────────────────────────────────────────────────
function renderUker() {
  setActiveNav('uker');
  const data     = getFiltered();
  const expenses = data.filter(t => !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);

  function getMon(dato) {
    const d = pd(dato); const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const mon = new Date(d); mon.setDate(d.getDate() - day); mon.setHours(0,0,0,0); return mon;
  }
  function getWeekNum(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
  }

  const weeks = {};
  for (const tx of expenses) {
    const mon = getMon(tx.dato); const sun = new Date(mon); sun.setDate(mon.getDate()+6);
    const key = mon.toISOString().slice(0,10);
    const fmtD = dt => dt.toLocaleDateString('nb-NO', {day:'numeric', month:'short'});
    const label = fmtD(mon) + ' – ' + fmtD(sun);
    const weekNum = getWeekNum(mon);
    if (!weeks[key]) weeks[key] = { key, label, weekNum, total:0, txs:[] };
    weeks[key].total += tx.ut; weeks[key].txs.push(tx);
  }

  const sorted  = Object.values(weeks).sort((a,b) => a.key.localeCompare(b.key));
  const avgWeek = sorted.length ? sorted.reduce((s,w)=>s+w.total,0) / sorted.length : 0;
  const budgets = loadBudgets();
  const weeklyRef = (['mat','transport','spiseute','shopping'].reduce((s,id) => s+(budgets[id]||0), 0)) / 4.33;
  const reference = weeklyRef > 0 ? weeklyRef : avgWeek;

  const c = document.getElementById('mainContent');
  if (!sorted.length) { c.innerHTML = '<div class="card"><div style="color:var(--text-muted);font-size:13px">Ingen utgifter</div></div>'; return; }

  let ukerSort = 'dato';
  function renderUkerList(sortMode) {
    c.innerHTML = '';
    const totalSum = sorted.reduce((s,w)=>s+w.total,0);
    const headerRow = document.createElement('div');
    headerRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px';
    headerRow.innerHTML = `
      <div>
        <div class="section-head" style="margin:0">Uke for uke · ${sorted.length} uker</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:3px">Totalt: <strong style="color:var(--text)">${fmt(totalSum)}</strong> ${weeklyRef>0?`· Ukesbudsjett: <strong style="color:#2d6a2d">${fmt(weeklyRef)}</strong>`:''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="sort-btn${sortMode==='dato'?' sort-active':''}" data-s="dato">Nyeste</button>
        <button class="sort-btn${sortMode==='pris'?' sort-active':''}" data-s="pris">Høyeste</button>
      </div>`;
    c.appendChild(headerRow);
    headerRow.querySelectorAll('.sort-btn').forEach(btn => { btn.addEventListener('click', () => { ukerSort = btn.dataset.s; renderUkerList(ukerSort); }); });

    let displayList = [...sorted];
    if (sortMode === 'pris') displayList.sort((a,b) => b.total - a.total);

    for (const w of displayList) {
      const topCats = {};
      for (const tx of w.txs) topCats[tx.cat] = (topCats[tx.cat]||0) + tx.ut;
      const catBadges = Object.entries(topCats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([catId]) => {
        const cat = CATS.find(c=>c.id===catId)||{emoji:icon('diverse',{size:14})};
        return `<span style="font-size:14px">${cat.emoji}</span>`;
      }).join('');

      const card = document.createElement('div'); card.className = 'card'; card.style.marginBottom = '8px';
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;gap:12px';
      const overBudget = weeklyRef > 0 && w.total > weeklyRef;
      headerDiv.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;font-weight:700;color:#fff;background:#2d6a2d;padding:2px 8px;border-radius:20px">uke ${w.weekNum}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text)">${w.label}</span>
          <span style="font-size:11px;color:var(--text-muted)">${w.txs.length} stk</span>
          <span style="display:flex;gap:2px">${catBadges}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:16px;font-weight:700;color:${overBudget?'#e74c3c':'var(--text)'}">${fmt(w.total)}</div>
          <div class="tb-arrow" style="font-size:11px;color:var(--text-muted);transition:transform 0.2s">▼</div>
        </div>`;

      const tableWrap = document.createElement('div');
      tableWrap.style.cssText = 'display:none;margin-top:14px;border-top:1px solid var(--border-light);padding-top:12px';
      let innerSort = 'pris_desc';

      function renderInnerTable() {
        let rows = [...w.txs];
        if (innerSort==='pris_desc') rows.sort((a,b)=>b.ut-a.ut);
        else if (innerSort==='pris_asc') rows.sort((a,b)=>a.ut-b.ut);
        else if (innerSort==='dato') rows.sort((a,b)=>pd(b.dato)-pd(a.dato));
        else if (innerSort==='kat') rows.sort((a,b)=>a.cat.localeCompare(b.cat));
        const prisActive = innerSort.startsWith('pris');
        const prisLabel  = innerSort==='pris_desc'?'Pris ↓':innerSort==='pris_asc'?'Pris ↑':'Pris';
        tableWrap.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
            <button class="sort-btn${prisActive?' sort-active':''}" data-is="pris">${prisLabel}</button>
            <button class="sort-btn${innerSort==='dato'?' sort-active':''}" data-is="dato">Dato</button>
            <button class="sort-btn${innerSort==='kat'?' sort-active':''}" data-is="kat">Kategori</button>
          </div>
          <table class="tx-table">
            <thead><tr><th></th><th>Beskrivelse</th><th>Dato</th><th>Kategori</th><th style="text-align:right">Beløp</th></tr></thead>
            <tbody>${rows.map(tx => {
              const cat = CATS.find(c=>c.id===tx.cat)||{emoji:icon('diverse',{size:16}),color:'#78909c',label:'Diverse'};
              const pctOfWeek = ((tx.ut/w.total)*100).toFixed(0);
              return `<tr><td><div class="tx-icon-sm" style="background:${cat.color}22">${cat.emoji}</div></td><td class="tx-name-cell"><span class="tn">${tx.beskr}</span><span class="tm">${pctOfWeek}% av uken</span></td><td style="color:var(--text-muted);font-size:12px">${tx.dato}</td><td style="font-size:12px;color:var(--text-secondary)">${cat.label}</td><td class="tx-amt-out" style="text-align:right">-${fmt(tx.ut)}</td></tr>`;
            }).join('')}</tbody>
            <tfoot><tr style="border-top:2px solid var(--border)">
              <td colspan="4" style="padding:10px 0;font-size:12px;color:var(--text-muted)">${rows.length} transaksjoner · snitt ${fmt(w.total/rows.length)} per kjøp</td>
              <td style="padding:10px 0;font-weight:600;color:#c0392b;text-align:right">-${fmt(w.total)}</td>
            </tr></tfoot>
          </table>`;
        tableWrap.querySelectorAll('[data-is]').forEach(btn => {
          btn.addEventListener('click', () => {
            if (btn.dataset.is==='pris') innerSort = innerSort==='pris_desc'?'pris_asc':'pris_desc';
            else innerSort = btn.dataset.is;
            renderInnerTable();
          });
        });
      }
      renderInnerTable();

      let open = false;
      headerDiv.addEventListener('click', () => {
        open = !open;
        tableWrap.style.display = open ? 'block' : 'none';
        headerDiv.querySelector('.tb-arrow').style.transform = open ? 'rotate(180deg)' : '';
      });
      card.appendChild(headerDiv); card.appendChild(tableWrap); c.appendChild(card);
    }
  }
  renderUkerList(ukerSort);
}

