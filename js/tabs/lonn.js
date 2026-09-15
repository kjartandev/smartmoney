// ── Lønn kalkulator ───────────────────────────────────────────────
const LONN_KEY     = 'okonomi_lonn_v1';
const FORDELING_KEY = 'okonomi_fordeling_v1';
function loadLonnState()  { try { return JSON.parse(localStorage.getItem(LONN_KEY)||'{}'); } catch { return {}; } }
function saveLonnState(s) { localStorage.setItem(LONN_KEY, JSON.stringify(s)); }
// Migrate away from the (removed) multi-scenario shape: pull posts out of the first scenario.
function loadFordeling() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(FORDELING_KEY) || '[]'); } catch { raw = []; }
  if (Array.isArray(raw) && raw.length && 'items' in raw[0]) {
    const items = raw[0].items || [];
    saveFordeling(items);
    return items;
  }
  return Array.isArray(raw) ? raw : [];
}
function saveFordeling(f) { localStorage.setItem(FORDELING_KEY, JSON.stringify(f)); }

function renderLonnskalkulator() {
  setActiveNav('lonnskalk');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  function calcSkatt(bruttoAar) {
    const trygdeavgift  = bruttoAar * 0.077;
    const minstefradrag = Math.min(Math.max(bruttoAar * 0.46, 31800), 104450);
    const alminnelig    = Math.max(bruttoAar - minstefradrag - 108550, 0);
    const flat          = alminnelig * 0.22;
    let trinn = 0;
    if (bruttoAar > 942400) trinn += (bruttoAar - 942400) * 0.166;
    if (bruttoAar > 697150) trinn += (Math.min(bruttoAar, 942400) - 697150) * 0.136;
    if (bruttoAar > 306050) trinn += (Math.min(bruttoAar, 697150) - 306050) * 0.040;
    if (bruttoAar > 217400) trinn += (Math.min(bruttoAar, 306050) - 217400) * 0.017;
    return flat + trinn + trygdeavgift;
  }

  const saved = loadLonnState();
  let bruttoMnd     = saved.bruttoMnd || 50000;
  let manualSkattPct = saved.manualSkattPct != null ? saved.manualSkattPct : null; // null = use auto

  function autoSkattPct() { return bruttoMnd > 0 ? calcSkatt(bruttoMnd * 12) / (bruttoMnd * 12) * 100 : 0; }
  function effectivePct() { return manualSkattPct != null ? manualSkattPct : autoSkattPct(); }
  function skattMndCalc() { return Math.round(bruttoMnd * effectivePct() / 100); }
  function nettoMnd()     { return Math.round(bruttoMnd - skattMndCalc()); }
  function kr(v)          { return Math.round(v).toLocaleString('nb-NO') + ' kr'; }

  // Reorders the fordeling list by moving draggedId to sit right before/after
  // targetId, mirroring applyCategoryMove's insert logic in budsjett.js.
  function reorderFordeling(draggedId, targetId, insertAfter) {
    const items = loadFordeling();
    const dragged = items.find(i => i.id === draggedId);
    if (!dragged) return;
    const rest = items.filter(i => i.id !== draggedId);
    let idx = rest.findIndex(i => i.id === targetId);
    if (idx === -1) idx = rest.length;
    else if (insertAfter) idx += 1;
    rest.splice(idx, 0, dragged);
    saveFordeling(rest);
  }

  let draggedPostId = null;

  function renderFordeling() {
    const netto    = nettoMnd();
    const items    = loadFordeling();
    const fordelt  = items.reduce((s, i) => s + i.amount, 0);
    const rest     = netto - fordelt;
    const restPct  = netto > 0 ? Math.max(0, Math.min(fordelt / netto * 100, 100)) : 0;
    const restColor = rest < 0 ? '#f44336' : rest === 0 ? '#4caf50' : '#7dd3fc';

    const fd = document.getElementById('fordelingSection');
    if (!fd) return;
    fd.innerHTML = `
      <div class="section-head" style="display:flex;justify-content:space-between;align-items:center">
        <span>Fordeling av netto lønn</span>
        <button class="sort-btn" id="addPostBtn">+ Post</button>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px">
          <span style="color:var(--text-muted)">Netto å fordele</span>
          <span style="font-weight:700;color:#4caf50">${kr(netto)}</span>
        </div>
        <div style="background:var(--chip-bg);border-radius:4px;height:10px;overflow:hidden;margin-bottom:14px">
          <div style="height:100%;border-radius:4px;background:${rest<0?'#f44336':'#4caf50'};width:${restPct}%;transition:width 0.3s"></div>
        </div>
        ${items.length === 0 ? `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:8px 0">Ingen poster enda — legg til din første!</div>` : ''}
        ${items.map(item => `
          <div class="fordeling-row" data-id="${item.id}" draggable="true" style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-light);cursor:grab">
            <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text)"><span class="budget-drag-handle" title="Dra for å endre rekkefølge" style="opacity:1">⠿</span>${item.name}</span>
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-weight:600;font-size:13px">${kr(item.amount)}</span>
              <span style="font-size:11px;color:var(--text-muted)">${netto>0?((item.amount/netto)*100).toFixed(0)+'%':''}</span>
              <button class="sort-btn del-post-btn" data-id="${item.id}" style="padding:2px 7px;font-size:11px;color:#f44336">×</button>
            </div>
          </div>`).join('')}
        ${items.length > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding-top:10px">
          <span style="${rest<0?'color:#f44336':''}">Gjenstår</span>
          <span style="color:${restColor}">${kr(rest)}</span>
        </div>` : ''}
      </div>
      <div id="addPostForm" style="display:none">
        <div class="card" style="margin-top:8px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
          <div style="flex:1;min-width:120px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Navn</label>
            <input id="postName" type="text" placeholder="F.eks. Husleie"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px">
          </div>
          <div style="width:120px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Beløp (kr)</label>
            <input id="postAmount" type="number" placeholder="8000"
              style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px">
          </div>
          <div style="display:flex;gap:6px">
            <button class="sort-btn sort-active" id="savePostBtn">Legg til</button>
            <button class="sort-btn" id="cancelPostBtn">Avbryt</button>
          </div>
        </div>
      </div>`;

    document.getElementById('addPostBtn').addEventListener('click', () => {
      document.getElementById('addPostForm').style.display = 'block';
      document.getElementById('postName').focus();
    });
    document.getElementById('cancelPostBtn').addEventListener('click', () => {
      document.getElementById('addPostForm').style.display = 'none';
    });
    document.getElementById('savePostBtn').addEventListener('click', () => {
      const name   = document.getElementById('postName').value.trim();
      const amount = parseFloat(document.getElementById('postAmount').value) || 0;
      if (!name || !amount) { showToast('Fyll inn navn og beløp'); return; }
      const items = loadFordeling();
      items.push({ id: Date.now().toString(), name, amount });
      saveFordeling(items);
      renderFordeling();
      renderFordelingChart();
    });
    document.querySelectorAll('.del-post-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmDialog('Er du sikker på at du vil fjerne denne posten?', () => {
          saveFordeling(loadFordeling().filter(i => i.id !== btn.dataset.id));
          renderFordeling();
          renderFordelingChart();
        });
      });
    });
    document.querySelectorAll('.fordeling-row').forEach(row => {
      row.addEventListener('dragstart', e => {
        draggedPostId = row.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => { row.style.opacity = '0.4'; }, 0);
      });
      row.addEventListener('dragend', () => {
        draggedPostId = null;
        document.querySelectorAll('.fordeling-row').forEach(r => { r.style.opacity = ''; r.style.boxShadow = ''; });
      });
      row.addEventListener('dragover', e => {
        if (!draggedPostId || draggedPostId === row.dataset.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const after = (e.clientY - row.getBoundingClientRect().top) > row.getBoundingClientRect().height / 2;
        row.style.boxShadow = after ? 'inset 0 -2px 0 0 var(--green-accent)' : 'inset 0 2px 0 0 var(--green-accent)';
      });
      row.addEventListener('dragleave', () => { row.style.boxShadow = ''; });
      row.addEventListener('drop', e => {
        if (!draggedPostId || draggedPostId === row.dataset.id) return;
        e.preventDefault();
        const after = (e.clientY - row.getBoundingClientRect().top) > row.getBoundingClientRect().height / 2;
        reorderFordeling(draggedPostId, row.dataset.id, after);
        draggedPostId = null;
        renderFordeling();
        renderFordelingChart();
      });
    });
  }

  // ── Build page ────────────────────────────────────────────────
  const skattMnd  = skattMndCalc();
  const netto     = nettoMnd();
  const effRate   = effectivePct().toFixed(1);

  // ── Two-column layout ─────────────────────────────────────────
  const pageWrap = document.createElement('div');
  pageWrap.style.cssText = 'display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap';
  c.appendChild(pageWrap);

  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'flex:0 0 320px;min-width:260px';
  pageWrap.appendChild(leftCol);

  const topCard = document.createElement('div');
  topCard.className = 'card';
  topCard.style.marginBottom = '20px';
  topCard.innerHTML = `
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:14px">Lønnskalkulator 2025</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:16px;align-items:end">
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Brutto månedslønn</label>
        <input id="lonnInput" type="number" value="${bruttoMnd}"
          style="width:100%;box-sizing:border-box;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:18px;font-weight:700">
      </div>
      <div style="min-width:80px">
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:6px">Skatt %</label>
        <input id="skattPctInput" type="number" min="0" max="60" step="0.1"
          placeholder="${autoSkattPct().toFixed(1)}"
          value="${manualSkattPct != null ? manualSkattPct : ''}"
          style="width:100%;box-sizing:border-box;padding:10px 10px;border-radius:10px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:16px;font-weight:700">
      </div>
    </div>
    <div id="lonnSummary">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Brutto</div>
          <div id="lsB" style="font-weight:700;font-size:15px;color:var(--text)">${kr(bruttoMnd)}</div>
        </div>
        <div style="background:rgba(244,67,54,0.08);border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Skatt</div>
          <div id="lsS" style="font-weight:700;font-size:15px;color:#f44336">-${kr(skattMnd)}</div>
        </div>
        <div style="background:rgba(76,175,80,0.08);border-radius:10px;padding:12px">
          <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">Netto</div>
          <div id="lsN" style="font-weight:700;font-size:15px;color:#4caf50">${kr(netto)}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);text-align:right">Effektiv skatt: <span id="lsEff">${effRate}</span>% <span id="lsEffHint">${manualSkattPct != null ? '· manuell' : '· estimert etter norske skatteregler 2025'}</span></div>
    </div>`;
  leftCol.appendChild(topCard);

  const fordelingDiv = document.createElement('div');
  fordelingDiv.id = 'fordelingSection';
  leftCol.appendChild(fordelingDiv);
  renderFordeling();

  const FORDELING_COLORS = ['#22c55e','#3b82f6','#a855f7','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
  const fordelingChartDiv = document.createElement('div');
  leftCol.appendChild(fordelingChartDiv);
  renderFordelingChart();

  function renderFordelingChart() {
    const items = loadFordeling();
    if (items.length === 0) { fordelingChartDiv.innerHTML = ''; return; }
    const total = items.reduce((s, i) => s + i.amount, 0);
    fordelingChartDiv.innerHTML = `
      <div class="card" style="display:flex;gap:16px;align-items:center;margin-top:8px">
        <canvas id="fordelingDonut" width="100" height="100" style="flex-shrink:0"></canvas>
        <div style="flex:1;display:flex;flex-direction:column;gap:5px;min-width:0">
          ${items.map((item,i)=>`
          <div style="display:flex;align-items:center;gap:6px;font-size:11px">
            <div style="width:8px;height:8px;border-radius:50%;background:${FORDELING_COLORS[i%FORDELING_COLORS.length]};flex-shrink:0"></div>
            <div style="flex:1;color:var(--text-nav);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.name}</div>
            <div style="font-weight:600;color:var(--text);white-space:nowrap">${total>0?Math.round(item.amount/total*100):0}%</div>
          </div>`).join('')}
        </div>
      </div>`;
    setTimeout(() => {
      const canvas = document.getElementById('fordelingDonut');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const cx = 50, cy = 50, r = 42, inner = 26;
      let angle = -Math.PI / 2;
      ctx.clearRect(0,0,100,100);
      items.forEach((item,i) => {
        const slice = (item.amount/total) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,angle,angle+slice); ctx.closePath();
        ctx.fillStyle = FORDELING_COLORS[i%FORDELING_COLORS.length]; ctx.fill(); angle += slice;
      });
      const isDark = document.body.classList.contains('dark');
      ctx.beginPath(); ctx.arc(cx,cy,inner,0,Math.PI*2);
      ctx.fillStyle = isDark ? '#141414' : '#fff'; ctx.fill();

      const labelColor = isDark ? '#7a7a7a' : '#9aab90';
      const sumColor   = isDark ? '#f0f0f0' : '#2b2b2b';
      ctx.textAlign = 'center';
      ctx.fillStyle = labelColor;
      ctx.font = '7px DM Sans,sans-serif';
      ctx.fillText('TOTALT', cx, cy - 6);
      ctx.fillStyle = sumColor;
      ctx.font = 'bold 11px DM Sans,sans-serif';
      ctx.fillText(Math.round(total).toLocaleString('nb-NO'), cx, cy + 6);
      ctx.fillStyle = labelColor;
      ctx.font = '7px DM Sans,sans-serif';
      ctx.fillText('kr', cx, cy + 15);
    }, 50);
  }

  function updateCalc() {
    const sm = skattMndCalc();
    const nm = nettoMnd();
    const ef = effectivePct().toFixed(1);
    document.getElementById('lsB').textContent = kr(bruttoMnd);
    document.getElementById('lsS').textContent = '-' + kr(sm);
    document.getElementById('lsN').textContent = kr(nm);
    document.getElementById('lsEff').textContent = ef;
    document.getElementById('lsEffHint').textContent = manualSkattPct != null ? '· manuell' : '· estimert etter norske skatteregler 2025';
    // update placeholder to reflect new auto rate when brutto changes
    const pctInput = document.getElementById('skattPctInput');
    if (pctInput && manualSkattPct == null) pctInput.placeholder = autoSkattPct().toFixed(1);
    renderFordeling();
  }

  document.getElementById('lonnInput').addEventListener('input', e => {
    bruttoMnd = parseFloat(e.target.value) || 0;
    saveLonnState({ bruttoMnd, manualSkattPct });
    updateCalc();
  });

  document.getElementById('skattPctInput').addEventListener('input', e => {
    const v = e.target.value.trim();
    manualSkattPct = v === '' ? null : Math.min(100, Math.max(0, parseFloat(v) || 0));
    saveLonnState({ bruttoMnd, manualSkattPct });
    updateCalc();
  });

  // ── Vaktkalender (right column) ───────────────────────────────
  const calWrap = document.createElement('div');
  calWrap.style.cssText = 'flex:1;min-width:300px';
  pageWrap.appendChild(calWrap);

  let calYear  = new Date().getFullYear();
  let calMonth = new Date().getMonth();
  let editDate = null;
  const DAG = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];
  const DAGFULL = ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'];

  function dkey(y,m,d) { return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function renderCal(keepSettOpen = false) {
    const sett    = loadVaktSett();
    const profiles = loadJobbprofiler();
    const vakter  = loadVakter();
    const today  = new Date();
    const todayK = dkey(today.getFullYear(), today.getMonth(), today.getDate());
    const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7;
    const lastDay  = new Date(calYear, calMonth+1, 0).getDate();
    const helligdager = Object.assign({}, getNorskHelligdager(calYear), getNorskHelligdager(calYear+1));
    const monthPfx = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;

    calWrap.innerHTML = '';

    // Header
    const hd = document.createElement('div');
    hd.className = 'section-head';
    hd.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
    hd.innerHTML = `<span>Vaktkalender</span><button class="sort-btn" id="calSettBtn">${icon('settings',{size:12})} Innstillinger</button>`;
    calWrap.appendChild(hd);

    // Settings panel
    const settCard = document.createElement('div');
    settCard.className = 'card'; settCard.style.cssText = `display:${keepSettOpen?'block':'none'};margin-bottom:12px`;
    settCard.innerHTML = `
      <div style="margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:8px">Jobbprofiler</div>
        <div id="jobbProfilListe"></div>
        <div id="jobbProfilForm" style="display:none"></div>
        <button class="sort-btn" id="addJobProfilBtn" style="margin-top:8px;font-size:11px">+ Ny jobb</button>
      </div>
      `;
    calWrap.appendChild(settCard);

    // ── Jobbprofiler UI ─────────────────────────────────────────────
    function renderProfilListe() {
      const liste = document.getElementById('jobbProfilListe');
      if (!liste) return;
      const profs = loadJobbprofiler();
      const iSt = 'padding:5px 7px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:12px';

      // Renders the shift-code chips inside a profile's edit form
      function renderKodeListe(profId) {
        const el = document.getElementById('kodeListFor_' + profId);
        if (!el) return;
        const koder = getJobbKoder(profId);
        el.innerHTML = koder.length
          ? koder.map(k => `<div style="display:flex;align-items:center;gap:4px;background:var(--chip-bg);border-radius:6px;padding:4px 8px;font-size:12px"><span style="font-weight:700">${k.kode}</span><span style="color:var(--text-muted)">${k.start}–${k.end}</span><button class="del-kode-job" data-profid="${profId}" data-kodeid="${k.id}" style="background:none;border:none;color:#f44336;cursor:pointer;font-size:14px;line-height:1;padding:0 2px">×</button></div>`).join('')
          : '<span style="font-size:11px;color:var(--text-muted)">Ingen vaktkoder ennå</span>';
        el.querySelectorAll('.del-kode-job').forEach(btn => {
          btn.addEventListener('click', () => {
            const upd = getJobbKoder(btn.dataset.profid).filter(k => k.id !== btn.dataset.kodeid);
            saveJobbKoder(btn.dataset.profid, upd);
            renderKodeListe(btn.dataset.profid);
          });
        });
      }

      liste.innerHTML = '';
      profs.forEach(p => {
        const row = document.createElement('div');
        row.style.cssText = 'border-bottom:1px solid var(--border-light);padding:6px 0';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;justify-content:space-between';
        head.innerHTML = `
          <div style="font-size:12px">
            <span style="font-weight:600">${p.name}</span>
            <span style="color:var(--text-muted);margin-left:6px">${p.timepris} kr/t${p.kveldSats?` · kveld +${p.kveldSats}`:''}${p.nattSats?` · natt +${p.nattSats}`:''}</span>
          </div>
          <div style="display:flex;gap:4px">
            <button class="sort-btn edit-profil-btn" data-id="${p.id}" style="font-size:10px;padding:2px 7px">Rediger</button>
            ${profs.length > 1 ? `<button class="sort-btn del-profil-btn" data-id="${p.id}" style="font-size:10px;padding:2px 7px;color:#f44336">Slett</button>` : ''}
          </div>`;
        const editForm = document.createElement('div');
        editForm.id = 'pef_' + p.id;
        editForm.style.cssText = 'display:none;margin-top:8px';
        editForm.innerHTML = `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;margin-bottom:6px">
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Navn</label><input id="pName_${p.id}" type="text" value="${p.name}" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Timesats (kr/t)</label><input id="pTimepris_${p.id}" type="number" value="${p.timepris}" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Kveld kr/t fra</label><div style="display:flex;gap:4px"><input id="pKveldSats_${p.id}" type="number" value="${p.kveldSats||0}" style="${iSt};width:50px"><input id="pKveldFra_${p.id}" type="time" value="${p.kveldFra||'17:00'}" style="${iSt};flex:1"></div></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Natt kr/t (fra–til)</label><div style="display:flex;gap:4px"><input id="pNattSats_${p.id}" type="number" value="${p.nattSats||0}" style="${iSt};width:40px"><input id="pNattFra_${p.id}" type="time" value="${p.nattFra||'21:00'}" style="${iSt};flex:1"><input id="pNattTil_${p.id}" type="time" value="${p.nattTil||'06:00'}" style="${iSt};flex:1"></div></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Helg kr/t</label><input id="pHelgSats_${p.id}" type="number" value="${p.helgSats||0}" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Helligdag %</label><input id="pHelligSats_${p.id}" type="number" value="${p.helligSats||133}" style="${iSt};width:100%;box-sizing:border-box"></div>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:12px">
            <button class="sort-btn sort-active save-profil-btn" data-id="${p.id}" style="font-size:11px">Lagre</button>
            <button class="sort-btn cancel-profil-btn" data-id="${p.id}" style="font-size:11px">Avbryt</button>
          </div>
          <div style="border-top:1px solid var(--border-light);padding-top:10px">
            <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:6px">Vaktkoder</div>
            <div id="kodeListFor_${p.id}" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
              <input id="nk_kode_${p.id}" type="text" placeholder="Kode" maxlength="4" style="${iSt};width:60px;font-weight:700">
              <input id="nk_start_${p.id}" type="time" style="${iSt}">
              <input id="nk_end_${p.id}" type="time" style="${iSt}">
              <button class="sort-btn add-kode-job" data-id="${p.id}" style="font-size:11px">+ Legg til</button>
            </div>
          </div>`;
        row.appendChild(head);
        row.appendChild(editForm);
        liste.appendChild(row);
      });

      liste.querySelectorAll('.edit-profil-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const f = document.getElementById('pef_' + btn.dataset.id);
          if (!f) return;
          const opening = f.style.display === 'none';
          f.style.display = opening ? 'block' : 'none';
          if (opening) renderKodeListe(btn.dataset.id);
        });
      });
      liste.querySelectorAll('.del-profil-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          showConfirmDialog('Slett denne jobbprofilen?', () => {
            saveJobbprofiler(loadJobbprofiler().filter(p => p.id !== btn.dataset.id));
            renderProfilListe();
          });
        });
      });
      liste.querySelectorAll('.save-profil-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.dataset.id;
          const all = loadJobbprofiler();
          const idx = all.findIndex(p => p.id === id);
          if (idx < 0) return;
          all[idx] = { ...all[idx],
            name:       document.getElementById('pName_'+id).value.trim() || all[idx].name,
            timepris:   parseFloat(document.getElementById('pTimepris_'+id).value) || 200,
            kveldFra:   document.getElementById('pKveldFra_'+id).value,
            kveldSats:  parseFloat(document.getElementById('pKveldSats_'+id).value) || 0,
            nattFra:    document.getElementById('pNattFra_'+id).value,
            nattTil:    document.getElementById('pNattTil_'+id).value,
            nattSats:   parseFloat(document.getElementById('pNattSats_'+id).value) || 0,
            helgSats:   parseFloat(document.getElementById('pHelgSats_'+id).value) || 0,
            helligSats: parseFloat(document.getElementById('pHelligSats_'+id).value) || 133,
            updatedAt:  new Date().toISOString(),
          };
          saveJobbprofiler(all);
          showToast('Lagret'); renderProfilListe();
        });
      });
      liste.querySelectorAll('.cancel-profil-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const f = document.getElementById('pef_' + btn.dataset.id);
          if (f) f.style.display = 'none';
        });
      });
      liste.querySelectorAll('.add-kode-job').forEach(btn => {
        btn.addEventListener('click', () => {
          const profId = btn.dataset.id;
          const kode  = (document.getElementById('nk_kode_'+profId)?.value||'').trim().toUpperCase();
          const start = document.getElementById('nk_start_'+profId)?.value||'';
          const end   = document.getElementById('nk_end_'+profId)?.value||'';
          if (!kode || !start || !end) { showToast('Fyll inn kode, start og slutt'); return; }
          const koder = getJobbKoder(profId);
          koder.push({ id: 'kode_' + Date.now(), kode, start, end });
          saveJobbKoder(profId, koder);
          if (document.getElementById('nk_kode_'+profId)) document.getElementById('nk_kode_'+profId).value = '';
          if (document.getElementById('nk_start_'+profId)) document.getElementById('nk_start_'+profId).value = '';
          if (document.getElementById('nk_end_'+profId)) document.getElementById('nk_end_'+profId).value = '';
          renderKodeListe(profId);
        });
      });
    }
    renderProfilListe();

    document.getElementById('addJobProfilBtn').addEventListener('click', () => {
      const formEl = document.getElementById('jobbProfilForm');
      if (formEl.style.display !== 'none') { formEl.style.display = 'none'; return; }
      const iSt = 'padding:5px 7px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:12px';
      formEl.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:8px;padding:10px;margin-top:6px;font-size:12px">
          <div style="font-weight:600;margin-bottom:8px">Ny jobbprofil</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Navn</label><input id="nJobNavn" type="text" placeholder="F.eks. Sykehus" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Timesats (kr/t)</label><input id="nJobTimepris" type="number" placeholder="220" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Kveld kr/t fra</label><div style="display:flex;gap:4px"><input id="nJobKveldSats" type="number" placeholder="0" style="${iSt};width:50px"><input id="nJobKveldFra" type="time" value="17:00" style="${iSt};flex:1"></div></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Natt kr/t (fra–til)</label><div style="display:flex;gap:4px"><input id="nJobNattSats" type="number" placeholder="0" style="${iSt};width:40px"><input id="nJobNattFra" type="time" value="21:00" style="${iSt};flex:1"><input id="nJobNattTil" type="time" value="06:00" style="${iSt};flex:1"></div></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Helg kr/t</label><input id="nJobHelgSats" type="number" placeholder="0" style="${iSt};width:100%;box-sizing:border-box"></div>
            <div><label style="color:var(--text-muted);display:block;margin-bottom:2px">Helligdag %</label><input id="nJobHelligSats" type="number" value="133" style="${iSt};width:100%;box-sizing:border-box"></div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="sort-btn sort-active" id="saveNyJobBtn" style="font-size:11px">Opprett</button>
            <button class="sort-btn" id="cancelNyJobBtn" style="font-size:11px">Avbryt</button>
          </div>
        </div>`;
      formEl.style.display = 'block';
      document.getElementById('cancelNyJobBtn').addEventListener('click', () => { formEl.style.display = 'none'; });
      document.getElementById('saveNyJobBtn').addEventListener('click', () => {
        const name = document.getElementById('nJobNavn').value.trim();
        if (!name) { showToast('Skriv inn et navn'); return; }
        const profs = loadJobbprofiler();
        profs.push({
          id: 'job_' + Date.now(), name,
          timepris:   parseFloat(document.getElementById('nJobTimepris').value) || 200,
          kveldFra:   document.getElementById('nJobKveldFra').value || '17:00',
          kveldSats:  parseFloat(document.getElementById('nJobKveldSats').value) || 0,
          nattFra:    document.getElementById('nJobNattFra').value || '21:00',
          nattTil:    document.getElementById('nJobNattTil').value || '06:00',
          nattSats:   parseFloat(document.getElementById('nJobNattSats').value) || 0,
          helgSats:   parseFloat(document.getElementById('nJobHelgSats').value) || 0,
          helligSats: parseFloat(document.getElementById('nJobHelligSats').value) || 133,
          createdAt:  new Date().toISOString(),
        });
        saveJobbprofiler(profs);
        formEl.style.display = 'none';
        renderProfilListe();
        showToast('Jobbprofil opprettet');
      });
    });

    // Month nav
    const nav = document.createElement('div');
    nav.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
    nav.innerHTML = `<button class="sort-btn" id="calPrev" style="font-size:16px;padding:4px 12px">‹</button><span style="font-weight:700;font-size:14px;color:var(--text)">${monthsNo[calMonth].charAt(0).toUpperCase()+monthsNo[calMonth].slice(1)} ${calYear}</span><button class="sort-btn" id="calNext" style="font-size:16px;padding:4px 12px">›</button>`;
    calWrap.appendChild(nav);

    // Grid
    const getWeekNum = date => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
      const y = new Date(Date.UTC(d.getUTCFullYear(),0,1));
      return Math.ceil((((d-y)/86400000)+1)/7);
    };
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:28px repeat(7,1fr);gap:3px;margin-bottom:12px';
    // Header row: week label + day names
    const wkHdr = document.createElement('div');
    wkHdr.style.cssText = 'font-size:10px;font-weight:600;color:var(--text-muted);padding:4px 0;text-align:center';
    wkHdr.textContent = 'Uke'; grid.appendChild(wkHdr);
    DAG.forEach((dn, i) => {
      const h = document.createElement('div');
      const isWknd = i >= 5;
      h.style.cssText = `text-align:center;font-size:10px;font-weight:600;padding:4px 0;border-radius:6px;color:${isWknd?'#e91e63':'var(--text-muted)'};background:${isWknd?'rgba(233,30,99,0.07)':'transparent'}`;
      h.textContent = dn; grid.appendChild(h);
    });
    // Empty cells before first day + week number for first row
    const firstWeekNum = getWeekNum(new Date(calYear, calMonth, 1));
    const wn1 = document.createElement('div');
    wn1.style.cssText = 'font-size:9px;font-weight:700;color:var(--text-muted);text-align:center;padding:3px 0;align-self:start;margin-top:2px';
    wn1.textContent = firstWeekNum; grid.appendChild(wn1);
    for (let i=0; i<firstDow; i++) grid.appendChild(document.createElement('div'));
    let lastWeekShown = firstWeekNum;
    for (let d=1; d<=lastDay; d++) {
      const dk2 = dkey(calYear, calMonth, d);
      const dow = (firstDow+d-1)%7;
      // Insert week number at start of each new row (Monday)
      if (dow === 0 && d > 1) {
        const wn = document.createElement('div');
        wn.style.cssText = 'font-size:9px;font-weight:700;color:var(--text-muted);text-align:center;padding:3px 0;align-self:start;margin-top:2px';
        const wNum = getWeekNum(new Date(calYear, calMonth, d));
        wn.textContent = wNum; grid.appendChild(wn);
        lastWeekShown = wNum;
      }
      const isWeekend = dow>=5, isToday=dk2===todayK, isEditing=dk2===editDate;
      const isHellig = isVaktHelligdag(dk2, vakter[dk2], helligdager);
      const vakt = vakter[dk2];
      const cell = document.createElement('div');
      cell.dataset.date = dk2;
      const cellBg = isHellig ? 'rgba(255,193,7,0.12)' : isWeekend ? 'rgba(233,30,99,0.05)' : 'var(--chip-bg)';
      cell.style.cssText = `border-radius:8px;padding:5px;min-height:64px;cursor:pointer;background:${cellBg};border:2px solid ${isEditing?'#7dd3fc':isToday?'#4caf50':isHellig?'rgba(255,193,7,0.4)':'transparent'};display:flex;flex-direction:column;align-items:center;`;
      const dn2 = document.createElement('div');
      dn2.style.cssText = `font-size:11px;font-weight:700;color:${isHellig?'#f5a623':isWeekend?'#e91e63':'var(--text-muted)'};width:100%;text-align:left`;
      dn2.textContent = d; cell.appendChild(dn2);
      if (isHellig) {
        const hf = document.createElement('div');
        hf.title = helligdager[dk2];
        hf.style.cssText = 'font-size:8px;color:#f5a623;width:100%;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600';
        hf.textContent = helligdager[dk2]; cell.appendChild(hf);
      }
      if (vakt) {
        const vaktJobSett = getJobbprofil(vakt.jobId);
        const res = calcVaktPay(vakt, vaktJobSett, dk2, isHellig);
        if (vakt.kode) {
          const kb = document.createElement('div');
          kb.style.cssText = 'font-size:12px;font-weight:800;color:var(--text);margin-top:2px;text-align:center';
          kb.textContent = vakt.kode; cell.appendChild(kb);
        }
        const t = document.createElement('div');
        t.style.cssText = 'font-size:9px;color:var(--text-muted);margin-top:1px;text-align:center';
        t.textContent = `${vakt.start}–${vakt.end}`; cell.appendChild(t);
        const p = document.createElement('div');
        p.style.cssText = `font-size:10px;font-weight:700;margin-top:2px;color:${isHellig?'#f5a623':'#4caf50'}`;
        p.textContent = Math.round(res.pay).toLocaleString('nb-NO')+' kr'; cell.appendChild(p);
        if (profiles.length > 1) {
          const jl = document.createElement('div');
          jl.style.cssText = 'font-size:8px;color:var(--text-muted);margin-top:1px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%';
          jl.textContent = vaktJobSett.name || ''; cell.appendChild(jl);
        }
      } else {
        const pl = document.createElement('div');
        pl.style.cssText = 'font-size:16px;color:var(--text-muted);margin-top:6px;opacity:0.3';
        pl.textContent = '+'; cell.appendChild(pl);
      }
      cell.addEventListener('click', () => { editDate = editDate===dk2?null:dk2; renderCal(); });
      grid.appendChild(cell);
    }
    calWrap.appendChild(grid);

    // Edit form
    if (editDate) {
      const vakt = vakter[editDate]||{};
      const isEditHellig = !!helligdager[editDate] || !!(vakt.hellig);
      const dObj = new Date(editDate), dParts = editDate.split('-');
      const initJobId  = vakt.jobId || profiles[0]?.id || '';
      const initJobSett = getJobbprofil(initJobId);
      const form = document.createElement('div');
      form.className='card'; form.style.cssText='margin-bottom:12px';
      form.innerHTML = `
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:${isEditHellig?'4px':'10px'}">${DAGFULL[dObj.getDay()].charAt(0).toUpperCase()+DAGFULL[dObj.getDay()].slice(1)} ${parseInt(dParts[2])}. ${monthsNo[parseInt(dParts[1])-1]}</div>
        ${helligdager[editDate]?`<div style="font-size:11px;color:#f5a623;font-weight:600;margin-bottom:10px">🇳🇴 ${helligdager[editDate]} · ${initJobSett.helligSats||133}% helligdagstillegg</div>`:`<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);margin-bottom:10px;cursor:pointer"><input type="checkbox" id="vHellig" ${vakt.hellig?'checked':''}> Helligdag for jobben (${initJobSett.helligSats||133}% tillegg)</label>`}
        ${profiles.length > 1
          ? `<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Jobb</label><select id="vJobId" style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px;font-weight:600">${profiles.map(p=>`<option value="${p.id}"${initJobId===p.id?' selected':''}>${p.name}</option>`).join('')}</select></div>`
          : `<input type="hidden" id="vJobId" value="${initJobId}">`}
        <div id="kodeBtnArea" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Start</label>
            <input id="vStart" type="time" value="${vakt.start||''}" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:15px;font-weight:600"></div>
          <div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Slutt</label>
            <input id="vSlutt" type="time" value="${vakt.end||''}" style="padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:15px;font-weight:600"></div>
          <div style="display:flex;gap:6px;align-items:flex-end;padding-bottom:1px">
            <button class="sort-btn sort-active" id="saveVaktBtn">Lagre</button>
            ${vakt.start?'<button class="sort-btn" id="delVaktBtn" style="color:#f44336">Slett</button>':''}
            <button class="sort-btn" id="cancelVaktBtn">Avbryt</button>
          </div>
        </div>
        <div id="vPreview" style="margin-top:10px;font-size:12px;color:var(--text-muted)"></div>`;
      calWrap.appendChild(form);

      // Populate kode buttons for a job — refreshed when job selector changes
      let updatePreview = null; // forward ref so kode-btn clicks can call it after definition
      const renderKodeButtons = (jobId, activeKode) => {
        const area = document.getElementById('kodeBtnArea');
        if (!area) return;
        const koder = getJobbKoder(jobId);
        area.innerHTML = koder.map(k =>
          `<button class="kode-btn sort-btn${activeKode===k.kode?' sort-active':''}" data-kode="${k.kode}" data-start="${k.start}" data-end="${k.end}" style="text-align:center;min-width:46px;padding:5px 8px;line-height:1.2"><span style="font-weight:700;font-size:13px;display:block">${k.kode}</span><span style="font-size:9px;color:var(--text-muted)">${k.start.replace(':','꞉')}–${k.end.replace(':','꞉')}</span></button>`
        ).join('');
        area.querySelectorAll('.kode-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById('vStart').value = btn.dataset.start;
            document.getElementById('vSlutt').value = btn.dataset.end;
            area.querySelectorAll('.kode-btn').forEach(b => b.classList.remove('sort-active'));
            btn.classList.add('sort-active');
            updatePreview?.();
          });
        });
      };
      renderKodeButtons(initJobId, vakt.kode);

      updatePreview = () => {
        const v = { start: document.getElementById('vStart').value, end: document.getElementById('vSlutt').value };
        if (!v.start || !v.end) return;
        const jobSett = getJobbprofil(document.getElementById('vJobId')?.value);
        const helligNow = isVaktHelligdag(editDate, { hellig: document.getElementById('vHellig')?.checked }, helligdager);
        const res = calcVaktPay(v, jobSett, editDate, helligNow);
        const parts = [];
        if (res.eveningH > 0) parts.push(`${res.eveningH.toFixed(1)}t kveld +${Math.round(res.eveningH * jobSett.kveldSats).toLocaleString('nb-NO')} kr`);
        if (res.nightH > 0)   parts.push(`${res.nightH.toFixed(1)}t natt +${Math.round(res.nightH * jobSett.nattSats).toLocaleString('nb-NO')} kr`);
        if (res.helgH > 0)    parts.push(`helg +${Math.round(res.helgH * jobSett.helgSats).toLocaleString('nb-NO')} kr`);
        if (res.helligH > 0)  parts.push(`helligdag +${Math.round(res.helligH * jobSett.timepris * ((jobSett.helligSats || 133) / 100)).toLocaleString('nb-NO')} kr`);
        document.getElementById('vPreview').innerHTML = `<strong>${res.hours.toFixed(1)} t</strong> · Estimert: <strong style="color:#4caf50">${Math.round(res.pay).toLocaleString('nb-NO')} kr</strong>${parts.length ? ' · ' + parts.join(', ') : ''}`;
      };
      if (vakt.start) updatePreview();
      document.getElementById('vStart').addEventListener('input', updatePreview);
      document.getElementById('vSlutt').addEventListener('input', updatePreview);
      document.getElementById('vHellig')?.addEventListener('change', updatePreview);
      document.getElementById('vJobId')?.addEventListener('change', e => {
        renderKodeButtons(e.target.value, null);
        updatePreview?.();
      });
      document.getElementById('saveVaktBtn').addEventListener('click', () => {
        const all = loadVakter();
        const activeKode = form.querySelector('.kode-btn.sort-active');
        const helligChecked = document.getElementById('vHellig')?.checked || false;
        const selectedJobId = document.getElementById('vJobId')?.value || profiles[0]?.id;
        all[editDate] = {
          start: document.getElementById('vStart').value,
          end: document.getElementById('vSlutt').value,
          kode: activeKode?.dataset.kode || null,
          hellig: helligChecked || undefined,
          jobId: selectedJobId,
        };
        saveVakter(all); editDate = null; renderCal();
      });
      document.getElementById('delVaktBtn')?.addEventListener('click', () => {
        showConfirmDialog('Er du sikker på at du vil slette denne vakten?', () => {
          const all=loadVakter(); delete all[editDate]; saveVakter(all); editDate=null; renderCal();
        });
      });
      document.getElementById('cancelVaktBtn').addEventListener('click', () => { editDate=null; renderCal(); });
    }

    // Monthly summary
    const monthVakter = Object.entries(vakter).filter(([k]) => k.startsWith(monthPfx));
    if (monthVakter.length > 0) {
      let tH = 0, tP = 0;
      const byJob = {};
      for (const [k, v] of monthVakter) {
        const jobSett = getJobbprofil(v.jobId);
        const r = calcVaktPay(v, jobSett, k, isVaktHelligdag(k, v, helligdager));
        tH += r.hours; tP += r.pay;
        const jid = v.jobId || profiles[0]?.id || 'default';
        if (!byJob[jid]) byJob[jid] = { name: jobSett.name || 'Jobb', hours: 0, pay: 0, count: 0 };
        byJob[jid].hours += r.hours; byJob[jid].pay += r.pay; byJob[jid].count++;
      }
      const jobKeys = Object.keys(byJob);
      const perJobHtml = jobKeys.length > 1
        ? `<div style="margin-top:10px;border-top:1px solid var(--border-light);padding-top:10px">
            <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Per jobb</div>
            ${jobKeys.map(jid=>`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:12px"><span>${byJob[jid].name} <span style="color:var(--text-muted)">(${byJob[jid].count} vakter · ${byJob[jid].hours.toFixed(1)} t)</span></span><span style="font-weight:700;color:#4caf50">${Math.round(byJob[jid].pay).toLocaleString('nb-NO')} kr</span></div>`).join('')}
           </div>`
        : '';
      const sum = document.createElement('div');
      sum.className = 'card';
      sum.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">${monthsNo[calMonth].charAt(0).toUpperCase()+monthsNo[calMonth].slice(1)} — oppsummering</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
          <div style="background:var(--chip-bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Vakter</div>
            <div style="font-weight:700;font-size:18px">${monthVakter.length}</div>
          </div>
          <div style="background:var(--chip-bg);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Timer</div>
            <div style="font-weight:700;font-size:18px">${tH.toFixed(1)} t</div>
          </div>
          <div style="background:rgba(76,175,80,0.08);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">Estimert brutto</div>
            <div style="font-weight:700;font-size:18px;color:#4caf50">${Math.round(tP).toLocaleString('nb-NO')} kr</div>
          </div>
        </div>
        ${perJobHtml}`;
      calWrap.appendChild(sum);
    }

    // Wire nav + settings
    document.getElementById('calSettBtn').addEventListener('click', () => {
      settCard.style.display = settCard.style.display==='none'?'block':'none';
    });
    document.getElementById('calPrev').addEventListener('click', () => {
      calMonth--; if(calMonth<0){calMonth=11;calYear--;} editDate=null; renderCal();
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calMonth++; if(calMonth>11){calMonth=0;calYear++;} editDate=null; renderCal();
    });
  }

  renderCal();
}

