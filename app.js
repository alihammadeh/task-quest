const STORAGE_KEY = 'task-quest-v5';
const LEGACY_KEYS = ['task-quest-v4', 'task-quest-v3', 'task-quest-v2', 'task-quest-v1'];
const XP_LEVELS = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 20000, 30000];
const TIME_XP_INTERVAL_SEC = 300;

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
];

let state = loadState();
let activeFilter = 'all';
let expandedTaskId = null;

function defaultState() {
  const now = Date.now();
  return {
    tasks: [
      { id: 1, name: 'Plan my top 3 priorities for today', desc: '', xp: 25, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now },
      { id: 2, name: 'Clear email inbox',                  desc: '', xp: 10, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now },
      { id: 3, name: 'Work on most important project',     desc: '', xp: 100, done: false, category: 'work', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: now },
    ],
    categories: DEFAULT_CATEGORIES.slice(),
    totalXP: 0,
    doneCount: 0,
    focusSessions: 0,
    unlockedAchs: [],
    history: [], // append-only log of events: { type, at, ... }
    settings: { focusMins: 25, breakMins: 5, soundOn: true },
  };
}

function migrateTask(t) {
  return { desc: '', trackedSec: 0, timerStartedAt: null, xpFromTime: 0, category: 'general', createdAt: null, ...t };
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
            tasks: (old.tasks || []).map(migrateTask),
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
    merged.tasks = (parsed.tasks || []).map(migrateTask);
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
  }
}, 1000);

/* ============================
   POMODORO STATE & RENDERING
   ============================ */
const pomo = {
  isOpen: false,
  phase: 'focus',          // 'focus' | 'break'
  remaining: 25 * 60,      // seconds
  running: false,
  endsAt: null,            // timestamp (ms) when current run ends
  taskId: null,            // which task is the focus session about
  lastSecondShown: null,
  audioCtx: null,
  finished: false,         // shows the completion screen
};

function getDurationFor(phase) {
  return (phase === 'focus' ? state.settings.focusMins : state.settings.breakMins) * 60;
}

function openPomodoro() {
  pomo.isOpen = true;
  pomo.phase = 'focus';
  pomo.remaining = getDurationFor('focus');
  pomo.running = false;
  pomo.endsAt = null;
  pomo.finished = false;
  // pick a default task: currently-timing task, else first active task
  const timingTask = getCurrentTimerTask();
  const firstActive = state.tasks.find(t => !t.done);
  pomo.taskId = (timingTask || firstActive || {}).id || null;
  document.getElementById('pomoOverlay').classList.add('show');
  renderPomodoro();
}

function closePomodoro() {
  // if running, finalize: pause task timer
  if (pomo.running) {
    pomo.running = false;
    if (pomo.taskId) pauseTaskTimer(pomo.taskId, false);
  }
  pomo.isOpen = false;
  document.getElementById('pomoOverlay').classList.remove('show');
  document.getElementById('pomoOverlay').classList.remove('phase-break', 'last-10');
  render();
}

function startPomodoro() {
  if (pomo.finished) return;
  // sync remaining if it changed from settings while paused
  pomo.endsAt = Date.now() + pomo.remaining * 1000;
  pomo.running = true;
  // auto-start the linked task's timer (only on focus phase)
  if (pomo.phase === 'focus' && pomo.taskId) {
    startTaskTimer(pomo.taskId);
  }
  ensureAudio();
  renderPomodoro();
}

function pausePomodoro() {
  if (!pomo.running) return;
  pomo.remaining = Math.max(0, Math.ceil((pomo.endsAt - Date.now()) / 1000));
  pomo.running = false;
  pomo.endsAt = null;
  // pause task timer too
  if (pomo.phase === 'focus' && pomo.taskId) {
    pauseTaskTimer(pomo.taskId, false);
  }
  renderPomodoro();
}

function resetPomodoroPhase() {
  pomo.running = false;
  pomo.endsAt = null;
  pomo.remaining = getDurationFor(pomo.phase);
  pomo.finished = false;
  if (pomo.phase === 'focus' && pomo.taskId && getCurrentTimerTask() && getCurrentTimerTask().id === pomo.taskId) {
    pauseTaskTimer(pomo.taskId, false);
  }
  renderPomodoro();
}

function updatePhaseDuration(phase) {
  const inputId = phase === 'focus' ? 'pomoFocusMins' : 'pomoBreakMins';
  const v = parseInt(document.getElementById(inputId).value, 10);
  if (isNaN(v) || v < 1) return;
  const clamped = Math.min(phase === 'focus' ? 120 : 60, Math.max(1, v));
  document.getElementById(inputId).value = clamped;
  if (phase === 'focus') state.settings.focusMins = clamped;
  else state.settings.breakMins = clamped;
  // if currently on this phase and not running, reflect immediately
  if (pomo.phase === phase && !pomo.running && !pomo.finished) {
    pomo.remaining = clamped * 60;
    renderPomodoro();
  }
  saveState();
}

function selectPomodoroTask(taskId) {
  // pause any running task timer if switching tasks
  const running = getCurrentTimerTask();
  if (running) pauseTaskTimer(running.id, false);
  pomo.taskId = taskId;
  pomo.finished = false;
  // if pomodoro is currently running, link the new task
  if (pomo.running && pomo.phase === 'focus') startTaskTimer(taskId);
  document.getElementById('pomoNextList').style.display = 'none';
  renderPomodoro();
}

