// ── Transaksjoner ─────────────────────────────────────────────────
function renderTransaksjoner() {
  setActiveNav('transaksjoner');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'search-bar';
  searchWrap.innerHTML = '<span class="search-icon">🔍</span><input type="text" id="txSearch" placeholder="Søk i transaksjoner..." autocomplete="off"><button class="search-clear" id="searchClear">×</button>';
  c.appendChild(searchWrap);

  const chipDefs = [
    {id:'alle',l:'Alle'},{id:'utgifter',l:'Utgifter'},{id:'inntekt',l:'Inntekt'},
    {id:'folk',l:'Privat'},{id:'sparing',l:'Sparing'},{id:'reservert',l:'Reserverte'},
  ];
  let active   = 'alle';
  let sortCol  = 'dato';
  let sortDir  = 'desc';
  let page     = 1;
  const PAGE_SIZE = 25;

  const chipsDiv = document.createElement('div'); chipsDiv.className = 'filter-chips';
  const sortBar  = document.createElement('div');
  sortBar.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap';
  sortBar.innerHTML = `<span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Sorter:</span><button class="sort-btn sort-active" data-col="dato">Dato ↓</button><button class="sort-btn" data-col="amt">Beløp</button><button class="sort-btn" data-col="cat">Kategori</button>`;

  const paginationTop = document.createElement('div');
  const cardWrap  = document.createElement('div'); cardWrap.className = 'card';
  const tableWrap = document.createElement('table'); tableWrap.className = 'tx-table';
  tableWrap.innerHTML = '<thead><tr><th></th><th>Beskrivelse</th><th>Dato</th><th>Kategori</th><th>Notat/Handl.</th><th>Beløp</th></tr></thead>';
  const tbody = document.createElement('tbody');
  const tfoot = document.createElement('tfoot');
  tableWrap.appendChild(tbody);
  tableWrap.appendChild(tfoot);
  cardWrap.appendChild(tableWrap);
  const paginationBot = document.createElement('div');

  function updateSortBtns() {
    sortBar.querySelectorAll('.sort-btn').forEach(b => {
      const isActive = b.dataset.col === sortCol;
      b.classList.toggle('sort-active', isActive);
      const labels = {dato:'Dato',amt:'Beløp',cat:'Kategori'};
      b.textContent = labels[b.dataset.col] + (isActive ? ' '+(sortDir==='desc'?'↓':'↑') : '');
    });
  }

  function drawList() {
    const data     = getFiltered();
    const income   = data.filter(t => t.cat === 'income');
    const savings  = data.filter(t => t.cat === 'savings');
    const expenses = data.filter(t => !['income','savings','internal','transfer_in','reselling','folk','withdrawal'].includes(t.cat) && t.ut > 0);
    const allFolk  = data.filter(t => t.cat === 'folk');

    let pool;
    if      (active === 'utgifter')  pool = expenses;
    else if (active === 'inntekt')   pool = income;
    else if (active === 'folk')      pool = allFolk;
    else if (active === 'sparing')   pool = savings;
    else if (active === 'reservert') pool = data.filter(t => t.reserved);
    else pool = data.filter(t => t.cat !== 'internal');

    const searchQ = (document.getElementById('txSearch')?.value || '').toLowerCase().trim();
    if (searchQ) pool = pool.filter(t => t.beskr.toLowerCase().includes(searchQ) || fmt(t.ut).includes(searchQ) || fmt(t.inn).includes(searchQ));

    const sorted = [...pool].sort((a, b) => {
      let av, bv;
      if (sortCol === 'dato')      { av = pd(a.dato); bv = pd(b.dato); }
      else if (sortCol === 'amt')  { av = (a.ut||a.inn); bv = (b.ut||b.inn); }
      else if (sortCol === 'cat')  { av = a.cat; bv = b.cat; }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    if (!sorted.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px">Ingen transaksjoner</td></tr>';
      tfoot.innerHTML = ''; paginationTop.innerHTML = ''; paginationBot.innerHTML = '';
      return;
    }

    const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
    if (page > totalPages) page = totalPages;
    const pageSlice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const renderPagination = (el) => {
      if (totalPages <= 1) { el.innerHTML = ''; return; }
      el.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 0;margin-bottom:4px';
      el.innerHTML = `
        <button class="sort-btn pg-prev" style="padding:5px 12px" ${page===1?'disabled':''}>← Forrige</button>
        <span style="font-size:12px;color:var(--text-muted)">Side ${page} av ${totalPages} · ${sorted.length} transaksjoner</span>
        <button class="sort-btn pg-next" style="padding:5px 12px" ${page===totalPages?'disabled':''}>Neste →</button>`;
      el.querySelector('.pg-prev')?.addEventListener('click', () => { page--; drawList(); });
      el.querySelector('.pg-next')?.addEventListener('click', () => { page++; drawList(); });
    };
    renderPagination(paginationTop);
    renderPagination(paginationBot);

    const overrides  = loadOverrides();
    const notes      = loadNotes();
    const splits     = loadSplits();
    const editableCats = CATS.filter(c => !['reselling','kredittkort','bankgebyr'].includes(c.id));
    const specialCats  = [
      {id:'income',label:'Inntekt',emoji:'💰'},{id:'savings',label:'Sparing',emoji:'🏦'},
      {id:'folk',label:'Privat',emoji:'👤'},{id:'internal',label:'Intern',emoji:'🔄'},
      {id:'withdrawal',label:'Uttak sparing',emoji:'↩️'}
    ];
    const allPickable = [...editableCats, ...specialCats];

    tbody.innerHTML = pageSlice.map(tx => {
      const id = txId(tx);
      const cat = CATS.find(c=>c.id===tx.cat) || {
        emoji: tx.cat==='income'?'💰': tx.cat==='savings'?'🏦': tx.cat==='reselling'?'🏷️':'👤',
        color: tx.cat==='reselling'?'#26a69a':'#9aab90',
        label: tx.cat==='income'?'Lønn': tx.cat==='savings'?'Sparing': tx.cat==='reselling'?'Salg':'Privat'
      };
      const isOverridden = !!overrides[id];
      const catOpts = allPickable.map(c=>`<option value="${c.id}"${c.id===tx.cat?' selected':''}>${icon(c.id,{pack:'emoji'})} ${c.label}</option>`).join('');
      const note    = notes[id] || '';
      const isSplit = !!splits[id];
      const amtClass = tx.inn > 0 ? 'tx-amt-inn' : 'tx-amt-out';
      let amtHtml;
      if (isSplit && tx.ut > 0) {
        amtHtml = `<td class="${amtClass}"><span class="split-amt-orig">-${fmt(tx.ut)}</span><span class="split-amt-half">½ din del: -${fmt(tx.ut/2)}</span></td>`;
      } else {
        amtHtml = `<td class="${amtClass}">${tx.inn > 0 ? '+'+fmt(tx.inn) : '-'+fmt(tx.ut)}</td>`;
      }
      const noteHtml = note ? `<span class="tx-note-text" data-noteid="${id.replace(/"/g,'&quot;')}">📝 ${note}</span>` : '';
      return `<tr data-txid="${id.replace(/"/g,'&quot;')}">
        <td><div class="tx-icon-sm" style="background:${cat.color}22">${cat.emoji}</div></td>
        <td class="tx-name-cell">
          <span class="tn">${tx.beskr}${tx.reserved?'<span class="badge-res">Reservert</span>':''}${isSplit?'<span style="font-size:10px;background:#fff3cd;color:#e67e22;padding:1px 5px;border-radius:3px;margin-left:4px">½</span>':''}</span>
          ${noteHtml}
          <span class="tx-note-edit-wrap" style="display:none"><input class="tx-note-input" placeholder="Skriv notat..." value="${note.replace(/"/g,'&quot;')}" data-noteid="${id.replace(/"/g,'&quot;')}"></span>
        </td>
        <td style="color:var(--text-muted);font-size:12px">${tx.dato}</td>
        <td style="font-size:12px">
          <select class="cat-override-sel" style="border:1px solid ${isOverridden?'var(--green-accent)':'var(--border)'};border-radius:6px;padding:3px 6px;font-family:inherit;font-size:11px;color:${isOverridden?'var(--green-accent)':'var(--text-secondary)'};background:var(--input-bg);cursor:pointer;outline:none">
            ${catOpts}
          </select>
        </td>
        <td style="white-space:nowrap">
          <button class="note-btn" title="Legg til notat" data-noteid="${id.replace(/"/g,'&quot;')}">📝</button>
          ${tx.ut > 0 ? `<button class="split-btn${isSplit?' active':''}" title="Marker som delt" data-splitid="${id.replace(/"/g,'&quot;')}">½</button>` : ''}
        </td>
        ${amtHtml}
      </tr>`;
    }).join('');

    // Wire category changes
    tbody.querySelectorAll('.cat-override-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const id = sel.closest('tr').dataset.txid;
        const ov = loadOverrides();
        ov[id] = sel.value;
        saveOverrides(ov);
        allClassified = loadStored().map(tx => ({ ...tx, cat: classify(tx) }));
        updateTopbar(); drawList();
      });
    });

    // Wire note buttons
    tbody.querySelectorAll('.note-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row     = btn.closest('tr');
        const editWrap= row.querySelector('.tx-note-edit-wrap');
        const noteSpan= row.querySelector('.tx-note-text');
        const isOpen  = editWrap.style.display !== 'none';
        editWrap.style.display = isOpen ? 'none' : 'inline-block';
        if (!isOpen) {
          const inp = editWrap.querySelector('.tx-note-input');
          inp.focus(); inp.select();
        }
      });
    });
    tbody.querySelectorAll('.tx-note-input').forEach(inp => {
      const save = () => {
        const ns = loadNotes();
        const v  = inp.value.trim();
        if (v) ns[inp.dataset.noteid] = v;
        else delete ns[inp.dataset.noteid];
        saveNotes(ns); drawList();
      };
      inp.addEventListener('blur', save);
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = loadNotes()[inp.dataset.noteid]||''; inp.blur(); } });
    });
    // Wire note text click (to re-edit)
    tbody.querySelectorAll('.tx-note-text').forEach(span => {
      span.style.cursor = 'pointer';
      span.addEventListener('click', () => {
        const row     = span.closest('tr');
        const editWrap= row.querySelector('.tx-note-edit-wrap');
        editWrap.style.display = 'inline-block';
        span.style.display = 'none';
        editWrap.querySelector('.tx-note-input').focus();
      });
    });

    // Wire split buttons
    tbody.querySelectorAll('.split-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sp = loadSplits();
        const id = btn.dataset.splitid;
        if (sp[id]) delete sp[id]; else sp[id] = true;
        saveSplits(sp); drawList();
      });
    });

    // Sum row
    const sumOut = sorted.filter(t=>t.ut>0).reduce((s,t)=>s+t.ut,0);
    const sumInn = sorted.filter(t=>t.inn>0).reduce((s,t)=>s+t.inn,0);
    const netStr = sumInn > 0 && sumOut > 0
      ? `<span style="color:#2d6a2d">+${fmt(sumInn)}</span> &nbsp;·&nbsp; <span style="color:#c0392b">-${fmt(sumOut)}</span>`
      : sumInn > 0 ? `<span style="color:#2d6a2d">+${fmt(sumInn)}</span>`
      : `<span style="color:#c0392b">-${fmt(sumOut)}</span>`;
    tfoot.innerHTML = `<tr style="border-top:2px solid var(--border)">
      <td colspan="4" style="padding:12px 0;font-size:12px;color:var(--text-muted);font-weight:500">${sorted.length} transaksjoner totalt</td>
      <td style="padding:12px 0;font-size:12px;color:var(--text-secondary);text-align:right;font-weight:500">Sum (alle)</td>
      <td style="padding:12px 0;text-align:right;font-weight:600;font-size:13px">${netStr}</td>
    </tr>`;
  }

  chipDefs.forEach(ch => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (ch.id===active?' active':'');
    btn.textContent = ch.l;
    btn.addEventListener('click', () => {
      active = ch.id; page = 1;
      chipsDiv.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active'); drawList();
    });
    chipsDiv.appendChild(btn);
  });

  sortBar.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (sortCol === btn.dataset.col) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortCol = btn.dataset.col; sortDir = 'desc'; }
      page = 1; updateSortBtns(); drawList();
    });
  });

  c.appendChild(chipsDiv);
  c.appendChild(sortBar);
  c.appendChild(paginationTop);
  c.appendChild(cardWrap);
  c.appendChild(paginationBot);
  drawList();

  const searchEl = document.getElementById('txSearch');
  const clearBtn = document.getElementById('searchClear');
  if (searchEl) searchEl.addEventListener('input', () => { clearBtn.style.display = searchEl.value ? 'block' : 'none'; page = 1; drawList(); });
  if (clearBtn) clearBtn.addEventListener('click', () => { searchEl.value = ''; clearBtn.style.display = 'none'; page = 1; drawList(); });
}
