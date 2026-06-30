/* ============================
   SYNC (Phase 3a — manual push/pull)
   ============================
   Two operations:
   - cloudPush(): take current local state, write everything to cloud
   - cloudPull(): read everything from cloud, replace local state
   These are intentionally "all or nothing" right now. Per-record sync
   comes in Phase 3c (last-write-wins on individual changes). */
const sync = {
  inProgress: false,
  lastSyncAt: null, // ms epoch
  lastSyncDirection: null, // 'push' | 'pull'
};

function getSyncStatusText() {
  if (!sync.lastSyncAt) return 'Not synced yet';
  const ago = Date.now() - sync.lastSyncAt;
  const mins = Math.floor(ago / 60000);
  if (mins < 1) return `${sync.lastSyncDirection === 'push' ? 'Saved' : 'Loaded'} just now`;
  if (mins < 60) return `${sync.lastSyncDirection === 'push' ? 'Saved' : 'Loaded'} ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${sync.lastSyncDirection === 'push' ? 'Saved' : 'Loaded'} ${hrs}h ago`;
  return `${sync.lastSyncDirection === 'push' ? 'Saved' : 'Loaded'} ${new Date(sync.lastSyncAt).toLocaleDateString()}`;
}

function updateSyncStatus() {
  const el = document.getElementById('authSyncStatus');
  if (el) el.textContent = getSyncStatusText();
}

async function cloudPush() {
  if (!auth.client || !auth.currentUser) { showToast('Sign in to sync'); return; }
  if (sync.inProgress) { showToast('Sync already in progress'); return; }

  closeAuthMenu();
  sync.inProgress = true;
  showToast('☁ Saving to cloud...');

  try {
    const userId = auth.currentUser.id;

    // 1. Profile (singleton row)
    const { error: profileErr } = await auth.client
      .from('profiles')
      .upsert({
        user_id: userId,
        total_xp: state.totalXP,
        done_count: state.doneCount,
        focus_sessions: state.focusSessions || 0,
        unlocked_achs: state.unlockedAchs || [],
        history: state.history || [],
        settings: state.settings,
        updated_at: new Date().toISOString(),
      });
    if (profileErr) throw profileErr;

    // 2. Categories — wipe + replace (simpler than diffing for now)
    const { error: catDelErr } = await auth.client
      .from('categories')
      .delete()
      .eq('user_id', userId);
    if (catDelErr) throw catDelErr;

    if (state.categories.length > 0) {
      const catRows = state.categories.map((c, idx) => ({
        id: c.id,
        user_id: userId,
        name: c.name,
        color: c.color,
        sort_order: idx,
      }));
      const { error: catInsErr } = await auth.client.from('categories').insert(catRows);
      if (catInsErr) throw catInsErr;
    }

    // 3. Tasks — wipe + replace
    const { error: taskDelErr } = await auth.client
      .from('tasks')
      .delete()
      .eq('user_id', userId);
    if (taskDelErr) throw taskDelErr;

    if (state.tasks.length > 0) {
      const taskRows = state.tasks.map(t => ({
        id: t.id,
        user_id: userId,
        name: t.name,
        description: t.desc || '',
        xp: t.xp,
        done: t.done,
        category: t.category,
        tracked_sec: t.trackedSec || 0,
        timer_started_at: t.timerStartedAt || null,
        xp_from_time: t.xpFromTime || 0,
        created_at: t.createdAt || null,
        completed_at: t.completedAt || null,
        sort_order: t.order,
        subtasks: t.subtasks || [],
        recurrence: t.recurrence || null,
      }));
      const { error: taskInsErr } = await auth.client.from('tasks').insert(taskRows);
      if (taskInsErr) throw taskInsErr;
    }

    sync.lastSyncAt = Date.now();
    sync.lastSyncDirection = 'push';
    showToast(`✅ Saved ${state.tasks.length} tasks to cloud`);
  } catch (e) {
    console.error('[sync] Push failed:', e);
    showToast('❌ Save failed: ' + (e.message || 'unknown error'));
  } finally {
    sync.inProgress = false;
    updateSyncStatus();
  }
}

