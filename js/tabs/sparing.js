// ── Sparing ──────────────────────────────────────────────────────
// Buckets created before iconId existed only have a bare emoji — match by
// label against the known presets (and their common English/Norwegian
// variants: "fond", "nødfond"/"emergency", "car", …) so they still get
// lucide/tabler icons instead of needing to be recreated. Substring, not
// exact match — "Nordnet (fond)" and "Nødfond for bil" should both hit.
// Which figure the "Faktisk saldo" card shows. Defaults to 'alt' — the balance
// is never quietly reduced; seeing only your own share is something you ask for.
const SALDO_VIEW_KEY = 'okonomi_saldo_view';   // 'alt' | 'mine'

const BUCKET_LABEL_ICON_KEYWORDS = [
  ['bsu',       ['bsu']],
  ['krisefond', ['krisefond', 'nødfond', 'nodfond', 'emergency']],
  ['nordnet',   ['nordnet', 'fond']],
  ['shortterm', ['short-term', 'shortterm', 'short term']],
  ['reise',     ['ferie', 'reise', 'vacation', 'holiday', 'travel']],
  ['bil',       ['bil', 'car']],
  ['trening',   ['trening', 'gym', 'sport']],
  ['pensjon',   ['pensjon', 'retirement']],
];
function resolveBucketIcon(b) {
  if (b.iconId) return b.iconId;
  // Emoji chosen by hand under Rediger — keyword guessing must not override it,
  // or renaming a bucket to "Bilfond" would silently swap in the car icon.
  if (b.emojiLocked) return null;
  const label = (b.label || '').trim().toLowerCase();
  if (!label) return null;
  const hit = BUCKET_LABEL_ICON_KEYWORDS.find(([, kws]) => kws.some(kw => label.includes(kw)));
  return hit ? hit[0] : null;
}

// Persist the on-screen order. Buckets not on screen (hidden ones) keep their
// records and settle at the end — they are invisible either way.
function saveBucketOrder(orderedIds) {
  const buckets = loadCustomBuckets();
  const byId = new Map(buckets.map(b => [b.id, b]));
  const reordered = [];
  orderedIds.forEach(id => { if (byId.has(id)) { reordered.push(byId.get(id)); byId.delete(id); } });
  byId.forEach(b => reordered.push(b));
  saveCustomBuckets(reordered);
}

// Hold a card for a moment, then drag it onto another to drop it in that spot.
// Pointer events rather than HTML5 drag-and-drop: same code path for mouse and
// touch, and it never fights the inputs inside the card.
const BUCKET_DRAG_HOLD_MS = 200;
function enableBucketDragReorder(grid) {
  let holdTimer = null, drag = null, startX = 0, startY = 0;

  const otherCards = () => [...grid.querySelectorAll('[data-bucket-id]')].filter(el => el !== drag?.el);

  const markTarget = el => {
    otherCards().forEach(c => {
      const on = c === el;
      c.style.outline = on ? '2px dashed var(--green-accent)' : '';
      c.style.outlineOffset = on ? '2px' : '';
      c.style.transform = on ? 'scale(0.97)' : '';
      c.style.transition = 'transform 0.12s ease';
    });
  };

  /** Card whose centre is closest to the pointer — works for a 2-column grid,
      where "the one above/below" is as valid a drop as "the one beside". */
  const nearestCard = (x, y) => {
    let best = null, bestD = Infinity;
    otherCards().forEach(c => {
      const r = c.getBoundingClientRect();
      const dx = (r.left + r.width/2) - x, dy = (r.top + r.height/2) - y;
      const d = dx*dx + dy*dy;
      if (d < bestD) { bestD = d; best = c; }
    });
    return best;
  };

  const reset = () => {
    clearTimeout(holdTimer); holdTimer = null;
    if (drag) {
      Object.assign(drag.el.style, { position:'', transform:'', zIndex:'', opacity:'', boxShadow:'', cursor:'', transition:'' });
      drag = null;
    }
    otherCards().forEach(c => { c.style.outline = ''; c.style.outlineOffset = ''; c.style.transform = ''; });
    document.body.style.userSelect = '';
  };

  grid.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest('[data-bucket-id]');
    if (!card) return;
    // Never hijack the quick-add row, Rediger, or the × button.
    if (e.target.closest('input, button, select, textarea, a')) return;
    startX = e.clientX; startY = e.clientY;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      drag = { el: card, id: card.dataset.bucketId, target: null };
      Object.assign(card.style, {
        position: 'relative', zIndex: '50', opacity: '0.94', cursor: 'grabbing',
        boxShadow: '0 14px 34px rgba(0,0,0,0.28)', transition: 'none',
      });
      drag.rect = card.getBoundingClientRect();
      card.setPointerCapture?.(e.pointerId);
      document.body.style.userSelect = 'none';
      navigator.vibrate?.(8);
    }, BUCKET_DRAG_HOLD_MS);
  });

  grid.addEventListener('pointermove', e => {
    // Moved before the hold completed — that is a scroll or a stray nudge, not a drag.
    if (holdTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) { clearTimeout(holdTimer); holdTimer = null; }
    if (!drag) return;
    e.preventDefault();
    drag.el.style.transform = `translate(${e.clientX - startX}px, ${e.clientY - startY}px)`;
    // Still hovering over its own slot — a small wiggle after the hold should not
    // pick a neighbour and silently reorder on release.
    const r = drag.rect;
    const home = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    drag.target = home ? null : nearestCard(e.clientX, e.clientY);
    markTarget(drag.target);
  }, { passive: false });

  const finish = () => {
    if (!drag) { reset(); return; }
    const { id, target } = drag;
    const ids = [...grid.querySelectorAll('[data-bucket-id]')].map(el => el.dataset.bucketId);
    reset();
    if (!target) return;
    const to = ids.indexOf(target.dataset.bucketId);
    const from = ids.indexOf(id);
    if (from === -1 || to === -1 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    saveBucketOrder(ids);
    renderSparing();
  };

  grid.addEventListener('pointerup', finish);
  grid.addEventListener('pointercancel', reset);
}

/** Sub-positions inside one bucket — e.g. Nordnet Tek + KLP Global in the same
    Nordnet account. When a bucket has them, its balance IS their sum, so the
    two can never drift apart. */
function bucketHoldings(bdata) {
  return Array.isArray(bdata?.holdings) ? bdata.holdings.filter(h => h && h.name) : [];
}
function holdingsSum(holdings) {
  return holdings.reduce((s,h) => s + (Number.isFinite(+h.amount) ? +h.amount : 0), 0);
}