function completeCurrentPomodoroTask() {
  if (!pomo.taskId) return;
  const t = state.tasks.find(t => t.id === pomo.taskId);
  if (!t || t.done) return;
  // finalize task time, award XP, mark done
  if (t.timerStartedAt) pauseTaskTimer(t.id, false);
  const prevLvl = getLevel(state.totalXP);
  t.done = true;
  state.totalXP += t.xp;
  state.doneCount++;
  const newLvl = getLevel(state.totalXP);
  showToast(`+${t.xp} XP earned!${newLvl > prevLvl ? ' 🎉 Level up! Now level ' + newLvl : ''}`);
  checkAchievements();
  saveState();
  // show next-task picker
  showNextTaskList();
}

function showNextTaskList() {
  const list = document.getElementById('pomoNextList');
  const candidates = state.tasks.filter(t => !t.done && t.id !== pomo.taskId).slice(0, 5);
  if (candidates.length === 0) {
    list.innerHTML = '<div style="text-align:center;font-size:13px;color:var(--text-muted);padding:1rem;">No other active tasks. Add one or close the timer.</div>';
  } else {
    list.innerHTML = `<div style="text-align:center;font-size:11px;color:var(--text-subtle);text-transform:uppercase;letter-spacing:0.08em;padding:6px 0;">Pick the next quest</div>` +
      candidates.map(t => {
        const cat = getCategory(t.category);
        const col = getColor(cat.color);
        return `<button class="pomo-next-item" onclick="selectPomodoroTask(${t.id})">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col.dot};"></span>
          <span class="pomo-next-item-name">${escHtml(t.name)}</span>
          <span class="xp-badge ${t.xp===10?'xp-sm':t.xp===25?'xp-md':t.xp===50?'xp-lg':'xp-xl'}">+${t.xp} XP</span>
        </button>`;
      }).join('');
  }
  list.style.display = 'flex';
  pomo.taskId = null;
  renderPomodoro();
}

/* Phase transitions */
function onPhaseEnd() {
  pomo.running = false;
  pomo.endsAt = null;
  playEndBell();
  // pause task timer if it was running
  if (pomo.phase === 'focus' && pomo.taskId) pauseTaskTimer(pomo.taskId, false);

  if (pomo.phase === 'focus') {
    state.focusSessions = (state.focusSessions || 0) + 1;
    state.totalXP += 15;
    recordHistoryEvent({
      type: 'pomodoro_complete',
      at: Date.now(),
      durationMins: state.settings.focusMins,
      taskId: pomo.taskId || null,
    });
    showToast('🎯 Focus done! +15 XP. Time for a break.');
    checkAchievements();
    saveState();
    // transition to break — auto start
    pomo.phase = 'break';
    pomo.remaining = getDurationFor('break');
    pomo.endsAt = Date.now() + pomo.remaining * 1000;
    pomo.running = true;
  } else {
    showToast('☕ Break done! Ready for another round?');
    pomo.phase = 'focus';
    pomo.remaining = getDurationFor('focus');
    // user must manually start the next focus session
  }
  renderPomodoro();
}

/* Render the full overlay */
function renderPomodoro() {
  if (!pomo.isOpen) return;
  const overlay = document.getElementById('pomoOverlay');
  overlay.classList.toggle('phase-break', pomo.phase === 'break');

  // phase label
  const phaseLabel = document.getElementById('pomoPhaseLabel');
  phaseLabel.textContent = pomo.phase === 'focus' ? 'Focus' : 'Break';
  phaseLabel.classList.toggle('break', pomo.phase === 'break');

  // sound button
  document.getElementById('pomoSoundBtn').textContent = state.settings.soundOn ? '🔊' : '🔇';
  document.getElementById('pomoSoundBtn').classList.toggle('muted', !state.settings.soundOn);

  // time inputs
  document.getElementById('pomoFocusMins').value = state.settings.focusMins;
  document.getElementById('pomoBreakMins').value = state.settings.breakMins;
  document.getElementById('pomoFocusMins').disabled = pomo.running;
  document.getElementById('pomoBreakMins').disabled = pomo.running;
  document.getElementById('pomoTimeEdit').style.display = pomo.finished ? 'none' : '';

  // clock
  renderClock();

  // task card
  renderPomoTaskCard();

  // controls
  renderPomoControls();
}

function renderClock() {
  const sec = Math.max(0, pomo.remaining);
  const m = Math.floor(sec / 60), s = sec % 60;
  const digits = [
    Math.floor(m / 10), m % 10,
    -1, // colon placeholder
    Math.floor(s / 10), s % 10,
  ];
  const clockEl = document.getElementById('pomoClock');
  // build columns once, animate via translate
  if (!clockEl.dataset.built) {
    let html = '';
    for (let i = 0; i < digits.length; i++) {
      if (digits[i] === -1) {
        html += `<div class="pomo-colon">:</div>`;
      } else {
        html += `<div class="pomo-digit-col"><div class="pomo-digit-stack" data-stack="${i}">`;
        for (let n = 0; n <= 9; n++) html += `<div class="pomo-digit-cell">${n}</div>`;
        html += `</div></div>`;
      }
    }
    clockEl.innerHTML = html;
    clockEl.dataset.built = '1';
  }
  digits.forEach((d, i) => {
    if (d < 0) return;
    const stack = clockEl.querySelector(`[data-stack="${i}"]`);
    if (stack) stack.style.transform = `translateY(-${d}em)`;
  });

  // last-10 visual pulse only on focus phase
  document.getElementById('pomoOverlay').classList.toggle('last-10', pomo.phase === 'focus' && pomo.running && sec > 0 && sec <= 10);
}

