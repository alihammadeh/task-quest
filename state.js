const COLOR_PALETTE = [
  { id: 'purple', bg: 'var(--accent-bg)',  fg: 'var(--accent-strong)', dot: '#7f77dd' },
  { id: 'info',   bg: 'var(--info-bg)',    fg: 'var(--info)',          dot: '#378add' },
  { id: 'teal',   bg: 'var(--teal-bg)',    fg: 'var(--teal)',          dot: '#1d9e75' },
  { id: 'green',  bg: 'var(--success-bg)', fg: 'var(--success)',       dot: '#639922' },
  { id: 'amber',  bg: 'var(--warn-bg)',    fg: 'var(--warn)',          dot: '#ba7517' },
  { id: 'coral',  bg: 'var(--danger-bg)',  fg: 'var(--danger)',        dot: '#d85a30' },
  { id: 'pink',   bg: 'var(--pink-bg)',    fg: 'var(--pink)',          dot: '#d4537e' },
  { id: 'gray',   bg: 'var(--gray-bg)',    fg: 'var(--gray)',          dot: '#888780' },
];
const DEFAULT_CATEGORIES = [
  { id: 'general',  name: 'General',  color: 'gray' },
  { id: 'work',     name: 'Work',     color: 'info' },
  { id: 'personal', name: 'Personal', color: 'purple' },
  { id: 'health',   name: 'Health',   color: 'green' },
  { id: 'learning', name: 'Learning', color: 'amber' },
];
const ACHIEVEMENTS = [
  { id: 'first', icon: '⚔', label: 'First blood', desc: 'Complete 1 task', check: s => s.doneCount >= 1 },
  { id: 'five', icon: '🏆', label: 'On a roll', desc: 'Complete 5 tasks', check: s => s.doneCount >= 5 },
  { id: 'ten', icon: '💎', label: 'Unstoppable', desc: 'Complete 10 tasks', check: s => s.doneCount >= 10 },
  { id: 'twentyfive', icon: '🚀', label: 'Productivity machine', desc: 'Complete 25 tasks', check: s => s.doneCount >= 25 },
  { id: 'lvl3', icon: '🌟', label: 'Rising star', desc: 'Reach level 3', check: s => getLevel(s.totalXP) >= 3 },
  { id: 'lvl5', icon: '👑', label: 'Quest master', desc: 'Reach level 5', check: s => getLevel(s.totalXP) >= 5 },
  { id: 'lvl10', icon: '⭐', label: 'Legend', desc: 'Reach level 10', check: s => getLevel(s.totalXP) >= 10 },
  { id: 'epic', icon: '🔥', label: 'Epic deed', desc: 'Complete an epic task', check: s => s.tasks.some(t => t.done && t.xp === 100) },
  { id: 'focus', icon: '🎯', label: 'Focused', desc: 'Complete a Pomodoro', check: s => s.focusSessions >= 1 },
  { id: 'focus5', icon: '🧘', label: 'Deep worker', desc: 'Complete 5 Pomodoros', check: s => s.focusSessions >= 5 },
  { id: 'wellrounded', icon: '🎨', label: 'Well-rounded', desc: 'Complete tasks in 3 categories', check: s => {
    const cats = new Set(s.tasks.filter(t => t.done).map(t => t.category));
    return cats.size >= 3;
  }},
  { id: 'hour1', icon: '⏰', label: 'Logged in', desc: 'Track 1 hour on tasks', check: s => totalTrackedSec(s) >= 3600 },
  { id: 'hour10', icon: '⏳', label: 'Time master', desc: 'Track 10 hours on tasks', check: s => totalTrackedSec(s) >= 36000 },
  { id: 'streak3', icon: '🔥', label: 'Warming up', desc: '3-day streak', check: s => computeStreak(s).count >= 3 },
  { id: 'streak7', icon: '⚡', label: 'On fire', desc: '7-day streak', check: s => computeStreak(s).count >= 7 },
  { id: 'streak30', icon: '🌋', label: 'Unbreakable', desc: '30-day streak', check: s => computeStreak(s).count >= 30 },
];

let state = loadState();
let activeFilter = 'all';
let expandedTaskId = null;

function defaultState() {
  const now = Date.now();
  return {
    tasks: [
      { id: 1, name: 'Plan my top 3 priorities for today', desc: '', xp: 25, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now, order: 0 },
      { id: 2, name: 'Clear email inbox',                  desc: '', xp: 10, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now, order: 1 },
      { id: 3, name: 'Work on most important project',     desc: '', xp: 100, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now, order: 2 },
    ],
    categories: DEFAULT_CATEGORIES.slice(),
    totalXP: 0,
    doneCount: 0,
    focusSessions: 0,
    unlockedAchs: [],
    history: [], // append-only log of events: { type, at, ... }
    settings: { focusMins: 25, breakMins: 5, soundOn: true },
    lastActiveDay: null, // dayKey of the last calendar day the app handled (daily-reset detection)
  };
}

function migrateTask(t) {
  return { desc: '', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, category: 'general', createdAt: null, subtasks: [], ...t };
}

