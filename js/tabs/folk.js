// ── Folk / Privat ─────────────────────────────────────────────────
function renderFolk() {
  setActiveNav('folk');
  const data     = getFiltered();
  const inn      = data.filter(t => t.cat === 'folk' && t.inn > 0).sort((a,b)=>pd(b.dato)-pd(a.dato));
  const ut       = data.filter(t => t.cat === 'folk' && t.ut  > 0).sort((a,b)=>pd(b.dato)-pd(a.dato));
  const totalInn = inn.reduce((s,t)=>s+t.inn,0);
  const totalUt  = ut.reduce((s,t)=>s+t.ut,0);
  const netto    = totalInn - totalUt;
  const makeRows = (txs, dir) => txs.map(tx=>`
    <tr>
      <td><div class="tx-icon-sm" style="background:${dir==='inn'?'#e8f5e9':'#fce8e6'}">👤</div></td>
      <td class="tx-name-cell"><span class="tn">${tx.beskr}</span></td>
      <td style="color:var(--text-muted);font-size:12px">${tx.dato}</td>
      <td class="${dir==='inn'?'tx-amt-inn':'tx-amt-out'}">${dir==='inn'?'+'+fmt(tx.inn):'-'+fmt(tx.ut)}</td>
    </tr>`).join('');

  document.getElementById('mainContent').innerHTML = `
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
  <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Inn fra andre</div><div style="font-size:24px;font-weight:600;color:#2d6a2d">+${fmt(totalInn)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${inn.length} innbetalinger</div></div>
  <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Ut til andre</div><div style="font-size:24px;font-weight:600;color:#c0392b">-${fmt(totalUt)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${ut.length} utbetalinger</div></div>
  <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Netto</div><div style="font-size:24px;font-weight:600;color:${netto>=0?'#2d6a2d':'#c0392b'}">${netto>=0?'+':''}${fmt(netto)}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">totalt</div></div>
</div>
${inn.length>0?`<div class="section-head">Inn fra andre</div><div class="card"><table class="tx-table"><thead><tr><th></th><th>Fra</th><th>Dato</th><th>Beløp</th></tr></thead><tbody>${makeRows(inn,'inn')}</tbody><tfoot><tr style="border-top:2px solid var(--border)"><td colspan="3" style="padding:10px 0;font-size:12px;color:var(--text-muted)">${inn.length} transaksjoner</td><td style="padding:10px 0;font-weight:600;color:#2d6a2d;text-align:right">+${fmt(totalInn)}</td></tr></tfoot></table></div>`:''}
${ut.length>0?`<div class="section-head">Ut til andre</div><div class="card"><table class="tx-table"><thead><tr><th></th><th>Til</th><th>Dato</th><th>Beløp</th></tr></thead><tbody>${makeRows(ut,'ut')}</tbody><tfoot><tr style="border-top:2px solid var(--border)"><td colspan="3" style="padding:10px 0;font-size:12px;color:var(--text-muted)">${ut.length} transaksjoner</td><td style="padding:10px 0;font-weight:600;color:#c0392b;text-align:right">-${fmt(totalUt)}</td></tr></tfoot></table></div>`:''}
${inn.length===0&&ut.length===0?'<div class="card"><div style="color:var(--text-muted);font-size:13px;padding:8px 0;text-align:center">Ingen private transaksjoner denne perioden</div></div>':''}`;
}