function renderPomoTaskCard() {
  const card = document.getElementById('pomoTaskCard');
  if (pomo.taskId == null) {
    card.classList.add('empty');
    if (pomo.finished) {
      card.innerHTML = `<div>Pick your next quest below ↓</div>`;
    } else {
      card.innerHTML = `<div>No task selected. ${state.tasks.filter(t => !t.done).length > 0 ? 'Choose one to focus on.' : 'Add a task first.'}</div>`;
      // show selector
      if (state.tasks.filter(t => !t.done).length > 0) showNextTaskListPicker();
    }
    return;
  }
  card.classList.remove('empty');
  const t = state.tasks.find(t => t.id === pomo.taskId);
  if (!t) { card.innerHTML = ''; return; }
  const cat = getCategory(t.category);
  const col = getColor(cat.color);
  const xpCls = t.xp === 10 ? 'xp-sm' : t.xp === 25 ? 'xp-md' : t.xp === 50 ? 'xp-lg' : 'xp-xl';
  const tracked = effTrackedSec(t);
  card.innerHTML = `
    <div class="pomo-task-header">
      <span class="cat-tag" style="background:${col.bg};color:${col.fg};">${escHtml(cat.name)}</span>
      <div class="pomo-task-name">${escHtml(t.name)}</div>
      <span class="xp-badge ${xpCls}">+${t.xp} XP</span>
    </div>
    ${t.desc && t.desc.trim() ? `<div class="pomo-task-desc">${escHtml(t.desc)}</div>` : ''}
    <div class="pomo-task-time">⏱ Total time on this task: <span data-task-timer-display="${t.id}">${formatDuration(tracked)}</span></div>
    <div class="pomo-task-actions">
      <button class="btn-ghost" onclick="showNextTaskListPicker()">Switch task</button>
      <button class="btn-ghost" onclick="completeCurrentPomodoroTask()" style="border-color:var(--success);color:var(--success);">✓ Complete this task</button>
    </div>
  `;
}

function showNextTaskListPicker() {
  const list = document.getElementById('pomoNextList');
  const candidates = state.tasks.filter(t => !t.done && t.id !== pomo.taskId).slice(0, 8);
  if (candidates.length === 0) {
    list.style.display = 'none';
    return;
  }
  list.innerHTML = `<div style="text-align:center;font-size:11px;color:var(--text-subtle);text-transform:uppercase;letter-spacing:0.08em;padding:6px 0;">Pick a task to focus on</div>` +
    candidates.map(t => {
      const cat = getCategory(t.category);
      const col = getColor(cat.color);
      return `<button class="pomo-next-item" onclick="selectPomodoroTask(${t.id})">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col.dot};"></span>
        <span class="pomo-next-item-name">${escHtml(t.name)}</span>
        <span class="xp-badge ${t.xp===10?'xp-sm':t.xp===25?'xp-md':t.xp===50?'xp-lg':'xp-xl'}">+${t.xp} XP</span>
      </button>`;
    }).join('');
  list.style.display = 'flex';
}

function renderPomoControls() {
  const ctrl = document.getElementById('pomoControls');
  if (pomo.running) {
    ctrl.innerHTML = `
      <button class="pomo-btn-big secondary" onclick="pausePomodoro()">⏸ Pause</button>
      <button class="pomo-btn-big danger" onclick="resetPomodoroPhase()">↺ Reset</button>
    `;
  } else {
    const phaseName = pomo.phase === 'focus' ? 'focus' : 'break';
    ctrl.innerHTML = `
      <button class="pomo-btn-big" onclick="startPomodoro()">▶ Start ${phaseName}</button>
      ${pomo.remaining < getDurationFor(pomo.phase) ? `<button class="pomo-btn-big danger" onclick="resetPomodoroPhase()">↺ Reset</button>` : ''}
    `;
  }
}

/* ============================
   AUDIO
   ============================ */
