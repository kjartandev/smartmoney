// ── Verktøy tab ─────────────────────────────────────────────────
// BSU calculator, feriepenger calculator, Norges Bank valuta/trip planner

const VALUTA_CACHE_KEY = 'okonomi_valuta_cache_v4';
const VALUTA_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ── Norges Bank API (CSV format — simple, reliable) ─────────────
async function fetchExchangeRates() {
  try {
    const cached = JSON.parse(localStorage.getItem(VALUTA_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < VALUTA_CACHE_TTL) return cached.rates;
  } catch {}

  const currencies = ['EUR','USD','SEK','DKK','GBP','PLN','HUF','CZK','CHF','THB','TRY','JPY'];
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const url = `https://data.norges-bank.no/api/data/EXR/B.${currencies.join('+')}.NOK.SP?format=csv&startPeriod=${from}&endPeriod=${today}&locale=en`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error('API error ' + resp.status);
    const text = await resp.text();
    const rates = parseNorgesBankCSV(text);
    localStorage.setItem(VALUTA_CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
    return rates;
  } catch (e) {
    console.warn('Valuta fetch failed:', e);
    return null;
  }
}

function parseNorgesBankCSV(text) {
  const result = {};
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return result;

  // Header: FREQ;Frekvens;BASE_CUR;...;UNIT_MULT;...;TIME_PERIOD;OBS_VALUE
  const hdr = lines[0].split(';');
  const col = name => hdr.indexOf(name);
  const iCur = col('BASE_CUR'), iDate = col('TIME_PERIOD'), iVal = col('OBS_VALUE'), iMult = col('UNIT_MULT');

  // Parse all rows, group by currency
  const byC = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(';');
    if (c.length < hdr.length) continue;
    const cur = c[iCur];
    const date = c[iDate];
    const rawRate = parseFloat(c[iVal].replace(',', '.'));
    const mult = parseInt(c[iMult]) || 0; // 0=per 1, 2=per 100
    if (!cur || isNaN(rawRate)) continue;
    // Normalize to "NOK per 1 unit" (divide by 10^mult)
    const divisor = Math.pow(10, mult);
    const rate = rawRate / divisor;
    if (!byC[cur]) byC[cur] = [];
    byC[cur].push({ date, rate });
  }

  // Build result with latest rate + 7d change
  for (const [cur, values] of Object.entries(byC)) {
    values.sort((a, b) => a.date.localeCompare(b.date));
    const latest = values[values.length - 1];
    const weekAgo = values.length > 5 ? values[values.length - 6] : values[0];
    result[cur] = {
      rate: latest.rate,  // NOK per 1 unit of foreign currency
      date: latest.date,
      change7d: weekAgo.rate ? ((latest.rate - weekAgo.rate) / weekAgo.rate * 100) : 0,
      history: values.slice(-30),
    };
  }
  return result;
}

// ── Skattekalkulator ─────────────────────────────────────────────
const SKATT_CALC_KEY = 'okonomi_skatt_calc_v1';

