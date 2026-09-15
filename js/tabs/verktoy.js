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
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">🧮 Skattekalkulator</div>
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

// ── Sparemål Calculator ──────────────────────────────────────────
const SPAREMAAL_CALC_KEY = 'okonomi_sparemaal_calc_v1';

function renderSparemaalCalc(container) {
  const saved = JSON.parse(localStorage.getItem(SPAREMAAL_CALC_KEY) || '{}');
  const iSt = 'padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:14px;background:var(--input-bg);color:var(--text);width:100%;font-family:inherit;box-sizing:border-box';

  container.innerHTML = `
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">🎯 Sparemål-kalkulator</div>
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
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">🏖️ Feriepenger-kalkulator</div>
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
    <div style="font-weight:600;font-size:14px;margin-bottom:14px">💱 Valutakurser (Norges Bank)</div>
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
          <div style="font-weight:600;font-size:13px;margin-bottom:10px">✈️ Reisekalkulator</div>
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

// ── Main render ──────────────────────────────────────────────────
function renderVerktoy() {
  setActiveNav('verktoy');
  const c = document.getElementById('mainContent');
  c.innerHTML = '';

  // Skattekalkulator
  const skHead = document.createElement('div'); skHead.className = 'section-head'; skHead.textContent = 'Skattekalkulator'; c.appendChild(skHead);
  const skCard = document.createElement('div'); skCard.className = 'card'; c.appendChild(skCard);
  renderSkattekalkulatorCalc(skCard);

  // Sparemål
  const smHead = document.createElement('div'); smHead.className = 'section-head'; smHead.textContent = 'Sparemål'; c.appendChild(smHead);
  const smCard = document.createElement('div'); smCard.className = 'card'; c.appendChild(smCard);
  renderSparemaalCalc(smCard);

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
