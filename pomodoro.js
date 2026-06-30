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
  markDirty('profile');
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
    markDirty('profile');
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
  markDirty('profile');
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

