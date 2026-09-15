// ── App zoom ──────────────────────────────────────────────────────
/* The layout always resolves at DESIGN_WIDTH; only its scale changes.
   Never scales below 1 — a narrow or split-screen window keeps the normal
   responsive rules rather than shrinking everything into unreadability.
   Capped by height as well, because a wide-but-short screen (an ultrawide)
   would otherwise scale so far on width that almost nothing fits vertically. */
/* Set to the MacBook's own logical width, so the laptop lands on zoom 1 and
   renders natively — nothing is scaled or resampled there — and only the
   external monitor scales up to match it. If the laptop is a different size,
   change this one number to match it. */
const DESIGN_WIDTH  = 1280;
const DESIGN_MIN_H  = 760;

function applyAppZoom() {
  const z = Math.max(1, Math.min(
    window.innerWidth  / DESIGN_WIDTH,
    window.innerHeight / DESIGN_MIN_H
  ));
  document.documentElement.style.zoom = String(z);
  document.documentElement.style.setProperty('--app-zoom', String(z));
}
applyAppZoom();   // before first paint, so nothing is laid out twice
window.addEventListener('resize', applyAppZoom);

// ── Loading screen animation (canvas, per-frame — not CSS/SMIL) ────
/* Same reasoning as the confetti: real per-frame control (requestAnimationFrame)
   instead of CSS keyframes/SMIL means guaranteed sync between the drawn line,
   the traveling arrow and the dots lighting up — no cross-timing-system drift
   like the old SVG+SMIL version had — plus a custom easing curve and a soft
   glow on the arrow that CSS alone couldn't give cheaply. */
/* LOADING_SCREEN_MIN_MS (below, in Boot) happens to be the same length as this
   animation's own CYCLE_MS, so without this flag the fade-out would almost
   always land right on the cycle's reset instant — the line snapping back to
   the start and the arrow jumping with it, reading as it disappearing. Setting
   this forces the very next frame (and every one after, since the loop then
   stops) to render the fully-drawn end state instead, whatever point the
   animation actually happened to be at. */
let _loadingCanvasFrozen = false;
function freezeLoadingCanvas() { _loadingCanvasFrozen = true; }

