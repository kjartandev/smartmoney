// ── Innsikt ───────────────────────────────────────────────────────
function renderInnsikt() {
  setActiveNav('innsikt');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  const stored    = loadStored();
  const allMonths = [...new Set(stored.map(t=>getMonthKey(t.dato)))].sort();

  if (!stored.length) {
    c.innerHTML = '<div class="card"><div style="color:var(--text-muted);font-size:13px;text-align:center;padding:24px">Ingen data ennå — last opp transaksjoner for å se innsikt.</div></div>';
    return;
  }

  // ── Section: Top merchants with pagination ──────────────────────
  const merchantTotals = {};
  const merchantMonths = {};
  for (const tx of allClassified) {
    if (['income','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(tx.cat)) continue;
    if (tx.ut <= 0) continue;
    merchantTotals[tx.beskr] = (merchantTotals[tx.beskr]||0) + tx.ut;
    if (!merchantMonths[tx.beskr]) merchantMonths[tx.beskr] = new Set();
    merchantMonths[tx.beskr].add(getMonthKey(tx.dato));
  }
  const allMerchants = Object.entries(merchantTotals).sort((a,b)=>b[1]-a[1]);
  const TOP_LIMIT    = 50;
  const MER_PER_PAGE = 25;
  const topMerchants = allMerchants.slice(0, TOP_LIMIT);

  if (topMerchants.length) {
    const merHead = document.createElement('div'); merHead.className='section-head'; merHead.textContent='Topp steder (alle tider)'; c.appendChild(merHead);
    const merCard = document.createElement('div'); merCard.className='card'; c.appendChild(merCard);

    let merPage  = 1;
    let merMode  = 'top3'; // 'top3' | 'alle'
    const nMonths       = allMonths.length || 1;
    const totalMerPages = Math.ceil(topMerchants.length / MER_PER_PAGE);

    const merRow = ([name, total], rank) => {
      const mCount  = merchantMonths[name]?.size || 1;
      const perMonth= total / nMonths;
      const barW    = (total / topMerchants[0][1] * 100).toFixed(1);
      const medals  = ['🥇','🥈','🥉'];
      const rankEl  = rank < 3 ? medals[rank] : `<span style="font-size:11px;font-weight:700;color:var(--text-muted)">#${rank+1}</span>`;
      return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border-light)">
        <span style="font-size:16px;flex-shrink:0;width:22px;text-align:center">${rankEl}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
          <div style="height:4px;background:var(--budget-track-bg);border-radius:2px;overflow:hidden;margin-top:5px">
            <div style="height:100%;width:${barW}%;background:#2d6a2d;border-radius:2px"></div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;min-width:90px">
          <div style="font-size:13px;font-weight:600;color:var(--text)">${fmt(total)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${fmt(perMonth)}/mnd · ${mCount} mnd</div>
        </div>
      </div>`;
    };

    const renderMerchants = () => {
      const toggleHtml = `<div style="display:flex;gap:6px;margin-bottom:12px">
        <button class="sort-btn mer-mode-btn${merMode==='top3'?' sort-active':''}" data-mode="top3">Topp 3</button>
        <button class="sort-btn mer-mode-btn${merMode==='alle'?' sort-active':''}" data-mode="alle">Alle</button>
      </div>`;

      let bodyHtml = '';
      if (merMode === 'top3') {
        bodyHtml = topMerchants.slice(0,3).map((entry, i) => merRow(entry, i)).join('');
      } else {
        const pageSlice    = topMerchants.slice((merPage-1)*MER_PER_PAGE, merPage*MER_PER_PAGE);
        const globalOffset = (merPage-1)*MER_PER_PAGE;
        bodyHtml = pageSlice.map((entry, i) => merRow(entry, globalOffset+i)).join('');
        if (totalMerPages > 1) {
          bodyHtml += `<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">
            <button class="sort-btn mer-prev" style="padding:5px 12px" ${merPage===1?'disabled':''}>← Forrige</button>
            <span style="font-size:12px;color:var(--text-muted)">Side ${merPage} av ${totalMerPages} · topp ${topMerchants.length}</span>
            <button class="sort-btn mer-next" style="padding:5px 12px" ${merPage===totalMerPages?'disabled':''}>Neste →</button>
          </div>`;
        }
      }

      merCard.innerHTML = toggleHtml + bodyHtml;
      merCard.querySelectorAll('.mer-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => { merMode = btn.dataset.mode; merPage = 1; renderMerchants(); });
      });
      merCard.querySelector('.mer-prev')?.addEventListener('click', () => { merPage--; renderMerchants(); });
      merCard.querySelector('.mer-next')?.addEventListener('click', () => { merPage++; renderMerchants(); });
    };
    renderMerchants();
  }

  // ── Section: Recurring / subscriptions detection ────────────────
  const recurMap = {};
  const allStoredClassified = stored.map(t => ({...t, cat: classify(t)}));
  for (const tx of allStoredClassified) {
    if (tx.ut <= 0) continue;
    if (['income','savings','internal','transfer_in','folk','withdrawal'].includes(tx.cat)) continue;
    const key = tx.beskr.toLowerCase().trim();
    if (!recurMap[key]) recurMap[key] = { originalName: tx.beskr, entries: [], cat: tx.cat };
    recurMap[key].entries.push({ mk: getMonthKey(tx.dato), amt: tx.ut, cat: tx.cat, dato: tx.dato });
  }

  const fixedCosts = [];
  for (const [, data] of Object.entries(recurMap)) {
    const { originalName, entries } = data;
    const months = [...new Set(entries.map(e=>e.mk))];
    if (months.length < 3) continue;

    const totalMonths  = allMonths.length;
    const coverageRatio= months.length / Math.max(totalMonths, 1);

    const perMonth = {};
    for (const e of entries) perMonth[e.mk] = (perMonth[e.mk]||0) + e.amt;
    const monthlyAmounts = Object.values(perMonth);
    const avgAmt = monthlyAmounts.reduce((s,a)=>s+a,0) / monthlyAmounts.length;
    const stddev = Math.sqrt(monthlyAmounts.map(a=>(a-avgAmt)**2).reduce((s,v)=>s+v,0)/monthlyAmounts.length);
    const cv = avgAmt > 0 ? stddev / avgAmt : 1;

    if (cv > 0.25) continue;
    if (avgAmt < 5) continue;

    const catId  = entries[entries.length-1].cat;
    const catInfo= CATS.find(c=>c.id===catId) || {emoji:'💼', label:'Diverse', id:'diverse'};
    const isSubscription = catInfo.id === 'abo' || (avgAmt < 600 && coverageRatio >= 0.5);
    const yearlyEstimate = avgAmt * 12;

    fixedCosts.push({ name: originalName, avgAmt, months: months.length, catInfo, isSubscription, yearlyEstimate, coverageRatio, entries });
  }
  fixedCosts.sort((a,b) => b.avgAmt - a.avgAmt);

  const subs   = fixedCosts.filter(f => f.isSubscription);
  const places = fixedCosts.filter(f => !f.isSubscription);

  if (subs.length) {
    const totalSubsMnd = subs.reduce((s,f)=>s+f.avgAmt, 0);
    const totalSubsAar = totalSubsMnd * 12;
    const subHead = document.createElement('div'); subHead.className='section-head';
    subHead.textContent = `Abonnementer & faste utgifter · ${subs.length} aktive`; c.appendChild(subHead);
    const subCard = document.createElement('div'); subCard.className='card';
    subCard.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Per måned</div>
          <div style="font-size:22px;font-weight:700;color:#e67e22">${fmt(totalSubsMnd)}</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Per år (estimert)</div>
          <div style="font-size:22px;font-weight:700;color:#c0392b">${fmt(totalSubsAar)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">Basert på ${allMonths.length} måneder med data.</div>
      ${subs.map(f => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
        <div style="font-size:16px;flex-shrink:0">${f.catInfo.emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name.length > 32 ? f.name.slice(0,32)+'…' : f.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">${f.months} måneder registrert</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:600;color:var(--text)">~${fmt(f.avgAmt)}/mnd</div>
          <div style="font-size:11px;color:#c0392b">~${fmt(f.yearlyEstimate)}/år</div>
        </div>
      </div>`).join('')}`;
    c.appendChild(subCard);
  }

  // ── Section: Faste steder med tidsperiode-velger ────────────────
  if (places.length) {
    const plHead = document.createElement('div'); plHead.className='section-head';
    plHead.textContent = `Faste steder & periodiske utgifter · ${places.length} funnet`; c.appendChild(plHead);
    const plCard = document.createElement('div'); plCard.className='card'; c.appendChild(plCard);

    const RANGES = [
      { label: '1 mnd',  months: 1 },
      { label: '3 mnd',  months: 3 },
      { label: '6 mnd',  months: 6 },
      { label: '12 mnd', months: 12 },
    ];
    let activeRange = 3; // default: 3 months

    // Latest date in dataset as reference point
    const latestDate = stored.reduce((max, t) => {
      const d = pd(t.dato); return d > max ? d : max;
    }, new Date(0));

    const renderPlaces = () => {
      const cutoff = new Date(latestDate);
      cutoff.setMonth(cutoff.getMonth() - activeRange);

      const chipHtml = `<div style="display:flex;gap:6px;margin-bottom:14px">
        ${RANGES.map(r => `<button class="sort-btn place-range-btn${r.months===activeRange?' sort-active':''}" data-months="${r.months}">${r.label}</button>`).join('')}
      </div>`;

      const rowsHtml = places.map(f => {
        // Filter this place's entries to the selected window
        const windowEntries = f.entries.filter(e => pd(e.dato) > cutoff);
        if (!windowEntries.length) return '';
        const visits = windowEntries.length;
        const total  = windowEntries.reduce((s,e)=>s+e.amt, 0);
        const avg    = total / visits;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
          <div style="font-size:16px;flex-shrink:0">${f.catInfo.emoji}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name.length > 32 ? f.name.slice(0,32)+'…' : f.name}</div>
            <div style="font-size:11px;color:var(--text-muted)">${visits} besøk siste ${activeRange} mnd</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:13px;font-weight:600;color:var(--text)">${fmt(total)} totalt</div>
            <div style="font-size:11px;color:var(--text-muted)">~${fmt(avg)}/gang</div>
          </div>
        </div>`;
      }).filter(Boolean).join('');

      plCard.innerHTML = chipHtml + (rowsHtml || '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Ingen besøk i denne perioden.</div>');

      plCard.querySelectorAll('.place-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          activeRange = +btn.dataset.months;
          renderPlaces();
        });
      });
    };
    renderPlaces();
  }

  if (!subs.length && !places.length) {
    const emptyHead = document.createElement('div'); emptyHead.className='section-head'; emptyHead.textContent='Faste utgifter'; c.appendChild(emptyHead);
    const emptyCard = document.createElement('div'); emptyCard.className='card';
    emptyCard.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px">Trenger minst 3 måneder med data for å detektere faste utgifter.</div>';
    c.appendChild(emptyCard);
  }
}
