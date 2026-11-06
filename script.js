// ReddyWorks - Email + parola prin Supabase; nu pune chei secrete aici.
(() => {
  const $ = id => document.getElementById(id);
  const cfg = window.REDDYWORKS_AUTH || {};
  const valid = /^https:\/\//.test(cfg.supabaseUrl || '') && /^(sb_publishable_|eyJ)/.test(cfg.supabasePublishableKey || '');
  const client = valid && window.supabase?.createClient ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  // Statistici publice: functie SQL care returneaza doar numere agregate.
  async function loadCommunityStats() {
    const total = $('rw-total-members');
    const recent = $('rw-new-members');
    const info = $('rw-community-status');
    if (!total || !recent || !info) return;
    if (!client) {
      info.textContent = 'Statisticile nu sunt disponibile momentan.';
      return;
    }
    try {
      const { data, error } = await client.rpc('get_community_stats');
      if (error) throw error;
      const stats = Array.isArray(data) ? data[0] : data;
      if (!stats || stats.total_members == null || stats.new_members_7d == null) throw new Error('Raspuns incomplet');
      total.textContent = Number(stats.total_members).toLocaleString('ro-RO');
      recent.textContent = Number(stats.new_members_7d).toLocaleString('ro-RO');
      info.textContent = 'Statistici actualizate din comunitatea ReddyWorks.';
    } catch (error) {
      console.error('ReddyWorks community stats:', error);
      info.textContent = 'Statisticile nu pot fi încărcate momentan.';
    }
  }
  loadCommunityStats();
  const dialog = $('rw-login-dialog');
  const form = $('rw-auth-form');
  const msg = $('rw-auth-message');
  const siteKey = '0x4AAAAAAF2k_ndCSkTda4QR'; // cheie PUBLICA Cloudflare
  let mode = 'login', widgetId = null, busy = false;
  let roleRequest = 0;
  let currentStaffRole = null;
  let memberSearchRequest = 0;
  let selectedMember = null;
  const memberCache = new Map();
  const status = text => { if (msg) msg.textContent = text; };
  function render(session) {
    const user = session?.user || null;
    if ($('rw-login')) $('rw-login').hidden = !!user;
    if ($('rw-user')) $('rw-user').hidden = !user;
    if ($('rw-username')) $('rw-username').textContent = user ? (user.user_metadata?.username || user.email?.split('@')[0] || 'Contul meu') : '';
    if (user && dialog?.open) dialog.close();
    updateStaffUI(user);
  }
  async function updateStaffUI(user) {
    const currentRequest = ++roleRequest;
    const badge = $('rw-role-badge');
    const adminButton = $('rw-admin-open');
    const founderTools = $('rw-founder-tools');
    const memberTools = $('rw-member-tools');
    currentStaffRole = null;
    if (badge) { badge.hidden = true; badge.textContent = ''; }
    if (adminButton) adminButton.hidden = true;
    if (founderTools) founderTools.hidden = true;
    if (memberTools) memberTools.hidden = true;
    memberSearchRequest++;
    if (!user || !client) { if ($('rw-admin-dialog')?.open) $('rw-admin-dialog').close(); return; }
    try {
      const {data, error} = await client.from('staff_roles').select('role').eq('id', user.id).maybeSingle();
      if (currentRequest !== roleRequest || error) return;
      const role = data?.role;
      if (!['founder', 'admin', 'moderator'].includes(role)) return;
      if (badge) { badge.textContent = role === 'founder' ? '👑 Founder' : role === 'admin' ? 'Administrator' : 'Moderator'; badge.hidden = false; }
      if (adminButton) adminButton.hidden = !['founder', 'admin'].includes(role);
      currentStaffRole = role;
      if (founderTools) founderTools.hidden = !['founder', 'admin'].includes(role);
      if (memberTools) memberTools.hidden = !['founder','admin'].includes(role);
      if ($('rw-staff-role')) { const adminOption = $('rw-staff-role').querySelector('option[value="admin"]'); if (adminOption) adminOption.hidden = role !== 'founder'; if (role !== 'founder' && $('rw-staff-role').value === 'admin') $('rw-staff-role').value = 'moderator'; }
      if ($('rw-admin-description')) $('rw-admin-description').textContent = role === 'founder' ? 'Caută membri și gestionează rolurile echipei.' : role === 'admin' ? 'Poți promova membri la Moderator sau retrage rolul Moderator.' : 'Rolul tău este Moderator.';
    } catch (error) { console.error('ReddyWorks staff:', error); }
  }
  const roleNames = {founder:'👑 Founder',admin:'Administrator',moderator:'Moderator',member:'Membru'};
  function clearMemberSelection() {
    selectedMember = null;
    if ($('rw-staff-id')) $('rw-staff-id').value = '';
    if ($('rw-staff-selected')) $('rw-staff-selected').value = '';
    if ($('rw-staff-submit')) $('rw-staff-submit').disabled = true;
  }
  async function loadMembers() {
    const list = $('rw-member-list');
    const statusEl = $('rw-member-status');
    if (!client || !list || !statusEl || !['founder','admin'].includes(currentStaffRole)) return;
    const request = ++memberSearchRequest;
    list.replaceChildren();
    statusEl.textContent = 'Se caută membrii…';
    try {
      const {data, error} = await client.rpc('search_reddyworks_members', {search_name: $('rw-member-search')?.value.trim() || ''});
      if (request !== memberSearchRequest) return;
      if (error) throw error;
      clearMemberSelection();
      memberCache.clear();
      for (const member of data || []) {
        memberCache.set(member.member_id, member);
        const item = document.createElement('div'); item.className = 'rw-member-item';
        const details = document.createElement('div'); details.className = 'rw-member-details';
        const name = document.createElement('strong'); name.textContent = member.member_username || 'Membru fără nume';
        const role = document.createElement('span'); role.textContent = roleNames[member.member_role] || 'Membru';
        details.append(name, role); item.append(details);
        if (member.member_role === 'founder') {
          const protectedTag = document.createElement('span'); protectedTag.className = 'rw-member-protected'; protectedTag.textContent = 'Protejat'; item.append(protectedTag);
        } else if (currentStaffRole === 'founder' || (currentStaffRole === 'admin' && ['member', 'moderator'].includes(member.member_role))) {
          const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'rw-member-choose'; choose.textContent = 'Selectează';
          choose.addEventListener('click', () => {
            selectedMember = member;
            $('rw-staff-id').value = member.member_id;
            $('rw-staff-selected').value = member.member_username || member.member_id;
            $('rw-staff-submit').disabled = false;
            $('rw-staff-message').textContent = 'Ai selectat ' + (member.member_username || 'membrul') + '.';
          });
          item.append(choose);
        }
        list.append(item);
      }
      statusEl.textContent = !data?.length ? 'Nu am găsit membri.' : `${data.length} membri afișați (maximum 50).`;
    } catch (error) {
      if (request !== memberSearchRequest) return;
      console.error('ReddyWorks members:', error);
      statusEl.textContent = 'Nu am putut încărca membrii. Verifică permisiunile Supabase.';
    }
  }
  let memberSearchDelay;
  $('rw-member-search')?.addEventListener('input', () => {
    clearTimeout(memberSearchDelay);
    memberSearchDelay = setTimeout(loadMembers, 300);
  });
  $('rw-admin-open')?.addEventListener('click', () => {
    $('rw-admin-dialog')?.showModal();
    clearMemberSelection();
    if ($('rw-staff-message')) $('rw-staff-message').textContent = '';
    loadMembers();
  });
  $('rw-admin-close')?.addEventListener('click', () => $('rw-admin-dialog')?.close());
  $('rw-admin-dialog')?.addEventListener('click', e => { if (e.target === $('rw-admin-dialog')) e.target.close(); });
  $('rw-staff-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!client || !['founder', 'admin'].includes(currentStaffRole) || !selectedMember || selectedMember.member_role === 'founder') return;
    if (currentStaffRole === 'admin' && !['member', 'moderator'].includes(selectedMember.member_role)) return;
    const button = $('rw-staff-submit');
    const message = $('rw-staff-message');
    const userId = selectedMember.member_id;
    const selection = $('rw-staff-role').value;
    if (currentStaffRole === 'admin' && !['moderator', 'remove'].includes(selection)) return;
    if (selection === 'remove' && selectedMember.member_role === 'member') { message.textContent = 'Acest membru nu are un rol staff de retras.'; return; }
    if (!confirm('Confirmi modificarea rolului pentru ' + (selectedMember.member_username || userId) + '?')) return;
    button.disabled = true;
    message.textContent = 'Se verifică permisiunile…';
    try {
      const {error} = await client.rpc('manage_staff_role', {
        target_user_id: userId,
        new_role: selection === 'remove' ? null : selection
      });
      if (error) throw error;
      message.textContent = 'Rolul a fost actualizat cu succes.';
      clearMemberSelection();
      await loadMembers();
    } catch (error) {
      console.error('ReddyWorks staff:', error);
      message.textContent = 'Modificarea nu a reușit: ' + error.message;
    } finally { if (selectedMember) button.disabled = false; }
  });
  function captchaReady() {
    if (!window.turnstile) return false;
    if (widgetId === null) {
      widgetId = window.turnstile.render('#rw-captcha', { sitekey: siteKey, theme: 'dark' });
    }
    return true;
  }
  function resetCaptcha() { if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId); }
  function setMode(next) {
    mode = next; status('');
    const register = mode === 'register';
    $('rw-dialog-title').textContent = register ? 'Creează cont ReddyWorks' : 'Conectare ReddyWorks';
    $('rw-dialog-subtitle').textContent = register ? 'Înregistrează-te cu email și parolă.' : 'Intră în contul tău ReddyWorks.';
    $('rw-name-row').hidden = !register; $('rw-confirm-row').hidden = !register;
    $('rw-name').required = register; $('rw-confirm').required = register;
    $('rw-password').autocomplete = register ? 'new-password' : 'current-password';
    $('rw-submit').textContent = register ? 'Creează cont' : 'Conectare';
    $('rw-forgot').hidden = register;
    $('rw-tab-login').classList.toggle('active', !register);
    $('rw-tab-register').classList.toggle('active', register);
    $('rw-tab-login').setAttribute('aria-pressed', String(!register));
    $('rw-tab-register').setAttribute('aria-pressed', String(register));
    resetCaptcha();
  }
  $('rw-login')?.addEventListener('click', () => {
    setMode('login');
    dialog?.showModal();
    if (!client) status('Verifică cheia publică din auth-config.js.');
    if (!captchaReady()) status('Verificarea de securitate nu s-a încărcat. Reîncarcă pagina.');
  });
  $('rw-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  $('rw-tab-login')?.addEventListener('click', () => setMode('login'));
  $('rw-tab-register')?.addEventListener('click', () => setMode('register'));
  form?.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    if (!client) return status('Lipsește configurarea publică Supabase.');
    if (!captchaReady()) return status('Cloudflare Turnstile nu este disponibil.');
    const captchaToken = window.turnstile.getResponse(widgetId);
    if (!captchaToken) return status('Completează verificarea de securitate.');
    const email = $('rw-email').value.trim();
    const password = $('rw-password').value;
    if (password.length < 12) return status('Parola trebuie să aibă minimum 12 caractere.');
    if (mode === 'register') {
      const name = $('rw-name').value.trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) return status('Numele trebuie să aibă 3–24 caractere: litere, cifre sau _.');
      if (password !== $('rw-confirm').value) return status('Parolele nu coincid.');
    }
    busy = true; $('rw-submit').disabled = true; status('Se procesează cererea…');
    try {
      if (mode === 'register') {
        const {error} = await client.auth.signUp({
          email, password,
          options: { data: { username: $('rw-name').value.trim() }, captchaToken,
            emailRedirectTo: 'https://xreddy5.github.io/reddyworks/' }
        });
        status(error ? 'Înregistrarea nu a reușit: ' + error.message : 'Verifică emailul pentru confirmarea contului.');
      } else {
        const {error} = await client.auth.signInWithPassword({email, password, options:{captchaToken}});
        status(error ? 'Conectarea nu a reușit. Verifică emailul, parola și confirmarea contului.' : 'Conectat cu succes.');
      }
    } catch (err) { console.error('ReddyWorks auth:', err); status('A apărut o problemă de conexiune.'); }
    finally { busy = false; $('rw-submit').disabled = false; resetCaptcha(); }
  });
  $('rw-forgot')?.addEventListener('click', async () => {
    if (!client) return status('Supabase nu este configurat.');
    const email = $('rw-email').value.trim();
    if (!$('rw-email').checkValidity()) return status('Introdu o adresă de email validă.');
    if (!captchaReady()) return status('Cloudflare Turnstile nu este disponibil.');
    const captchaToken = window.turnstile.getResponse(widgetId);
    if (!captchaToken) return status('Completează verificarea de securitate.');
    try {
      const {error} = await client.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://xreddy5.github.io/reddyworks/', captchaToken
      });
      status(error ? 'Cererea nu a reușit. Încearcă din nou.' : 'Dacă adresa există, vei primi un email de recuperare.');
    } catch { status('A apărut o problemă de conexiune.'); }
    finally { resetCaptcha(); }
  });
  $('rw-logout')?.addEventListener('click', async () => {
    if (!client) return;
    const {error} = await client.auth.signOut();
    if (error) status('Deconectarea nu a reușit.'); else render(null);
  });
  if (!client) { render(null); return; }
  client.auth.onAuthStateChange((_event, session) => render(session));
  client.auth.getSession().then(({data,error}) => {
    if (error) { console.error('ReddyWorks auth:',error.message); render(null); }
    else render(data.session);
  }).catch(() => render(null));
  // Recuperarea parolei necesită o pagină separată pentru introducerea parolei noi.
})();