function ensureAudio() {
  if (pomo.audioCtx) return;
  try { pomo.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
}
function beep(freq, duration = 0.08, type = 'sine', vol = 0.15) {
  if (!state.settings.soundOn || !pomo.audioCtx) return;
  const ctx = pomo.audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}
function playTick(secLeft) {
  if (secLeft > 10) {
    beep(800, 0.025, 'square', 0.06); // soft tick
  } else if (secLeft > 0) {
    beep(1200, 0.07, 'square', 0.18); // urgent boop
  }
}
function playEndBell() {
  if (!state.settings.soundOn) return;
  ensureAudio();
  setTimeout(() => beep(880, 0.18, 'sine', 0.22), 0);
  setTimeout(() => beep(1108, 0.22, 'sine', 0.22), 130);
  setTimeout(() => beep(1318, 0.32, 'sine', 0.22), 280);
}
function toggleSound() {
  state.settings.soundOn = !state.settings.soundOn;
  saveState();
  if (state.settings.soundOn) ensureAudio();
  document.getElementById('pomoSoundBtn').textContent = state.settings.soundOn ? '🔊' : '🔇';
  document.getElementById('pomoSoundBtn').classList.toggle('muted', !state.settings.soundOn);
}

/* ============================
   POMODORO TICK LOOP
   ============================ */
setInterval(() => {
  if (!pomo.isOpen || !pomo.running) return;
  const secLeft = Math.max(0, Math.ceil((pomo.endsAt - Date.now()) / 1000));
  if (secLeft !== pomo.remaining) {
    pomo.remaining = secLeft;
    renderClock();
    if (pomo.lastSecondShown !== secLeft) {
      pomo.lastSecondShown = secLeft;
      if (secLeft > 0) playTick(secLeft);
    }
  }
  if (secLeft <= 0) onPhaseEnd();
}, 200);

/* ============================
   MAIN APP RENDER
   ============================ */
function render() {
  const lvl = getLevel(state.totalXP);
  document.getElementById('level').textContent = lvl;
  document.getElementById('totalXP').textContent = state.totalXP;
  document.getElementById('doneCount').textContent = state.doneCount;
  document.getElementById('lvlA').textContent = lvl;
  const lx = getLevelXP();
  document.getElementById('xpProg').textContent = `${state.totalXP - lx.current} / ${lx.next - lx.current} XP`;
  document.getElementById('xpBar').style.width = lx.pct + '%';
  document.getElementById('streakMsg').innerHTML = state.doneCount > 0
    ? `<b>${state.doneCount}</b> quest${state.doneCount === 1 ? '' : 's'} slain — keep going!`
    : 'Complete quests to earn XP and level up!';

  renderCatPicker();
  renderCatFilters('catFilters', false);
  renderCatFilters('catFiltersDone', true);
  renderTaskLists();
  renderAchievements();
  if (pomo.isOpen) renderPomodoro();
}

function renderCatPicker() {
  const sel = document.getElementById('catPick');
  const prev = sel.value;
  sel.innerHTML = state.categories.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');
  if (state.categories.find(c => c.id === prev)) sel.value = prev;
}

function renderCatFilters(elemId, isDoneTab) {
  const wrap = document.getElementById(elemId);
  const tasks = state.tasks.filter(t => isDoneTab ? t.done : !t.done);
  const allCount = tasks.length;
  let html = `<button class="cat-chip${activeFilter==='all'?' active':''}" style="${activeFilter==='all'?'background:var(--surface-2);color:var(--text);border-color:var(--border-strong);':''}" onclick="setFilter('all')">All <span class="count">${allCount}</span></button>`;
  state.categories.forEach(cat => {
    const count = tasks.filter(t => t.category === cat.id).length;
    if (count === 0 && cat.id !== 'general') return;
    const col = getColor(cat.color);
    const isActive = activeFilter === cat.id;
    const style = isActive ? `background:${col.bg};color:${col.fg};border-color:${col.dot};` : ``;
    html += `<button class="cat-chip${isActive?' active':''}" style="${style}" onclick="setFilter('${cat.id}')">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${col.dot};"></span>
      ${escHtml(cat.name)} <span class="count">${count}</span>
    </button>`;
  });
  if (!isDoneTab) html += `<button class="cat-chip-manage" onclick="openCatModal()">⚙ Manage</button>`;
  wrap.innerHTML = html;
}

function renderTaskLists() {
  const filterFn = t => activeFilter === 'all' || t.category === activeFilter;
  const active = state.tasks.filter(t => !t.done && filterFn(t));
  const done   = state.tasks.filter(t =>  t.done && filterFn(t));
  document.getElementById('activeList').innerHTML = active.length === 0
    ? '<div class="empty">No active quests in this view.</div>'
    : active.map(taskHTML).join('');
  document.getElementById('doneList').innerHTML = done.length === 0
    ? '<div class="empty">No completed quests in this view.</div>'
    : done.map(taskHTML).join('');
}

function taskHTML(t) {
  const cls = t.xp === 10 ? 'xp-sm' : t.xp === 25 ? 'xp-md' : t.xp === 50 ? 'xp-lg' : 'xp-xl';
  const cat = getCategory(t.category);
  const col = getColor(cat.color);
  const isExpanded = expandedTaskId === t.id;
  const isTiming = t.timerStartedAt != null;
  const tracked = effTrackedSec(t);
  const timePillHTML = (tracked > 0 || isTiming)
    ? `<span class="time-pill ${isTiming ? 'live' : ''}" data-task-timer-pill="${t.id}">⏱ ${formatDuration(tracked)}</span>`
    : '';
  const descIconHTML = t.desc && t.desc.trim() ? `<span class="desc-icon">📝</span>` : '';
  return `<div class="task-card${t.done ? ' done' : ''}${isExpanded ? ' expanded' : ''}${isTiming ? ' timing' : ''}">
    <div class="task-main" onclick="toggleExpand(event, ${t.id})">
      <button class="check-btn${t.done ? ' done' : ''}" onclick="event.stopPropagation();toggleTask(${t.id})" aria-label="${t.done ? 'Uncheck' : 'Check'}">${t.done ? '✓' : ''}</button>
      <div class="task-body">
        <div class="task-name">${escHtml(t.name)}</div>
        <div class="task-meta">
          <span class="cat-tag" style="background:${col.bg};color:${col.fg};">${escHtml(cat.name)}</span>
          ${timePillHTML}
          ${descIconHTML}
        </div>
      </div>
      <span class="xp-badge ${cls}">+${t.xp} XP</span>
      <span class="expand-arrow">▶</span>
      <button class="del-btn" onclick="event.stopPropagation();deleteTask(${t.id})" aria-label="Delete">✕</button>
    </div>
    ${isExpanded ? detailHTML(t) : ''}
  </div>`;
}

function detailHTML(t) {
  const isTiming = t.timerStartedAt != null;
  const tracked = effTrackedSec(t);
  const isDone = t.done;
  return `<div class="task-detail">
    <textarea class="desc-area" placeholder="Add notes, links, sub-tasks, context..." onchange="updateDesc(${t.id}, this.value)" onclick="event.stopPropagation()">${escHtml(t.desc || '')}</textarea>
    ${!isDone ? `
    <div class="timer-mini" onclick="event.stopPropagation()">
      <div>
        <div class="timer-mini-label">${isTiming ? 'Tracking time...' : 'Time on this task'}</div>
        <div class="timer-mini-display" data-task-timer-display="${t.id}">${formatDuration(tracked)}</div>
      </div>
      <div class="timer-mini-controls">
        ${isTiming
          ? `<button class="timer-btn pause" onclick="pauseTaskTimer(${t.id})">⏸ Pause</button>`
          : `<button class="timer-btn start" onclick="startTaskTimer(${t.id})">▶ Start</button>`
        }
        <button class="timer-btn complete" onclick="completeTaskFromTimer(${t.id})">✓ Complete</button>
      </div>
    </div>` : `
    <div class="timer-mini" onclick="event.stopPropagation()">
      <div>
        <div class="timer-mini-label">Total time logged</div>
        <div class="timer-mini-display">${formatDuration(tracked)}</div>
      </div>
    </div>`}
  </div>`;
}

function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function toggleExpand(event, id) {
  if (event.target.closest('.task-detail')) return;
  expandedTaskId = expandedTaskId === id ? null : id;
  render();
}
function updateDesc(id, value) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  t.desc = value;
  saveState(); render();
}
function setFilter(id) { activeFilter = id; render(); }

