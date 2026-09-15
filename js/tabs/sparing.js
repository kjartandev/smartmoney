// ── Sparing ──────────────────────────────────────────────────────
function sparingSaveBucket(bid, balVal, goalVal) {
  const all = loadSparemaal();
  if (!all[bid]) all[bid] = {};
  if (balVal !== '') {
    all[bid].balance = parseFloat(balVal) || 0;
  } else {
    delete all[bid].balance;
  }
  if (goalVal !== '') all[bid].target = parseFloat(goalVal) || 0; else delete all[bid].target;
  // Always record when this bucket was last saved
  all[bid].updatedAt = new Date().toISOString();
  // Clean up legacy fields
  delete all[bid].snapshotMonth;
  delete all[bid].txSnapshot;
  if (!Object.keys(all[bid]).filter(k => k !== 'updatedAt').length) delete all[bid];
  saveSparemaal(all);
  snapshotNetWorth();
  renderSparing();
  showToast('Lagret');
}

function formatUpdatedAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `Sist oppdatert ${dd}.${mm}.${yy} kl. ${hh}:${mi}`;
}

function addCustomBucket(label, emoji, balVal, goalVal) {
  const buckets = loadCustomBuckets();
  const id = 'custom_' + Date.now();
  const colorIdx = buckets.filter(b=>!b.hidden).length % BUCKET_COLORS.length;
  buckets.push({ id, label, emoji: emoji || '💎', color: BUCKET_COLORS[colorIdx], createdAt: new Date().toISOString(), hidden: false });
  saveCustomBuckets(buckets);
  if (balVal || goalVal) sparingSaveBucket(id, balVal || '', goalVal || '');
  else renderSparing();
  showToast('Ny sparebøtte opprettet');
}

function removeCustomBucket(bid) {
  const buckets = loadCustomBuckets();
  const b = buckets.find(x => x.id === bid);
  if (b) { b.hidden = true; b.hiddenAt = new Date().toISOString(); }
  saveCustomBuckets(buckets);
  renderSparing();
  showToast('Sparebøtte skjult');
}

function removeDefaultBucket(bid) {
  const hidden = loadHiddenDefaults();
  if (!hidden.includes(bid)) hidden.push(bid);
  saveHiddenDefaults(hidden);
  renderSparing();
  showToast('Sparebøtte skjult');
}