async function cloudPull() {
  if (!auth.client || !auth.currentUser) { showToast('Sign in to sync'); return; }
  if (sync.inProgress) { showToast('Sync already in progress'); return; }

  // Confirm — this is destructive of local state
  if (!confirm('Load from cloud will replace ALL your current local data with what\'s in the cloud. Continue?')) return;

  closeAuthMenu();
  sync.inProgress = true;
  showToast('⬇ Loading from cloud...');

  try {
    const userId = auth.currentUser.id;

    // 1. Profile
    const { data: profileRow, error: profileErr } = await auth.client
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileErr) throw profileErr;

    // 2. Categories
    const { data: catRows, error: catErr } = await auth.client
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order');
    if (catErr) throw catErr;

    // 3. Tasks
    const { data: taskRows, error: taskErr } = await auth.client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { nullsFirst: false });
    if (taskErr) throw taskErr;

    // Rebuild local state from cloud data
    if (!profileRow && (!catRows || catRows.length === 0) && (!taskRows || taskRows.length === 0)) {
      showToast('Cloud is empty — nothing to load');
      sync.inProgress = false;
      return;
    }

    // Pause any running timer before replacing state
    const running = getCurrentTimerTask();
    if (running) pauseTaskTimer(running.id, false);

    const newState = defaultState();
    if (profileRow) {
      newState.totalXP = profileRow.total_xp || 0;
      newState.doneCount = profileRow.done_count || 0;
      newState.focusSessions = profileRow.focus_sessions || 0;
      newState.unlockedAchs = profileRow.unlocked_achs || [];
      newState.history = profileRow.history || [];
      newState.settings = { ...newState.settings, ...(profileRow.settings || {}) };
    }
    newState.categories = (catRows && catRows.length > 0)
      ? catRows.map(c => ({ id: c.id, name: c.name, color: c.color }))
      : DEFAULT_CATEGORIES.slice();
    newState.tasks = (taskRows || []).map((t, idx) => ({
      id: Number(t.id),
      name: t.name,
      desc: t.description || '',
      xp: t.xp,
      done: t.done,
      category: t.category,
      trackedSec: t.tracked_sec || 0,
      timerStartedAt: t.timer_started_at ? Number(t.timer_started_at) : null,
      xpFromTime: t.xp_from_time || 0,
      createdAt: t.created_at ? Number(t.created_at) : null,
      completedAt: t.completed_at ? Number(t.completed_at) : null,
      order: t.sort_order != null ? Number(t.sort_order) : idx,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      recurrence: t.recurrence || null,
    }));

    state = newState;
    activeFilter = 'all';
    expandedTaskId = null;
    saveState();
    render();

    sync.lastSyncAt = Date.now();
    sync.lastSyncDirection = 'pull';
    showToast(`✅ Loaded ${state.tasks.length} tasks from cloud`);
  } catch (e) {
    console.error('[sync] Pull failed:', e);
    showToast('❌ Load failed: ' + (e.message || 'unknown error'));
  } finally {
    sync.inProgress = false;
    updateSyncStatus();
  }
}

/* ============================
   FIRST-LOGIN FLOW (Phase 3b)
   ============================
   On first sign-in (per device + per user combo), figure out which
   side has data and act accordingly:
     local empty + cloud empty  → nothing to do
     local empty + cloud has    → auto-pull
     local has   + cloud empty  → auto-push
     local has   + cloud has    → show modal, ask user to choose */

// "Local has data" = anything beyond a pristine default install
function localHasMeaningfulData() {
  if (state.totalXP > 0) return true;
  if (state.doneCount > 0) return true;
  if ((state.history || []).length > 0) return true;
  // Default install ships 3 starter tasks. If task count differs or any
  // task has been edited (described, tracked, completed), treat as real data.
  if (state.tasks.length !== 3) return true;
  for (const t of state.tasks) {
    if (t.done || t.trackedSec > 0 || (t.desc && t.desc.trim()) || t.completedAt) return true;
  }
  return false;
}

