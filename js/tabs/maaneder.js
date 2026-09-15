// ── Måneder ──────────────────────────────────────────────────────
function renderMaaneder() {
  setActiveNav('maaneder');
  const stored      = loadStored();
  const allMonthKeys= [...new Set(stored.map(t=>getMonthKey(t.dato)))].sort();
  const years       = [...new Set(allMonthKeys.map(mk=>mk.split('-')[0]))].sort().reverse();
  const c           = document.getElementById('mainContent');
  c.innerHTML = '';

  if (!allMonthKeys.length) {
    c.innerHTML = '<div class="card"><div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Ingen lagrede måneder</div></div>';
    return;
  }

  const totalTx = stored.length;
  const statsDiv = document.createElement('div');
  statsDiv.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px';
  statsDiv.innerHTML = `
    <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">År lagret</div><div style="font-size:24px;font-weight:600;color:#2d6a2d">${years.length}</div></div>
    <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Måneder</div><div style="font-size:24px;font-weight:600;color:#2d6a2d">${allMonthKeys.length}</div></div>
    <div class="card" style="text-align:center"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Transaksjoner</div><div style="font-size:24px;font-weight:600;color:#2d6a2d">${totalTx}</div></div>`;
  c.appendChild(statsDiv);

  for (const year of years) {
    const yearMonths = allMonthKeys.filter(mk => mk.startsWith(year));
    const yearTx     = stored.filter(t => t.dato.split('.')[2] === year).length;
    const section    = document.createElement('div');
    section.className = 'card'; section.style.marginBottom = '10px';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none;padding:2px 0';
    header.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:16px;font-weight:700;color:#2d6a2d">${year}</div>
        <div style="font-size:12px;color:var(--text-muted)">${yearMonths.length} måneder · ${yearTx} transaksjoner</div>
      </div>
      <div class="yr-arrow" style="font-size:12px;color:var(--text-muted);transition:transform 0.2s">▼</div>`;

    const body = document.createElement('div');
    body.style.cssText = 'display:none;margin-top:14px;border-top:1px solid var(--border-light);padding-top:12px';

    // Compute year totals
    let yearTotalInc = 0, yearTotalExp = 0, yearTotalTx = 0;
    const monthRows = yearMonths.map(mk => {
      const parts = mk.split('-');
      const label = monthsNo[+parts[1]-1] + ' ' + parts[0];
      const mTxs  = stored.filter(t => getMonthKey(t.dato) === mk);
      const classified = mTxs.map(t => ({...t, cat: classify(t)}));
      const inc = classified.filter(t=>t.cat==='income').reduce((s,t)=>s+t.inn,0);
      const exp = classified.filter(t=>!['income','savings','internal','transfer_in','reselling','folk'].includes(t.cat)&&t.ut>0).reduce((s,t)=>s+t.ut,0);
      const netto = inc - exp;
      yearTotalInc += inc; yearTotalExp += exp; yearTotalTx += mTxs.length;
      const mc = loadMonthClose()[mk];
      const nettoC = netto >= 0 ? '#2d6a2d' : '#c0392b';
      return `<tr style="border-bottom:1px solid var(--border-light)">
        <td style="padding:9px 0;font-weight:500">${label}${mc?'  ✅':''}</td>
        <td style="padding:9px 0;text-align:right;color:var(--text-muted)">${mTxs.length}</td>
        <td style="padding:9px 0;text-align:right;color:#2d6a2d;font-weight:500">+${fmt(inc)}</td>
        <td style="padding:9px 0;text-align:right;color:#c0392b;font-weight:500">-${fmt(exp)}</td>
        <td style="padding:9px 0;text-align:right;color:${nettoC};font-weight:500">${netto>=0?'+':'−'}${fmt(Math.abs(netto))}</td>
        <td style="padding:9px 0;text-align:right;white-space:nowrap">
          <button class="open-close-btn sort-btn" data-month="${mk}" data-inc="${inc}" data-exp="${exp}" style="font-size:10px;padding:3px 7px;margin-right:4px">📋</button>
          <button class="del-month" data-month="${mk}" style="background:none;border:none;color:#ddd;cursor:pointer;font-size:16px;line-height:1;padding:0">×</button>
        </td>
      </tr>`;
    }).join('');

    const yearNetto = yearTotalInc - yearTotalExp;
    const nettoColor = yearNetto >= 0 ? '#2d6a2d' : '#c0392b';

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px';
    table.innerHTML = `<thead><tr>
      <th style="text-align:left;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;padding-bottom:8px">Måned</th>
      <th style="text-align:right;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;padding-bottom:8px">Transaksjoner</th>
      <th style="text-align:right;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;padding-bottom:8px">Inntekt</th>
      <th style="text-align:right;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;padding-bottom:8px">Utgifter</th>
      <th style="text-align:right;font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.5px;padding-bottom:8px">Netto</th>
      <th style="width:32px"></th>
    </tr></thead><tbody>${monthRows}</tbody>
    <tfoot><tr style="border-top:2px solid var(--border)">
      <td style="padding:10px 0;font-size:12px;font-weight:600;color:var(--text)">Totalt ${year}</td>
      <td style="padding:10px 0;text-align:right;font-size:12px;color:var(--text-muted)">${yearTotalTx}</td>
      <td style="padding:10px 0;text-align:right;font-size:13px;font-weight:700;color:#2d6a2d">+${fmt(yearTotalInc)}</td>
      <td style="padding:10px 0;text-align:right;font-size:13px;font-weight:700;color:#c0392b">−${fmt(yearTotalExp)}</td>
      <td style="padding:10px 0;text-align:right;font-size:13px;font-weight:700;color:${nettoColor}">${yearNetto>=0?'+':'−'}${fmt(Math.abs(yearNetto))}</td>
      <td></td>
    </tr></tfoot>`;

    body.appendChild(table);

    // Monthly close panels (one per month, hidden by default)
    for (const mk of yearMonths) {
      const parts  = mk.split('-');
      const label  = monthsNo[+parts[1]-1] + ' ' + parts[0];
      const mTxs2  = stored.filter(t => getMonthKey(t.dato) === mk);
      const cl2    = mTxs2.map(t => ({...t, cat: classify(t)}));
      const inc2   = cl2.filter(t=>t.cat==='income').reduce((s,t)=>s+t.inn,0);
      const exp2   = cl2.filter(t=>!['income','savings','internal','transfer_in','reselling','folk','savings','withdrawal'].includes(t.cat)&&t.ut>0).reduce((s,t)=>s+t.ut,0);
      const catTotals2 = {};
      cl2.filter(t=>!['income','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat)&&t.ut>0).forEach(t=>{ catTotals2[t.cat]=(catTotals2[t.cat]||0)+t.ut; });
      const worstCat = Object.entries(catTotals2).sort((a,b)=>b[1]-a[1])[0];
      const worstLabel = worstCat ? (CATS.find(c=>c.id===worstCat[0])?.emoji+' '+(CATS.find(c=>c.id===worstCat[0])?.label||worstCat[0])+' ('+fmt(worstCat[1])+')') : '—';
      const mc2 = loadMonthClose()[mk] || {};
      const closePanel = document.createElement('div');
      closePanel.id = `close-panel-${mk}`;
      closePanel.style.cssText = 'display:none;margin-top:12px;padding:14px;background:var(--chip-bg);border-radius:10px';
      closePanel.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:12px">📋 Månedsslutt — ${label}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:var(--card-bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Inntekt</div>
            <div style="font-weight:700;color:#4caf50">${fmt(inc2)}</div>
          </div>
          <div style="background:var(--card-bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Utgifter</div>
            <div style="font-weight:700;color:#f44336">${fmt(exp2)}</div>
          </div>
          <div style="background:var(--card-bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Netto</div>
            <div style="font-weight:700;color:${inc2-exp2>=0?'#4caf50':'#f44336'}">${fmt(inc2-exp2)}</div>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Verste kategori: <strong style="color:var(--text)">${worstLabel}</strong></div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div>
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Hva endret seg denne måneden?</label>
            <textarea id="mc-endret-${mk}" rows="2" placeholder="F.eks. brukte mer på mat, færre restaurantbesøk..."
              style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:12px;resize:vertical">${mc2.endret||''}</textarea>
          </div>
          <div>
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Notat til neste måned</label>
            <textarea id="mc-neste-${mk}" rows="2" placeholder="F.eks. kutt ned på takeaway, spar mer til ferie..."
              style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:12px;resize:vertical">${mc2.neste||''}</textarea>
          </div>
          <div style="display:flex;gap:6px">
            <button class="sort-btn sort-active save-close-btn" data-month="${mk}">Lagre</button>
            <button class="sort-btn cancel-close-btn" data-month="${mk}">Lukk</button>
          </div>
          ${mc2.savedAt?`<div style="font-size:11px;color:var(--text-muted)">Sist lagret ${new Date(mc2.savedAt).toLocaleDateString('nb-NO')}</div>`:''}
        </div>`;
      body.appendChild(closePanel);
    }
    let open = false;
    header.addEventListener('click', () => {
      open = !open;
      body.style.display = open ? 'block' : 'none';
      header.querySelector('.yr-arrow').style.transform = open ? '' : 'rotate(-90deg)';
    });
    header.querySelector('.yr-arrow').style.transform = 'rotate(-90deg)';
    section.appendChild(header); section.appendChild(body); c.appendChild(section);
  }

  const danger = document.createElement('div');
  danger.style.marginTop = '8px';
  danger.innerHTML = `<button class="danger-btn" id="clearAllBtn">Slett alle data</button>`;
  c.appendChild(danger);

  document.querySelectorAll('.open-close-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const panel = document.getElementById(`close-panel-${btn.dataset.month}`);
      if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
  });
  document.querySelectorAll('.save-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mk = btn.dataset.month;
      const all = loadMonthClose();
      all[mk] = {
        endret:  document.getElementById(`mc-endret-${mk}`)?.value || '',
        neste:   document.getElementById(`mc-neste-${mk}`)?.value || '',
        savedAt: new Date().toISOString(),
      };
      saveMonthClose(all);
      showToast('Månedsslutt lagret ✅');
      renderMaaneder();
    });
  });
  document.querySelectorAll('.cancel-close-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const panel = document.getElementById(`close-panel-${btn.dataset.month}`);
      if (panel) panel.style.display = 'none';
    });
  });
  document.querySelectorAll('.del-month').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const mk = btn.dataset.month, parts = mk.split('-');
      const label = monthsNo[+parts[1]-1] + ' ' + parts[0];
      if (confirm(`Slette data for ${label}?`)) {
        saveStored(loadStored().filter(t => getMonthKey(t.dato) !== mk));
        showToast(`${label} slettet`);
        if (activeMonthFilter === mk) activeMonthFilter = null;
        boot(false);
      }
    });
  });
  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    if (confirm('Slette ALL lagret data? (transaksjoner, kategorier, budsjett, notater, vakter osv.) Dette kan ikke angres.')) {
      const allKeys = [STORAGE_KEY,OVERRIDES_KEY,BUDGET_KEY,INCOME_KEY,NOTES_KEY,SPLIT_KEY,VAKTKODER_KEY,VAKTER_KEY,VAKTSETT_KEY,LONN_KEY,FORDELING_KEY,CHECKPOINTS_KEY,MONTHCLOSE_KEY,SPAREMAAL_KEY,CUSTOM_BUCKETS_KEY];
      allKeys.forEach(k => { localStorage.removeItem(k); idbSet(k, null); });
      showToast('Alle data slettet');
      activeMonthFilter = null;
      boot(true);
    }
  });
}

