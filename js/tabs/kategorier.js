// ── Kategorier (embedded in Oversikt) ────────────────────────────
function renderKategorierInto(container) {
  if (!container) return;
  container.innerHTML = '';

  const data      = getFiltered();
  const expenses  = data.filter(t => !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);
  const reselling = data.filter(t => t.cat === 'reselling');
  const catTotals = {}; const catTxs = {};
  for (const tx of expenses) {
    catTotals[tx.cat] = (catTotals[tx.cat]||0) + tx.ut;
    if (!catTxs[tx.cat]) catTxs[tx.cat] = [];
    catTxs[tx.cat].push(tx);
  }
  const sorted  = CATS.filter(c => catTotals[c.id]>0 && c.id !== 'reselling').sort((a,b)=>catTotals[b.id]-catTotals[a.id]);
  const total   = sorted.reduce((s,c)=>s+catTotals[c.id],0);
  const maxCat  = Math.max(...sorted.map(c=>catTotals[c.id]),1);

  if (!sorted.length && !reselling.length) {
    container.innerHTML = '<div class="card" style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Ingen kategorier å vise</div>';
    return;
  }

  const donutCard = document.createElement('div');
  donutCard.className = 'card';
  donutCard.style.cssText = 'display:flex;gap:20px;align-items:center;margin-bottom:16px';
  donutCard.innerHTML = `
    <canvas id="donutChart" width="120" height="120" style="flex-shrink:0"></canvas>
    <div style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
      ${sorted.slice(0,6).map(cat=>`
      <div style="display:flex;align-items:center;gap:6px;font-size:11px">
        <div style="width:8px;height:8px;border-radius:50%;background:${cat.color};flex-shrink:0"></div>
        <div style="flex:1;color:var(--text-nav);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat.label}</div>
        <div style="font-weight:600;color:var(--text);white-space:nowrap">${fmt(catTotals[cat.id])}</div>
      </div>`).join('')}
      ${sorted.length>6?`<div style="font-size:10px;color:var(--text-muted)">+${sorted.length-6} til</div>`:''}
    </div>`;
  container.appendChild(donutCard);

  setTimeout(() => {
    const canvas = document.getElementById('donutChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 60, cy = 60, r = 48, inner = 30;
    let angle = -Math.PI / 2;
    ctx.clearRect(0,0,120,120);
    if (!sorted.length) return;
    for (const cat of sorted) {
      const slice = (catTotals[cat.id]/total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
      ctx.fillStyle = cat.color; ctx.fill(); angle += slice;
    }
    const isDark = document.body.classList.contains('dark');
    ctx.beginPath(); ctx.arc(cx,cy,inner,0,Math.PI*2);
    ctx.fillStyle = isDark ? '#141414' : '#fff'; ctx.fill();
    ctx.fillStyle = isDark ? '#f2f2f2' : '#1a1a1a'; ctx.font = '600 11px DM Sans,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmt(total).replace(' kr',''), cx, cy-3);
    ctx.fillStyle = isDark ? '#7a7a7a' : '#9aab90'; ctx.font = '400 9px DM Sans,sans-serif';
    ctx.fillText('totalt', cx, cy+9);
  }, 50);

  const catHead = document.createElement('div');
  catHead.style.cssText = 'font-size:11px;color:var(--text-muted);margin-bottom:8px';
  catHead.textContent = `Alle kategorier · ${fmt(total)} totalt — klikk for å se transaksjoner`;
  container.appendChild(catHead);

  for (const cat of sorted) {
    const pct      = (catTotals[cat.id]/maxCat*100).toFixed(1);
    const sharePct = ((catTotals[cat.id]/total)*100).toFixed(0);
    const txs      = (catTxs[cat.id]||[]).sort((a,b)=>pd(b.dato)-pd(a.dato));
    const wrap     = document.createElement('div');
    wrap.className = 'card'; wrap.style.marginBottom='8px'; wrap.style.cursor='pointer';
    wrap.addEventListener('mouseenter', () => wrap.style.boxShadow='0 2px 12px rgba(0,0,0,0.07)');
    wrap.addEventListener('mouseleave', () => wrap.style.boxShadow='');
    const header = document.createElement('div');
    header.className='cat-row'; header.style.cssText='padding:0;border:none;cursor:pointer;user-select:none';
    header.innerHTML=`<div class="cat-dot" style="background:${cat.color}"></div><div class="cr-name">${cat.emoji} ${cat.label}</div><div class="cr-bar-wrap" style="width:200px"><div class="cr-bar" style="width:${pct}%;background:${cat.color}"></div></div><div class="cr-pct">${sharePct}%</div><div class="cr-amt">${fmt(catTotals[cat.id])}</div><div class="toggle-arrow" style="margin-left:12px;font-size:12px;color:var(--text-muted);transition:transform 0.2s">▼</div>`;
    const txPanel = document.createElement('div');
    txPanel.style.cssText='display:none;margin-top:14px;border-top:1px solid var(--border-light);padding-top:12px';
    let catSortMode = 'dato';
    let datoSortDesc = true;
    let prisSortDesc = true;
    function renderCatTable() {
      let sorted2;
      if (catSortMode === 'pris') sorted2 = [...txs].sort((a,b) => prisSortDesc ? b.ut - a.ut : a.ut - b.ut);
      else sorted2 = [...txs].sort((a,b) => datoSortDesc ? pd(b.dato) - pd(a.dato) : pd(a.dato) - pd(b.dato));
      txPanel.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:10px;align-items:center"><button class="sort-btn${catSortMode==='dato'?' sort-active':''}" id="datoSortBtn">Dato ${datoSortDesc ? '↓' : '↑'}</button><button class="sort-btn${catSortMode==='pris'?' sort-active':''}" id="prisSortBtn">Pris ${prisSortDesc ? '↓' : '↑'}</button></div><table class="tx-table"><thead><tr><th>Dato</th><th>Beskrivelse</th><th style="text-align:right">Beløp</th></tr></thead><tbody>${sorted2.map(tx=>`<tr><td style="color:var(--text-muted);font-size:12px;width:90px">${tx.dato}</td><td class="tx-name-cell"><span class="tn">${tx.beskr}${tx.reserved?'<span class="badge-res">Reservert</span>':''}</span></td><td class="tx-amt-out" style="text-align:right">-${fmt(tx.ut)}</td></tr>`).join('')}</tbody></table><div style="font-size:12px;color:var(--text-muted);margin-top:10px;text-align:right">${txs.length} transaksjoner · totalt ${fmt(catTotals[cat.id])}</div>`;
      txPanel.querySelector('#datoSortBtn').addEventListener('click', e => { e.stopPropagation(); if (catSortMode === 'dato') { datoSortDesc = !datoSortDesc; } else { catSortMode = 'dato'; } renderCatTable(); });
      txPanel.querySelector('#prisSortBtn').addEventListener('click', e => { e.stopPropagation(); if (catSortMode === 'pris') { prisSortDesc = !prisSortDesc; } else { catSortMode = 'pris'; } renderCatTable(); });
    }
    renderCatTable();
    let open=false;
    header.addEventListener('click',()=>{ open=!open; txPanel.style.display=open?'block':'none'; header.querySelector('.toggle-arrow').style.transform=open?'rotate(180deg)':''; });
    wrap.appendChild(header); wrap.appendChild(txPanel); container.appendChild(wrap);
  }

  if (reselling.length > 0) {
    const resellingTotal = reselling.reduce((s,t)=>s+t.inn,0);
    const wrap = document.createElement('div');
    wrap.className='card'; wrap.style.marginBottom='8px'; wrap.style.cursor='pointer';
    wrap.addEventListener('mouseenter', () => wrap.style.boxShadow='0 2px 12px rgba(0,0,0,0.07)');
    wrap.addEventListener('mouseleave', () => wrap.style.boxShadow='');
    const header = document.createElement('div');
    header.className='cat-row'; header.style.cssText='padding:0;border:none;cursor:pointer;user-select:none';
    header.innerHTML=`<div class="cat-dot" style="background:#26a69a"></div><div class="cr-name">${icon('reselling',{size:14})} Salg / Reselling</div><div class="cr-bar-wrap" style="width:200px"><div class="cr-bar" style="width:100%;background:#26a69a"></div></div><div class="cr-pct">inn</div><div class="cr-amt" style="color:#26a69a">+${fmt(resellingTotal)}</div><div class="toggle-arrow" style="margin-left:12px;font-size:12px;color:var(--text-muted);transition:transform 0.2s">▼</div>`;
    const txPanel = document.createElement('div');
    txPanel.style.cssText='display:none;margin-top:14px;border-top:1px solid var(--border-light);padding-top:12px';
    txPanel.innerHTML=`<table class="tx-table"><thead><tr><th>Dato</th><th>Beskrivelse</th><th style="text-align:right">Beløp</th></tr></thead><tbody>${[...reselling].sort((a,b)=>pd(b.dato)-pd(a.dato)).map(tx=>`<tr><td style="color:var(--text-muted);font-size:12px;width:90px">${tx.dato}</td><td class="tx-name-cell"><span class="tn">${tx.beskr}</span></td><td style="text-align:right;font-weight:600;color:#26a69a">+${fmt(tx.inn)}</td></tr>`).join('')}</tbody></table><div style="font-size:12px;color:#26a69a;font-weight:600;margin-top:10px;text-align:right">${reselling.length} transaksjoner · totalt +${fmt(resellingTotal)}</div>`;
    let open=false;
    header.addEventListener('click',()=>{ open=!open; txPanel.style.display=open?'block':'none'; header.querySelector('.toggle-arrow').style.transform=open?'rotate(180deg)':''; });
    wrap.appendChild(header); wrap.appendChild(txPanel); container.appendChild(wrap);
  }
}