function firstLoginFlagKey() {
  return `task-quest-firstlogin-done:${auth.currentUser.id}`;
}

async function handleFirstLogin() {
  if (!auth.client || !auth.currentUser) return;
  // Only run once per user-per-device
  if (localStorage.getItem(firstLoginFlagKey())) return;

  try {
    showToast('Checking your cloud data...');
    const userId = auth.currentUser.id;

    // Cheap check: count tasks. profile may exist (auto-created) but be empty.
    const [tasksRes, profileRes] = await Promise.all([
      auth.client.from('tasks').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      auth.client.from('profiles').select('total_xp, history').eq('user_id', userId).maybeSingle(),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (profileRes.error) throw profileRes.error;

    const cloudTaskCount = tasksRes.count || 0;
    const cloudHasData = cloudTaskCount > 0
      || (profileRes.data && (profileRes.data.total_xp > 0 || (profileRes.data.history || []).length > 0));
    const localHas = localHasMeaningfulData();

    if (!cloudHasData && !localHas) {
      // both empty — nothing to do, just mark done
      markFirstLoginDone();
      return;
    }
    if (!cloudHasData && localHas) {
      // auto-push
      showToast('☁ First login — backing up your data to the cloud...');
      await cloudPushSilent();
      markFirstLoginDone();
      return;
    }
    if (cloudHasData && !localHas) {
      // auto-pull (no confirm needed since local has no real data)
      showToast('⬇ First login — loading your saved data...');
      await cloudPullSilent();
      markFirstLoginDone();
      return;
    }
    // BOTH have data — let the user choose
    openFirstLoginModal(cloudTaskCount);
  } catch (e) {
    console.error('[first-login] check failed:', e);
    showToast('⚠ Could not check cloud data — sync manually if needed');
  }
}

function markFirstLoginDone() {
  try { localStorage.setItem(firstLoginFlagKey(), String(Date.now())); } catch (e) {}
}

// Internal "silent" versions of push/pull used by the first-login flow.
// They skip the confirm() dialog since the user has already made the choice
// via the first-login modal.
async function cloudPushSilent() {
  // re-use cloudPush but skip the confirm path (cloudPush has none on push anyway)
  await cloudPush();
}
async function cloudPullSilent() {
  // mirror cloudPull but without the destructive confirm — user already opted in
  if (!auth.client || !auth.currentUser) return;
  if (sync.inProgress) return;
  sync.inProgress = true;
  try {
    const userId = auth.currentUser.id;
    const [profileRes, catRes, taskRes] = await Promise.all([
      auth.client.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      auth.client.from('categories').select('*').eq('user_id', userId).order('sort_order'),
      auth.client.from('tasks').select('*').eq('user_id', userId).order('sort_order', { nullsFirst: false }),
    ]);
    if (profileRes.error) throw profileRes.error;
    if (catRes.error) throw catRes.error;
    if (taskRes.error) throw taskRes.error;

    const running = getCurrentTimerTask();
    if (running) pauseTaskTimer(running.id, false);

    const newState = defaultState();
    const profileRow = profileRes.data;
    if (profileRow) {
      newState.totalXP = profileRow.total_xp || 0;
      newState.doneCount = profileRow.done_count || 0;
      newState.focusSessions = profileRow.focus_sessions || 0;
      newState.unlockedAchs = profileRow.unlocked_achs || [];
      newState.history = profileRow.history || [];
      newState.settings = { ...newState.settings, ...(profileRow.settings || {}) };
    }
    newState.categories = (catRes.data && catRes.data.length > 0)
      ? catRes.data.map(c => ({ id: c.id, name: c.name, color: c.color }))
      : DEFAULT_CATEGORIES.slice();
    newState.tasks = (taskRes.data || []).map((t, idx) => ({
      id: Number(t.id),
      name: t.name,
      desc: t.description || '',
      xp: t.xp,
      done: t.done,
      category: t.category,
      trackedSec: t.tracked_sec || 0,
      timerStartedAt: t.timer_started_at ? Number(t.timer_started_at) : null,
      xpFromTime: t.xp_from_time || 0,
      createdAt: t.created_at ? Number(t.created_at) : null,
      completedAt: t.completed_at ? Number(t.completed_at) : null,
      order: t.sort_order != null ? Number(t.sort_order) : idx,
      subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
      recurrence: t.recurrence || null,
    }));

    state = newState;
    activeFilter = 'all';
    expandedTaskId = null;
    saveState();
    render();

    sync.lastSyncAt = Date.now();
    sync.lastSyncDirection = 'pull';
    showToast(`✅ Loaded ${state.tasks.length} tasks from cloud`);
  } catch (e) {
    console.error('[sync] silent pull failed:', e);
    showToast('❌ Load failed: ' + (e.message || 'unknown error'));
  } finally {
    sync.inProgress = false;
    updateSyncStatus();
  }
}

function openFirstLoginModal(cloudTaskCount) {
  const localTaskCount = state.tasks.length;
  const localXP = state.totalXP;
  const cloudXP = '?'; // we didn't fetch this in the cheap check; user just needs the rough picture
  // build the modal
  const m = document.createElement('div');
  m.className = 'modal-bg show';
  m.id = 'firstLoginModal';
  m.innerHTML = `
    <div class="modal" style="max-width: 480px;">
      <div class="modal-title">Welcome back! Which data do you want to keep?</div>
      <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px; line-height: 1.55;">
        You have data on both this device and in your cloud account. Choose which to keep — the other will be replaced.
      </p>
      <div class="first-login-choices">
        <button class="first-login-choice" onclick="firstLoginChoose('local')">
          <div class="fl-choice-icon">💻</div>
          <div class="fl-choice-body">
            <div class="fl-choice-title">Keep this device's data</div>
            <div class="fl-choice-desc">${localTaskCount} task${localTaskCount===1?'':'s'} · ${localXP} XP locally — will be pushed to cloud, replacing what's there</div>
          </div>
        </button>
        <button class="first-login-choice" onclick="firstLoginChoose('cloud')">
          <div class="fl-choice-icon">☁</div>
          <div class="fl-choice-body">
            <div class="fl-choice-title">Use cloud data</div>
            <div class="fl-choice-desc">${cloudTaskCount} task${cloudTaskCount===1?'':'s'} in cloud — will replace this device's data</div>
          </div>
        </button>
      </div>
      <p style="font-size: 11px; color: var(--text-subtle); margin-top: 16px; line-height: 1.5;">
        Tip: this prompt only appears the first time you log in on this device. After that, sync uses the most recent change automatically.
      </p>
    </div>
  `;
  document.body.appendChild(m);
}

async function firstLoginChoose(choice) {
  const modal = document.getElementById('firstLoginModal');
  if (modal) modal.remove();
  if (choice === 'local') {
    showToast('💻 Keeping local data — pushing to cloud...');
    await cloudPushSilent();
  } else {
    showToast('☁ Loading cloud data...');
    await cloudPullSilent();
  }
  markFirstLoginDone();
}

/* ============================
   AUTO-SYNC (Phase 3c)
   ============================
   Mutations call markDirty(kind, id) to enqueue a sync. After a debounce
   window, all queued changes are pushed in a single batch. The dirty queue
   survives page reloads via localStorage so unsynced changes aren't lost. */

const DIRTY_KEY = 'task-quest-dirty-queue';
const SYNC_DEBOUNCE_MS = 1500;

const autoSync = {
  enabled: true,
  timer: null,
  flushing: false,
  // Sets of dirty IDs by kind. Deletions are tracked separately so we know
  // to issue DELETE rather than UPSERT.
  dirty: {
    tasks: new Set(),
    deletedTasks: new Set(),
    categories: new Set(),
    deletedCategories: new Set(),
    profile: false, // singleton — just a bool
  },
};

function loadDirtyQueue() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return;
    const q = JSON.parse(raw);
    autoSync.dirty.tasks = new Set(q.tasks || []);
    autoSync.dirty.deletedTasks = new Set(q.deletedTasks || []);
    autoSync.dirty.categories = new Set(q.categories || []);
    autoSync.dirty.deletedCategories = new Set(q.deletedCategories || []);
    autoSync.dirty.profile = !!q.profile;
  } catch (e) {}
}
function saveDirtyQueue() {
  try {
    localStorage.setItem(DIRTY_KEY, JSON.stringify({
      tasks: [...autoSync.dirty.tasks],
      deletedTasks: [...autoSync.dirty.deletedTasks],
      categories: [...autoSync.dirty.categories],
      deletedCategories: [...autoSync.dirty.deletedCategories],
      profile: autoSync.dirty.profile,
    }));
  } catch (e) {}
}
function dirtyQueueIsEmpty() {
  return autoSync.dirty.tasks.size === 0
    && autoSync.dirty.deletedTasks.size === 0
    && autoSync.dirty.categories.size === 0
    && autoSync.dirty.deletedCategories.size === 0
    && !autoSync.dirty.profile;
}

