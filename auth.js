const STORAGE_KEY = 'task-quest-v5';
const LEGACY_KEYS = ['task-quest-v4', 'task-quest-v3', 'task-quest-v2', 'task-quest-v1'];
const XP_LEVELS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 20000, 30000];
const TIME_XP_INTERVAL_SEC = 300;

/* ============================
   AUTH (Supabase)
   ============================
   Sync-aware but sync-optional. The app works fully without login.
   When logged in, we expose the user object via auth.currentUser.
   Phase 3 will add actual data sync on top of this. */
const auth = {
  client: null,        // Supabase client instance (null if config missing)
  currentUser: null,   // populated on login; null when signed out
  initialized: false,
};

function initAuth() {
  if (auth.initialized) return;
  auth.initialized = true;

  const cfg = window.TASK_QUEST_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR_PROJECT_ID')) {
    console.log('[auth] No Supabase config found — sync disabled. The app works fine without it.');
    renderAuthArea();
    return;
  }
  if (typeof window.supabase === 'undefined') {
    console.warn('[auth] Supabase library not loaded — check the script tag in index.html.');
    renderAuthArea();
    return;
  }

  auth.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // Restore session on page load + react to changes (login, logout, token refresh)
  auth.client.auth.onAuthStateChange((event, session) => {
    const wasSignedIn = !!auth.currentUser;
    auth.currentUser = session ? session.user : null;
    renderAuthArea();
    if (event === 'SIGNED_IN' && !wasSignedIn) {
      // True sign-in (not a token refresh or re-fire of an existing session)
      showToast(`✅ Signed in as ${auth.currentUser.email}`);
      handleFirstLogin();
    }
    if (event === 'SIGNED_OUT') showToast('👋 Signed out');
  });

  // Get the current session (works on first load too)
  auth.client.auth.getSession().then(({ data: { session } }) => {
    auth.currentUser = session ? session.user : null;
    renderAuthArea();
  });
}

async function signInWithGoogle() {
  if (!auth.client) {
    showToast('Sync not configured — see README');
    return;
  }
  const { error } = await auth.client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  });
  if (error) showToast('Sign-in failed: ' + error.message);
}

async function signOut() {
  if (!auth.client) return;
  closeAuthMenu();
  await auth.client.auth.signOut();
}

function renderAuthArea() {
  const root = document.getElementById('authArea');
  if (!root) return;

  // Not configured at all — hide the auth area entirely
  if (!auth.client) {
    root.innerHTML = '';
    return;
  }

  if (auth.currentUser) {
    const u = auth.currentUser;
    const displayName = u.user_metadata?.full_name || u.user_metadata?.name || u.email;
    const avatarUrl = u.user_metadata?.avatar_url || u.user_metadata?.picture;
    const initials = (displayName || '?').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

    root.innerHTML = `
      <div class="auth-wrap">
        <button class="auth-profile" onclick="toggleAuthMenu(event)">
          <span class="auth-avatar">
            ${avatarUrl ? `<img src="${escAttr(avatarUrl)}" alt="" onerror="this.style.display='none';this.parentNode.textContent='${escHtml(initials)}'" />` : escHtml(initials)}
          </span>
          <span>${escHtml(displayName)}</span>
        </button>
        <div class="auth-menu" id="authMenu">
          <div class="auth-menu-info">
            Signed in as <b>${escHtml(u.email)}</b>
            <div class="auth-sync-status" id="authSyncStatus">${getSyncStatusText()}</div>
          </div>
          <button class="auth-menu-item" onclick="cloudPush()">☁ Save to cloud</button>
          <button class="auth-menu-item" onclick="cloudPull()">⬇ Load from cloud</button>
          <button class="auth-menu-item danger" onclick="signOut()">Sign out</button>
        </div>
      </div>
    `;
  } else {
    root.innerHTML = `
      <button class="auth-signin" onclick="signInWithGoogle()">
        <span class="g-icon"></span>
        Sign in
      </button>
    `;
  }
}

function toggleAuthMenu(event) {
  event.stopPropagation();
  const menu = document.getElementById('authMenu');
  if (!menu) return;
  menu.classList.toggle('show');
  // Close on outside click
  if (menu.classList.contains('show')) {
    setTimeout(() => document.addEventListener('click', closeAuthMenu, { once: true }), 0);
  }
}
function closeAuthMenu() {
  const menu = document.getElementById('authMenu');
  if (menu) menu.classList.remove('show');
}

function escAttr(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