function addTask() {
  const inp = document.getElementById('taskInput');
  const name = inp.value.trim();
  if (!name) return;
  const xp = parseInt(document.getElementById('xpPick').value, 10);
  const category = document.getElementById('catPick').value;
  state.tasks.unshift({ id: Date.now(), name, desc: '', xp, done: false, category, trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: Date.now() });
  inp.value = '';
  saveState(); render();
}
function recordHistoryEvent(event) {
  if (!state.history) state.history = [];
  state.history.push(event);
  // keep history bounded — last 1 year is plenty for most users
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  state.history = state.history.filter(e => e.at >= cutoff);
}
function toggleTask(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t) return;
  if (t.timerStartedAt) pauseTaskTimer(id, false);
  const prevLvl = getLevel(state.totalXP);
  t.done = !t.done;
  if (t.done) {
    state.totalXP += t.xp;
    state.doneCount++;
    t.completedAt = Date.now();
    recordHistoryEvent({
      type: 'task_complete',
      at: Date.now(),
      taskId: t.id,
      name: t.name,
      xp: t.xp,
      category: t.category,
      trackedSec: t.trackedSec || 0,
    });
  } else {
    state.totalXP = Math.max(0, state.totalXP - t.xp);
    state.doneCount = Math.max(0, state.doneCount - 1);
    // remove the most recent matching completion event (un-check)
    if (state.history && state.history.length) {
      for (let i = state.history.length - 1; i >= 0; i--) {
        if (state.history[i].type === 'task_complete' && state.history[i].taskId === id) {
          state.history.splice(i, 1);
          break;
        }
      }
    }
    delete t.completedAt;
  }
  const newLvl = getLevel(state.totalXP);
  if (t.done) showToast(`+${t.xp} XP earned!${newLvl > prevLvl ? ' 🎉 Level up! Now level ' + newLvl : ''}`);
  checkAchievements();
  saveState(); render();
}
function completeTaskFromTimer(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t || t.done) return;
  if (t.timerStartedAt) pauseTaskTimer(id, false);
  toggleTask(id);
}
function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (expandedTaskId === id) expandedTaskId = null;
  if (pomo.taskId === id) pomo.taskId = null;
  saveState(); render();
}
function checkAchievements() {
  ACHIEVEMENTS.forEach(a => {
    if (!state.unlockedAchs.includes(a.id) && a.check(state)) {
      state.unlockedAchs.push(a.id);
      showToast(`${a.icon} Achievement: ${a.label}`);
    }
  });
}
function renderAchievements() {
  document.getElementById('achRow').innerHTML = ACHIEVEMENTS.map(a => {
    const unlocked = state.unlockedAchs.includes(a.id);
    return `<div class="ach ${unlocked ? 'unlocked' : 'locked'}">
      <span class="ach-icon">${a.icon}</span>
      <div class="ach-text">
        <div class="ach-label">${a.label}</div>
        <div class="ach-desc">${a.desc}</div>
      </div>
    </div>`;
  }).join('');
}
/* ============================
   STATS DASHBOARD
   ============================ */

function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function shortDayLabel(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Build a daily aggregate from history
function aggregateDaily(days) {
  const today = startOfDay(Date.now());
  const buckets = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayMs = today - i * 24 * 60 * 60 * 1000;
    buckets.push({ ms: dayMs, key: dayKey(dayMs), xp: 0, tasksDone: 0, focusSessions: 0, trackedSec: 0 });
  }
  const map = Object.fromEntries(buckets.map(b => [b.key, b]));
  for (const e of (state.history || [])) {
    const k = dayKey(e.at);
    const b = map[k];
    if (!b) continue;
    if (e.type === 'task_complete') {
      b.xp += e.xp || 0;
      b.tasksDone += 1;
      b.trackedSec += e.trackedSec || 0;
    } else if (e.type === 'pomodoro_complete') {
      b.xp += 15;
      b.focusSessions += 1;
    }
  }
  return buckets;
}

function renderStats() {
  const root = document.getElementById('statsContent');
  const events = state.history || [];

  if (events.length === 0) {
    root.innerHTML = `
      <div class="stats-empty">
        <div class="stats-empty-icon">📊</div>
        <div class="stats-empty-title">No stats yet</div>
        <div class="stats-empty-desc">Complete a few tasks or finish a Pomodoro session and your activity will start showing up here.</div>
      </div>`;
    return;
  }

  root.innerHTML = `
    <div class="stats-section-title">Last 30 days</div>
    <div class="stats-card" id="statsXPChart"></div>

    <div class="stats-section-title">Activity heatmap (last 12 weeks)</div>
    <div class="stats-card" id="statsHeatmap"></div>

    <div class="stats-section-title">Time by category</div>
    <div class="stats-card" id="statsDonut"></div>

    <div class="stats-section-title">Records</div>
    <div class="stats-records" id="statsRecords"></div>
  `;

  renderXPChart();
  renderHeatmap();
  renderDonut();
  renderRecords();
}