function initLoadingCanvas() {
  const canvas = document.getElementById('loadingCanvas');
  if (!canvas) return;

  const W = 210, H = 141;
  // The path itself (all `points` below) is sized to exactly fill W×H, but the arrowhead's
  // chevron arms swing out well past the path at the very start (point 0 sits right in the
  // corner) — without room around the tight box, that swing gets clipped by the canvas edge.
  // The canvas is padded on all sides for that; PAD doesn't touch the drawing coordinates,
  // which still live in plain 0..W / 0..H space via the ctx.translate below.
  const PAD = 44;
  const CANVAS_W = W + PAD * 2, CANVAS_H = H + PAD * 2;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = CANVAS_W + 'px';
  canvas.style.height = CANVAS_H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.translate(PAD, PAD);

  // Same zigzag proportions as the real app icon's arrow (bottom-left → peak → dip → top-right)
  const points = [[15,126],[84,57],[129,93],[195,15]];
  const segLens = [];
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i+1][0]-points[i][0], dy = points[i+1][1]-points[i][1];
    const len = Math.hypot(dx, dy);
    segLens.push(len);
    totalLen += len;
  }
  const cumFrac = [0];
  let acc = 0;
  for (const len of segLens) { acc += len; cumFrac.push(acc / totalLen); }

  function pointAtProgress(p) {
    const dist = Math.min(1, Math.max(0, p)) * totalLen;
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const segLen = segLens[i];
      if (dist <= acc + segLen || i === segLens.length - 1) {
        const segP = segLen === 0 ? 0 : Math.min(1, Math.max(0, (dist - acc) / segLen));
        const [x1,y1] = points[i], [x2,y2] = points[i+1];
        return { x: x1+(x2-x1)*segP, y: y1+(y2-y1)*segP, angle: Math.atan2(y2-y1, x2-x1) };
      }
      acc += segLen;
    }
    const [x,y] = points[points.length-1];
    return { x, y, angle: 0 };
  }

  const easeInOutCubic = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3) / 2;

  // Read localStorage directly, not document.body's class — applyDarkMode() runs inside
  // the DOMContentLoaded handler, which fires after this synchronous script, so the class
  // wouldn't be set yet at this point.
  const isDark = localStorage.getItem(DARK_KEY) === '1';
  const trackColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)';

  const grad = ctx.createLinearGradient(points[0][0], points[0][1], points[3][0], points[3][1]);
  grad.addColorStop(0, '#4caf50');
  grad.addColorStop(1, '#8bd66f');

  // The `points` array above isn't a scaled copy of the whole 1024px icon — it's an exact
  // affine scale of just AppIcon.svg's own arrow-path coordinates (M 230 700 L 460 470 L 610
  // 590 L 830 330), at a factor of exactly 10/3: e.g. its first point (230,700) = our (15,126)
  // * 10/3 + (180,280), and this holds for all 4 points. So the width/length values below must
  // convert through *this* factor, not any ratio against the canvas's own overall pixel size —
  // that mismatch (comparing against W instead of the real path scale) was why the line and
  // arrowhead never quite matched the logo's proportions.
  const LOGO_SCALE = 10 / 3;   // logo px per canvas px, for this specific path
  // Shared with the arrowhead chevron below so it's never just "close enough" —
  // both read this one constant, guaranteeing the same stroke width as the logo (56px there).
  const LINE_WIDTH = 56 / LOGO_SCALE;

  const CYCLE_MS = 1800;
  const DRAW_FRACTION = 0.7;   // path drawing happens over the first 70% of the cycle, then holds
  let startTime = null;

  // Real-time (not progress-based) pop tracking. easeInOutCubic has ~zero slope right at both
  // ends of the curve — near the first dot and, worse, frozen solid during the end hold (rawP
  // pinned at 1) — so a pop window measured in progress-`p` units never actually elapses there.
  // Timestamps sidestep that entirely: each dot pops over a fixed real-world duration from the
  // instant it's reached, however fast or slow `p` itself happens to be moving.
  const POP_MS = 260;
  const dotHitAt = new Array(points.length).fill(null);

  function strokePath(toPoint) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < toPoint.length; i++) ctx.lineTo(toPoint[i][0], toPoint[i][1]);
    ctx.stroke();
  }

  function frame(ts) {
    if (!canvas.isConnected) return;   // loading screen was removed — stop the loop
    if (!startTime) startTime = ts;
    const elapsed = (ts - startTime) % CYCLE_MS;
    const rawP = _loadingCanvasFrozen ? 1 : Math.min(1, (elapsed / CYCLE_MS) / DRAW_FRACTION);
    const p = easeInOutCubic(rawP);

    ctx.clearRect(-PAD, -PAD, CANVAS_W, CANVAS_H);   // full physical canvas — the translate shifted the origin

    // Track (dim guide, always fully visible)
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = LINE_WIDTH; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    strokePath(points);

    // Drawn portion, up to progress p
    const dist = p * totalLen;
    const drawnPoints = [points[0]];
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      const segLen = segLens[i];
      if (dist >= acc + segLen) {
        drawnPoints.push(points[i+1]);
      } else {
        const segP = segLen === 0 ? 0 : (dist - acc) / segLen;
        const [x1,y1] = points[i], [x2,y2] = points[i+1];
        drawnPoints.push([x1+(x2-x1)*segP, y1+(y2-y1)*segP]);
        break;
      }
      acc += segLen;
    }
    ctx.strokeStyle = grad;
    strokePath(drawnPoints);

    // Dots — pop (expand then settle) at the instant the arrow reaches them. The last point
    // fades out over that same pop instead of settling, so it hands off cleanly to the
    // arrowhead resting there rather than showing through behind it.
    const radii = [7, 5.5, 5.5, 6];
    const lastIdx = points.length - 1;
    for (let i = 0; i < points.length; i++) {
      const [x, y] = points[i];
      const passed = p >= cumFrac[i] - 0.0005;
      if (passed && dotHitAt[i] === null) dotHitAt[i] = ts;
      if (!passed) dotHitAt[i] = null;   // cycle looped back around — rearm for next pass
      const hitT = dotHitAt[i] !== null ? Math.min(1, (ts - dotHitAt[i]) / POP_MS) : 0;   // 0 → just hit, 1 → settled
      const isLast = i === lastIdx;
      if (isLast && hitT >= 1) continue;   // fully handed off to the arrowhead

      let radius, opacity;
      if (!passed) {
        radius = 4; opacity = 1;
      } else {
        const eased = 1 - Math.pow(1 - hitT, 3);   // ease-out — snappy expand, gentle settle
        const bump = Math.sin(hitT * Math.PI) * 0.55;   // expand out then back down within the window
        radius = radii[i] * (1 + bump * (1 - eased * 0.3));
        opacity = isLast ? 1 - eased : 1;
      }
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = passed ? '#ffffff' : trackColor;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Traveling arrowhead — same open "V" chevron as the AppIcon logo (two thick
    // rounded strokes meeting at the tip), not a filled triangle: same gradient
    // and line width as the growth line itself, so it reads as its continuation.
    // Stays put at the tip during the hold, rather than vanishing at the end.
    {
      const { x, y, angle } = pointAtProgress(p);
      // Exact arm geometry lifted from AppIcon.svg's own arrowhead path
      // (M 830 330 L 700 320 M 830 330 L 820 460), expressed relative to the
      // tip's travel direction so it holds at any segment angle. Both arms
      // are the same length (130.4px in the logo's own coordinates, converted
      // through LOGO_SCALE — see its definition above), but they are NOT
      // symmetric about the reverse-of-travel line — one sits 54.1° off it,
      // the other 35.9° off the other way — same asymmetry as the logo.
      const ARM_LEN = 130.4 / LOGO_SCALE;
      const reverseAngle = angle + Math.PI;
      const ARM1_OFFSET = 0.9444;    // +54.1°
      const ARM2_OFFSET = -0.6263;   // -35.9°
      ctx.save();
      ctx.shadowColor = 'rgba(76,175,80,0.65)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = grad;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(reverseAngle + ARM1_OFFSET) * ARM_LEN, y + Math.sin(reverseAngle + ARM1_OFFSET) * ARM_LEN);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(reverseAngle + ARM2_OFFSET) * ARM_LEN, y + Math.sin(reverseAngle + ARM2_OFFSET) * ARM_LEN);
      ctx.stroke();
      ctx.restore();
    }

    if (_loadingCanvasFrozen) return;   // final frame drawn — no point animating a hidden screen
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
initLoadingCanvas();

// ── Loading screen: ambient dollar-bill rain in the background ─────
/* Same particle physics as the confetti/goal celebration in core.js — real
   drawn bill shapes, not emoji — but gentler and continuous, as a background
   wash behind the name + arrow rather than a one-shot burst. Most particles
   are single bills in one of three denominations (each with its own portrait
   silhouette and ink tone, like real currency's subtle color-coding); a
   minority are thicker bank-strapped bundles for variety. */
let _loadingRainFrozen = false;
function freezeLoadingRain() { _loadingRainFrozen = true; }

// The ambient loading-screen rain only ever uses denom 1 (see LOADING_RAIN_DENOM
// below) — a genuinely green body (the app's brand green, not the pale cream
// tone real bills actually are), since a mixed pale palette read as too
// washed-out/tan for that subtle background wash. The 10/20/100 notes exist
// for the goal-reached celebration instead. Real dollars are all the same
// green regardless of denomination — distinguished by the printed number and
// portrait, not color — so every note here stays in that family too, but each
// one is a genuinely different green (spring, emerald, moss, teal) rather than
// just a lighter/darker step of the same hue, so a full-screen mix of all four
// still reads as separate bills at a glance.
const RAIN_DENOMS = {
  1:   { label: '1',   body: '#6cbf3f', ink: '#1f3d12', face: 'round', strap: '#3f7a1f' },
  10:  { label: '10',  body: '#1f9e5c', ink: '#0a3d24', face: 'wave',  strap: '#146b3f' },
  20:  { label: '20',  body: '#7a8f3d', ink: '#333d12', face: 'curly', strap: '#5c6b1f' },
  100: { label: '100', body: '#0e6b5c', ink: '#052e26', face: 'round', strap: '#0a4a3f' },
};
const LOADING_RAIN_DENOM = 1;

// A generic abstract silhouette, not a likeness of anyone real — head +
// shoulders inside the portrait oval, with a hairline shape that differs per
// denomination so the notes are distinguishable even at a glance.
function drawBillFace(ctx, cx, cy, r, ink, style) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = ink;

  ctx.beginPath();
  ctx.ellipse(0, r * 0.78, r * 0.62, r * 0.5, 0, Math.PI, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(0, r * 0.05, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  if (style === 'round') {
    ctx.arc(0, -r * 0.08, r * 0.42, Math.PI * 1.08, Math.PI * 1.92);
  } else if (style === 'wave') {
    ctx.moveTo(-r * 0.4, -r * 0.05);
    ctx.quadraticCurveTo(-r * 0.15, -r * 0.62, r * 0.05, -r * 0.35);
    ctx.quadraticCurveTo(r * 0.25, -r * 0.6, r * 0.4, -r * 0.1);
    ctx.quadraticCurveTo(0, -r * 0.42, -r * 0.4, -r * 0.05);
  } else { // curly
    for (let i = -3; i <= 3; i++) {
      ctx.moveTo(i * r * 0.15, -r * 0.15);
      ctx.arc(i * r * 0.15, -r * 0.22, r * 0.14, 0, Math.PI * 2);
    }
  }
  ctx.fill();
  ctx.restore();
}

// Draws one note centered on the current origin. `flip` (0..1) is the
// confetti-style edge-on trick — width narrows toward the rotation's
// edge-on point, reading as a flat bill flipping in the air; detail only
// renders once it's facing us enough to actually be legible.
function drawBillNote(ctx, w, h, denom, flip) {
  const d = RAIN_DENOMS[denom];
  const dw = w * flip;
  ctx.fillStyle = d.body;
  ctx.fillRect(-dw / 2, -h / 2, dw, h);
  if (flip <= 0.4) return;

  ctx.strokeStyle = d.ink;
  ctx.lineWidth = Math.max(0.6, h * 0.06);
  ctx.strokeRect(-dw / 2 + h * 0.1, -h / 2 + h * 0.1, dw - h * 0.2, h - h * 0.2);

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(-dw * 0.14, 0, h * 0.3, h * 0.36, 0, 0, Math.PI * 2);
  ctx.clip();
  drawBillFace(ctx, -dw * 0.14, h * 0.02, h * 0.34, d.ink, d.face);
  ctx.restore();
  ctx.strokeStyle = d.ink;
  ctx.lineWidth = Math.max(0.5, h * 0.02);
  ctx.beginPath();
  ctx.ellipse(-dw * 0.14, 0, h * 0.3, h * 0.36, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = d.ink;
  ctx.font = `700 ${h * 0.3}px Georgia, serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(d.label, -dw / 2 + h * 0.12, -h / 2 + h * 0.22);
  ctx.textAlign = 'right';
  ctx.fillText(d.label, dw / 2 - h * 0.12, h / 2 - h * 0.22);
}

// A thicker, bank-strapped stack — layered page-edges behind the top note
// plus a vertical paper strap with the bundle's total, for visual variety
// against the plain single bills.
function drawBillBundle(ctx, w, h, denom, flip) {
  const d = RAIN_DENOMS[denom];
  const dw = w * flip;
  const LAYERS = 5;
  const OFFSET = h * 0.06;
  for (let i = LAYERS; i >= 1; i--) {
    ctx.fillStyle = i % 2 === 0 ? '#c9b071' : '#d9c48a';
    ctx.fillRect(-dw / 2 + i * OFFSET * 0.4, -h / 2 - i * OFFSET, dw, h);
  }
  ctx.save();
  ctx.translate(LAYERS * OFFSET * 0.4 * 0.35, -LAYERS * OFFSET * 0.35);
  drawBillNote(ctx, w, h, denom, flip);
  if (flip > 0.4) {
    const strapW = h * 0.34;
    ctx.fillStyle = d.strap;
    ctx.fillRect(-strapW / 2, -h / 2 - 4, strapW, h + 8);
    ctx.save();
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${strapW * 0.5}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$' + (denom * 100).toLocaleString(), 0, 1);
    ctx.restore();
  }
  ctx.restore();
}

function initLoadingRain() {
  const canvas = document.getElementById('loadingRainCanvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  resize();
  window.addEventListener('resize', resize);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const GRAVITY = 480;
  const SPAWN_RATE = 24;   // notes/sec
  const BUNDLE_CHANCE = 0.18;
  const particles = [];
  let lastTime = performance.now();
  let spawnAcc = 0;

  function spawnParticle() {
    const isBundle = Math.random() < BUNDLE_CHANCE;
    const w = 28 + Math.random() * 10;
    particles.push({
      x: Math.random() * window.innerWidth,
      y: -30,
      vx: (Math.random() - 0.5) * 30,
      vy: 120 + Math.random() * 80,
      rot: Math.random() * Math.PI * 2,
      angVel: (Math.random() - 0.5) * (isBundle ? 1 : 2),   // bundles tumble slower — they're heavier
      w, h: w * 0.44,   // real dollar-bill proportions
      denom: LOADING_RAIN_DENOM,
      isBundle,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 0.8 + Math.random() * 1,
      swayAmp: 20 + Math.random() * 25,
      opacity: 0.35 + Math.random() * 0.3,
    });
  }

  function frame(now) {
    if (!canvas.isConnected) return;   // loading screen was removed — stop the loop
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!_loadingRainFrozen) {
      spawnAcc += dt;
      while (spawnAcc > 1 / SPAWN_RATE) { spawnParticle(); spawnAcc -= 1 / SPAWN_RATE; }
    }

    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += GRAVITY * dt;
      p.swayPhase += p.swaySpeed * dt;
      p.x += p.vx * dt + Math.sin(p.swayPhase) * p.swayAmp * dt;
      p.y += p.vy * dt;
      p.rot += p.angVel * dt;

      if (p.y > window.innerHeight + 40) { particles.splice(i, 1); continue; }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const flip = Math.max(0.12, Math.abs(Math.cos(p.rot)));
      if (p.isBundle) drawBillBundle(ctx, p.w, p.h, p.denom, flip);
      else drawBillNote(ctx, p.w, p.h, p.denom, flip);
      ctx.restore();
    }

    if (_loadingRainFrozen && particles.length === 0) {
      window.removeEventListener('resize', resize);
      return;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
initLoadingRain();

// ── Tab navigation (wired into browser back/forward) ────────────────
/* The actual switch + history push. Always safe/idempotent to call again —
   used directly by bindBackNav's reopen (a forward press), which must not
   re-trigger unwindLayers (nothing to unwind on a rebuild). */
function enterTab(tab) {
  const prevTab = currentTab;
  currentTab = tab;
  rerenderCurrentTab();
  bindBackNav(
    document.getElementById('app'),
    () => { currentTab = prevTab; rerenderCurrentTab(); },
    () => enterTab(tab),
    'nav'
  );
}

/* Entry point for an actual nav click. Closes anything drilled into on top
   of the current tab first — otherwise its entry sits below the new tab's
   entry and a later Back press lands on a view no longer on screen. */
function navigateToTab(tab) {
  unwindLayers(() => enterTab(tab));
}

// ── Boot ──────────────────────────────────────────────────────────
const LOADING_SCREEN_MIN_MS = 3100;
const _loadingScreenStart = Date.now();
function hideLoadingScreen() {
  const el = document.getElementById('loadingScreen');
  if (!el) return;
  const elapsed = Date.now() - _loadingScreenStart;
  const wait = Math.max(0, LOADING_SCREEN_MIN_MS - elapsed);
  setTimeout(() => {
    freezeLoadingCanvas();
    freezeLoadingRain();
    el.classList.add('hidden');
  }, wait);
}

function bootWithData(stored, resetTab) {
  document.getElementById('uploadScreen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  hideLoadingScreen();
  allClassified = stored.map(tx => ({ ...tx, cat: classify(tx) }));
  const allKeys  = [...new Set(stored.map(t=>getMonthKey(t.dato)))].sort();
  const allYears = [...new Set(stored.map(t=>t.dato.split('.')[2]))].sort();
  if (!activeYear || !allYears.includes(activeYear)) activeYear = allYears[allYears.length-1];
  const yearKeys = allKeys.filter(k => k.startsWith(activeYear));
  if (!activeMonthFilter || !yearKeys.includes(activeMonthFilter))
    activeMonthFilter = yearKeys.length ? yearKeys[yearKeys.length-1] : allKeys[allKeys.length-1];
  renderSidebarChart();
  updateTopbar();
  if (resetTab) currentTab = 'oversikt';
  rerenderCurrentTab();
}

function boot(resetTab = true) {
  const stored = loadStored();
  if (stored.length) { bootWithData(stored, resetTab); return; }
  idbGet(STORAGE_KEY).then(idbData => {
    if (idbData && idbData.length) {
      saveStored(idbData);
      return Promise.all([
        idbGet(OVERRIDES_KEY).then(v => { if (v) localStorage.setItem(OVERRIDES_KEY, JSON.stringify(v)); }),
        idbGet(BUDGET_KEY).then(v => { if (v) localStorage.setItem(BUDGET_KEY, JSON.stringify(v)); }),
        idbGet(INCOME_KEY).then(v => { if (v) localStorage.setItem(INCOME_KEY, String(v)); }),
        idbGet(NOTES_KEY).then(v => { if (v) localStorage.setItem(NOTES_KEY, JSON.stringify(v)); }),
        idbGet(SPLIT_KEY).then(v => { if (v) localStorage.setItem(SPLIT_KEY, JSON.stringify(v)); }),
        idbGet(SPAREMAAL_KEY).then(v => { if (v) localStorage.setItem(SPAREMAAL_KEY, JSON.stringify(v)); }),
        idbGet(CUSTOM_BUCKETS_KEY).then(v => { if (v) localStorage.setItem(CUSTOM_BUCKETS_KEY, JSON.stringify(v)); }),
        idbGet(STUDIELAN_KEY).then(v => { if (v) localStorage.setItem(STUDIELAN_KEY, JSON.stringify(v)); }),
      ]).then(() => bootWithData(idbData, resetTab));
    }
    // No data anywhere yet — boot straight into the normal app shell with an
    // empty state instead of the separate "upload a CSV" screen; "+ Legg til
    // måned" in the topbar is the one way in from here.
    bootWithData([], resetTab);
    tryAutoLoad();
  }).catch(() => {
    bootWithData([], resetTab);
    tryAutoLoad();
  });
}

// ── Auto-load transaksjoner.csv ───────────────────────────────────
function tryAutoLoad() {
  fetch('./transaksjoner.csv')
    .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
    .then(text => {
      const txs = parseCSV(text);
      if (txs.length) {
        saveStored(mergeNewTxs(loadStored(), txs));
        showToast('Fant transaksjoner.csv — lastet inn automatisk', 3500);
        activeMonthFilter = [...new Set(txs.map(t=>getMonthKey(t.dato)))].sort().pop();
        bootWithData(loadStored(), true);
      }
    })
    .catch(() => {}); // silent fail — file not found is normal
}

// ── Events ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved dark mode
  const savedDark = localStorage.getItem(DARK_KEY);
  applyDarkMode(savedDark === '1');

  // Apply saved icon pack to nav + static chrome icons
  applyNavIcons();
  applyStaticIcons();

  document.getElementById('fileInput').addEventListener('change', e => processFile(e.target.files[0]));
  document.getElementById('fileInputHidden').addEventListener('change', e => { processFile(e.target.files[0]); e.target.value=''; });
  document.getElementById('fileInputBackup').addEventListener('change', e => { processBackupFile(e.target.files[0]); e.target.value=''; });
  document.getElementById('addMonthBtn').addEventListener('click', () => document.getElementById('fileInputHidden').click());
  document.getElementById('toolsBtn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('toolsMenu').classList.toggle('open');
  });
  document.addEventListener('click', () => document.getElementById('toolsMenu')?.classList.remove('open'));
  document.getElementById('importBackupBtn').addEventListener('click', () => { document.getElementById('toolsMenu').classList.remove('open'); document.getElementById('fileInputBackup').click(); });
  document.getElementById('panelClose').addEventListener('click', closePanel);
  document.getElementById('panelOverlay').addEventListener('click', closePanel);
  document.getElementById('exportBtn').addEventListener('click', exportToFile);
  document.getElementById('exportJsonBtn').addEventListener('click', exportToJSON);
  document.getElementById('exportCsvBtn').addEventListener('click', exportToCSV);
  document.getElementById('darkModeToggle').addEventListener('click', toggleDarkMode);

  document.getElementById('fullscreenBtn').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('fullscreenBtn');
    const span = btn.querySelector('.ti-icon');
    const name = document.fullscreenElement ? 'minimize' : 'maximize';
    span.dataset.icon = name;
    span.innerHTML = icon(name, { size: 14 });
    btn.title = document.fullscreenElement ? 'Avslutt fullskjerm' : 'Fullskjerm';
  });

  // Icon pack picker in tools menu
  const iconPickerWrap = document.getElementById('iconPackPickerWrap');
  if (iconPickerWrap) {
    iconPickerWrap.innerHTML = renderIconPackPicker();
    wireIconPackPicker(iconPickerWrap);
  }

  document.getElementById('app').addEventListener('click', e => {
    // Arrow click: toggle group open/closed only, no navigation
    const arrow = e.target.closest('.navg-arrow');
    if (arrow) {
      const head = arrow.closest('.nav-group-head');
      const group = head?.dataset.group;
      if (group) {
        if (navOpenGroups.has(group)) navOpenGroups.delete(group);
        else navOpenGroups.add(group);
        applyNavGroups();
      }
      return;
    }
    // Group head click (anywhere else): always navigate + ensure open — single click, no friction
    const head = e.target.closest('.nav-group-head');
    if (head && head.dataset.tab) {
      const group = head.dataset.group;
      navOpenGroups.add(group);
      if (head.dataset.tab !== currentTab) navigateToTab(head.dataset.tab);
      else applyNavGroups();
      return;
    }
    // Sub-item or standalone nav-item click
    const nav = e.target.closest('.nav-item');
    if (!nav || !nav.dataset.tab) return;
    if (nav.dataset.tab !== currentTab) navigateToTab(nav.dataset.tab);
  });

  // Drag-and-drop on upload zone
  const dz = document.getElementById('dropZone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor='#2d6a2d'; });
  dz.addEventListener('dragleave', () => dz.style.borderColor='');
  dz.addEventListener('drop', e => { e.preventDefault(); dz.style.borderColor=''; processFile(e.dataTransfer.files[0]); });

  // Close year dropdown on outside click
  document.addEventListener('click', () => {
    document.getElementById('yearMenu')?.classList.remove('open');
    document.getElementById('yearTrigger')?.classList.remove('open');
  });

  boot(false);
});