// Ensure every task has a numeric `order` for drag-to-reorder. If any are
// missing one (pre-reorder data), assign order by current array position so
// the existing display order is preserved. Mutates and returns the array.
function ensureTaskOrder(tasks) {
  if (tasks.some(t => typeof t.order !== 'number')) tasks.forEach((t, i) => { t.order = i; });
  return tasks;
}

function loadState() {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const key of LEGACY_KEYS) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          const old = JSON.parse(legacy);
          const migrated = {
            ...defaultState(),
            ...old,
            categories: old.categories && old.categories.length ? old.categories : DEFAULT_CATEGORIES.slice(),
            tasks: ensureTaskOrder((old.tasks || []).map(migrateTask)),
            history: old.history || [],
            settings: { focusMins: 25, breakMins: 5, soundOn: true, ...(old.settings || {}) },
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return migrated;
        }
      }
      return defaultState();
    }
    const parsed = JSON.parse(raw);
    const merged = { ...defaultState(), ...parsed };
    merged.unlockedAchs = parsed.unlockedAchs || [];
    merged.categories = parsed.categories && parsed.categories.length ? parsed.categories : DEFAULT_CATEGORIES.slice();
    merged.tasks = ensureTaskOrder((parsed.tasks || []).map(migrateTask));
    merged.history = parsed.history || [];
    merged.settings = { focusMins: 25, breakMins: 5, soundOn: true, ...(parsed.settings || {}) };
    return merged;
  } catch (e) {
    return defaultState();
  }
}
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }

function getLevel(xp) {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) if (xp >= XP_LEVELS[i]) return i + 1;
  return 1;
}
function getLevelXP() {
  const lvl = getLevel(state.totalXP) - 1;
  const current = XP_LEVELS[lvl] || 0;
  const next = XP_LEVELS[lvl + 1] || (XP_LEVELS[lvl] + 500);
  return { current, next, pct: Math.round(((state.totalXP - current) / (next - current)) * 100) };
}
function getColor(id) { return COLOR_PALETTE.find(c => c.id === id) || COLOR_PALETTE[7]; }
function getCategory(id) { return state.categories.find(c => c.id === id) || state.categories[0]; }

/* ----- Time tracking on tasks ----- */
function getCurrentTimerTask() { return state.tasks.find(t => t.timerStartedAt != null); }
function effTrackedSec(t) {
  if (!t.timerStartedAt) return t.trackedSec || 0;
  return (t.trackedSec || 0) + Math.floor((Date.now() - t.timerStartedAt) / 1000);
}
function totalTrackedSec(s) { return s.tasks.reduce((acc, t) => acc + effTrackedSec(t), 0); }
function formatDuration(sec) {
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}
function startTaskTimer(taskId) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t || t.done) return;
  const running = getCurrentTimerTask();
  if (running && running.id !== taskId) pauseTaskTimer(running.id, false);
  t.timerStartedAt = Date.now();
  saveState(); render();
}
function pauseTaskTimer(taskId, notify = true) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t || !t.timerStartedAt) return;
  const elapsed = Math.floor((Date.now() - t.timerStartedAt) / 1000);
  t.trackedSec = (t.trackedSec || 0) + elapsed;
  t.timerStartedAt = null;
  awardTimeXP(t);
  saveState(); render();
  if (notify) showToast(`⏸ Paused — total: ${formatDuration(t.trackedSec)}`);
  markDirty('task', taskId);
  markDirty('profile');
}
function awardTimeXP(t) {
  const earned = Math.floor((t.trackedSec || 0) / TIME_XP_INTERVAL_SEC);
  const previously = t.xpFromTime || 0;
  const delta = earned - previously;
  if (delta > 0) {
    t.xpFromTime = earned;
    state.totalXP += delta;
    showToast(`+${delta} bonus XP for time logged`);
    checkAchievements();
  }
}

/* live timer loop for the in-list per-task display */
let liveTimerInterval = setInterval(() => {
  const t = getCurrentTimerTask();
  if (!t) return;
  const display = document.querySelector(`[data-task-timer-display="${t.id}"]`);
  const pill = document.querySelector(`[data-task-timer-pill="${t.id}"]`);
  if (display) display.textContent = formatDuration(effTrackedSec(t));
  if (pill) pill.textContent = '⏱ ' + formatDuration(effTrackedSec(t));
  // award XP per tick
  const currentSec = effTrackedSec(t);
  const earnedTotal = Math.floor(currentSec / TIME_XP_INTERVAL_SEC);
  if (earnedTotal > (t.xpFromTime || 0)) {
    const delta = earnedTotal - (t.xpFromTime || 0);
    t.xpFromTime = earnedTotal;
    state.totalXP += delta;
    showToast(`+${delta} bonus XP for time logged`);
    checkAchievements();
    saveState();
    document.getElementById('totalXP').textContent = state.totalXP;
    document.getElementById('level').textContent = getLevel(state.totalXP);
    document.getElementById('lvlA').textContent = getLevel(state.totalXP);
    const lx = getLevelXP();
    document.getElementById('xpProg').textContent = `${state.totalXP - lx.current} / ${lx.next - lx.current} XP`;
    document.getElementById('xpBar').style.width = lx.pct + '%';
    markDirty('task', t.id);
    markDirty('profile');
  }
}, 1000);

