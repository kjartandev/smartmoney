// ── Sky-synkronisering (Supabase) ──────────────────────────────────
// Rent tillegg: helt usynlig/uvirksom for en bruker som aldri åpner
// Konto-avsnittet i Verktøy-arket. Steg 1 av to (se planen) — kun
// manuell opplasting/nedlasting via knapper her, ingen automatikk.
// Rører aldri boot()/bootWithData() — synk skjer utelukkende fra et
// eksplisitt knappetrykk, etter at appen alt har startet normalt fra
// lokal data.
//
// VIKTIG DESIGNREGEL (lært av en feil): Konto-seksjonen MÅ tegnes
// synkront med en gang, aldri bak et await. Første versjon ventet på
// sbClient.auth.getSession() før den skrev noe som helst til DOM-en —
// hang eller feilet det kallet, ble hele seksjonen stående usynlig tom
// uten en eneste feilmelding i konsollen, og det så ut som funksjonen
// ikke fantes. Nå tegnes utlogget-tilstand umiddelbart, og vi
// "oppgraderer" til innlogget-visning etterpå når/hvis økten svarer.

const SUPABASE_URL = 'https://xuktyslpraetthdtwbiu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Y4ANQAvK1r_ngYnwdd5B8w_4rm91DQu';

// Lastes biblioteket ikke (blokkert av utvidelse, nettverk, CDN nede),
// skal det si ifra i grensesnittet — ikke kaste en TypeError på
// toppnivå som stopper resten av fila fra å kjøre i det hele tatt.
const sbClient = (window.supabase && window.supabase.createClient)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

const kontoWrap = () => document.getElementById('kontoSection');

// Et hengende nettverkskall skal aldri kunne etterlate seksjonen tom.
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function getSyncSession() {
  if (!sbClient) return null;
  try {
    const res = await withTimeout(sbClient.auth.getSession(), 8000, { data: { session: null } });
    return res?.data?.session || null;
  } catch { return null; }
}