/* --- Daily XP chart (last 30 days) --- */
function renderXPChart() {
  const root = document.getElementById('statsXPChart');
  const days = aggregateDaily(30);
  const maxXP = Math.max(1, ...days.map(d => d.xp));
  const maxMin = Math.max(1, ...days.map(d => Math.round(d.trackedSec / 60)));

  const W = 700, H = 240, P = { l: 40, r: 44, t: 16, b: 28 };
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;
  const barW = innerW / days.length;

  const totalXP = days.reduce((a, b) => a + b.xp, 0);
  const totalMin = Math.round(days.reduce((a, b) => a + b.trackedSec, 0) / 60);
  const best = days.reduce((a, b) => b.xp > a.xp ? b : a);
  const avgXP = Math.round(totalXP / days.length);

  // Left axis (XP) — 4 ticks
  const niceMaxXP = niceCeil(maxXP);
  const xpTicks = [0, niceMaxXP * 0.25, niceMaxXP * 0.5, niceMaxXP * 0.75, niceMaxXP].map(v => Math.round(v));

  // Right axis (minutes) — own nice ceil
  const niceMaxMin = niceCeil(maxMin);
  const minTicks = [0, niceMaxMin * 0.25, niceMaxMin * 0.5, niceMaxMin * 0.75, niceMaxMin].map(v => Math.round(v));

  let yAxisLeft = '';
  xpTicks.forEach((v, i) => {
    const y = P.t + innerH - (v / niceMaxXP) * innerH;
    yAxisLeft += `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="2 3" />`;
    yAxisLeft += `<text x="${P.l - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--text-subtle)">${v}</text>`;
  });

  // Right axis labels (minutes) — no extra grid lines, just text
  let yAxisRight = '';
  minTicks.forEach(v => {
    const y = P.t + innerH - (v / niceMaxMin) * innerH;
    yAxisRight += `<text x="${W - P.r + 6}" y="${y + 3}" text-anchor="start" font-size="10" fill="var(--text-subtle)">${v}m</text>`;
  });

  // Axis labels
  yAxisLeft += `<text x="${P.l - 6}" y="${P.t - 4}" text-anchor="end" font-size="9" fill="var(--text-subtle)" font-weight="500">XP</text>`;
  yAxisRight += `<text x="${W - P.r + 6}" y="${P.t - 4}" text-anchor="start" font-size="9" fill="var(--teal)" font-weight="500">MIN</text>`;

  // Bars (XP)
  let bars = '';
  days.forEach((d, i) => {
    const x = P.l + i * barW + 1;
    const w = barW - 2;
    const h = (d.xp / niceMaxXP) * innerH;
    const y = P.t + innerH - h;
    const isToday = i === days.length - 1;
    bars += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${isToday ? 'var(--accent-strong)' : 'var(--accent)'}" rx="2" opacity="${d.xp > 0 ? 1 : 0.15}">
      <title>${shortDayLabel(d.ms)}: ${d.xp} XP, ${d.tasksDone} tasks, ${Math.round(d.trackedSec / 60)} min tracked</title>
    </rect>`;
  });

  // Line + dots (Minutes)
  const linePoints = days.map((d, i) => {
    const x = P.l + i * barW + barW / 2;
    const mins = Math.round(d.trackedSec / 60);
    const y = P.t + innerH - (mins / niceMaxMin) * innerH;
    return { x, y, mins, ms: d.ms };
  });
  let linePath = '';
  if (linePoints.length > 0 && totalMin > 0) {
    linePath = 'M ' + linePoints.map(p => `${p.x} ${p.y}`).join(' L ');
  }
  let lineSvg = '';
  if (linePath) {
    lineSvg += `<path d="${linePath}" stroke="var(--teal)" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round" />`;
    linePoints.forEach(p => {
      if (p.mins > 0) {
        lineSvg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--teal)" stroke="var(--surface)" stroke-width="1.5">
          <title>${shortDayLabel(p.ms)}: ${p.mins} min tracked</title>
        </circle>`;
      }
    });
  }

  // X axis labels (every 5 days)
  let xLabels = '';
  days.forEach((d, i) => {
    if (i % 5 !== 0 && i !== days.length - 1) return;
    const x = P.l + i * barW + barW / 2;
    xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10" fill="var(--text-subtle)">${shortDayLabel(d.ms)}</text>`;
  });

  root.innerHTML = `
    <div class="stats-summary-row">
      <div class="stats-summary-item"><div class="stats-summary-num">${totalXP}</div><div class="stats-summary-lbl">Total XP</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${avgXP}</div><div class="stats-summary-lbl">Daily avg XP</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${formatDuration(totalMin * 60)}</div><div class="stats-summary-lbl">Total tracked</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${best.xp}</div><div class="stats-summary-lbl">Best day (${shortDayLabel(best.ms)})</div></div>
    </div>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--accent)"></span>XP earned</span>
      <span class="legend-item"><span class="legend-swatch line" style="background:var(--teal)"></span>Minutes tracked</span>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="stats-svg">
      ${yAxisLeft}
      ${yAxisRight}
      ${bars}
      ${lineSvg}
      ${xLabels}
    </svg>
  `;
}

function niceCeil(n) {
  if (n <= 10) return 10;
  if (n <= 25) return 25;
  if (n <= 50) return 50;
  if (n <= 100) return 100;
  if (n <= 250) return 250;
  if (n <= 500) return 500;
  if (n <= 1000) return 1000;
  return Math.ceil(n / 500) * 500;
}

/* --- Activity heatmap (last 12 weeks, GitHub style) --- */
function renderHeatmap() {
  const root = document.getElementById('statsHeatmap');
  const weeks = 12;
  const totalDays = weeks * 7;
  const today = startOfDay(Date.now());
  // Align to start on Monday: find offset
  const todayDow = new Date(today).getDay(); // 0=Sun, 1=Mon...
  const daysSinceMon = (todayDow + 6) % 7; // Mon-aligned
  // We want grid: 7 rows (M-Sun) x weeks columns
  const startMs = today - (daysSinceMon + (weeks - 1) * 7) * 24 * 60 * 60 * 1000;

  const map = {};
  for (const e of (state.history || [])) {
    const k = dayKey(e.at);
    map[k] = map[k] || 0;
    if (e.type === 'task_complete') map[k] += e.xp || 0;
    if (e.type === 'pomodoro_complete') map[k] += 15;
  }

  const cell = 9, gap = 2;
  const W = weeks * (cell + gap) + 24;
  const H = 7 * (cell + gap) + 18;
  let cells = '';
  let totalActiveDays = 0;
  let maxXP = 0;
  for (const k of Object.keys(map)) maxXP = Math.max(maxXP, map[k]);

  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const dayMs = startMs + (w * 7 + d) * 24 * 60 * 60 * 1000;
      if (dayMs > today) continue;
      const k = dayKey(dayMs);
      const xp = map[k] || 0;
      if (xp > 0) totalActiveDays++;
      const intensity = maxXP === 0 ? 0 : xp / maxXP;
      const lvl = xp === 0 ? 0 : intensity > 0.75 ? 4 : intensity > 0.5 ? 3 : intensity > 0.25 ? 2 : 1;
      const color = ['var(--surface-2)', '#cee0c4', '#9ec88a', '#6ba948', '#3b6d11'][lvl];
      const x = 24 + w * (cell + gap);
      const y = 8 + d * (cell + gap);
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="1.5" fill="${color}"><title>${shortDayLabel(dayMs)}: ${xp} XP</title></rect>`;
    }
  }
  // Day-of-week labels (Mon, Wed, Fri)
  const dowLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
  let labels = '';
  dowLabels.forEach((l, i) => {
    if (!l) return;
    const y = 8 + i * (cell + gap) + cell - 1;
    labels += `<text x="0" y="${y}" font-size="8" fill="var(--text-subtle)">${l}</text>`;
  });

  // Streak: count consecutive days ending today with xp > 0
  let streak = 0;
  for (let i = 0; ; i++) {
    const k = dayKey(today - i * 24 * 60 * 60 * 1000);
    if ((map[k] || 0) > 0) streak++;
    else break;
  }

  root.innerHTML = `
    <div class="stats-summary-row">
      <div class="stats-summary-item"><div class="stats-summary-num">${streak}🔥</div><div class="stats-summary-lbl">Current streak</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${totalActiveDays}</div><div class="stats-summary-lbl">Active days</div></div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="stats-svg">
      ${labels}
      ${cells}
    </svg>
    <div class="heatmap-legend">
      Less
      <span class="hm-sq" style="background:var(--surface-2)"></span>
      <span class="hm-sq" style="background:#cee0c4"></span>
      <span class="hm-sq" style="background:#9ec88a"></span>
      <span class="hm-sq" style="background:#6ba948"></span>
      <span class="hm-sq" style="background:#3b6d11"></span>
      More
    </div>
  `;
}

/* --- Time-by-category donut --- */
function renderDonut() {
  const root = document.getElementById('statsDonut');
  // Aggregate from completion events (preserves deleted tasks) + add live tracked time on still-existing active tasks
  const totals = {}; // catId -> seconds
  for (const e of (state.history || [])) {
    if (e.type !== 'task_complete') continue;
    if (!e.trackedSec || e.trackedSec <= 0) continue;
    totals[e.category] = (totals[e.category] || 0) + e.trackedSec;
  }
  // include time on currently-incomplete tasks (history doesn't have these yet)
  for (const t of state.tasks) {
    if (t.done) continue;
    const sec = effTrackedSec(t);
    if (sec > 0) totals[t.category] = (totals[t.category] || 0) + sec;
  }

  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  if (total === 0) {
    root.innerHTML = `<div class="stats-empty-mini">No time tracked yet. Start a task timer to see this chart.</div>`;
    return;
  }

  const cx = 100, cy = 100, r = 80, sw = 28;
  let segs = '';
  let legend = '';
  let angleStart = -Math.PI / 2;
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  entries.forEach(([catId, sec]) => {
    const cat = getCategory(catId);
    const col = getColor(cat ? cat.color : 'gray');
    const portion = sec / total;
    const angleEnd = angleStart + portion * Math.PI * 2;
    const x1 = cx + r * Math.cos(angleStart);
    const y1 = cy + r * Math.sin(angleStart);
    const x2 = cx + r * Math.cos(angleEnd);
    const y2 = cy + r * Math.sin(angleEnd);
    const large = portion > 0.5 ? 1 : 0;
    segs += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}" stroke="${col.dot}" stroke-width="${sw}" fill="none">
      <title>${cat ? cat.name : catId}: ${formatDuration(sec)} (${Math.round(portion * 100)}%)</title>
    </path>`;
    legend += `<div class="donut-legend-row">
      <span class="donut-legend-dot" style="background:${col.dot}"></span>
      <span class="donut-legend-name">${cat ? cat.name : catId}</span>
      <span class="donut-legend-val">${formatDuration(sec)} <span style="color:var(--text-subtle)">(${Math.round(portion * 100)}%)</span></span>
    </div>`;
    angleStart = angleEnd;
  });

  root.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 200 200" class="donut-svg">
        ${segs}
        <text x="100" y="96" text-anchor="middle" font-size="13" fill="var(--text-subtle)">Total</text>
        <text x="100" y="115" text-anchor="middle" font-size="18" font-weight="500" fill="var(--text)">${formatDuration(total)}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>
  `;
}

/* --- Records cards --- */
function renderRecords() {
  const root = document.getElementById('statsRecords');
  const events = state.history || [];
  const completionEvents = events.filter(e => e.type === 'task_complete');
  const pomoEvents = events.filter(e => e.type === 'pomodoro_complete');

  // Best day (most XP)
  const dayXP = {};
  events.forEach(e => {
    const k = dayKey(e.at);
    dayXP[k] = (dayXP[k] || 0) + (e.type === 'task_complete' ? (e.xp || 0) : 15);
  });
  const bestDayEntry = Object.entries(dayXP).sort((a, b) => b[1] - a[1])[0];
  const bestDayLabel = bestDayEntry ? new Date(bestDayEntry[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  const bestDayVal = bestDayEntry ? bestDayEntry[1] : 0;

  // Best week (rolling 7-day window)
  let bestWeek = 0;
  for (let i = 0; i < 365; i++) {
    const end = startOfDay(Date.now()) - i * 24 * 60 * 60 * 1000;
    let sum = 0;
    for (let j = 0; j < 7; j++) {
      const k = dayKey(end - j * 24 * 60 * 60 * 1000);
      sum += dayXP[k] || 0;
    }
    if (sum > bestWeek) bestWeek = sum;
  }

  // Longest task time (single task)
  const taskTimes = {};
  state.tasks.forEach(t => { if (t.trackedSec) taskTimes[t.id] = (taskTimes[t.id] || 0) + t.trackedSec; });
  completionEvents.forEach(e => { if (e.trackedSec) taskTimes[e.taskId] = Math.max(taskTimes[e.taskId] || 0, e.trackedSec); });
  const longestTaskSec = Math.max(0, ...Object.values(taskTimes));

  // Total focus time
  const totalFocusMins = pomoEvents.reduce((a, e) => a + (e.durationMins || 25), 0);

  const records = [
    { icon: '🏆', label: 'Best day', value: `${bestDayVal} XP`, sub: bestDayLabel },
    { icon: '📅', label: 'Best week', value: `${bestWeek} XP`, sub: 'rolling 7-day' },
    { icon: '✅', label: 'Tasks completed', value: completionEvents.length, sub: 'all-time (last 365d)' },
    { icon: '🍅', label: 'Pomodoros', value: pomoEvents.length, sub: `${totalFocusMins}m focus time` },
    { icon: '⏱', label: 'Longest task time', value: formatDuration(longestTaskSec), sub: 'single task' },
    { icon: '⭐', label: 'Total XP', value: state.totalXP, sub: `Level ${getLevel(state.totalXP)}` },
  ];

  root.innerHTML = records.map(r => `
    <div class="record-card">
      <div class="record-icon">${r.icon}</div>
      <div class="record-text">
        <div class="record-value">${r.value}</div>
        <div class="record-label">${r.label}</div>
        <div class="record-sub">${r.sub}</div>
      </div>
    </div>
  `).join('');
}


function setTab(tab, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['active', 'done', 'stats', 'achievements'].forEach(p => {
    document.getElementById('panel' + p.charAt(0).toUpperCase() + p.slice(1)).style.display = p === tab ? '' : 'none';
  });
  if (tab === 'stats') renderStats();
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

/* Categories modal */
function openCatModal() { renderCatEditList(); document.getElementById('catModal').classList.add('show'); }
function closeCatModal() { document.getElementById('catModal').classList.remove('show'); }
function renderCatEditList() {
  const list = document.getElementById('catEditList');
  list.innerHTML = state.categories.map(cat => {
    const swatches = COLOR_PALETTE.map(c => `
      <span class="swatch" style="background:${c.dot};${c.id===cat.color?'border-color:var(--text);border-width:2.5px':''}" onclick="setCatColor('${cat.id}','${c.id}')" title="${c.id}"></span>
    `).join('');
    const canDelete = cat.id !== 'general';
    return `<div class="cat-row">
      <div class="swatch-picker">${swatches}</div>
      <input type="text" value="${escHtml(cat.name)}" maxlength="20" onchange="renameCategory('${cat.id}', this.value)" />
      ${canDelete ? `<button class="del-btn" onclick="deleteCategory('${cat.id}')" style="opacity:0.7;">✕</button>` : ''}
    </div>`;
  }).join('');
}
function addCategory() {
  const inp = document.getElementById('newCatName');
  const name = inp.value.trim();
  if (!name) return;
  const id = 'c_' + Date.now();
  const used = new Set(state.categories.map(c => c.color));
  const color = (COLOR_PALETTE.find(c => !used.has(c.id)) || COLOR_PALETTE[0]).id;
  state.categories.push({ id, name, color });
  inp.value = '';
  saveState(); renderCatEditList(); render();
}
function renameCategory(id, name) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  cat.name = name.trim() || cat.name;
  saveState(); render();
}
function setCatColor(id, color) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  cat.color = color;
  saveState(); renderCatEditList(); render();
}
function deleteCategory(id) {
  if (id === 'general') return;
  if (!confirm('Delete this category? Its tasks will move to General.')) return;
  state.categories = state.categories.filter(c => c.id !== id);
  state.tasks.forEach(t => { if (t.category === id) t.category = 'general'; });
  if (activeFilter === id) activeFilter = 'all';
  saveState(); renderCatEditList(); render();
}

function resetAll() {
  if (!confirm('This will erase all your tasks, XP, achievements, and categories. Continue?')) return;
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  state = defaultState();
  activeFilter = 'all';
  expandedTaskId = null;
  render();
}

window.addEventListener('beforeunload', () => {
  const t = getCurrentTimerTask();
  if (t) {
    const elapsed = Math.floor((Date.now() - t.timerStartedAt) / 1000);
    t.trackedSec = (t.trackedSec || 0) + elapsed;
    t.timerStartedAt = null;
    awardTimeXP(t);
    saveState();
  }
});

// ESC closes the pomodoro overlay
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && pomo.isOpen) closePomodoro();
});

render();