function sparingSaveBucket(bid, balVal, goalVal, yearlyLimitVal, targetDateVal, loanFundedVal, holdingsVal, ownFundedVal) {
  const all = loadSparemaal();
  if (!all[bid]) all[bid] = {};
  if (holdingsVal !== undefined) {
    if (holdingsVal.length) all[bid].holdings = holdingsVal; else delete all[bid].holdings;
  }
  const holds = bucketHoldings(all[bid]);
  if (holds.length) {
    all[bid].balance = holdingsSum(holds);   // derived, never typed in directly
  } else if (balVal !== '') {
    all[bid].balance = parseFloat(balVal) || 0;
  } else {
    delete all[bid].balance;
  }
  if (goalVal !== '') all[bid].target = parseFloat(goalVal) || 0; else delete all[bid].target;
  if (yearlyLimitVal !== undefined) {
    if (yearlyLimitVal !== '') all[bid].yearlyLimit = parseFloat(yearlyLimitVal) || 0; else delete all[bid].yearlyLimit;
  }
  if (targetDateVal !== undefined) {
    if (targetDateVal !== '') all[bid].targetDate = targetDateVal; else delete all[bid].targetDate;
  }
  // How much of this bucket is money borrowed from Lånekassen — used to show
  // avkastning against the loan, and nothing else. Never touches the balance.
  if (loanFundedVal !== undefined) {
    if (loanFundedVal !== '') all[bid].loanFunded = parseFloat(loanFundedVal) || 0; else delete all[bid].loanFunded;
  }
  // Own money put in. Together with loanFunded this is the cost basis, which is
  // what separates "what I've saved" from "what it has earned".
  if (ownFundedVal !== undefined) {
    if (ownFundedVal !== '') all[bid].ownFunded = parseFloat(ownFundedVal) || 0; else delete all[bid].ownFunded;
  }
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

// Quick add/subtract: adjusts balance by a delta and keeps a dated history
// so annual-limit buckets (like BSU) can show "deposited this year".
function sparingQuickAdjust(bid, delta, holdingIdx) {
  const all = loadSparemaal();
  if (!all[bid]) all[bid] = {};
  const holds = bucketHoldings(all[bid]);
  if (holds.length) {
    // Money goes into one specific fund, and the bucket balance follows from it.
    const i = (holdingIdx != null && holds[holdingIdx]) ? holdingIdx : 0;
    holds[i].amount = Math.max(0, (+holds[i].amount || 0) + delta);
    all[bid].holdings = holds;
    all[bid].balance = holdingsSum(holds);
  } else {
    all[bid].balance = (typeof all[bid].balance === 'number' ? all[bid].balance : 0) + delta;
  }
  all[bid].updatedAt = new Date().toISOString();
  const today = new Date();
  const dateStr = String(today.getDate()).padStart(2,'0') + '.' + String(today.getMonth()+1).padStart(2,'0') + '.' + today.getFullYear();
  if (!Array.isArray(all[bid].history)) all[bid].history = [];
  all[bid].history.push({ date: dateStr, delta });
  while (all[bid].history.length > 200) all[bid].history.shift();
  saveSparemaal(all);
  snapshotNetWorth();
  renderSparing();
  showToast('Lagret');
}

function sparingYearlyDeposits(bdata) {
  if (!Array.isArray(bdata.history)) return 0;
  const year = String(new Date().getFullYear());
  return bdata.history
    .filter(h => h.delta > 0 && h.date.endsWith(year))
    .reduce((s, h) => s + h.delta, 0);
}

// kr/month needed to close the remaining gap by targetDate — null when there's
// nothing left to save, no deadline set, or the deadline has already passed
// (those all read as "not applicable" rather than a number in the UI).
function sparingMonthlyNeeded(remaining, targetDate) {
  if (!targetDate || remaining <= 0) return null;
  const target = new Date(targetDate + 'T00:00:00');
  if (isNaN(target)) return null;
  const daysLeft = (target - new Date()) / 86400000;
  if (daysLeft <= 0) return null;
  const monthsLeft = daysLeft / 30.44;
  return remaining / Math.max(monthsLeft, 1 / 30.44); // floor of ~1 day so a due-tomorrow goal doesn't divide by ~0
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

function addCustomBucket(label, emoji, balVal, goalVal, iconId) {
  const buckets = loadCustomBuckets();
  const id = 'custom_' + Date.now();
  const colorIdx = buckets.filter(b=>!b.hidden).length % BUCKET_COLORS.length;
  const bucket = { id, label, emoji: emoji || '💎', color: BUCKET_COLORS[colorIdx], createdAt: new Date().toISOString(), hidden: false };
  if (iconId) bucket.iconId = iconId;
  buckets.push(bucket);
  saveCustomBuckets(buckets);
  if (balVal || goalVal) sparingSaveBucket(id, balVal || '', goalVal || '');
  else renderSparing();
  showToast('Ny sparebøtte opprettet');
}

// Rename / re-icon an existing bucket. Saves silently — the caller re-renders,
// so saving the edit modal is one repaint, not two.
function updateCustomBucket(bid, patch) {
  const buckets = loadCustomBuckets();
  const b = buckets.find(x => x.id === bid);
  if (!b) return false;
  if (patch.label) b.label = patch.label;
  if (patch.emoji !== undefined) b.emoji = patch.emoji || '💎';
  if (patch.iconId) b.iconId = patch.iconId; else delete b.iconId;
  if (patch.emojiLocked) b.emojiLocked = true; else delete b.emojiLocked;
  saveCustomBuckets(buckets);
  return true;
}


// Same popup-modal chrome as Budsjett's "Legg til kategori" (openAddBudgetCatModal
// in budsjett.js) — overlay + centered card, Escape/click-outside/back-gesture to
// close — instead of the old inline form that expanded in the page flow.
function openAddBucketModal() {
  const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';
  const presets = [
    { id: 'bsu',       name: 'BSU' },
    { id: 'krisefond', name: 'Krisefond' },
    { id: 'nordnet',   name: 'Nordnet' },
    { id: 'shortterm', name: 'Short-term' },
    { id: 'reise',     name: 'Ferie' },
    { id: 'bil',       name: 'Bil' },
    { id: 'trening',   name: 'Trening' },
    { id: 'pensjon',   name: 'Pensjon' },
  ];

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:confirmFadeIn 0.15s ease';

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg);color:var(--text);border-radius:18px;padding:22px 24px;max-width:420px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit;animation:confirmPop 0.22s cubic-bezier(.34,1.56,.64,1)';
  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700">Opprett ny sparebøtte</div>
      <button id="nbCloseBtn" style="padding:2px 8px;font-size:18px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer">×</button>
    </div>
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Hurtigvalg</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
      ${presets.map(p=>`<button class="nb-preset" data-iconid="${p.id}" data-emoji="${icon(p.id,{pack:'emoji'})}" data-name="${p.name}" style="padding:6px 12px;background:var(--chip-bg);border:1px solid var(--border);border-radius:20px;font-size:12px;cursor:pointer;color:var(--text);display:flex;align-items:center;gap:5px">${icon(p.id,{size:14})} ${p.name}</button>`).join('')}
    </div>
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Egendefinert</div>
    <div style="display:grid;grid-template-columns:60px 1fr;gap:6px;margin-bottom:8px">
      <div style="position:relative">
        <input id="nbEmoji" type="text" maxlength="4" style="${iSt};text-align:center;font-size:18px">
        <span id="nbEmojiHint" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;color:var(--text-muted)">${icon('pick-icon',{size:18})}</span>
      </div>
      <input id="nbName" type="text" placeholder="Navn på bøtte…" style="${iSt}">
    </div>
    <div id="nbEmojiPickerSlot"></div>
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
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let backNav = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (backNav) { const c = backNav; backNav = null; c(); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  box.querySelector('#nbCloseBtn').addEventListener('click', close);
  const escHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  backNav = bindBackNav(overlay, close);

  const nbEmojiInput = box.querySelector('#nbEmoji');
  const nbEmojiHint  = box.querySelector('#nbEmojiHint');
  const nbEmojiSlot  = box.querySelector('#nbEmojiPickerSlot');
  nbEmojiInput.addEventListener('input', () => {
    nbEmojiHint.style.display = nbEmojiInput.value ? 'none' : 'flex';
  });
  nbEmojiInput.addEventListener('click', () => {
    openEmojiPicker(nbEmojiSlot, nbEmojiInput, emoji => {
      nbEmojiInput.value = emoji;
      nbEmojiHint.style.display = 'none';
    });
  });

  box.querySelectorAll('.nb-preset').forEach(btn => {
    btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--green-accent)'; });
    btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; });
    btn.addEventListener('click', () => {
      close();
      addCustomBucket(btn.dataset.name, btn.dataset.emoji, '', '', btn.dataset.iconid);
    });
  });
  box.querySelector('#nbCancel').addEventListener('click', close);
  box.querySelector('#nbSave').addEventListener('click', () => {
    const name = box.querySelector('#nbName').value.trim();
    if (!name) { showToast('Skriv inn et navn'); return; }
    const emoji = box.querySelector('#nbEmoji').value.trim();
    const bal   = box.querySelector('#nbBal').value.trim();
    const goal  = box.querySelector('#nbGoal').value.trim();
    close();
    addCustomBucket(name, emoji, bal, goal);
  });
}