// Automatisk sikkerhetskopi FØR en nedlasting fra skyen får lov til å
// overskrive noe — samme teknikk som den eksisterende "Eksporter JSON"
// (js/io.js), bare uten dens tomme-database-sperre: selv en tom lokal
// profil skal få sin "før"-fil.
function downloadLocalSafetyBackup() {
  const blob = new Blob([JSON.stringify(collectFullBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = 'okonomi_backup_for_sky_overskriving_' + new Date().toISOString().slice(0, 10) + '.json';
  a.href = url; a.click(); URL.revokeObjectURL(url);
}

async function getProfile(userId) {
  try {
    const { data } = await sbClient.from('profiles').select('display_name').eq('id', userId).maybeSingle();
    return data;
  } catch { return null; }
}
async function saveDisplayName(name) {
  const session = await getSyncSession();
  if (!session) return;
  const { error } = await sbClient.from('profiles').upsert({ id: session.user.id, display_name: name, updated_at: new Date().toISOString() });
  if (error) showToast('Kunne ikke lagre navnet: ' + error.message);
}

async function uploadBackup() {
  const session = await getSyncSession();
  if (!session) { showToast('Du er ikke logget inn'); return; }
  try {
    const backup = collectFullBackup();
    const { error } = await sbClient.from('backups').insert({ data: backup });
    if (error) { showToast('Opplasting feilet: ' + error.message); return; }
    showToast(`Lastet opp til sky · ${backup.txs.length} transaksjoner`);
  } catch (e) {
    showToast('Opplasting feilet: ' + (e?.message || e));
  }
}

async function downloadBackup() {
  const session = await getSyncSession();
  if (!session) { showToast('Du er ikke logget inn'); return; }
  try {
    const { data, error } = await sbClient
      .from('backups')
      .select('data,created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) { showToast('Henting feilet: ' + error.message); return; }
    if (!data) { showToast('Ingen sky-backup funnet ennå — last opp fra en annen enhet først'); return; }

    const cloud = data.data || {};
    const local = collectFullBackup();
    const vaktAntall = b => Object.values(b.vakter || {}).flat().length;
    const when = new Date(data.created_at).toLocaleString('nb-NO');

    showConfirmDialog(
      `Denne enheten: ${(local.txs || []).length} transaksjoner, ${vaktAntall(local)} vakter<br>` +
      `Skyen (${when}): ${(cloud.txs || []).length} transaksjoner, ${vaktAntall(cloud)} vakter<br><br>` +
      `Henting overskriver det som ligger på denne enheten. En sikkerhetskopi av det du har nå lastes automatisk ned først.`,
      () => { downloadLocalSafetyBackup(); restoreFullBackup(cloud); },
      { title: 'Hent fra sky?', confirmLabel: 'Hent fra sky', cancelLabel: 'Avbryt' }
    );
  } catch (e) {
    showToast('Henting feilet: ' + (e?.message || e));
  }
}

// ── Rendering ────────────────────────────────────────────────────
// display:block på input/knapp + white-space:normal på wrapperen:
// .tools-menu setter white-space:nowrap for sine enkle énlinjes
// tekstvalg, men input/button er inline-block som standard og ville
// ellers presses sammen side om side på én linje i stedet for å stable.
const KONTO_INPUT_STYLE = 'display:block;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px';

function renderKontoLoggedOut(statusMsg = '') {
  const wrap = kontoWrap();
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="tools-item" style="cursor:default;white-space:normal">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px">Konto</div>
      <input type="email" id="syncEmailInput" placeholder="din@epost.no" style="${KONTO_INPUT_STYLE};margin-bottom:6px">
      <button class="sort-btn sort-active" id="syncLoginBtn" style="display:block;width:100%;box-sizing:border-box;font-size:12px">Send innloggingskode</button>
      <div id="syncStatus" style="font-size:11px;color:var(--text-muted);margin-top:6px">${statusMsg}</div>
      <!-- Kode-innlogging finnes fordi en e-postlenke på iOS ALLTID
           åpner seg i Safari, aldri inne i en app lagt til på
           hjemskjermen — og de to har helt atskilt lagring, så en
           innlogging gjort i Safari finnes rett og slett ikke inne i
           hjemskjerm-appen. Koden kan derimot skrives inn akkurat der
           man faktisk vil være innlogget. -->
      <div id="syncCodeWrap" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid var(--border-light)">
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Åpner lenken seg i feil nettleser? Skriv inn koden fra e-posten her i stedet:</div>
        <input type="text" id="syncCodeInput" inputmode="numeric" autocomplete="one-time-code" placeholder="6-sifret kode" style="${KONTO_INPUT_STYLE};margin-bottom:6px;letter-spacing:2px;font-weight:600">
        <button class="sort-btn" id="syncCodeBtn" style="display:block;width:100%;box-sizing:border-box;font-size:12px">Logg inn med kode</button>
      </div>
    </div>`;

  const statusEl = () => document.getElementById('syncStatus');

  document.getElementById('syncLoginBtn').addEventListener('click', async () => {
    const email = document.getElementById('syncEmailInput').value.trim();
    if (!email) { statusEl().textContent = 'Skriv inn e-post først'; return; }
    if (!sbClient) { statusEl().textContent = 'Supabase-biblioteket lastet ikke — sjekk nettverk/blokkering'; return; }
    statusEl().textContent = 'Sender...';
    try {
      const { error } = await sbClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.href.split('#')[0] }
      });
      if (error) { statusEl().textContent = 'Noe gikk galt: ' + error.message; return; }
      statusEl().textContent = 'Sendt! Sjekk e-posten — bruk lenken, eller koden under.';
      document.getElementById('syncCodeWrap').style.display = 'block';
    } catch (e) {
      statusEl().textContent = 'Noe gikk galt: ' + (e?.message || e);
    }
  });

  document.getElementById('syncCodeBtn').addEventListener('click', async () => {
    const email = document.getElementById('syncEmailInput').value.trim();
    const token = document.getElementById('syncCodeInput').value.trim().replace(/\s/g, '');
    if (!email) { statusEl().textContent = 'Skriv inn e-posten din over først'; return; }
    if (!token) { statusEl().textContent = 'Skriv inn koden fra e-posten'; return; }
    statusEl().textContent = 'Sjekker koden...';
    try {
      const { error } = await sbClient.auth.verifyOtp({ email, token, type: 'email' });
      if (error) { statusEl().textContent = 'Koden ble ikke godtatt: ' + error.message; return; }
      // onAuthStateChange tegner innlogget-visningen automatisk.
    } catch (e) {
      statusEl().textContent = 'Noe gikk galt: ' + (e?.message || e);
    }
  });
}

function renderKontoLoggedIn(session, profile) {
  const wrap = kontoWrap();
  if (!wrap) return;
  wrap.innerHTML = `
    <div class="tools-item" style="cursor:default;white-space:normal">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px">Konto</div>
      <input type="text" id="syncNameInput" placeholder="Navnet ditt" value="${profile?.display_name || ''}"
        style="${KONTO_INPUT_STYLE};font-weight:600;margin-bottom:3px">
      <div style="font-size:11px;color:var(--text-muted)">${session.user.email}</div>
    </div>
    <button class="tools-item" id="syncUploadBtn">${icon('import', { size: 14 })} Last opp til sky</button>
    <button class="tools-item" id="syncDownloadBtn">${icon('download', { size: 14 })} Hent fra sky</button>
    <button class="tools-item" id="syncLogoutBtn" style="color:#f44336">Logg ut</button>`;
  const nameInput = document.getElementById('syncNameInput');
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
  nameInput.addEventListener('change', () => saveDisplayName(nameInput.value.trim()));
  document.getElementById('syncUploadBtn').addEventListener('click', uploadBackup);
  document.getElementById('syncDownloadBtn').addEventListener('click', downloadBackup);
  document.getElementById('syncLogoutBtn').addEventListener('click', async () => {
    await sbClient.auth.signOut();
    renderKontoLoggedOut('Logget ut.');
  });
}

// Tegner ALLTID noe umiddelbart (synkront), og oppgraderer etterpå.
function renderKontoSection() {
  const wrap = kontoWrap();
  if (!wrap) return;
  if (!sbClient) {
    wrap.innerHTML = `<div class="tools-item" style="cursor:default;white-space:normal">
      <div style="font-size:12px;font-weight:600;margin-bottom:4px">Konto</div>
      <div style="font-size:11px;color:#f44336">Sky-synk utilgjengelig: Supabase-biblioteket ble ikke lastet (blokkert av nettverk eller en utvidelse?).</div>
    </div>`;
    return;
  }
  renderKontoLoggedOut();
  getSyncSession().then(async session => {
    if (!session) return;                 // forblir utlogget-visning
    const profile = await getProfile(session.user.id);
    renderKontoLoggedIn(session, profile);
  }).catch(() => { /* utlogget-visningen står allerede der */ });
}

// js/main.js lukker #toolsMenu på ethvert klikk i dokumentet (fint for
// engangsknapper som Eksporter/Bytt tema), men det lukket også hele
// menyen i det man klikket i e-post-/navnefeltet her. Lyttes én gang på
// den statiske wrapperen — den byttes aldri ut, bare innerHTML-en.
kontoWrap()?.addEventListener('click', e => e.stopPropagation());

if (sbClient) sbClient.auth.onAuthStateChange(() => renderKontoSection());
renderKontoSection();