function calcSkattAar(bruttoAar) {
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

function renderSkattekalkulatorCalc(container) {
  const saved = JSON.parse(localStorage.getItem(SKATT_CALC_KEY) || '{}');
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-weight:600;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';

  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">${icon('kalkulator',{size:14})} Skattekalkulator</div>
    <div style="display:grid;grid-template-columns:1fr auto;gap:12px;margin-bottom:14px;align-items:end">
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Årslønn (brutto)</label>
        <input id="skAarslonn" type="number" placeholder="F.eks. 650000" value="${saved.aarslonn || ''}" style="${iSt}">
      </div>
      <div style="min-width:90px">
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Din skatt % <span style="font-weight:400">(valgfri)</span></label>
        <input id="skManualPct" type="number" min="0" max="60" step="0.1" placeholder="—"
          value="${saved.manualPct != null ? saved.manualPct : ''}"
          style="${iSt};font-size:15px">
      </div>
    </div>
    <div id="skResult" style="display:none"></div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:10px">Estimert etter norske skatteregler 2025 (trinnskatt + trygdeavgift + alminnelig inntektsskatt). Faktisk skatt kan avvike.</div>`;

  const update = () => {
    const aarslonn  = parseFloat(container.querySelector('#skAarslonn')?.value) || 0;
    const manualPctRaw = container.querySelector('#skManualPct')?.value?.trim();
    const manualPct = manualPctRaw !== '' ? Math.min(100, Math.max(0, parseFloat(manualPctRaw) || 0)) : null;
    localStorage.setItem(SKATT_CALC_KEY, JSON.stringify({ aarslonn, manualPct }));

    const res = container.querySelector('#skResult');
    if (!res) return;
    if (aarslonn <= 0) { res.style.display = 'none'; return; }

    const estSkattAar  = calcSkattAar(aarslonn);
    const estPct       = aarslonn > 0 ? estSkattAar / aarslonn * 100 : 0;
    const estNettoAar  = aarslonn - estSkattAar;

    const hasManual    = manualPct != null;
    const manSkattAar  = hasManual ? aarslonn * manualPct / 100 : null;
    const manNettoAar  = hasManual ? aarslonn - manSkattAar : null;

    const kr = v => Math.round(v).toLocaleString('nb-NO') + ' kr';
    const satslabel = hasManual ? `din sats (${manualPct.toFixed(1)}%)` : '';

    const estCell = (label, val, color) => `
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${label}</div>
        <div style="font-size:14px;font-weight:700;color:${color};">${val}</div>
      </div>`;

    const manCell = (label, val, color) => `
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px;border:1px solid ${color}22">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${label}</div>
        <div style="font-size:14px;font-weight:700;color:${color};">${val}</div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:3px">${satslabel}</div>
      </div>`;

    res.style.display = 'block';
    res.innerHTML = `
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Estimert (norske skatteregler 2025)</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
        ${estCell('Skatt per år',       '-' + kr(estSkattAar),   '#f44336')}
        ${estCell('Effektiv skatt %',   estPct.toFixed(1) + '%', '#f44336')}
        ${estCell('Skatt per mnd',      '-' + kr(estSkattAar/12),'#f44336')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:${hasManual?'16':'0'}px">
        ${estCell('Estimert netto per år',  kr(estNettoAar),       '#4caf50')}
        ${estCell('Estimert netto per mnd', kr(estNettoAar/12),    '#4caf50')}
      </div>
      ${hasManual ? `
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Med ${satslabel}</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px">
        ${manCell('Skatt per år',   '-' + kr(manSkattAar),      '#f44336')}
        ${manCell('Skatt %',        manualPct.toFixed(1) + '%', '#f44336')}
        ${manCell('Skatt per mnd',  '-' + kr(manSkattAar/12),   '#f44336')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${manCell('Netto per år',   kr(manNettoAar),            '#4caf50')}
        ${manCell('Netto per mnd',  kr(manNettoAar/12),         '#4caf50')}
      </div>` : ''}`;
  };

  container.querySelector('#skAarslonn')?.addEventListener('input', update);
  container.querySelector('#skManualPct')?.addEventListener('input', update);
  if (saved.aarslonn) update();
}

// ── Årslønn & skatt hittil (manuell tracker fra lønnslipp) ────────
const LONN_SKATT_TRACKER_KEY = 'okonomi_lonn_skatt_tracker_v1';

function lsSaveExact(lonn, skatt) {
  const curYear = new Date().getFullYear();
  localStorage.setItem(LONN_SKATT_TRACKER_KEY, JSON.stringify({
    aar: curYear, lonnHittil: lonn, skattHittil: skatt, updatedAt: new Date().toISOString(),
  }));
}

function renderLonnSkattTracker(container) {
  const saved = JSON.parse(localStorage.getItem(LONN_SKATT_TRACKER_KEY) || '{}');
  const curYear = new Date().getFullYear();
  const isStaleYear = saved.aar && saved.aar !== curYear;
  const lonnHittil  = isStaleYear ? 0 : (saved.lonnHittil  || 0);
  const skattHittil = isStaleYear ? 0 : (saved.skattHittil || 0);
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-weight:600;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';

  const kr = v => Math.round(v).toLocaleString('nb-NO') + ' kr';
  const netto = lonnHittil - skattHittil;
  const pct   = lonnHittil > 0 ? skattHittil / lonnHittil * 100 : 0;

  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">${icon('skatt',{size:14})} Årslønn &amp; skatt</div>
    ${isStaleYear ? `<div style="font-size:11px;color:#f59e0b;margin-bottom:10px">Sist oppdatert i ${saved.aar} — start på nytt for ${curYear}.</div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px">
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Lønn hittil</div>
        <input id="lsLonnHittil" type="number" value="${lonnHittil || ''}" placeholder="0" style="border:none;background:transparent;padding:0;font-size:14px;font-weight:700;color:var(--text);width:100%;font-family:inherit">
      </div>
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Skatt hittil</div>
        <input id="lsSkattHittil" type="number" value="${skattHittil || ''}" placeholder="0" style="border:none;background:transparent;padding:0;font-size:14px;font-weight:700;color:#f44336;width:100%;font-family:inherit">
      </div>
      <div style="background:var(--chip-bg);border-radius:10px;padding:12px">
        <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Netto hittil</div>
        <div style="font-size:14px;font-weight:700;color:#4caf50">${kr(netto)}</div>
      </div>
    </div>
    ${lonnHittil > 0 ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;text-align:center">Effektiv skatt hittil: <strong style="color:var(--text)">${pct.toFixed(1)}%</strong></div>` : ''}

    <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">Legg til denne måneden (fra lønnslipp)</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px">
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Lønn denne måneden</label>
        <input id="lsAddLonn" type="number" placeholder="F.eks. 32000" style="${iSt}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Skatt denne måneden</label>
        <input id="lsAddSkatt" type="number" placeholder="F.eks. 6900" style="${iSt}">
      </div>
    </div>
    <button id="lsAddBtn" style="width:100%;padding:9px;background:var(--green-accent);color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-bottom:6px">Legg til</button>
    <div id="lsAddPreview" style="font-size:11px;color:var(--text-muted);text-align:center;min-height:14px"></div>`;

  const saveExactField = (input, key) => {
    const v = parseFloat(input.value) || 0;
    const cur = JSON.parse(localStorage.getItem(LONN_SKATT_TRACKER_KEY) || '{}');
    const l = key === 'lonnHittil'  ? v : (isStaleYear ? 0 : (cur.lonnHittil  || 0));
    const s = key === 'skattHittil' ? v : (isStaleYear ? 0 : (cur.skattHittil || 0));
    lsSaveExact(l, s);
    renderLonnSkattTracker(container);
    showToast('Lagret');
  };
  const lonnInp = container.querySelector('#lsLonnHittil');
  const skattInp = container.querySelector('#lsSkattHittil');
  lonnInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveExactField(lonnInp, 'lonnHittil'); } });
  skattInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveExactField(skattInp, 'skattHittil'); } });

  const addLonnInp = container.querySelector('#lsAddLonn');
  const addSkattInp = container.querySelector('#lsAddSkatt');
  const preview = container.querySelector('#lsAddPreview');
  const updatePreview = () => {
    const dl = parseFloat(addLonnInp.value) || 0;
    const ds = parseFloat(addSkattInp.value) || 0;
    if (!dl && !ds) { preview.textContent = ''; return; }
    preview.textContent = `Ny sum: ${kr(lonnHittil + dl)} lønn · ${kr(skattHittil + ds)} skatt`;
  };
  addLonnInp.addEventListener('input', updatePreview);
  addSkattInp.addEventListener('input', updatePreview);
  container.querySelector('#lsAddBtn').addEventListener('click', () => {
    const dl = parseFloat(addLonnInp.value) || 0;
    const ds = parseFloat(addSkattInp.value) || 0;
    if (!dl && !ds) return;
    lsSaveExact(lonnHittil + dl, skattHittil + ds);
    renderLonnSkattTracker(container);
    showToast('Lagt til');
  });
}

// ── Sparemål Calculator ──────────────────────────────────────────
const SPAREMAAL_CALC_KEY = 'okonomi_sparemaal_calc_v1';

function renderSparemaalCalc(container) {
  const saved = JSON.parse(localStorage.getItem(SPAREMAAL_CALC_KEY) || '{}');
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';

  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">${icon('budsjett',{size:14})} Sparemål-kalkulator</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Målbeløp</label>
        <input id="smTarget" type="number" placeholder="F.eks. 50000" value="${saved.target||''}" style="${iSt}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Nåværende beløp</label>
        <input id="smCurrent" type="number" placeholder="F.eks. 12000" value="${saved.current||''}" style="${iSt}">
      </div>
    </div>
    <div style="margin-bottom:14px">
      <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Månedlig sparing (valgfritt)</label>
      <input id="smMonthly" type="number" placeholder="F.eks. 2000" value="${saved.monthly||''}" style="${iSt};max-width:200px">
    </div>
    <div id="smResult" style="display:none"></div>`;

  const update = () => {
    const target  = parseFloat(document.getElementById('smTarget')?.value) || 0;
    const current = parseFloat(document.getElementById('smCurrent')?.value) || 0;
    const monthly = parseFloat(document.getElementById('smMonthly')?.value) || 0;
    localStorage.setItem(SPAREMAAL_CALC_KEY, JSON.stringify({ target, current, monthly }));
    const res = document.getElementById('smResult');
    if (!res) return;
    if (target <= 0) { res.style.display = 'none'; return; }

    const remaining = Math.max(0, target - current);
    const pct = Math.min(100, current > 0 && target > 0 ? Math.round(current / target * 100) : 0);
    const barColor = pct >= 100 ? '#22c55e' : pct >= 66 ? '#84cc16' : pct >= 33 ? '#f59e0b' : '#3b82f6';
    const done = remaining <= 0;

    let timeHtml = '';
    if (!done && monthly > 0) {
      const months = Math.ceil(remaining / monthly);
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + months);
      const dateLabel = monthsNo[targetDate.getMonth()] + ' ' + targetDate.getFullYear();
      timeHtml = `
        <div style="background:var(--chip-bg);border-radius:10px;padding:14px;text-align:center;margin-top:12px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Estimert ferdig</div>
          <div style="font-size:20px;font-weight:700;color:var(--text)">${dateLabel}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px">${months} mnd · ${fmt(monthly)}/mnd</div>
        </div>`;
    } else if (!done && monthly === 0) {
      timeHtml = `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;text-align:center">Skriv inn månedlig sparing for å se estimert ferdigdato</div>`;
    }

    res.style.display = 'block';
    res.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Mål</div>
          <div style="font-size:18px;font-weight:700;color:var(--text)">${fmt(target)}</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Sparet</div>
          <div style="font-size:18px;font-weight:700;color:${barColor}">${fmt(current)}</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Gjenstår</div>
          <div style="font-size:18px;font-weight:700;color:${done?'#22c55e':'var(--text)'}">${done?'✓ Nådd!':fmt(remaining)}</div>
        </div>
      </div>
      <div style="height:14px;background:var(--budget-track-bg);border-radius:7px;overflow:hidden;margin-bottom:6px">
        <div style="height:100%;width:${pct}%;background:${barColor};border-radius:7px;transition:width 0.5s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
        <span>${fmt(current)} sparet</span>
        <span style="font-weight:600;color:${barColor}">${pct}%</span>
        <span>${fmt(target)} mål</span>
      </div>
      ${timeHtml}`;
  };

  container.querySelector('#smTarget')?.addEventListener('input', update);
  container.querySelector('#smCurrent')?.addEventListener('input', update);
  container.querySelector('#smMonthly')?.addEventListener('input', update);
  if (saved.target) update();
}

// ── Abonnementer (subscriptions tracker) ─────────────────────────
const ABONNEMENT_KEY = 'okonomi_abonnementer_v1';

function loadAbonnementer() {
  try { return JSON.parse(localStorage.getItem(ABONNEMENT_KEY) || '[]'); } catch { return []; }
}
function saveAbonnementer(list) {
  localStorage.setItem(ABONNEMENT_KEY, JSON.stringify(list));
}

// Next occurrence of "day" from today, clamped to short months (e.g. day 31 in April → April 30)
function nextBillingInfo(day) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clampDay = (y, m) => Math.min(day, new Date(y, m + 1, 0).getDate());
  let y = now.getFullYear(), m = now.getMonth();
  let next = new Date(y, m, clampDay(y, m));
  if (next < today) {
    m += 1;
    if (m > 11) { m = 0; y += 1; }
    next = new Date(y, m, clampDay(y, m));
  }
  const daysUntil = Math.round((next - today) / 86400000);
  return { date: next, daysUntil };
}

// Modal for adding a new subscription — icon picker + navn/pris/dag, then hands
// the finished object back via onAdd (kept out of the card so it doesn't sit
// on screen permanently).
function openAddAbonnementModal(onAdd) {
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:confirmFadeIn 0.15s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg);color:var(--text);border-radius:18px;padding:22px 24px;max-width:380px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit;animation:confirmPop 0.22s cubic-bezier(.34,1.56,.64,1)';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700">Legg til abonnement</div>
      <button id="aboModalCloseBtn" style="padding:2px 8px;font-size:18px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer">×</button>
    </div>
    <div style="display:grid;grid-template-columns:52px 1fr;gap:8px;margin-bottom:10px">
      <input id="aboEmojiInput" type="text" maxlength="4" readonly value="💳"
        style="${iSt};text-align:center;font-size:18px;padding:8px 0;cursor:pointer">
      <input id="aboModalName" type="text" placeholder="F.eks. Netflix" style="${iSt}">
    </div>
    <div id="aboEmojiPickerSlot"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Pris/mnd</label>
        <input id="aboModalPrice" type="number" placeholder="149" style="${iSt}">
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Dag i mnd</label>
        <input id="aboModalDay" type="number" min="1" max="31" placeholder="15" style="${iSt}">
      </div>
    </div>
    <button id="aboModalAddBtn" style="width:100%;padding:9px;background:var(--green-accent);color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600">Legg til</button>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let backNav = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (backNav) { const c = backNav; backNav = null; c(); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  box.querySelector('#aboModalCloseBtn').addEventListener('click', close);
  const escHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  backNav = bindBackNav(overlay, close);

  const emojiInput = box.querySelector('#aboEmojiInput');
  const emojiSlot  = box.querySelector('#aboEmojiPickerSlot');
  emojiInput.addEventListener('click', () => {
    openEmojiPicker(emojiSlot, emojiInput, emoji => { emojiInput.value = emoji; });
  });

  const nameInp  = box.querySelector('#aboModalName');
  const priceInp = box.querySelector('#aboModalPrice');
  const dayInp   = box.querySelector('#aboModalDay');

  const submit = () => {
    const name  = nameInp.value.trim();
    const price = parseFloat(priceInp.value) || 0;
    const day   = Math.min(31, Math.max(1, parseInt(dayInp.value) || 0));
    if (!name || price <= 0 || !day) { showToast('Fyll ut navn, pris og dag'); return; }
    const emoji = emojiInput.value.trim() || '💳';
    close();
    onAdd({ id: Date.now(), name, price, day, emoji, active: true });
  };
  box.querySelector('#aboModalAddBtn').addEventListener('click', submit);
  [nameInp, priceInp, dayInp].forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  }));
  nameInp.focus();
}

function renderAbonnementerCard(container) {
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';
  let editingId = null;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-weight:600;font-size:14px">${icon('abonnement',{size:14})} Abonnementer</div>
      <button id="aboAddOpenBtn" style="display:flex;align-items:center;gap:4px;padding:6px 12px;background:var(--green-accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">${icon('add',{size:12})} Legg til</button>
    </div>
    <div id="aboSummary"></div>
    <div id="aboList" style="display:flex;flex-direction:column;gap:8px;margin-top:14px"></div>`;

  container.querySelector('#aboAddOpenBtn').addEventListener('click', () => {
    openAddAbonnementModal(sub => {
      const list = loadAbonnementer();
      list.push(sub);
      saveAbonnementer(list);
      renderList();
      showToast('Lagt til');
    });
  });

  function renderSummary(list) {
    const summary = container.querySelector('#aboSummary');
    if (!list.length) { summary.innerHTML = ''; return; }
    const active = list.filter(s => s.active);
    const totalMonthly = active.reduce((sum, s) => sum + s.price, 0);
    summary.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Per mnd</div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${fmt(totalMonthly)}</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Per år</div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${fmt(totalMonthly * 12)}</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Aktive</div>
          <div style="font-size:16px;font-weight:700;color:var(--text)">${active.length}</div>
        </div>
      </div>`;
  }

  function renderList() {
    const list = loadAbonnementer();
    renderSummary(list);
    const listEl = container.querySelector('#aboList');

    if (!list.length) {
      listEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0">Ingen abonnementer lagt til ennå.</div>`;
      return;
    }

    const withInfo = list.map(s => ({ ...s, info: nextBillingInfo(s.day) }));
    withInfo.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.info.daysUntil - b.info.daysUntil;
    });

    listEl.innerHTML = withInfo.map(s => {
      const emoji = s.emoji || '💳';
      if (editingId === s.id) {
        return `
        <div class="aboEditRow" data-id="${s.id}" style="background:var(--chip-bg);border-radius:10px;padding:10px 12px">
          <div style="display:grid;grid-template-columns:44px 1.4fr 1fr 1fr auto;gap:8px;align-items:center">
            <input class="aboEditEmoji" type="text" maxlength="4" readonly value="${emoji}"
              style="width:44px;height:36px;text-align:center;font-size:18px;border:1px solid var(--border);border-radius:8px;background:var(--input-bg);color:var(--text);cursor:pointer">
            <input class="aboEditName" type="text" value="${s.name}" style="${iSt};padding:6px 8px">
            <input class="aboEditPrice" type="number" value="${s.price}" style="${iSt};padding:6px 8px">
            <input class="aboEditDay" type="number" min="1" max="31" value="${s.day}" style="${iSt};padding:6px 8px">
            <div style="display:flex;gap:4px">
              <button class="aboSaveBtn" data-id="${s.id}" style="padding:6px 10px;border:none;border-radius:6px;background:var(--green-accent);color:#fff;font-size:12px;cursor:pointer;font-weight:600">✓</button>
              <button class="aboCancelBtn" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:none;color:var(--text);font-size:12px;cursor:pointer">✕</button>
            </div>
          </div>
          <div class="aboEditEmojiSlot"></div>
        </div>`;
      }

      const badgeColor = !s.active ? 'var(--text-muted)' : s.info.daysUntil <= 3 ? '#f59e0b' : 'var(--text-muted)';
      const badgeText  = !s.active ? 'Pauset' : s.info.daysUntil === 0 ? 'I dag' : s.info.daysUntil === 1 ? 'I morgen' : `om ${s.info.daysUntil} dager`;

      return `
      <div style="background:var(--chip-bg);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px;opacity:${s.active ? '1' : '0.55'}">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--input-bg);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">${emoji}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.name}</div>
          <div style="font-size:11px;color:var(--text-muted)">Dag ${s.day} i mnd</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--text)">${fmt(s.price)}</div>
          <div style="font-size:10px;font-weight:600;color:${badgeColor}">${badgeText}</div>
        </div>
        <div style="display:flex;gap:2px">
          <button class="aboPauseBtn" data-id="${s.id}" title="${s.active ? 'Pause' : 'Gjenoppta'}" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;font-size:14px">${s.active ? '⏸' : '▶'}</button>
          <button class="aboEditBtn" data-id="${s.id}" title="Rediger" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;font-size:14px">✎</button>
          <button class="aboDeleteBtn" data-id="${s.id}" title="Slett" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px;font-size:14px">🗑</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.aboEditRow').forEach(row => {
      const emojiInput = row.querySelector('.aboEditEmoji');
      const emojiSlot  = row.querySelector('.aboEditEmojiSlot');
      emojiInput.addEventListener('click', () => {
        openEmojiPicker(emojiSlot, emojiInput, emoji => { emojiInput.value = emoji; });
      });
    });

    listEl.querySelectorAll('.aboPauseBtn').forEach(btn => btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const l = loadAbonnementer();
      const item = l.find(s => s.id === id);
      if (item) { item.active = !item.active; saveAbonnementer(l); renderList(); }
    }));

    listEl.querySelectorAll('.aboEditBtn').forEach(btn => btn.addEventListener('click', () => {
      editingId = Number(btn.dataset.id);
      renderList();
    }));

    listEl.querySelectorAll('.aboCancelBtn').forEach(btn => btn.addEventListener('click', () => {
      editingId = null;
      renderList();
    }));

    listEl.querySelectorAll('.aboSaveBtn').forEach(btn => btn.addEventListener('click', () => {
      const id  = Number(btn.dataset.id);
      const row = btn.closest('.aboEditRow');
      const name  = row.querySelector('.aboEditName').value.trim();
      const price = parseFloat(row.querySelector('.aboEditPrice').value) || 0;
      const day   = Math.min(31, Math.max(1, parseInt(row.querySelector('.aboEditDay').value) || 1));
      const emoji = row.querySelector('.aboEditEmoji').value.trim() || '💳';
      if (!name || price <= 0) return;
      const l = loadAbonnementer();
      const item = l.find(s => s.id === id);
      if (item) { item.name = name; item.price = price; item.day = day; item.emoji = emoji; saveAbonnementer(l); }
      editingId = null;
      renderList();
      showToast('Lagret');
    }));

    listEl.querySelectorAll('.aboDeleteBtn').forEach(btn => btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const item = list.find(s => s.id === id);
      showConfirmDialog(`Er du sikker på at du vil slette «${item?.name}»?`, () => {
        const l = loadAbonnementer().filter(s => s.id !== id);
        saveAbonnementer(l);
        renderList();
        showToast('Slettet');
      });
    }));
  }

  renderList();
}

// ── Feriepenger Calculator ───────────────────────────────────────
function renderFeriepengerCalc(container) {
  const saved = JSON.parse(localStorage.getItem('okonomi_feriepenger') || '{}');
  const bruttoAar = saved.bruttoAar || 0;
  const over60 = saved.over60 || false;

  const rate = over60 ? 0.122 : 0.102;
  const feriepenger = bruttoAar * rate;
  const skatt = feriepenger * 0; // feriepenger er skattefrie i juni
  const netto = feriepenger;
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit';

  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">${icon('feriepenger',{size:14})} Feriepenger-kalkulator</div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Brutto årslønn (forrige år)</label>
      <input id="fpBrutto" type="number" placeholder="F.eks. 500000" value="${bruttoAar || ''}" style="${iSt}">
    </div>
    <div style="margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer">
        <input id="fpOver60" type="checkbox" ${over60 ? 'checked' : ''} style="width:16px;height:16px">
        Over 60 år (12,2% i stedet for 10,2%)
      </label>
    </div>
    <div id="fpResult" style="display:${bruttoAar ? 'block' : 'none'}">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <div style="background:var(--chip-bg);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Feriepenger</div>
          <div style="font-size:24px;font-weight:700;color:#22c55e" id="fpAmount">${fmt(feriepenger)}</div>
          <div style="font-size:11px;color:var(--text-muted)" id="fpRate">${(rate*100).toFixed(1)}% av brutto</div>
        </div>
        <div style="background:var(--chip-bg);border-radius:10px;padding:14px;text-align:center">
          <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Per mnd (delt på 12)</div>
          <div style="font-size:24px;font-weight:700;color:var(--text)" id="fpMonthly">${fmt(feriepenger / 12)}</div>
          <div style="font-size:11px;color:var(--text-muted)">opptjent per mnd</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);line-height:1.5">
        Utbetales normalt i juni. Feriepenger er trekkfri — du betaler ikke skatt på disse i utbetalingsmåneden.
        Satsen er ${(rate*100).toFixed(1)}% av fjorårets brutto for ${over60 ? 'arbeidstakere over 60' : 'vanlige arbeidstakere'}.
      </div>
    </div>`;

  const update = () => {
    const b = parseFloat(document.getElementById('fpBrutto').value) || 0;
    const o = document.getElementById('fpOver60').checked;
    const r = o ? 0.122 : 0.102;
    const fp = b * r;
    localStorage.setItem('okonomi_feriepenger', JSON.stringify({ bruttoAar: b, over60: o }));
    const res = document.getElementById('fpResult');
    res.style.display = b > 0 ? 'block' : 'none';
    document.getElementById('fpAmount').textContent = fmt(fp);
    document.getElementById('fpRate').textContent = (r*100).toFixed(1) + '% av brutto';
    document.getElementById('fpMonthly').textContent = fmt(fp / 12);
  };
  container.querySelector('#fpBrutto').addEventListener('input', update);
  container.querySelector('#fpOver60').addEventListener('change', update);
}

// ── Valuta / Trip Planner ────────────────────────────────────────
function renderValutaPanel(container) {
  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">${icon('valuta',{size:14})} Valutakurser (Norges Bank)</div>
    <div id="valutaContent" style="text-align:center;color:var(--text-muted);padding:20px">Henter kurser...</div>`;

  fetchExchangeRates().then(rates => {
    const content = document.getElementById('valutaContent');
    if (!content) return; // tab navigated away
    if (!rates || !Object.keys(rates).length) {
      content.innerHTML = '<div style="color:#ef4444;font-size:13px">Kunne ikke hente kurser. Sjekk internettilkobling.</div>';
      return;
    }

    // Popular currencies with flags
    const curInfo = {
      EUR: { flag: '🇪🇺', name: 'Euro' },
      USD: { flag: '🇺🇸', name: 'US Dollar' },
      GBP: { flag: '🇬🇧', name: 'Britisk pund' },
      SEK: { flag: '🇸🇪', name: 'Svensk krone' },
      DKK: { flag: '🇩🇰', name: 'Dansk krone' },
      PLN: { flag: '🇵🇱', name: 'Polsk zloty' },
      HUF: { flag: '🇭🇺', name: 'Ungarsk forint' },
      CZK: { flag: '🇨🇿', name: 'Tsjekkisk krone' },
      CHF: { flag: '🇨🇭', name: 'Sveitsisk franc' },
      THB: { flag: '🇹🇭', name: 'Thailandsk baht' },
      TRY: { flag: '🇹🇷', name: 'Tyrkisk lira' },
      JPY: { flag: '🇯🇵', name: 'Japansk yen' },
    };

    const savedTrip = JSON.parse(localStorage.getItem('okonomi_trip') || '{}');

    content.innerHTML = `
      <div style="text-align:left">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Sist oppdatert: ${Object.values(rates)[0]?.date || '—'}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:20px">
          ${Object.entries(rates).map(([cur, data]) => {
            const info = curInfo[cur] || { flag: '🏳️', name: cur };
            const arrow = data.change7d > 0.3 ? '↑' : data.change7d < -0.3 ? '↓' : '→';
            const color = data.change7d > 0.3 ? '#ef4444' : data.change7d < -0.3 ? '#22c55e' : 'var(--text-muted)';
            const rateDisplay = data.rate.toFixed(2);
            const perLabel = '';
            return `<div style="background:var(--chip-bg);border-radius:8px;padding:10px 12px;display:flex;align-items:center;gap:8px">
              <span style="font-size:18px">${info.flag}</span>
              <div style="flex:1;text-align:left">
                <div style="font-size:12px;font-weight:600">${cur}${perLabel}</div>
                <div style="font-size:10px;color:var(--text-muted)">${info.name}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:14px;font-weight:700">${rateDisplay}</div>
                <div style="font-size:10px;color:${color}">${arrow} ${Math.abs(data.change7d).toFixed(1)}% 7d</div>
              </div>
            </div>`;
          }).join('')}
        </div>

        <div style="border-top:1px solid var(--border-light);padding-top:16px">
          <div style="font-weight:600;font-size:13px;margin-bottom:10px">${icon('reise',{size:13})} Reisekalkulator</div>
          <div style="margin-bottom:10px">
            <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Valuta</label>
            <select id="tripCur" style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit">
              ${Object.entries(rates).map(([cur]) => {
                const info = curInfo[cur] || { flag: '🏳️', name: cur };
                return `<option value="${cur}" ${cur === (savedTrip.cur || 'EUR') ? 'selected' : ''}>${info.flag} ${cur} — ${info.name}</option>`;
              }).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 32px 1fr;gap:6px;align-items:end;margin-bottom:12px">
            <div>
              <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">NOK</label>
              <input id="tripNok" type="number" placeholder="5000" value="${savedTrip.nok || ''}"
                style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box">
            </div>
            <div style="text-align:center;font-size:16px;color:var(--text-muted);padding-bottom:8px">⇌</div>
            <div>
              <label id="tripForeignLabel" style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">EUR</label>
              <input id="tripForeign" type="number" placeholder="—"
                style="padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box">
            </div>
          </div>
          <div id="tripResult" style="background:var(--chip-bg);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:11px;color:var(--text-muted)" id="tripRate">Velg valuta og skriv inn beløp</div>
          </div>
        </div>
      </div>`;

    let tripUpdating = false;
    const updateTripFromNok = () => {
      if (tripUpdating) return; tripUpdating = true;
      const nok = parseFloat(document.getElementById('tripNok')?.value) || 0;
      const cur = document.getElementById('tripCur')?.value;
      const rateData = rates[cur];
      localStorage.setItem('okonomi_trip', JSON.stringify({ nok, cur }));
      const fEl = document.getElementById('tripForeign');
      const rateEl = document.getElementById('tripRate');
      if (nok > 0 && rateData) {
        const converted = nok / rateData.rate;
        if (fEl) fEl.value = converted.toFixed(2);
        if (rateEl) rateEl.textContent = `Kurs: 1 ${cur} = ${rateData.rate.toFixed(2)} NOK`;
      } else if (fEl) { fEl.value = ''; }
      tripUpdating = false;
    };
    const updateTripFromForeign = () => {
      if (tripUpdating) return; tripUpdating = true;
      const foreign = parseFloat(document.getElementById('tripForeign')?.value) || 0;
      const cur = document.getElementById('tripCur')?.value;
      const rateData = rates[cur];
      const nokEl = document.getElementById('tripNok');
      const rateEl = document.getElementById('tripRate');
      if (foreign > 0 && rateData) {
        const nok = foreign * rateData.rate;
        if (nokEl) nokEl.value = nok.toFixed(2);
        if (rateEl) rateEl.textContent = `Kurs: 1 ${cur} = ${rateData.rate.toFixed(2)} NOK`;
        localStorage.setItem('okonomi_trip', JSON.stringify({ nok, cur }));
      } else if (nokEl) { nokEl.value = ''; }
      tripUpdating = false;
    };
    const updateCurLabel = () => {
      const cur = document.getElementById('tripCur')?.value;
      const lbl = document.getElementById('tripForeignLabel');
      if (lbl) lbl.textContent = cur || 'Valuta';
    };
    document.getElementById('tripNok')?.addEventListener('input', updateTripFromNok);
    document.getElementById('tripForeign')?.addEventListener('input', updateTripFromForeign);
    document.getElementById('tripCur')?.addEventListener('change', () => { updateCurLabel(); updateTripFromNok(); });
    updateCurLabel();
    if (savedTrip.nok) updateTripFromNok();
  }).catch(err => {
    const content = document.getElementById('valutaContent');
    if (content) content.innerHTML = `<div style="color:#ef4444;font-size:13px">Feil ved henting av kurser: ${err.message || 'ukjent feil'}</div>`;
  });
}

// ── Skatt tab (Skattekalkulator + Årslønn & skatt hittil) ─────────
function renderSkatt() {
  setActiveNav('skatt');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  // Skattekalkulator
  const skHead = document.createElement('div'); skHead.className = 'section-head'; skHead.textContent = 'Skattekalkulator'; c.appendChild(skHead);
  const skCard = document.createElement('div'); skCard.className = 'card'; c.appendChild(skCard);
  renderSkattekalkulatorCalc(skCard);

  // Årslønn & skatt hittil
  const lsHead = document.createElement('div'); lsHead.className = 'section-head'; lsHead.textContent = 'Årslønn & skatt hittil'; c.appendChild(lsHead);
  const lsCard = document.createElement('div'); lsCard.className = 'card'; c.appendChild(lsCard);
  renderLonnSkattTracker(lsCard);
}

// ── Studielån-tracker ────────────────────────────────────────────
// Answers three questions: how much have I borrowed, where did it go, and how
// are the borrowed kroner I put in funds doing against what I owe on them.
function renderStudielanCard(container) {
  const st       = loadStudielanState();
  const payouts  = studielanPayouts();
  const paid     = payouts.reduce((s,t) => s+t.inn, 0);
  const total    = st.prior + paid;

  const funded    = studielanFundedBuckets();
  const fundedSum = funded.reduce((s,x) => s+x.funded, 0);   // lånt inn — det du skylder
  const fundedVal = funded.reduce((s,x) => s+x.bal, 0);      // hva kontoene står i nå
  const ownSum    = funded.reduce((s,x) => s+(x.own||0), 0);  // egne penger skutt inn i de samme bøttene
  const basis     = fundedSum + ownSum;                       // alt du har skutt inn
  const avk       = fundedVal - basis;                        // det kontoene har tjent
  const avkPct    = basis > 0 ? (avk / basis * 100) : 0;
  const avkColor  = avk > 0 ? '#22c55e' : avk < 0 ? '#ef4444' : 'var(--text-muted)';

  // Per year, newest first
  const byYear = {};
  payouts.forEach(t => { const y = t.dato.split('.')[2]; byYear[y] = (byYear[y]||0) + t.inn; });
  const years = Object.entries(byYear).sort((a,b) => b[0].localeCompare(a[0]));
  const yearMax = Math.max(...years.map(y => y[1]), 1);

  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:15px;font-weight:600;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';
  const tile = (label, value, sub, color) => `
    <div style="background:var(--chip-bg);border:1px solid var(--border);border-radius:12px;padding:12px 14px">
      <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color||'var(--text)'};white-space:nowrap">${value}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${sub}</div>
    </div>`;

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div style="font-weight:600;font-size:14px">${icon('studielan',{size:14})} Studielån</div>
      <div style="font-size:11px;color:var(--text-muted)">Rentefritt så lenge du er student</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
      ${tile('Totalt lånt', fmt(total),
             payouts.length ? `${payouts.length} utbetaling${payouts.length!==1?'er':''}${st.prior>0?` · inkl. ${fmt(st.prior)} fra før`:''}` : 'ingen utbetalinger enda')}
      ${tile('Brukt — ute av konto', fmt(Math.max(0, total - fundedSum)),
             fundedSum > 0 ? 'f.eks. bil — gjeld, men ikke penger du har' : 'alt lånet er brukt')}
      ${fundedSum > 0
        ? tile('Står i fond/sparing',
               `${fmt(fundedVal)} <span style="font-size:13px;color:${avkColor}">${avk>=0?'+':'−'}${fmt(avk)}</span>`,
               `skutt inn ${fmt(basis)}${ownSum>0?` (${fmt(fundedSum)} lånt)`:' — alt lånt'} · ${avk>=0?'+':'−'}${Math.abs(avkPct).toFixed(1).replace('.',',')} % avkastning`)
        : tile('Står i fond/sparing', '—', 'merk en bøtte i Sparing → Rediger')}
    </div>

    ${funded.length ? `<div style="margin-bottom:14px">
      ${funded.map(x => {
        const bs = x.funded + (x.own||0);
        const a  = x.bal - bs;
        const ac = a > 0 ? '#22c55e' : a < 0 ? '#ef4444' : 'var(--text-muted)';
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border-light)">
          <div style="font-size:16px;line-height:1;flex-shrink:0">${resolveBucketIcon(x.b) ? icon(resolveBucketIcon(x.b),{size:16}) : x.b.emoji}</div>
          <div style="flex:1;min-width:0;font-size:13px;font-weight:500">${x.b.label}</div>
          <div style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmt(x.bal)} · skutt inn ${fmt(bs)}</div>
          <div style="font-size:13px;font-weight:700;color:${ac};white-space:nowrap;min-width:92px;text-align:right">${a>=0?'+':'−'}${fmt(a)}</div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:4px">
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Tell lån fra og med</label>
        <div id="slFromField" style="${iSt};cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:500;font-size:14px">
          <span id="slFromText" style="${st.fromDate ? '' : 'color:var(--text-muted)'}">${st.fromDate ? formatDateNo(st.fromDate) : 'Alle utbetalinger'}</span>
          <span style="color:var(--text-muted);display:flex;flex-shrink:0">${icon('calendar',{size:14})}</span>
        </div>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Lån tatt opp før den datoen</label>
        <input id="slPrior" type="number" min="0" step="1000" placeholder="0" value="${st.prior || ''}" style="${iSt}">
      </div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-bottom:${years.length?'16px':'0'}">
      Sett startdatoen til da du begynte på bachelor — stipend fra videregående var ikke lån og skal ikke telle med.${st.fromDate ? ` Utbetalinger før ${formatDateNo(st.fromDate)} er utelatt.` : ''}
    </div>

    ${years.length ? `<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Utbetalt per år</div>
    ${years.map(([y,v]) => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div style="font-size:12px;font-weight:600;width:38px;flex-shrink:0">${y}</div>
        <div style="flex:1;height:6px;background:var(--border);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${(v/yearMax*100).toFixed(1)}%;background:var(--text-muted);border-radius:99px"></div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;width:80px;text-align:right">${fmt(v)}</div>
      </div>`).join('')}` : ''}

    ${payouts.length ? `<div style="margin-top:14px">
      <button class="sort-btn" id="slToggleList">Vis utbetalinger (${payouts.length})</button>
      <div id="slList" style="display:none;margin-top:10px"></div>
    </div>` : `<div style="font-size:12px;color:var(--text-muted);margin-top:12px">
      Ingen utbetalinger fanget opp enda. De dukker opp her automatisk når en utbetaling fra Lånekassen importeres.
    </div>`}`;

  // Re-render only on a real change — otherwise tabbing out of the field would
  // rebuild the card under the cursor and drop focus.
  const save = (patch = {}) => {
    const next = {
      prior: Math.max(0, parseFloat(container.querySelector('#slPrior')?.value) || 0),
      fromDate: st.fromDate,
      ...patch,
    };
    if (next.prior === st.prior && next.fromDate === st.fromDate) return;
    saveStudielanState(next);
    renderStudielanCard(container);
  };
  container.querySelector('#slPrior')?.addEventListener('blur', () => save());
  container.querySelector('#slPrior')?.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

  const fromField = container.querySelector('#slFromField');
  fromField?.addEventListener('click', () => {
    openCalendarPicker(fromField, st.fromDate, dateStr => save({ fromDate: dateStr || '' }));
  });

  const toggle = container.querySelector('#slToggleList');
  toggle?.addEventListener('click', () => {
    const list = container.querySelector('#slList');
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';
    toggle.textContent = open ? `Vis utbetalinger (${payouts.length})` : 'Skjul utbetalinger';
    if (!open && !list.dataset.filled) {
      list.dataset.filled = '1';
      list.innerHTML = [...payouts].reverse().map(t => `
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--border-light)">
          <div style="flex:1;min-width:0;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.beskr}</div>
          <div style="font-size:11px;color:var(--text-muted);white-space:nowrap">${t.dato}</div>
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);white-space:nowrap;width:90px;text-align:right">${fmt(t.inn)}</div>
        </div>`).join('');
    }
  });
}

// ── Main render ──────────────────────────────────────────────────
function renderKontoeierCard(card) {
  card.innerHTML = `
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">
      Banken merker overføringer mellom dine egne kontoer med ditt eget navn —
      helt likt en betaling til en venn. Appen bruker navnet for å skille dem,
      så flytting av egne penger ikke telles som forbruk.
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
      <div style="flex:1;min-width:190px">
        <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:3px">Navnet ditt slik det står i kontoutskriften</label>
        <input id="kontoeierInput" type="text" placeholder="Fornavn Etternavn" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:14px">
      </div>
      <button class="sort-btn sort-active" id="kontoeierSave">Lagre</button>
    </div>`;
  // Settes som verdi, ikke i malen over, så et navn med anførselstegn ikke
  // bryter ut av attributtet.
  card.querySelector('#kontoeierInput').value = loadKontoeier();
  card.querySelector('#kontoeierSave').addEventListener('click', () => {
    saveKontoeier(card.querySelector('#kontoeierInput').value.trim().toLowerCase());
    showToast('Lagret — kategoriene er oppdatert');
    boot(false);
  });
}

function renderVerktoy() {
  setActiveNav('verktoy');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  // Kontoeier — bare for kontoutskrifter uten Type-kolonne, der eierens eget
  // navn er det eneste som skiller egne overføringer fra betalinger til andre.
  // Navnet gjettes ved import; her kan det rettes hvis gjettingen bommet.
  if (loadStored().some(t => !t.type && t.til && t.fra)) {
    const keHead = document.createElement('div'); keHead.className = 'section-head'; keHead.textContent = 'Kontoeier'; c.appendChild(keHead);
    const keCard = document.createElement('div'); keCard.className = 'card'; c.appendChild(keCard);
    renderKontoeierCard(keCard);
  }

  // Abonnementer
  const aboHead = document.createElement('div'); aboHead.className = 'section-head'; aboHead.textContent = 'Abonnementer'; c.appendChild(aboHead);
  const aboCard = document.createElement('div'); aboCard.className = 'card'; c.appendChild(aboCard);
  renderAbonnementerCard(aboCard);

  // Sparemål
  const smHead = document.createElement('div'); smHead.className = 'section-head'; smHead.textContent = 'Sparemål'; c.appendChild(smHead);
  const smCard = document.createElement('div'); smCard.className = 'card'; c.appendChild(smCard);
  renderSparemaalCalc(smCard);

  // Studielån
  const slHead = document.createElement('div'); slHead.className = 'section-head'; slHead.textContent = 'Studielån'; c.appendChild(slHead);
  const slCard = document.createElement('div'); slCard.className = 'card'; c.appendChild(slCard);
  renderStudielanCard(slCard);

  // Two-column: Feriepenger + Valuta
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:4px';

  const fpHead = document.createElement('div'); fpHead.className = 'section-head'; fpHead.textContent = 'Feriepenger'; c.appendChild(fpHead);

  const fpCard = document.createElement('div'); fpCard.className = 'card';
  const valCard = document.createElement('div'); valCard.className = 'card';
  grid.appendChild(fpCard);
  grid.appendChild(valCard);
  c.appendChild(grid);

  renderFeriepengerCalc(fpCard);
  renderValutaPanel(valCard);
}
