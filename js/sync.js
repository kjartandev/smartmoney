// ── Sky-synkronisering (Supabase) ──────────────────────────────────
// Rent tillegg: helt usynlig/uvirksom for en bruker som aldri åpner
// Konto-avsnittet i Verktøy-arket. Steg 1 av to (se planen) — kun
// manuell opplasting/nedlasting via knapper her, ingen automatikk.
// Rører aldri boot()/bootWithData() — synk skjer utelukkende fra et
// eksplisitt knappetrykk, etter at appen alt har startet normalt fra
// lokal data.

const SUPABASE_URL = 'https://xuktyslpraetthdtwbiu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Y4ANQAvK1r_ngYnwdd5B8w_4rm91DQu';
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

async function getSyncSession() {
  const { data } = await sbClient.auth.getSession();
  return data.session;
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
  const { data } = await sbClient.from('profiles').select('display_name').eq('id', userId).maybeSingle();
  return data;
}
async function saveDisplayName(name) {
  const session = await getSyncSession();
  if (!session) return;
  const { error } = await sbClient.from('profiles').upsert({ id: session.user.id, display_name: name, updated_at: new Date().toISOString() });
  if (error) showToast('Kunne ikke lagre navnet: ' + error.message);
}

async function uploadBackup() {
  const session = await getSyncSession();
  if (!session) return;
  const backup = collectFullBackup();
  const { error } = await sbClient.from('backups').insert({ data: backup });
  if (error) { showToast('Opplasting feilet: ' + error.message); return; }
  showToast('Lastet opp til sky');
}

async function downloadBackup() {
  const session = await getSyncSession();
  if (!session) return;
  const { data, error } = await sbClient
    .from('backups')
    .select('data,created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { showToast('Henting feilet: ' + error.message); return; }
  if (!data) { showToast('Ingen sky-backup funnet ennå — last opp fra en annen enhet først'); return; }

  const cloud = data.data;
  const local = collectFullBackup();
  const vaktAntall = b => Object.values(b.vakter || {}).flat().length;
  const when = new Date(data.created_at).toLocaleString('nb-NO');

  showConfirmDialog(
    `Denne enheten: ${local.txs.length} transaksjoner, ${vaktAntall(local)} vakter<br>` +
    `Skyen (${when}): ${cloud.txs.length} transaksjoner, ${vaktAntall(cloud)} vakter<br><br>` +
    `Henting overskriver det som ligger på denne enheten. En sikkerhetskopi av det du har nå lastes automatisk ned først.`,
    () => { downloadLocalSafetyBackup(); restoreFullBackup(cloud); },
    { title: 'Hent fra sky?', confirmLabel: 'Hent fra sky', cancelLabel: 'Avbryt' }
  );
}

async function renderKontoSection() {
  const wrap = document.getElementById('kontoSection');
  if (!wrap) return;
  const session = await getSyncSession();

  if (!session) {
    // display:block on input/button + white-space:normal on the wrapper:
    // .tools-menu sets white-space:nowrap for its plain single-line text
    // items, but input/button default to inline-block, so under nowrap
    // they'd sit squeezed side-by-side on one line instead of stacking —
    // explicit block + a local nowrap override undoes that.
    wrap.innerHTML = `
      <div class="tools-item" style="cursor:default;white-space:normal">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px">Konto</div>
        <input type="email" id="syncEmailInput" placeholder="din@epost.no"
          style="display:block;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px;margin-bottom:6px">
        <button class="sort-btn sort-active" id="syncLoginBtn" style="display:block;width:100%;box-sizing:border-box;font-size:12px">Send innloggingslenke</button>
        <div id="syncStatus" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div>
      </div>`;
    document.getElementById('syncLoginBtn').addEventListener('click', async () => {
      const email = document.getElementById('syncEmailInput').value.trim();
      const statusEl = document.getElementById('syncStatus');
      if (!email) { statusEl.textContent = 'Skriv inn e-post først'; return; }
      statusEl.textContent = 'Sender...';
      const { error } = await sbClient.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: location.href.split('#')[0] }
      });
      statusEl.textContent = error ? 'Noe gikk galt: ' + error.message : 'Lenke sendt! Sjekk e-posten din.';
    });
  } else {
    const profile = await getProfile(session.user.id);
    wrap.innerHTML = `
      <div class="tools-item" style="cursor:default;white-space:normal">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">Konto</div>
        <input type="text" id="syncNameInput" placeholder="Navnet ditt" value="${profile?.display_name || ''}"
          style="display:block;width:100%;box-sizing:border-box;padding:6px 9px;border-radius:7px;border:1px solid var(--border);background:var(--card-bg);color:var(--text);font-family:inherit;font-size:13px;font-weight:600;margin-bottom:3px">
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
      renderKontoSection();
    });
  }
}

sbClient.auth.onAuthStateChange(() => renderKontoSection());
renderKontoSection();