// Called by mutation functions to flag what changed.
// kind: 'task' | 'task-deleted' | 'category' | 'category-deleted' | 'profile'
function markDirty(kind, id) {
  if (!autoSync.enabled) return;
  if (kind === 'task')               { autoSync.dirty.tasks.add(id);              autoSync.dirty.deletedTasks.delete(id); }
  else if (kind === 'task-deleted')  { autoSync.dirty.deletedTasks.add(id);       autoSync.dirty.tasks.delete(id); }
  else if (kind === 'category')      { autoSync.dirty.categories.add(id);         autoSync.dirty.deletedCategories.delete(id); }
  else if (kind === 'category-deleted') { autoSync.dirty.deletedCategories.add(id); autoSync.dirty.categories.delete(id); }
  else if (kind === 'profile')       { autoSync.dirty.profile = true; }
  saveDirtyQueue();
  scheduleFlush();
}

function scheduleFlush() {
  if (!auth.client || !auth.currentUser) return; // no point if not signed in
  if (autoSync.timer) clearTimeout(autoSync.timer);
  autoSync.timer = setTimeout(flushDirty, SYNC_DEBOUNCE_MS);
  renderSyncIndicator('pending');
}

async function flushDirty() {
  if (!auth.client || !auth.currentUser) return;
  if (autoSync.flushing) return; // re-entry guard
  if (dirtyQueueIsEmpty()) { renderSyncIndicator('idle'); return; }
  autoSync.flushing = true;
  renderSyncIndicator('syncing');

  // Snapshot the queue, then clear it. New writes during sync will accumulate
  // in a fresh queue and trigger another flush.
  const snap = {
    tasks: [...autoSync.dirty.tasks],
    deletedTasks: [...autoSync.dirty.deletedTasks],
    categories: [...autoSync.dirty.categories],
    deletedCategories: [...autoSync.dirty.deletedCategories],
    profile: autoSync.dirty.profile,
  };
  autoSync.dirty.tasks.clear();
  autoSync.dirty.deletedTasks.clear();
  autoSync.dirty.categories.clear();
  autoSync.dirty.deletedCategories.clear();
  autoSync.dirty.profile = false;
  saveDirtyQueue();

  try {
    const userId = auth.currentUser.id;
    const ops = [];

    // Tasks upsert
    if (snap.tasks.length > 0) {
      const taskRows = snap.tasks
        .map(id => state.tasks.find(t => t.id === id))
        .filter(Boolean) // task may have been deleted between mark and flush
        .map(t => ({
          id: t.id,
          user_id: userId,
          name: t.name,
          description: t.desc || '',
          xp: t.xp,
          done: t.done,
          category: t.category,
          tracked_sec: t.trackedSec || 0,
          timer_started_at: t.timerStartedAt || null,
          xp_from_time: t.xpFromTime || 0,
          created_at: t.createdAt || null,
          completed_at: t.completedAt || null,
          sort_order: t.order,
          subtasks: t.subtasks || [],
          recurrence: t.recurrence || null,
          updated_at: new Date().toISOString(),
        }));
      if (taskRows.length > 0) ops.push(auth.client.from('tasks').upsert(taskRows));
    }
    // Tasks delete
    if (snap.deletedTasks.length > 0) {
      ops.push(auth.client.from('tasks').delete().eq('user_id', userId).in('id', snap.deletedTasks));
    }
    // Categories upsert
    if (snap.categories.length > 0) {
      const catRows = snap.categories
        .map(id => state.categories.find(c => c.id === id))
        .filter(Boolean)
        .map((c, idx) => ({
          id: c.id,
          user_id: userId,
          name: c.name,
          color: c.color,
          sort_order: state.categories.findIndex(x => x.id === c.id),
          updated_at: new Date().toISOString(),
        }));
      if (catRows.length > 0) ops.push(auth.client.from('categories').upsert(catRows));
    }
    // Categories delete
    if (snap.deletedCategories.length > 0) {
      ops.push(auth.client.from('categories').delete().eq('user_id', userId).in('id', snap.deletedCategories));
    }
    // Profile upsert
    if (snap.profile) {
      ops.push(auth.client.from('profiles').upsert({
        user_id: userId,
        total_xp: state.totalXP,
        done_count: state.doneCount,
        focus_sessions: state.focusSessions || 0,
        unlocked_achs: state.unlockedAchs || [],
        history: state.history || [],
        settings: state.settings,
        updated_at: new Date().toISOString(),
      }));
    }

    const results = await Promise.all(ops);
    const firstError = results.find(r => r && r.error);
    if (firstError) throw firstError.error;

    sync.lastSyncAt = Date.now();
    sync.lastSyncDirection = 'push';
    renderSyncIndicator('synced');
    updateSyncStatus();
  } catch (e) {
    console.error('[auto-sync] flush failed:', e);
    // Put the work back in the queue so we retry later
    snap.tasks.forEach(id => autoSync.dirty.tasks.add(id));
    snap.deletedTasks.forEach(id => autoSync.dirty.deletedTasks.add(id));
    snap.categories.forEach(id => autoSync.dirty.categories.add(id));
    snap.deletedCategories.forEach(id => autoSync.dirty.deletedCategories.add(id));
    if (snap.profile) autoSync.dirty.profile = true;
    saveDirtyQueue();
    renderSyncIndicator('error');
    showToast('⚠ Sync failed — will retry');
    // Retry after 10 seconds
    setTimeout(scheduleFlush, 10000);
  } finally {
    autoSync.flushing = false;
  }
}