function renderSparing() {
  setActiveNav('sparing');
  const mc = document.getElementById('mainContent');

  // Period transactions (informational only — does NOT affect balances)
  const filtered     = getFiltered();
  const fSavings     = filtered.filter(t => t.cat === 'savings');
  const fWithdrawals = filtered.filter(t => t.cat === 'withdrawal');
  const periodIn     = fSavings.reduce((s,t)=>s+t.ut,0);
  const periodOut    = fWithdrawals.reduce((s,t)=>s+t.inn,0);
  const periodNetto  = periodIn - periodOut;

  const saved = loadSparemaal();
  const visibleBuckets = getVisibleBuckets();
  const friendly = s => s.replace(/overføring (til|fra) /i, '').replace(/Trustly Norway AS.*/i, 'Nordnet');

  // Total assets = sum of manual balances for visible buckets only
  const totalAssets = visibleBuckets.reduce((s,b) => {
    const v = saved[b.id];
    return s + (v && typeof v.balance === 'number' ? v.balance : 0);
  }, 0);
  const bucketCount = visibleBuckets.filter(b => saved[b.id] && typeof saved[b.id].balance === 'number').length;

  // ── 1. Summary cards ──
  const summaryHtml = `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
  <div class="card" style="text-align:center">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Satt inn</div>
    <div style="font-size:22px;font-weight:700;color:#1a5fa8">-${fmt(periodIn)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fSavings.length} overføringer</div>
  </div>
  <div class="card" style="text-align:center">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Tatt ut</div>
    <div style="font-size:22px;font-weight:700;color:#ef4444">${fWithdrawals.length>0?'+'+fmt(periodOut):'—'}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fWithdrawals.length>0?fWithdrawals.length+' uttak':'ingen uttak'}</div>
  </div>
  <div class="card" style="text-align:center">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Netto denne perioden</div>
    <div style="font-size:22px;font-weight:700;color:${periodNetto>=0?'#22c55e':'#ef4444'}">${periodNetto>=0?'+':'-'}${fmt(Math.abs(periodNetto))}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fSavings.length} inn${fWithdrawals.length>0?' · '+fWithdrawals.length+' ut':''}</div>
  </div>
  <div class="card" style="text-align:center">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Faktisk saldo</div>
    <div style="font-size:22px;font-weight:700;color:#22c55e">${fmt(totalAssets)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${bucketCount} kontoer</div>
  </div>
</div>`;

  // ── 2. Sparebøtter + transactions ──
  const allPeriodTx = [
    ...fSavings.map(t=>({...t,dir:'inn'})),
    ...fWithdrawals.map(t=>({...t,dir:'ut'}))
  ].sort((a,b)=>pd(b.dato)-pd(a.dato));

  const nwHistory = JSON.parse(localStorage.getItem('okonomi_nw_history') || '[]');
  const formueHtml = nwHistory.length >= 2 ? `
    <div class="section-head" style="margin-top:0">Formue over tid</div>
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:var(--text-muted)">Total formue nå</div>
          <div style="font-size:18px;font-weight:700;color:#22c55e">${fmt(nwHistory[nwHistory.length-1].value)}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:var(--text-muted)">${nwHistory[0].date} → ${nwHistory[nwHistory.length-1].date}</div>
      </div>
      <canvas id="formueChart" style="width:100%;display:block;height:100px"></canvas>
    </div>` : '';

  mc.innerHTML = summaryHtml + formueHtml
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '  <div class="section-head" style="margin:0">Sparebøtter</div>'
    + '  <button id="addBucketBtn" style="padding:5px 12px;background:var(--green-accent);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">+ Ny bøtte</button>'
    + '</div>'
    + '<div id="addBucketForm" style="display:none;margin-bottom:16px"></div>'
    + '<div id="spareBucketGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px"></div>'
    + (allPeriodTx.length ? '<div class="section-head">Transaksjoner</div><div class="card" id="txList"></div>' : '')
    + (allPeriodTx.length ? '<div id="txListSummary" style="display:flex;gap:12px;justify-content:flex-end;padding:8px 0;font-size:12px;color:var(--text-muted)"></div>' : '');

  // ── "Add new bucket" form toggle ──
  const addBtn = document.getElementById('addBucketBtn');
  const addForm = document.getElementById('addBucketForm');
  addBtn.addEventListener('click', () => {
    if (addForm.style.display === 'none') {
      const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';
      addForm.style.display = 'block';
      addForm.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'card';
      wrap.style.cssText = 'padding:14px';
      wrap.innerHTML = `
        <div style="font-weight:600;font-size:13px;margin-bottom:10px">Opprett ny sparebøtte</div>
        <div style="display:grid;grid-template-columns:60px 1fr;gap:6px;margin-bottom:8px">
          <input id="nbEmoji" type="text" placeholder="💎" maxlength="4" style="${iSt};text-align:center;font-size:18px">
          <input id="nbName" type="text" placeholder="Navn på bøtte…" style="${iSt}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
          <input id="nbBal" type="number" placeholder="Startsaldo…" style="${iSt}">
          <input id="nbGoal" type="number" placeholder="Sparemål…" style="${iSt}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;color:var(--text-muted);text-align:center;margin-bottom:8px">
          <span>Faktisk saldo</span><span>Mål</span>
        </div>
        <div style="display:flex;gap:6px">
          <button id="nbSave" style="flex:1;padding:7px;background:var(--green-accent);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600">Opprett</button>
          <button id="nbCancel" style="padding:7px 14px;background:var(--border);color:var(--text);border:none;border-radius:6px;font-size:13px;cursor:pointer">Avbryt</button>
        </div>`;
      addForm.appendChild(wrap);
      document.getElementById('nbCancel').addEventListener('click', () => { addForm.style.display = 'none'; });
      document.getElementById('nbSave').addEventListener('click', () => {
        const name = document.getElementById('nbName').value.trim();
        if (!name) { showToast('Skriv inn et navn'); return; }
        addCustomBucket(name, document.getElementById('nbEmoji').value.trim(), document.getElementById('nbBal').value.trim(), document.getElementById('nbGoal').value.trim());
      });
    } else {
      addForm.style.display = 'none';
    }
  });

  // ── Build each bucket card ──
  const grid = document.getElementById('spareBucketGrid');

  if (visibleBuckets.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-muted)">
      <div style="font-size:36px;margin-bottom:12px">🪣</div>
      <div style="font-weight:600;font-size:15px;margin-bottom:6px">Ingen sparebøtter enda</div>
      <div style="font-size:12px">Klikk «+ Ny bøtte» for å opprette din første</div>
    </div>`;
  }

  visibleBuckets.forEach(b => {
    const bdata = saved[b.id] || {};
    const bal   = (typeof bdata.balance === 'number') ? bdata.balance : null;
    const goal  = (typeof bdata.target  === 'number') ? bdata.target  : 0;
    const pct   = (goal > 0 && bal !== null) ? Math.min(100, Math.round(bal / goal * 100)) : 0;
    const rem   = (goal > 0 && bal !== null) ? Math.max(0, goal - bal) : 0;
    const fc    = pct>=100?'#22c55e':pct>=66?'#84cc16':pct>=33?'#f59e0b':'#ef4444';

    const card = document.createElement('div');
    card.className = 'card';

    // Top row: emoji + name + balance
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px';

    const em = document.createElement('div');
    em.style.cssText = 'font-size:22px;line-height:1';
    em.innerHTML = b.emoji;

    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1';
    const nm = document.createElement('div');
    nm.style.cssText = 'font-weight:600;font-size:14px';
    nm.textContent = b.label;
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:var(--text-muted)';
    sub.textContent = bdata.updatedAt ? formatUpdatedAt(bdata.updatedAt) : (bal !== null ? 'Manuell saldo' : 'Ikke satt');
    mid.append(nm, sub);

    const disp = document.createElement('div');
    disp.style.cssText = 'font-size:20px;font-weight:700;color:'+b.color+';white-space:nowrap';
    disp.textContent = bal !== null ? fmt(bal) : '—';

    top.append(em, mid, disp);
    card.appendChild(top);

    // Progress bar: sparemål as x/y
    if (goal > 0 && bal !== null) {
      const track = document.createElement('div');
      track.style.cssText = 'height:6px;background:var(--border);border-radius:99px;margin-bottom:6px';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:'+pct+'%;background:'+fc+';border-radius:99px';
      track.appendChild(fill);
      card.appendChild(track);
      const prog = document.createElement('div');
      prog.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px';
      prog.innerHTML = '<span>'+fmt(bal)+' / '+fmt(goal)+' ('+pct+'%)</span><span>'+(rem>0?fmt(rem)+' gjenstår':'✓ Mål nådd!')+'</span>';
      card.appendChild(prog);
    }

    // Inputs
    const iRow = document.createElement('div');
    iRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px';
    const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';

    const balInp = document.createElement('input');
    balInp.type='number'; balInp.placeholder='Faktisk saldo…'; balInp.style.cssText=iSt;
    if (bal !== null) balInp.value = bal;

    const goalInp = document.createElement('input');
    goalInp.type='number'; goalInp.placeholder='Sparemål…'; goalInp.style.cssText=iSt;
    if (goal) goalInp.value = goal;

    iRow.append(balInp, goalInp);
    card.appendChild(iRow);

    const lRow = document.createElement('div');
    lRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:10px;color:var(--text-muted);text-align:center;margin-top:3px';
    lRow.innerHTML = '<span>Faktisk saldo</span><span>Sparemål</span>';
    card.appendChild(lRow);

    // Action buttons row
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px';

    const btn = document.createElement('button');
    btn.textContent = 'Lagre';
    btn.style.cssText = 'flex:1;padding:7px;background:var(--green-accent);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600';
    btn.addEventListener('click', () => sparingSaveBucket(b.id, balInp.value.trim(), goalInp.value.trim()));
    btnRow.appendChild(btn);

    const rmBtn = document.createElement('button');
    rmBtn.textContent = 'Fjern';
    rmBtn.style.cssText = 'padding:7px 12px;background:none;color:#ef4444;border:1px solid #ef4444;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600';
    rmBtn.addEventListener('click', () => {
      if (confirm('Skjul "' + b.label + '"? Data blir ikke slettet.')) {
        b.isCustom ? removeCustomBucket(b.id) : removeDefaultBucket(b.id);
      }
    });
    btnRow.appendChild(rmBtn);

    [balInp, goalInp].forEach(i => i.addEventListener('keydown', e => { if (e.key==='Enter') btn.click(); }));
    card.appendChild(btnRow);
    grid.appendChild(card);
  });

  // Transaction list
  const txList = document.getElementById('txList');
  if (txList && allPeriodTx.length) {
    allPeriodTx.forEach(tx => {
      const row = document.createElement('div');
      row.className = 'saving-row';
      const left = document.createElement('div');
      left.style.cssText = 'flex:1;min-width:0';
      const name = document.createElement('div');
      name.className = 'sr-name';
      if (tx.dir==='ut') name.style.color = '#ef4444';
      name.textContent = (tx.dir==='inn'?'→ ':'← ')+friendly(tx.beskr)+(tx.dir==='ut'?' (uttak)':'');
      const date = document.createElement('div');
      date.className = 'sr-sub';
      date.textContent = tx.dato;
      left.append(name, date);
      const amt = document.createElement('div');
      amt.className = 'sr-amt';
      if (tx.dir==='ut') amt.style.color = '#ef4444';
      amt.textContent = (tx.dir==='inn'?'+':'-')+fmt(tx.dir==='inn'?tx.ut:tx.inn);
      row.append(left, amt);
      txList.appendChild(row);
    });
  }

  // Transaction list summary
  const txSummaryEl = document.getElementById('txListSummary');
  if (txSummaryEl && allPeriodTx.length) {
    txSummaryEl.innerHTML = `
      <span>Inn: <strong style="color:#1a5fa8">-${fmt(periodIn)}</strong></span>
      <span>·</span>
      <span>Ut: <strong style="color:#ef4444">${fWithdrawals.length>0?'+'+fmt(periodOut):'—'}</strong></span>
      <span>·</span>
      <span>Netto: <strong style="color:${periodNetto>=0?'#22c55e':'#ef4444'}">${periodNetto>=0?'+':'-'}${fmt(Math.abs(periodNetto))}</strong></span>`;
  }

  // ── Render Formue over tid (manual balance history) ──
  if (nwHistory.length >= 2) {
    setTimeout(() => {
      const canvas = document.getElementById('formueChart');
      if (!canvas) return;
      const W = canvas.parentElement.offsetWidth;
      const H = 100;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const pad = { top: 8, right: 8, bottom: 20, left: 48 };
      const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
      const vals = nwHistory.map(p => p.value);
      const minV = Math.min(...vals) * 0.95, maxV = Math.max(...vals) * 1.05;
      const range = maxV - minV || 1;
      const n = nwHistory.length;
      const x = i => pad.left + (i / (n - 1)) * cw;
      const y = v => pad.top + (1 - (v - minV) / range) * ch;
      const isDark = document.body.classList.contains('dark');
      const labelColor = isDark ? '#6b7488' : '#9aab90';
      const fmtY = v => v >= 1000 ? Math.round(v/1000) + 'k' : Math.round(v).toString();
      // Y-axis grid + labels
      [0.25, 0.5, 0.75, 1].forEach(f => {
        const val = minV + f * range;
        const yy  = y(val);
        ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left+cw, yy);
        ctx.strokeStyle = isDark ? '#23262f' : '#f0f4ee'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = labelColor; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(fmtY(val), pad.left - 6, yy + 3);
      });
      // Fill
      ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
      vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.lineTo(x(n-1), H-pad.bottom); ctx.lineTo(x(0), H-pad.bottom); ctx.closePath();
      ctx.fillStyle = isDark ? 'rgba(74,222,128,0.1)' : 'rgba(34,197,94,0.1)'; ctx.fill();
      // Line
      ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
      vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
      // Date labels + dots: first, middle, last
      [0, Math.floor(n/2), n-1].forEach(i => {
        ctx.beginPath(); ctx.arc(x(i), y(vals[i]), 3, 0, Math.PI*2); ctx.fillStyle='#22c55e'; ctx.fill();
        ctx.fillStyle = labelColor; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(nwHistory[i].date, x(i), H - 4);
      });
    }, 0);
  }
}

// ── Net worth snapshot ───────────────────────────────────────────
function snapshotNetWorth() {
  const assets = getTotalManualAssets();
  if (assets.count === 0) return;
  const history = JSON.parse(localStorage.getItem('okonomi_nw_history') || '[]');
  const today = new Date();
  const dateStr = String(today.getDate()).padStart(2,'0') + '.' + String(today.getMonth()+1).padStart(2,'0') + '.' + today.getFullYear();
  // Dedupe: replace if same date already exists
  const existing = history.findIndex(p => p.date === dateStr);
  if (existing >= 0) history[existing].value = assets.sum;
  else history.push({ date: dateStr, value: assets.sum });
  // Keep max 365 entries
  while (history.length > 365) history.shift();
  localStorage.setItem('okonomi_nw_history', JSON.stringify(history));
}