// "Rediger" on a bucket card — same popup-modal chrome as openAddBucketModal,
// used instead of an inline expand/collapse per feedback.
function openEditBucketModal(b, bal, goal, yearlyLimit, bdata, isBsu) {
  const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;animation:confirmFadeIn 0.15s ease';

  const esc = v => String(v == null ? '' : v).replace(/"/g, '&quot;');

  const box = document.createElement('div');
  box.style.cssText = 'background:var(--card-bg);color:var(--text);border-radius:18px;padding:22px 24px;max-width:400px;width:90%;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.35);font-family:inherit;animation:confirmPop 0.22s cubic-bezier(.34,1.56,.64,1)';
  // Section rule — groups the fields instead of one long stack of labels.
  const rule = 'border:none;border-top:1px solid var(--border-light);margin:16px 0';
  const lbl  = 'font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px';

  box.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:16px;font-weight:700">Rediger «${b.label}»</div>
      <button id="ebCloseBtn" style="padding:2px 8px;font-size:18px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer">×</button>
    </div>
    ${b.isCustom ? `
    <div style="display:grid;grid-template-columns:52px 1fr;gap:8px">
      <div style="position:relative">
        <input id="ebEmoji" type="text" maxlength="4" title="Klikk for å velge ikon" value="${esc(b.emoji)}" style="${iSt};text-align:center;font-size:18px;cursor:pointer">
        <span id="ebEmojiHint" style="position:absolute;inset:0;display:${b.emoji ? 'none' : 'flex'};align-items:center;justify-content:center;pointer-events:none;color:var(--text-muted)">${icon('pick-icon',{size:18})}</span>
      </div>
      <input id="ebName" type="text" value="${esc(b.label)}" placeholder="Navn på bøtte…" style="${iSt};font-weight:600">
    </div>
    <div id="ebEmojiPickerSlot"></div>
    <hr style="${rule}">` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div>
        <label style="${lbl}">Faktisk saldo</label>
        <input id="ebBal" type="number" placeholder="0" style="${iSt}" value="${bal !== null ? bal : ''}">
      </div>
      <div>
        <label style="${lbl}">Sparemål</label>
        <input id="ebGoal" type="number" placeholder="0" style="${iSt}" value="${goal || ''}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:${(isBsu || yearlyLimit) ? '1fr 1fr' : '1fr'};gap:10px;margin-top:10px">
      <div>
        <label style="${lbl}">Ønsket dato</label>
        <div id="ebDateField" style="${iSt};cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px">
          <span id="ebDateText" style="${bdata.targetDate ? '' : 'color:var(--text-muted)'}">${bdata.targetDate ? formatDateNo(bdata.targetDate) : 'Velg dato…'}</span>
          <span style="color:var(--text-muted);display:flex;flex-shrink:0">${icon('calendar',{size:14})}</span>
        </div>
      </div>
      ${(isBsu || yearlyLimit) ? `
      <div>
        <label style="${lbl}">Årlig grense</label>
        <input id="ebYearly" type="number" placeholder="27500" style="${iSt}" value="${yearlyLimit || ''}">
      </div>` : ''}
    </div>

    <hr style="${rule}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
      <label style="${lbl};margin:0">Delposter</label>
      <button id="ebAddHolding" class="sort-btn" style="padding:3px 9px;font-size:11px">+ Legg til</button>
    </div>
    <div id="ebHoldings"></div>
    <div id="ebHoldingsHint" style="font-size:10px;color:var(--text-muted)">Del bøtta i flere fond — saldoen regnes ut fra summen</div>

    <hr style="${rule}">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div>
        <label style="${lbl}">Finansiert med studielån</label>
        <input id="ebLoan" type="number" placeholder="0" style="${iSt}" value="${bdata.loanFunded || ''}">
      </div>
      <div>
        <label style="${lbl}">Egne penger inn</label>
        <input id="ebOwn" type="number" placeholder="0" style="${iSt}" value="${bdata.ownFunded || ''}">
      </div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:4px">Endrer ikke saldoen. Til sammen er de det du har skutt inn — resten er avkastning</div>

    <button id="ebSave" style="width:100%;padding:9px;background:var(--green-accent);color:#fff;border:none;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;margin-top:18px">Lagre</button>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  let backNav = null;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (backNav) { const c = backNav; backNav = null; c(); }
  };
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  box.querySelector('#ebCloseBtn').addEventListener('click', close);
  const escHandler = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  backNav = bindBackNav(overlay, close);

  const balInp = box.querySelector('#ebBal');
  const goalInp = box.querySelector('#ebGoal');
  const yearlyInp = box.querySelector('#ebYearly'); // null unless the bucket is BSU-like — only read on save
  const loanInp = box.querySelector('#ebLoan');
  const ownInp  = box.querySelector('#ebOwn');

  // ── Delposter: name + amount rows; when any exist the balance is their sum ──
  let holdings = bucketHoldings(bdata).map(h => ({ name: h.name, amount: +h.amount || 0 }));
  const holdWrap = box.querySelector('#ebHoldings');
  const holdHint = box.querySelector('#ebHoldingsHint');

  const paintHoldings = () => {
    const on = holdings.length > 0;
    // With delposter the balance is their sum, so the field stops being typed in
    // and starts being a readout — greyed, and it says where the number comes from.
    balInp.disabled = on;
    balInp.style.opacity = on ? '0.55' : '';
    if (on) {
      balInp.value = holdingsSum(holdings);
      holdHint.textContent = 'Sum: ' + fmt(holdingsSum(holdings)) + ' — saldoen følger denne';
    } else {
      holdHint.textContent = 'Del bøtta i flere fond — saldoen regnes ut fra summen';
    }
    holdWrap.innerHTML = holdings.map((h,i) => `
      <div style="display:grid;grid-template-columns:1fr 100px 28px;gap:6px;margin-bottom:6px">
        <input class="eb-h-name" data-i="${i}" type="text" placeholder="Navn på fond…" value="${String(h.name||'').replace(/"/g,'&quot;')}" style="${iSt}">
        <input class="eb-h-amt" data-i="${i}" type="number" placeholder="0" value="${h.amount || ''}" style="${iSt}">
        <button class="eb-h-rm" data-i="${i}" title="Fjern delpost" style="border:1px solid var(--border);border-radius:6px;background:none;color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1">×</button>
      </div>`).join('');
    holdWrap.querySelectorAll('.eb-h-name').forEach(el =>
      el.addEventListener('input', e => { holdings[+e.target.dataset.i].name = e.target.value; }));
    holdWrap.querySelectorAll('.eb-h-amt').forEach(el =>
      el.addEventListener('input', e => {
        holdings[+e.target.dataset.i].amount = parseFloat(e.target.value) || 0;
        balInp.value = holdingsSum(holdings);
        holdHint.textContent = 'Sum: ' + fmt(holdingsSum(holdings)) + ' — saldoen følger denne';
      }));
    holdWrap.querySelectorAll('.eb-h-rm').forEach(el =>
      el.addEventListener('click', e => { holdings.splice(+e.currentTarget.dataset.i, 1); paintHoldings(); }));
  };
  box.querySelector('#ebAddHolding').addEventListener('click', () => {
    holdings.push({ name: '', amount: 0 });
    paintHoldings();
    holdWrap.querySelector('.eb-h-name:last-of-type')?.focus();
  });
  paintHoldings();
  const nameInp = box.querySelector('#ebName');       // null for non-custom buckets
  const emojiInp = box.querySelector('#ebEmoji');

  // The bucket keeps whatever pack-aware icon it already had (set when it was
  // created) until a hand-picked emoji replaces it — that emoji then also wins
  // over the label-keyword guess, via emojiLocked.
  let selIconId = b.iconId || '';
  let emojiLocked = !!b.emojiLocked;
  if (emojiInp) {
    const pickedEmoji = () => {
      selIconId = '';
      emojiLocked = !!emojiInp.value.trim();
      box.querySelector('#ebEmojiHint').style.display = emojiInp.value ? 'none' : 'flex';
    };
    emojiInp.addEventListener('input', pickedEmoji);
    emojiInp.addEventListener('click', () => {
      openEmojiPicker(box.querySelector('#ebEmojiPickerSlot'), emojiInp, e => {
        emojiInp.value = e;
        pickedEmoji();
      });
    });
  }
  const dateField = box.querySelector('#ebDateField');
  const dateText = box.querySelector('#ebDateText');
  let selectedDate = bdata.targetDate || '';

  dateField.addEventListener('click', () => {
    openCalendarPicker(dateField, selectedDate, dateStr => {
      selectedDate = dateStr;
      dateText.textContent = dateStr ? formatDateNo(dateStr) : 'Velg dato…';
      dateText.style.color = dateStr ? '' : 'var(--text-muted)';
    });
  });

  const save = () => {
    if (nameInp && !nameInp.value.trim()) { showToast('Skriv inn et navn'); nameInp.focus(); return; }
    close();
    if (b.isCustom) updateCustomBucket(b.id, {
      label: nameInp.value.trim(),
      emoji: emojiInp.value.trim(),
      iconId: selIconId,
      emojiLocked,
    });
    const cleanHoldings = holdings
      .map(h => ({ name: h.name.trim(), amount: +h.amount || 0 }))
      .filter(h => h.name);   // a row with no name is an abandoned draft, not a position
    sparingSaveBucket(b.id, balInp.value.trim(), goalInp.value.trim(), yearlyInp ? yearlyInp.value.trim() : '', selectedDate, loanInp.value.trim(), cleanHoldings, ownInp.value.trim());
  };
  box.querySelector('#ebSave').addEventListener('click', save);
  [nameInp, balInp, goalInp, yearlyInp, loanInp, ownInp].forEach(i => i?.addEventListener('keydown', e => { if (e.key === 'Enter') save(); }));
}

// dd.mm.yyyy for an ISO 'YYYY-MM-DD' string — matches every other date shown in this app.
function formatDateNo(iso) {
  const [y, m, d] = iso.split('-');
  return d + '.' + m + '.' + y;
}

// Small custom calendar popover, anchored under `anchorEl` — replaces the
// native <input type="date"> so picking a deadline is clicking a day on a
// calendar instead of typing/the OS's own date chrome, per feedback.
function openCalendarPicker(anchorEl, initialValue, onSelect) {
  document.querySelectorAll('.cal-picker-popover').forEach(el => el.remove());

  const base = initialValue ? new Date(initialValue + 'T00:00:00') : new Date();
  let viewYear = base.getFullYear();
  let viewMonth = base.getMonth();
  let selectedStr = initialValue || null;

  const pop = document.createElement('div');
  pop.className = 'cal-picker-popover';
  const r = anchorEl.getBoundingClientRect();
  pop.style.cssText = 'position:fixed;top:' + (r.bottom + 6) + 'px;left:' + r.left + 'px;z-index:10001;'
    + 'background:var(--card-bg);border:1px solid var(--border);border-radius:12px;'
    + 'box-shadow:0 12px 32px rgba(0,0,0,0.2);padding:12px;width:230px;font-family:inherit;'
    + 'animation:confirmPop 0.15s cubic-bezier(.34,1.56,.64,1)';
  document.body.appendChild(pop);

  const monthNames = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];
  const weekdays = ['Ma','Ti','On','To','Fr','Lø','Sø'];

  function render() {
    const first = new Date(viewYear, viewMonth, 1);
    const startOffset = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = new Date();
    const todayStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');

    let cells = '';
    for (let i = 0; i < startOffset; i++) cells += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = viewYear + '-' + String(viewMonth+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      const isSelected = dateStr === selectedStr;
      const isToday = dateStr === todayStr;
      cells += '<div class="cal-day' + (isSelected?' selected':'') + '" data-date="' + dateStr + '" style="text-align:center;padding:6px 0;border-radius:8px;cursor:pointer;font-size:12px;'
        + (isSelected ? 'background:var(--green-accent);color:#fff;font-weight:700;' : 'color:var(--text);')
        + (isToday && !isSelected ? 'border:1.5px solid var(--green-accent);' : 'border:1.5px solid transparent;')
        + '">' + d + '</div>';
    }

    pop.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <button class="cal-nav" data-dir="-1" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 8px;line-height:1">‹</button>
        <div style="font-size:12px;font-weight:600">${monthNames[viewMonth]} ${viewYear}</div>
        <button class="cal-nav" data-dir="1" style="background:none;border:none;color:var(--text-muted);font-size:16px;cursor:pointer;padding:2px 8px;line-height:1">›</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
        ${weekdays.map(w => '<div style="text-align:center;font-size:10px;color:var(--text-muted);font-weight:600">' + w + '</div>').join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${cells}</div>
      <button class="cal-clear" style="width:100%;margin-top:10px;padding:6px;background:none;border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-muted);cursor:pointer">Fjern dato</button>`;

    pop.querySelectorAll('.cal-day').forEach(el => {
      el.addEventListener('mouseenter', () => { if (el.dataset.date !== selectedStr) el.style.background = 'var(--chip-bg)'; });
      el.addEventListener('mouseleave', () => { if (el.dataset.date !== selectedStr) el.style.background = ''; });
      el.addEventListener('click', () => { selectedStr = el.dataset.date; onSelect(selectedStr); close(); });
    });
    pop.querySelectorAll('.cal-nav').forEach(btn => {
      btn.addEventListener('click', () => {
        viewMonth += parseInt(btn.dataset.dir, 10);
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        else if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        render();
      });
    });
    pop.querySelector('.cal-clear').addEventListener('click', () => { onSelect(''); close(); });
  }
  render();

  function outsideClick(e) { if (!pop.contains(e.target) && e.target !== anchorEl && !anchorEl.contains(e.target)) close(); }
  function escHandler(e) { if (e.key === 'Escape') close(); }
  function close() {
    pop.remove();
    document.removeEventListener('mousedown', outsideClick, true);
    document.removeEventListener('keydown', escHandler);
  }
  // Deferred so the click that opened this picker doesn't immediately close it.
  setTimeout(() => document.addEventListener('mousedown', outsideClick, true), 0);
  document.addEventListener('keydown', escHandler);
}

function removeCustomBucket(bid) {
  const buckets = loadCustomBuckets();
  const b = buckets.find(x => x.id === bid);
  if (b) { b.hidden = true; b.hiddenAt = new Date().toISOString(); }
  saveCustomBuckets(buckets);
  snapshotNetWorth();   // re-snapshot so "Total formue nå" drops the hidden bucket's balance
  renderSparing();
  showToast('Sparebøtte skjult');
}

function removeDefaultBucket(bid) {
  const hidden = loadHiddenDefaults();
  if (!hidden.includes(bid)) hidden.push(bid);
  saveHiddenDefaults(hidden);
  snapshotNetWorth();   // re-snapshot so "Total formue nå" drops the hidden bucket's balance
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

  // Total assets = sum of manual balances for visible buckets only
  const totalAssets = visibleBuckets.reduce((s,b) => {
    const v = saved[b.id];
    return s + (v && typeof v.balance === 'number' ? v.balance : 0);
  }, 0);
  const bucketCount = visibleBuckets.filter(b => saved[b.id] && typeof saved[b.id].balance === 'number').length;
  // How much of the total you borrowed in. The balance itself is never reduced —
  // the toggle below just lets you look at your own share when you want to.
  const loanInBuckets = studielanFundedBuckets().reduce((s,x) => s + x.funded, 0);
  const mineAssets    = totalAssets - loanInBuckets;
  const showMine      = loanInBuckets > 0 && localStorage.getItem(SALDO_VIEW_KEY) === 'mine';

  const viewBtn = (id, label, on) =>
    `<button id="${id}" style="border:none;border-radius:7px;padding:4px 12px;font-family:inherit;font-size:11px;font-weight:500;cursor:pointer;transition:all 0.15s;background:${on?'var(--green-accent)':'transparent'};color:${on?'#fff':'var(--text-secondary)'}">${label}</button>`;
  const toggleHtml = loanInBuckets > 0 ? `
<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:12px">
  <span style="font-size:11px;color:var(--text-muted)">Faktisk saldo viser</span>
  <div style="display:flex;background:var(--card-bg);border:1px solid var(--border);border-radius:10px;padding:3px">
    ${viewBtn('saldoAlt','Alt', !showMine)}${viewBtn('saldoMine','Mine penger', showMine)}
  </div>
</div>` : '';

  // Only the loan money sitting IN these accounts is subtracted — money already
  // spent (the car) is debt, but it is not part of the balances, so pulling it
  // out here would understate what you have. Invested loan that has grown shows
  // up correctly on its own: 800k in the fund minus 500k borrowed = 300k yours.
  // ── 1. Summary cards (Satt inn / Tatt ut / Netto are clickable — open the
  // matching transactions in the slide panel instead of a scroll-to-bottom list) ──
  const summaryHtml = toggleHtml + `
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
  <div class="card sp-summary-box" id="spBoxInn" style="text-align:center;cursor:pointer">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Satt inn</div>
    <div style="font-size:22px;font-weight:700;color:#1a5fa8">-${fmt(periodIn)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fSavings.length} overføringer</div>
  </div>
  <div class="card sp-summary-box" id="spBoxUt" style="text-align:center;cursor:pointer">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Tatt ut</div>
    <div style="font-size:22px;font-weight:700;color:#ef4444">${fWithdrawals.length>0?'+'+fmt(periodOut):'—'}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fWithdrawals.length>0?fWithdrawals.length+' uttak':'ingen uttak'}</div>
  </div>
  <div class="card sp-summary-box" id="spBoxNetto" style="text-align:center;cursor:pointer">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Netto denne perioden</div>
    <div style="font-size:22px;font-weight:700;color:${periodNetto>=0?'#22c55e':'#ef4444'}">${periodNetto>=0?'+':'-'}${fmt(Math.abs(periodNetto))}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${fSavings.length} inn${fWithdrawals.length>0?' · '+fWithdrawals.length+' ut':''}</div>
  </div>
  <div class="card" style="text-align:center">
    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">${showMine?'Mine penger':'Faktisk saldo'}</div>
    <div style="font-size:22px;font-weight:700;color:${showMine&&mineAssets<0?'#ef4444':'#22c55e'}">${showMine?(mineAssets<0?'−':'')+fmt(mineAssets):fmt(totalAssets)}</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${showMine?`${fmt(totalAssets)} − ${fmt(loanInBuckets)} lånt`:`${bucketCount} kontoer${loanInBuckets>0?` · ${fmt(mineAssets)} egne`:''}`}</div>
  </div>
</div>`;

  // ── 2. Sparebøtter ──
  const nwHistory = JSON.parse(localStorage.getItem('okonomi_nw_history') || '[]');
  const nwLast = nwHistory.length ? nwHistory[nwHistory.length-1].value : 0;
  const formueHtml = nwHistory.length >= 2 ? `
    <div class="section-head" style="margin-top:0">Formue over tid</div>
    <div class="card" style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div>
          <div style="font-size:11px;color:var(--text-muted)">Total formue nå</div>
          <div style="font-size:18px;font-weight:700;color:${nwLast<0?'#ef4444':'#22c55e'}">${nwLast<0?'-':''}${fmt(nwLast)}</div>
        </div>
        <div style="text-align:right;font-size:11px;color:var(--text-muted)">${nwHistory[0].date} → ${nwHistory[nwHistory.length-1].date}</div>
      </div>
      <div style="position:relative">
        <canvas id="formueChart" style="width:100%;display:block;height:100px"></canvas>
        <div id="formueTooltip" style="position:absolute;display:none;pointer-events:none;background:var(--topbar-bg);color:#fff;font-size:11px;font-weight:600;padding:5px 9px;border-radius:6px;white-space:nowrap;transform:translate(-50%,-100%);z-index:2"></div>
      </div>
    </div>` : '';

  mc.innerHTML = summaryHtml + formueHtml
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '  <div class="section-head" style="margin:0">Sparebøtter</div>'
    + '  <button id="addBucketBtn" style="padding:5px 12px;background:var(--green-accent);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600">+ Ny bøtte</button>'
    + '</div>'
    + '<div id="spareBucketGrid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:24px"></div>';

  // Summary boxes open the matching transactions in the slide panel — no more
  // scrolling to a flat list at the bottom of the tab for this.
  document.getElementById('saldoAlt')?.addEventListener('click', () => {
    localStorage.setItem(SALDO_VIEW_KEY, 'alt'); renderSparing();
  });
  document.getElementById('saldoMine')?.addEventListener('click', () => {
    localStorage.setItem(SALDO_VIEW_KEY, 'mine'); renderSparing();
  });

  document.getElementById('spBoxInn').addEventListener('click', () => openSparingTxPanel('inn'));
  document.getElementById('spBoxUt').addEventListener('click', () => openSparingTxPanel('ut'));
  document.getElementById('spBoxNetto').addEventListener('click', () => openSparingTxPanel('all'));

  // ── "Add new bucket" — same popup-modal pattern as Budsjett's "Legg til kategori" ──
  document.getElementById('addBucketBtn').addEventListener('click', openAddBucketModal);

  // ── Build each bucket card ──
  const grid = document.getElementById('spareBucketGrid');

  if (visibleBuckets.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;color:var(--text-muted)">
      <div style="font-size:36px;margin-bottom:12px">${icon('empty-bucket',{size:36})}</div>
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
    const yearlyLimit = (typeof bdata.yearlyLimit === 'number' && bdata.yearlyLimit > 0) ? bdata.yearlyLimit : 0;
    const yearlyDeposited = yearlyLimit ? sparingYearlyDeposits(bdata) : 0;
    const yearlyPct = yearlyLimit ? Math.min(100, Math.round(yearlyDeposited / yearlyLimit * 100)) : 0;
    const yearlyFc = yearlyPct>=100?'#22c55e':yearlyPct>=66?'#84cc16':yearlyPct>=33?'#f59e0b':'#ef4444';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.bucketId = b.id;

    // Top row: emoji + name + balance — also the drag grip (hold, then move)
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:12px;cursor:grab';
    top.title = 'Hold inne og dra for å flytte bøtta';

    const em = document.createElement('div');
    em.style.cssText = 'font-size:22px;line-height:1';
    const bucketIconId = resolveBucketIcon(b);
    em.innerHTML = bucketIconId ? icon(bucketIconId,{size:22}) : b.emoji;

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

    const rmBtn = document.createElement('button');
    rmBtn.textContent = '×';
    rmBtn.title = 'Fjern sparebøtte';
    rmBtn.style.cssText = 'padding:2px 8px;font-size:15px;line-height:1;color:var(--text-muted);background:none;border:none;border-radius:6px;cursor:pointer;flex-shrink:0';
    rmBtn.addEventListener('mouseenter', () => { rmBtn.style.color = '#ef4444'; });
    rmBtn.addEventListener('mouseleave', () => { rmBtn.style.color = 'var(--text-muted)'; });
    rmBtn.addEventListener('click', () => {
      showConfirmDialog('Er du sikker på at du vil fjerne «' + b.label + '»? Data blir ikke slettet, men bøtta skjules fra visningen.', () => {
        b.isCustom ? removeCustomBucket(b.id) : removeDefaultBucket(b.id);
      });
    });

    top.append(em, mid, disp, rmBtn);
    card.appendChild(top);

    // Progress bar: annual limit (e.g. BSU) takes priority over a fixed sparemål,
    // since it resets every year rather than being a one-time target.
    if (yearlyLimit) {
      const track = document.createElement('div');
      track.style.cssText = 'height:6px;background:var(--border);border-radius:99px;margin-bottom:6px';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:'+yearlyPct+'%;background:'+yearlyFc+';border-radius:99px';
      track.appendChild(fill);
      card.appendChild(track);
      const prog = document.createElement('div');
      prog.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px';
      prog.innerHTML = '<span>'+fmt(yearlyDeposited)+' / '+fmt(yearlyLimit)+' i år ('+yearlyPct+'%)</span><span>Nullstilles 1. jan</span>';
      card.appendChild(prog);
    } else if (goal > 0 && bal !== null) {
      const track = document.createElement('div');
      track.style.cssText = 'height:6px;background:var(--border);border-radius:99px;margin-bottom:6px';
      const fill = document.createElement('div');
      fill.style.cssText = 'height:100%;width:'+pct+'%;background:'+fc+';border-radius:99px';
      track.appendChild(fill);
      card.appendChild(track);
      const prog = document.createElement('div');
      prog.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:8px';
      const reachedHtml = '<span style="display:inline-flex;align-items:center;gap:4px;color:#d4af37;font-weight:700">'+icon('goal-reached',{size:12})+' Mål nådd!</span>';
      prog.innerHTML = '<span>'+fmt(bal)+' / '+fmt(goal)+' ('+pct+'%)</span>'+(rem>0?'<span>'+fmt(rem)+' gjenstår</span>':reachedHtml);
      card.appendChild(prog);
    }

    // Subtle "kr/month to hit it by <date>" — independent of which progress
    // bar above is showing, so a BSU bucket (which prioritizes its annual
    // limit bar) still gets this if it also has a Sparemål + deadline set.
    if (goal > 0 && bal !== null) {
      const monthlyNeeded = sparingMonthlyNeeded(rem, bdata.targetDate);
      if (monthlyNeeded !== null) {
        const needRow = document.createElement('div');
        needRow.style.cssText = 'font-size:10.5px;color:var(--text-muted);margin-top:-4px;margin-bottom:8px';
        needRow.textContent = '≈ ' + fmt(Math.ceil(monthlyNeeded)) + '/mnd for å nå målet til ' + formatDateNo(bdata.targetDate);
        card.appendChild(needRow);
      }
    }

    // Two funds in one account: show each by name with its amount and share, so
    // the bucket total is never a number you have to take apart in your head.
    const holdings = bucketHoldings(bdata);
    if (holdings.length) {
      const hSum = holdingsSum(holdings) || 1;
      const hWrap = document.createElement('div');
      hWrap.style.cssText = 'margin-top:2px;margin-bottom:2px';
      hWrap.innerHTML = holdings.map(h => {
        const amt = +h.amount || 0;
        const share = amt / hSum * 100;
        return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px">
          <span style="flex:1;min-width:0;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.name}</span>
          <span style="font-weight:600;white-space:nowrap">${fmt(amt)}</span>
          <span style="color:var(--text-muted);width:38px;text-align:right;white-space:nowrap">${share.toFixed(0)} %</span>
        </div>`;
      }).join('');
      card.appendChild(hWrap);
    }

    // Three numbers live in one account: the loan you owe, what the account has
    // earned, and what is yours. Avkastning needs a cost basis — loan in plus
    // own money in — so with no own money recorded the difference IS the return,
    // and only then do the two figures collapse into one.
    const loanFunded = (typeof bdata.loanFunded === 'number' && bdata.loanFunded > 0) ? bdata.loanFunded : 0;
    const ownFunded  = (typeof bdata.ownFunded  === 'number' && bdata.ownFunded  > 0) ? bdata.ownFunded  : 0;
    if (loanFunded > 0) {
      const basis   = loanFunded + ownFunded;
      const avk     = (bal || 0) - basis;
      const avkPct  = basis > 0 ? avk / basis * 100 : 0;
      const mine    = (bal || 0) - loanFunded;
      const col     = v => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : 'var(--text-muted)';
      const sign    = v => v > 0 ? '+' : v < 0 ? '−' : '';

      const parts = [`<span style="display:inline-flex;align-items:center;gap:5px;color:var(--text-muted)">${icon('studielan',{size:12})} Lånt ${fmt(loanFunded)}</span>`];
      if (ownFunded > 0) parts.push(`<span style="color:var(--text-muted)">Egne inn ${fmt(ownFunded)}</span>`);
      parts.push(`<span style="color:var(--text-muted)">Avkastning <strong style="font-size:12px;color:${col(avk)}">${sign(avk)}${fmt(avk)}</strong> <span style="color:var(--text-muted)">(${sign(avkPct)}${Math.abs(avkPct).toFixed(1).replace('.',',')} %)</span></span>`);
      if (ownFunded > 0) parts.push(`<span style="color:var(--text-muted)">Mine <strong style="font-size:12px;color:${col(mine)}">${mine<0?'−':''}${fmt(mine)}</strong></span>`);

      const loanRow = document.createElement('div');
      loanRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;background:var(--chip-bg);border:1px solid var(--border);border-radius:8px;padding:7px 10px;margin-top:8px';
      loanRow.innerHTML = parts.join('');
      card.appendChild(loanRow);
    }

    const iSt = 'padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:var(--input-bg);color:var(--text);width:100%';

    // Quick add/subtract — primary way to update a bucket day-to-day
    let qMode = 'add'; // 'add' | 'sub' — flipped by the compact +/- icon, keeps the field unsigned

    const qRow = document.createElement('div');
    qRow.style.cssText = 'display:flex;gap:6px;margin-top:8px';

    const qSign = document.createElement('button');
    qSign.type = 'button';
    qSign.textContent = '+';
    qSign.style.cssText = 'width:34px;flex-shrink:0;border:1px solid var(--border);border-radius:6px;font-size:16px;font-weight:700;cursor:pointer;background:transparent;transition:background 0.15s';
    qSign.addEventListener('mouseenter', () => { qSign.style.background = qMode === 'add' ? 'rgba(76,175,80,0.12)' : 'rgba(239,68,68,0.12)'; });
    qSign.addEventListener('mouseleave', () => { qSign.style.background = 'transparent'; });

    const qInp = document.createElement('input');
    qInp.type='number'; qInp.min='0'; qInp.placeholder='0'; qInp.style.cssText=iSt+';flex:1';

    const qBtn = document.createElement('button');
    qBtn.textContent = 'Lagre';
    qBtn.style.cssText = 'padding:7px 14px;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;background:var(--green-accent);color:#fff';

    // With more than one fund in the bucket, say which one the money goes into.
    let qHolding = null;
    if (holdings.length > 1) {
      qHolding = document.createElement('select');
      qHolding.style.cssText = iSt + ';flex:1;min-width:0;cursor:pointer';
      qHolding.innerHTML = holdings.map((h,i) => `<option value="${i}">${h.name}</option>`).join('');
      qRow.append(qSign, qHolding, qInp, qBtn);
    } else {
      qRow.append(qSign, qInp, qBtn);
    }
    card.appendChild(qRow);

    const qPreview = document.createElement('div');
    qPreview.style.cssText = 'font-size:11px;color:var(--text-muted);margin-top:4px;min-height:14px';
    card.appendChild(qPreview);

    const applyQMode = () => {
      const isAdd = qMode === 'add';
      qSign.textContent = isAdd ? '+' : '−';
      qSign.style.color = isAdd ? 'var(--green-accent)' : '#ef4444';
      qSign.style.borderColor = isAdd ? 'var(--green-accent)' : '#ef4444';
      updateQPreview();
    };
    qSign.addEventListener('click', () => { qMode = qMode === 'add' ? 'sub' : 'add'; applyQMode(); });

    const clampedDelta = amount => {
      const currentBal = bal || 0;
      if (qMode === 'add') return amount;
      return -Math.min(amount, currentBal);   // never subtract past 0
    };
    const updateQPreview = () => {
      const amount = parseFloat(qInp.value);
      if (!qInp.value.trim() || isNaN(amount) || amount < 0) { qPreview.textContent = ''; return; }
      const newBal = (bal || 0) + clampedDelta(amount);
      qPreview.textContent = 'Ny saldo: ' + fmt(newBal);
    };
    qInp.addEventListener('input', updateQPreview);
    const doQuickAdd = () => {
      const amount = parseFloat(qInp.value);
      if (!qInp.value.trim() || isNaN(amount) || amount < 0) return;
      const currentBal = bal || 0;
      if (qMode === 'sub' && amount > currentBal) showToast('Kan ikke trekke mer enn saldoen — satt til 0');
      const delta = clampedDelta(amount);
      if (delta === 0) return;
      // Fire the sound/animation first, before the heavier re-render blocks the thread —
      // otherwise the click-to-sound gap is noticeable.
      const justReachedGoal = goal > 0 && currentBal < goal && (currentBal + delta) >= goal;
      if (justReachedGoal) celebrateGoalReached(b.label); // confetti + fireworks + fanfare — never together with the money rain
      else if (delta > 0) celebrateMoneyAdd();
      else shockMoneyLoss();
      sparingQuickAdjust(b.id, delta, qHolding ? +qHolding.value : (holdings.length ? 0 : null));
    };
    qBtn.addEventListener('click', doQuickAdd);
    qInp.addEventListener('keydown', e => { if (e.key === 'Enter') doQuickAdd(); });
    applyQMode();

    // Exact balance / goal editing — tucked away, used rarely (setup, corrections).
    // Opens as a popup (same chrome as "+ Ny bøtte" / Budsjett's "Legg til
    // kategori") instead of an inline expand, per feedback.
    const isBsu = b.label.toLowerCase().includes('bsu');
    const editRow = document.createElement('div');
    editRow.style.cssText = 'margin-top:8px';
    const editBtn = document.createElement('button');
    editBtn.className = 'sort-btn';
    editBtn.textContent = 'Rediger';
    editBtn.addEventListener('click', () => openEditBucketModal(b, bal, goal, yearlyLimit, bdata, isBsu));
    editRow.appendChild(editBtn);
    card.appendChild(editRow);

    grid.appendChild(card);
  });

  if (visibleBuckets.length > 1) enableBucketDragReorder(grid);


  // ── Render Formue over tid (manual balance history) ──
  if (nwHistory.length >= 2) {
    setTimeout(() => {
      const canvas = document.getElementById('formueChart');
      const tooltip = document.getElementById('formueTooltip');
      if (!canvas) return;
      const W = canvas.parentElement.offsetWidth;
      const H = 100;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      const pad = { top: 8, right: 8, bottom: 20, left: 48 };
      const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom;
      const vals = nwHistory.map(p => p.value);
      // Pad by a share of the span, not by a percentage of the values — the old
      // ×0.95/×1.05 trick puts points outside the axis as soon as one is negative.
      const lo = Math.min(...vals), hi = Math.max(...vals);
      const padV = (hi - lo || Math.abs(hi) || 1) * 0.1;
      const minV = lo - padV, maxV = hi + padV;
      const range = maxV - minV || 1;
      const negative = vals[vals.length-1] < 0;
      const lineColor = negative ? '#ef4444' : '#22c55e';
      const n = nwHistory.length;
      const x = i => pad.left + (i / (n - 1)) * cw;
      const y = v => pad.top + (1 - (v - minV) / range) * ch;
      const isDark = document.body.classList.contains('dark');
      const labelColor = isDark ? '#7a7a7a' : '#9aab90';
      const fmtY = v => Math.abs(v) >= 1000 ? Math.round(v/1000) + 'k' : Math.round(v).toString();

      function draw(hoverIdx) {
        ctx.clearRect(0, 0, W, H);
        // Y-axis grid + labels
        [0.25, 0.5, 0.75, 1].forEach(f => {
          const val = minV + f * range;
          const yy  = y(val);
          ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(pad.left+cw, yy);
          ctx.strokeStyle = isDark ? '#1c1c1c' : '#f0f4ee'; ctx.lineWidth = 1; ctx.stroke();
          ctx.fillStyle = labelColor; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'right';
          ctx.fillText(fmtY(val), pad.left - 6, yy + 3);
        });
        // Zero line — only drawn when the series actually crosses it
        if (minV < 0 && maxV > 0) {
          const zy = y(0);
          ctx.beginPath(); ctx.moveTo(pad.left, zy); ctx.lineTo(pad.left+cw, zy);
          ctx.strokeStyle = isDark ? '#3a3a3a' : '#d8ddd4'; ctx.lineWidth = 1; ctx.stroke();
        }
        // Fill
        ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
        vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
        ctx.lineTo(x(n-1), H-pad.bottom); ctx.lineTo(x(0), H-pad.bottom); ctx.closePath();
        ctx.fillStyle = negative ? 'rgba(239,68,68,0.10)' : (isDark ? 'rgba(74,222,128,0.1)' : 'rgba(34,197,94,0.1)'); ctx.fill();
        // Line
        ctx.beginPath(); ctx.moveTo(x(0), y(vals[0]));
        vals.forEach((v, i) => ctx.lineTo(x(i), y(v)));
        ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
        // Hover guide line
        if (hoverIdx != null) {
          ctx.beginPath(); ctx.moveTo(x(hoverIdx), pad.top); ctx.lineTo(x(hoverIdx), H-pad.bottom);
          ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1; ctx.stroke();
        }
        // Dots on every data point
        for (let i = 0; i < n; i++) {
          const r = i === hoverIdx ? 5 : 3;
          ctx.beginPath(); ctx.arc(x(i), y(vals[i]), r, 0, Math.PI*2);
          ctx.fillStyle = lineColor; ctx.fill();
          if (i === hoverIdx) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        }
        // Date labels: first, middle, last only (avoids overlapping text)
        [0, Math.floor(n/2), n-1].forEach(i => {
          ctx.fillStyle = labelColor; ctx.font = '10px DM Sans,sans-serif'; ctx.textAlign = 'center';
          ctx.fillText(nwHistory[i].date, x(i), H - 4);
        });
      }
      draw(null);

      const HOVER_RADIUS = 10;
      canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        // Map screen px to canvas-buffer px explicitly — needed because CSS zoom (used to
        // match the laptop/monitor rendering) can throw off a naive clientX-rect.left calc.
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mx = (e.clientX - rect.left) * scaleX;
        const my = (e.clientY - rect.top) * scaleY;
        let nearest = null, best = Infinity;
        for (let i = 0; i < n; i++) {
          const dx = x(i) - mx, dy = y(vals[i]) - my;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < best) { best = d; nearest = i; }
        }
        if (nearest == null || best > HOVER_RADIUS) {
          draw(null);
          tooltip.style.display = 'none';
          return;
        }
        draw(nearest);
        tooltip.style.display = 'block';
        tooltip.style.left = x(nearest) + 'px';
        tooltip.style.top  = (y(vals[nearest]) - 10) + 'px';
        const delta = nearest > 0 ? vals[nearest] - vals[nearest-1] : null;
        const deltaStr = delta == null ? '' : (delta >= 0 ? ' · +' : ' · -') + fmt(Math.abs(delta));
        tooltip.textContent = nwHistory[nearest].date + ' · ' + (vals[nearest] < 0 ? '-' : '') + fmt(vals[nearest]) + deltaStr;
      });
      canvas.addEventListener('mouseleave', () => {
        draw(null);
        tooltip.style.display = 'none';
      });
    }, 0);
  }
}

