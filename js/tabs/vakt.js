// ── Vaktkalender (storage + calc) ────────────────────────────────
const VAKTKODER_KEY = 'okonomi_vaktkoder_v1';
const VAKTKODER_DEF = [
  {id:'A',  kode:'A',  start:'15:00', end:'22:30'},
  {id:'D',  kode:'D',  start:'07:30', end:'15:15'},
  {id:'K',  kode:'K',  start:'14:30', end:'22:30'},
  {id:'LV', kode:'LV', start:'08:00', end:'20:30'},
  {id:'N',  kode:'N',  start:'22:00', end:'07:00'},
];
function loadVaktkoder()  { try{const s=localStorage.getItem(VAKTKODER_KEY); return s?JSON.parse(s):VAKTKODER_DEF;}catch{return VAKTKODER_DEF;} }
function saveVaktkoder(k) { localStorage.setItem(VAKTKODER_KEY, JSON.stringify(k)); }
const VAKTER_KEY    = 'okonomi_vakter_v1';
const VAKTSETT_KEY  = 'okonomi_vaktsett_v1';
const VAKT_SETT_DEF = {timepris:200,kveldFra:'17:00',kveldSats:40,nattFra:'21:00',nattTil:'06:00',nattSats:60,helgSats:50,helligSats:133,pauseMin:30};
function loadVakter()   { try{return JSON.parse(localStorage.getItem(VAKTER_KEY)||'{}')}catch{return{}} }
function saveVakter(v)  { localStorage.setItem(VAKTER_KEY,JSON.stringify(v)); idbSet(VAKTER_KEY,v); }
function loadVaktSett() { return Object.assign({},VAKT_SETT_DEF,JSON.parse(localStorage.getItem(VAKTSETT_KEY)||'{}')); }
function saveVaktSett(s){ localStorage.setItem(VAKTSETT_KEY,JSON.stringify(s)); }

function easterDate(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const mo=Math.floor((h+l-7*m+114)/31), dy=((h+l-7*m+114)%31)+1;
  return new Date(year,mo-1,dy);
}
function getNorskHelligdager(year) {
  const add=(d,n)=>{ const r=new Date(d); r.setDate(r.getDate()+n); return r; };
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const e=easterDate(year);
  return {
    [fmt(new Date(year,0,1))]:   'Nyttårsdag',
    [fmt(add(e,-3))]:            'Skjærtorsdag',
    [fmt(add(e,-2))]:            'Langfredag',
    [fmt(e)]:                    '1. påskedag',
    [fmt(add(e,1))]:             '2. påskedag',
    [fmt(new Date(year,4,1))]:   'Arbeidernes dag',
    [fmt(new Date(year,4,17))]:  'Grunnlovsdag',
    [fmt(add(e,39))]:            'Kristi himmelfartsdag',
    [fmt(add(e,49))]:            '1. pinsedag',
    [fmt(add(e,50))]:            '2. pinsedag',
    [fmt(new Date(year,11,25))]: '1. juledag',
    [fmt(new Date(year,11,26))]: '2. juledag',
  };
}

// ── Jobbprofiler ─────────────────────────────────────────────────
const JOBBPROFILER_KEY = 'okonomi_jobbprofiler_v1';

function _globalKoderSnapshot() {
  // Read current global codes (or defaults) for one-time migration into profiles
  try { const s = localStorage.getItem(VAKTKODER_KEY); if (s) return JSON.parse(s); } catch {}
  return VAKTKODER_DEF.map(k => ({ ...k }));
}
function loadJobbprofiler() {
  try {
    const s = localStorage.getItem(JOBBPROFILER_KEY);
    if (s) {
      const p = JSON.parse(s);
      if (p.length > 0) {
        // One-time migration: add shiftCodes to profiles that don't have it yet
        let needsSave = false;
        p.forEach((prof, idx) => {
          if (!Array.isArray(prof.shiftCodes)) {
            prof.shiftCodes = idx === 0 ? _globalKoderSnapshot() : [];
            needsSave = true;
          }
        });
        if (needsSave) saveJobbprofiler(p);
        return p;
      }
    }
  } catch {}
  // First time ever: migrate from existing vaktSett + global vaktkoder
  const sett = loadVaktSett();
  const profile = {
    id: 'job_default', name: 'Jobb',
    timepris: sett.timepris, kveldFra: sett.kveldFra, kveldSats: sett.kveldSats,
    nattFra: sett.nattFra, nattTil: sett.nattTil, nattSats: sett.nattSats,
    helgSats: sett.helgSats, helligSats: sett.helligSats,
    shiftCodes: _globalKoderSnapshot(),
    createdAt: new Date().toISOString(),
  };
  const profiles = [profile];
  saveJobbprofiler(profiles);
  return profiles;
}
function saveJobbprofiler(p) {
  localStorage.setItem(JOBBPROFILER_KEY, JSON.stringify(p));
  idbSet(JOBBPROFILER_KEY, p);
}
function getJobbprofil(jobId) {
  const profiles = loadJobbprofiler();
  if (jobId) { const f = profiles.find(p => p.id === jobId); if (f) return f; }
  return profiles[0] || loadVaktSett();
}
function getJobbKoder(jobId) {
  const p = getJobbprofil(jobId);
  return Array.isArray(p?.shiftCodes) ? p.shiftCodes : [];
}
function saveJobbKoder(jobId, koder) {
  const all = loadJobbprofiler();
  const idx = all.findIndex(p => p.id === jobId);
  if (idx < 0) return;
  all[idx].shiftCodes = koder;
  all[idx].updatedAt  = new Date().toISOString();
  saveJobbprofiler(all);
}

// Single source of truth: a shift counts as helligdag if it's on the official
// Norwegian holiday calendar OR the user manually flagged it on the vakt itself.
function isVaktHelligdag(dk, vakt, helligdager) {
  return !!helligdager?.[dk] || !!vakt?.hellig;
}

function calcVaktPay(vakt, sett, dk, isHelligdag=false) {
  const toMin = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
  let s=toMin(vakt.start), e=toMin(vakt.end);
  if(e<=s) e+=1440;
  const workMin=Math.max(0,e-s);
  if(workMin<=0) return {hours:0,pay:0,eveningH:0,nightH:0,helgH:0,helligH:0};
  const kF=toMin(sett.kveldFra), nF=toMin(sett.nattFra), nT=toMin(sett.nattTil);
  const ov=(a,b,x,y)=>Math.max(0,Math.min(b,y)-Math.max(a,x));
  const e2=s+workMin, d1e=Math.min(e2,1440);
  let eveMin=ov(s,d1e,kF,nF), nightMin=ov(s,d1e,nF,1440)+ov(s,d1e,0,nT);
  if(e2>1440){const d2e=e2-1440; eveMin+=ov(0,d2e,kF,nF); nightMin+=ov(0,d2e,nF,1440)+ov(0,d2e,0,nT);}
  const hours=workMin/60, eveningH=eveMin/60, nightH=nightMin/60;
  const date=new Date(dk); const isHelg=date.getDay()===0||date.getDay()===6;
  const helgH=isHelg?hours:0, helligH=isHelligdag?hours:0;
  const pay=hours*sett.timepris
    +eveningH*sett.kveldSats
    +nightH*sett.nattSats
    +helgH*sett.helgSats
    +helligH*sett.timepris*((sett.helligSats||133)/100);
  return {hours,pay,eveningH,nightH,helgH,helligH};
}
