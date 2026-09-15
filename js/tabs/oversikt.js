// ── Oversikt ─────────────────────────────────────────────────────
function renderOversikt() {
  setActiveNav('oversikt');
  const data      = getFiltered();
  const income    = data.filter(t => t.cat === 'income');
  const reselling = data.filter(t => t.cat === 'reselling');
  const studielan = data.filter(t => t.cat === 'studielan');
  const expenses  = data.filter(t => !['income','studielan','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);
  const ti = income.reduce((s,t) => s+t.inn, 0);
  const te = expenses.reduce((s,t) => s+t.ut, 0);
  const tNetto = ti - te;
  // Studielån holdes utenfor både Inntekt og Netto — det er lån, ikke inntjening.
  const tsl = studielan.reduce((s,t) => s+t.inn, 0);

  const allKeys2 = [...new Set(allClassified.map(t => getMonthKey(t.dato)))].sort();
  const curIdx   = activeMonthFilter ? allKeys2.indexOf(activeMonthFilter) : allKeys2.length - 1;
  const prevKey  = curIdx > 0 ? allKeys2[curIdx - 1] : null;
  const prevExp  = prevKey ? allClassified.filter(t=>getMonthKey(t.dato)===prevKey&&!['income','studielan','savings','internal','transfer_in','reselling','folk'].includes(t.cat)&&t.ut>0).reduce((s,t)=>s+t.ut,0) : null;
  const prevInc  = prevKey ? allClassified.filter(t=>getMonthKey(t.dato)===prevKey&&t.cat==='income').reduce((s,t)=>s+t.inn,0) : null;
  const trendExp = (prevExp && te) ? ((te - prevExp) / prevExp * 100) : null;
  const trendInc = (prevInc && ti) ? ((ti - prevInc) / prevInc * 100) : null;

  const mkPrevLabel = prevKey ? (()=>{ const p=prevKey.split('-'); return monthsNo[+p[1]-1]+' '+p[0]; })() : null;
  const trendBadge = (val, inverse=false) => {
    if (val === null) return '';
    const up  = inverse ? val < 0 : val > 0;
    const cls = Math.abs(val) < 3 ? 'trend-flat' : up ? 'trend-up' : 'trend-down';
    const arrow = Math.abs(val) < 3 ? '→' : val > 0 ? '↑' : '↓';
    return `<span class="${cls}">${arrow} ${Math.abs(val).toFixed(0)}% vs ${mkPrevLabel}</span>`;
  };

  const resellingTotal = reselling.reduce((s,t)=>s+t.inn,0);
  const truncate = (str, n) => str.length > n ? str.slice(0, n) + '…' : str;

  const trendMonths = allKeys2.slice(-6);
  const trendData   = trendMonths.map(mk => {
    const exp = allClassified.filter(t=>getMonthKey(t.dato)===mk&&!['income','studielan','savings','internal','transfer_in','reselling','folk'].includes(t.cat)&&t.ut>0).reduce((s,t)=>s+t.ut,0);
    const inc = allClassified.filter(t=>getMonthKey(t.dato)===mk&&t.cat==='income').reduce((s,t)=>s+t.inn,0);
    const p   = mk.split('-');
    return { label: monthsShort[+p[1]-1], exp, inc };
  });

  // Income compact rows for right panel
  const incomeCompact = [...income].sort((a,b)=>pd(b.dato)-pd(a.dato)).map(tx =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <div class="tx-icon-sm" style="background:#e8f5e9;color:#2d6a2d;flex-shrink:0">${icon('income',{size:14})}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${truncate(tx.beskr,30)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${tx.dato}</div>
      </div>
      <div style="font-weight:600;color:#4caf50;white-space:nowrap;font-size:13px">+${fmt(tx.inn)}</div>
    </div>`
  ).join('');

  const resellingCompact = resellingTotal > 0 ? [...reselling].sort((a,b)=>pd(b.dato)-pd(a.dato)).map(tx =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <div class="tx-icon-sm" style="background:#e0f2f1;color:#00796b;flex-shrink:0">${icon('reselling',{size:14})}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${truncate(tx.beskr,30)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${tx.dato}</div>
      </div>
      <div style="font-weight:600;color:#26a69a;white-space:nowrap;font-size:13px">+${fmt(tx.inn)}</div>
    </div>`
  ).join('') : '';

  const studielanCompact = tsl > 0 ? [...studielan].sort((a,b)=>pd(b.dato)-pd(a.dato)).map(tx =>
    `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
      <div class="tx-icon-sm" style="background:var(--border-light);color:var(--text-muted);flex-shrink:0">${icon('studielan',{size:14})}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${truncate(tx.beskr,30)}</div>
        <div style="font-size:11px;color:var(--text-muted)">${tx.dato}</div>
      </div>
      <div style="font-weight:600;color:var(--text-muted);white-space:nowrap;font-size:13px">+${fmt(tx.inn)}</div>
    </div>`
  ).join('') : '';

  // Paginated top expenses
  const TOP_EXP_PAGE = 5;
  const TOP_EXP_MAX  = 25;
  const sortedExp    = [...expenses].sort((a,b) => b.ut - a.ut).slice(0, TOP_EXP_MAX);

  document.getElementById('mainContent').innerHTML = `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
  <div class="sum-card">
    <div class="sc-label">Inntekt</div>
    <div class="sc-val sc-green">${fmt(ti)}</div>
    <div class="sc-sub" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${income.length} utbetaling${income.length!==1?'er':''} ${trendBadge(trendInc,true)}</div>
    ${tsl>0?`<div class="sc-sub" style="margin-top:2px">+ ${fmt(tsl)} studielån</div>`:''}
  </div>
  <div class="sum-card">
    <div class="sc-label">Utgifter</div>
    <div class="sc-val sc-red">${fmt(te)}</div>
    <div class="sc-sub" style="display:flex;gap:6px;align-items:center">${expenses.length} transaksjoner ${trendBadge(trendExp)}</div>
  </div>
  <div class="sum-card">
    <div class="sc-label">Netto</div>
    <div class="sc-val" style="color:${tNetto>=0?'#4caf50':'#f44336'}">${tNetto>=0?'+':''}${Math.round(tNetto).toLocaleString('nb-NO')} kr</div>
    <div class="sc-sub">Inntekt minus utgifter</div>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:stretch">
  <div style="display:flex;flex-direction:column">
    <div class="section-head">Inntekt / Lønn</div>
    <div class="card" style="padding-bottom:4px">
      ${income.length===0?'<div style="color:var(--text-muted);font-size:13px">Ingen inntekt</div>':incomeCompact}
      ${resellingTotal>0?`<div style="margin-top:4px;padding-top:4px">${resellingCompact}<div style="font-size:11px;color:#26a69a;font-weight:600;text-align:right;margin-top:8px">Salg totalt: +${fmt(resellingTotal)}</div></div>`:''}
      ${tsl>0?`<div style="margin-top:4px;padding-top:4px">${studielanCompact}<div style="font-size:11px;color:var(--text-muted);text-align:right;margin-top:8px">Studielån: ${fmt(tsl)}</div></div>`:''}
    </div>

    <div class="section-head" style="margin-top:16px">Største utgifter</div>
    <div class="card" id="storsteUtgifterCard" style="padding-bottom:4px;min-height:290px">
      ${expenses.length===0?'<div style="color:var(--text-muted);font-size:13px">Ingen utgifter</div>':''}
    </div>

    <div class="section-head" style="margin-top:16px">Spending trend</div>
    <div class="card" style="flex:1;min-height:130px;padding:12px 16px">
      <canvas id="trendChart" style="width:100%;display:block"></canvas>
    </div>
  </div>
  <div>
    <div class="section-head">Kategorier</div>
    <div id="kategorierSection"></div>
  </div>
</div>`;

  // Paginated "Største utgifter"
  if (sortedExp.length) {
    const card = document.getElementById('storsteUtgifterCard');
    let expPage = 1;
    const expTotalPages = Math.ceil(sortedExp.length / TOP_EXP_PAGE);
    const renderExpPage = () => {
      const slice  = sortedExp.slice((expPage-1)*TOP_EXP_PAGE, expPage*TOP_EXP_PAGE);
      const offset = (expPage-1)*TOP_EXP_PAGE;
      const rows   = slice.map((tx, i) => {
        const cat  = CATS.find(c=>c.id===tx.cat)||{emoji:icon('diverse',{size:14})};
        const rank = offset+i;
        const r    = rank===0?icon('medal1',{size:15}):rank===1?icon('medal2',{size:15}):rank===2?icon('medal3',{size:15}):`<span style="font-size:11px;font-weight:700;color:var(--text-muted)">#${rank+1}</span>`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
          <div style="width:22px;text-align:center;flex-shrink:0;font-size:15px">${r}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${truncate(tx.beskr,28)}</div>
            <div style="font-size:11px;color:var(--text-muted)">${tx.dato} · ${cat.emoji}</div>
          </div>
          <div style="font-weight:600;color:#e74c3c;white-space:nowrap;font-size:13px">-${fmt(tx.ut)}</div>
        </div>`;
      }).join('');
      const nav = expTotalPages > 1 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;padding-top:6px;border-top:1px solid var(--border-light)">
          <button class="sort-btn exp-prev" style="padding:4px 10px;font-size:11px" ${expPage===1?'disabled':''}>← Forrige</button>
          <span style="font-size:11px;color:var(--text-muted)">Side ${expPage} av ${expTotalPages}</span>
          <button class="sort-btn exp-next" style="padding:4px 10px;font-size:11px" ${expPage===expTotalPages?'disabled':''}>Neste →</button>
        </div>` : '';
      card.innerHTML = rows + nav;
      card.querySelector('.exp-prev')?.addEventListener('click', () => { expPage--; renderExpPage(); });
      card.querySelector('.exp-next')?.addEventListener('click', () => { expPage++; renderExpPage(); });
    };
    renderExpPage();
  }

  renderKategorierInto(document.getElementById('kategorierSection'));

  // Trend line chart
  setTimeout(() => {
    const canvas = document.getElementById('trendChart');
    if (!canvas || trendData.length < 2) return;
    const W = canvas.parentElement.clientWidth - 32;
    const H = Math.max(canvas.parentElement.clientHeight - 24, 120);
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const pad = { top:10, right:10, bottom:28, left:48 };
    const cw  = W - pad.left - pad.right;
    const ch  = H - pad.top - pad.bottom;
    const maxVal = Math.max(...trendData.flatMap(d=>[d.exp,d.inc]), 1);
    const x  = i => pad.left + (i/(trendData.length-1))*cw;
    const yE = v => pad.top + (1 - v/maxVal)*ch;
    const isDark = document.body.classList.contains('dark');
    const gridColor  = isDark ? '#1c1c1c' : '#f0f4ee';
    const labelColor = isDark ? '#7a7a7a' : '#9aab90';
    const fmtY = v => v >= 1000 ? Math.round(v/1000) + 'k' : Math.round(v).toString();
    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = gridColor; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(f => {
      const y = yE(maxVal*f);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left+cw, y); ctx.stroke();
      ctx.fillStyle = labelColor; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='right';
      ctx.fillText(fmtY(maxVal*f), pad.left-6, y+3);
    });
    // Expense fill + line
    ctx.beginPath(); ctx.moveTo(x(0), yE(trendData[0].exp));
    trendData.forEach((d,i) => ctx.lineTo(x(i), yE(d.exp)));
    ctx.lineTo(x(trendData.length-1), yE(0)); ctx.lineTo(x(0), yE(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(255,99,71,0.10)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x(0), yE(trendData[0].exp));
    trendData.forEach((d,i) => ctx.lineTo(x(i), yE(d.exp)));
    ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    // Income line
    ctx.beginPath(); ctx.moveTo(x(0), yE(trendData[0].inc));
    trendData.forEach((d,i) => ctx.lineTo(x(i), yE(d.inc)));
    ctx.strokeStyle = '#2d6a2d'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
    // Dots + labels
    trendData.forEach((d,i) => {
      ctx.beginPath(); ctx.arc(x(i), yE(d.exp), 3, 0, Math.PI*2); ctx.fillStyle='#e74c3c'; ctx.fill();
      ctx.beginPath(); ctx.arc(x(i), yE(d.inc), 3, 0, Math.PI*2); ctx.fillStyle='#2d6a2d'; ctx.fill();
      ctx.fillStyle = labelColor; ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='center';
      ctx.fillText(d.label, x(i), H-pad.bottom+14);
    });
    ctx.font='10px DM Sans,sans-serif'; ctx.textAlign='left';
    ctx.fillStyle='#e74c3c'; ctx.fillRect(pad.left,4,10,4); ctx.fillStyle=labelColor; ctx.fillText('Utgifter',pad.left+14,10);
    ctx.fillStyle='#2d6a2d'; ctx.fillRect(pad.left+70,4,10,4); ctx.fillStyle=labelColor; ctx.fillText('Inntekt',pad.left+84,10);
  }, 80);
}

// ── Balance checkpoint card ───────────────────────────────────────
function renderBalanceCheckpoint(container, monthKey, appIncome, appExpenses) {
  const checkpoints = loadCheckpoints();
  const cp = checkpoints[monthKey] || {};
  const appCalc = appIncome - appExpenses;
  const diff = cp.actual != null ? cp.actual - appCalc : null;
  const diffColor = diff == null ? '' : diff >= 0 ? '#4caf50' : '#f44336';
  const card = document.createElement('div');
  card.className = 'card'; card.style.marginBottom = '16px';
  card.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">Saldosjekk</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">App (netto)</div>
        <div style="font-weight:700;font-size:15px">${Math.round(appCalc).toLocaleString('nb-NO')} kr</div>
      </div>
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Bank (faktisk)</div>
        <div id="cpActualDisplay" style="font-weight:700;font-size:15px;color:${cp.actual!=null?'var(--text)':'var(--text-muted)'}">${cp.actual!=null?Math.round(cp.actual).toLocaleString('nb-NO')+' kr':'—'}</div>
      </div>
      <div style="background:${diff==null?'var(--chip-bg)':diff>=0?'rgba(76,175,80,0.08)':'rgba(244,67,54,0.08)'};border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Differanse</div>
        <div style="font-weight:700;font-size:15px;color:${diffColor}">${diff==null?'—':(diff>=0?'+':'')+Math.round(diff).toLocaleString('nb-NO')+' kr'}</div>
      </div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input id="cpInput" type="number" placeholder="Skriv inn banksaldo..." value="${cp.actual!=null?cp.actual:''}"
        style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px">
      <button class="sort-btn sort-active" id="cpSaveBtn">Lagre</button>
      ${cp.actual!=null?'<button class="sort-btn" id="cpClearBtn" style="color:#f44336">×</button>':''}
    </div>
    ${cp.savedAt?`<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Sist oppdatert ${new Date(cp.savedAt).toLocaleDateString('nb-NO')}</div>`:''}`;
  container.appendChild(card);
  card.querySelector('#cpSaveBtn').addEventListener('click', () => {
    const v = parseFloat(card.querySelector('#cpInput').value);
    if (isNaN(v)) { showToast('Skriv inn et gyldig beløp'); return; }
    const all = loadCheckpoints();
    all[monthKey] = { actual: v, savedAt: new Date().toISOString() };
    saveCheckpoints(all);
    renderBalanceCheckpoint(container, monthKey, appIncome, appExpenses);
    card.remove();
  });
  card.querySelector('#cpClearBtn')?.addEventListener('click', () => {
    const all = loadCheckpoints(); delete all[monthKey]; saveCheckpoints(all);
    renderBalanceCheckpoint(container, monthKey, appIncome, appExpenses);
    card.remove();
  });
}