// ── Sparing transaction panel (opened from the "Satt inn"/"Tatt ut"/"Netto"
// summary boxes so the underlying transactions are one click away instead of
// a flat list at the bottom of the tab) ──
function openSparingTxPanel(kind) {
  const friendly = s => s.replace(/overføring (til|fra) /i, '').replace(/Trustly Norway AS.*/i, 'Nordnet');
  const filtered = getFiltered();
  const fSavings     = filtered.filter(t => t.cat === 'savings').map(t => ({ ...t, dir: 'inn' }));
  const fWithdrawals = filtered.filter(t => t.cat === 'withdrawal').map(t => ({ ...t, dir: 'ut' }));

  let allTxs, heading, totalColor;
  if (kind === 'inn') {
    allTxs = fSavings; heading = 'Satt inn'; totalColor = '#1a5fa8';
  } else if (kind === 'ut') {
    allTxs = fWithdrawals; heading = 'Tatt ut'; totalColor = '#ef4444';
  } else {
    allTxs = [...fSavings, ...fWithdrawals]; heading = 'Sparetransaksjoner'; totalColor = '#22c55e';
  }

  const panel   = document.getElementById('slidePanel');
  const overlay = document.getElementById('panelOverlay');
  const title   = document.getElementById('panelTitle');
  const body    = document.getElementById('panelBody');

  title.textContent = heading;
  panel.classList.add('open');
  overlay.classList.add('open');
  panelBackNav = bindBackNav(panel, closePanel, () => openSparingTxPanel(kind));

  let sortDir = 'desc';
  function render() {
    allTxs.sort((a, b) => sortDir === 'desc' ? pd(b.dato) - pd(a.dato) : pd(a.dato) - pd(b.dato));
    const totalIn  = fSavings.reduce((s, t) => s + t.ut, 0);
    const totalOut = fWithdrawals.reduce((s, t) => s + t.inn, 0);
    const net = totalIn - totalOut;
    const dispTotal = kind === 'inn' ? '-' + fmt(totalIn)
      : kind === 'ut' ? (totalOut > 0 ? '+' + fmt(totalOut) : '—')
      : (net >= 0 ? '+' : '-') + fmt(Math.abs(net));
    body.innerHTML = `
      <div style="font-size:28px;font-weight:700;color:${totalColor};margin-bottom:4px">${dispTotal}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">${allTxs.length} transaksjoner</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center">
        <span style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Sorter:</span>
        <button class="sort-btn sort-active" id="spSortBtn">Dato ${sortDir==='desc'?'↓':'↑'}</button>
      </div>
      <div>${allTxs.length===0?'<div style="text-align:center;color:var(--text-muted);padding:24px 0">Ingen transaksjoner</div>':
        allTxs.map(tx => {
          const isUt = tx.dir === 'ut';
          const color = isUt ? '#ef4444' : '#1a5fa8';
          return `<div class="panel-tx">
            <div style="width:34px;height:34px;border-radius:50%;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon(isUt?'withdrawal':'savings',{size:16})}</div>
            <div class="pt-info"><div class="pt-name">${friendly(tx.beskr)}${isUt?' (uttak)':''}</div><div class="pt-date">${tx.dato}</div></div>
            <div class="pt-amt" style="color:${color}">${(isUt?'-':'+')+fmt(isUt?tx.inn:tx.ut)}</div>
          </div>`;
        }).join('')}</div>`;
    document.getElementById('spSortBtn').addEventListener('click', () => { sortDir = sortDir==='desc'?'asc':'desc'; render(); });
  }
  render();
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