// Visual indicator next to the profile pill
function renderSyncIndicator(status) {
  // status: 'idle' | 'pending' | 'syncing' | 'synced' | 'error'
  const el = document.getElementById('authSyncStatus');
  if (!el) return;
  if (status === 'pending') el.textContent = '✏ Will sync shortly...';
  else if (status === 'syncing') el.textContent = '☁ Syncing...';
  else if (status === 'synced') el.textContent = 'Synced just now';
  else if (status === 'error') el.textContent = '⚠ Sync error — will retry';
  else el.textContent = getSyncStatusText();
}

// Auto-pull on app load when logged in, before user starts making changes
async function maybeAutoPullOnLoad() {
  if (!auth.client || !auth.currentUser) return;
  // Don't auto-pull if first-login flow is going to run (it handles its own data movement)
  if (!localStorage.getItem(firstLoginFlagKey())) return;
  // Don't auto-pull if we have unsynced local changes — they'd be overwritten
  if (!dirtyQueueIsEmpty()) {
    console.log('[auto-sync] skipping pull-on-load — unsynced local changes present');
    scheduleFlush(); // push them instead
    return;
  }
  // Quiet pull
  await cloudPullSilent();
}

// Best-effort flush on page hide / close (uses sendBeacon-like behavior via fetch keepalive)
window.addEventListener('beforeunload', () => {
  if (!dirtyQueueIsEmpty()) {
    // Try a synchronous flush attempt; usually this works for small payloads.
    // If it doesn't complete, the queue persists in localStorage and retries next load.
    flushDirty();
  }
});

