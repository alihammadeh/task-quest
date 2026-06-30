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
  renderStreak();

  renderCatPicker();
  renderCatFilters('catFilters', false);
  renderCatFilters('catFiltersDone', true);
  renderTaskLists();
  renderAchievements();
  if (pomo.isOpen) renderPomodoro();
}

// Updates the header streak pill and the message under the XP bar.
function renderStreak() {
  const { count, activeToday } = computeStreak();

  const pill = document.getElementById('streakPill');
  if (pill) {
    if (count > 0) {
      pill.style.display = '';
      pill.style.opacity = activeToday ? '1' : '0.55';
      pill.title = activeToday
        ? 'Active today — streak secured 🔥'
        : 'Complete a quest today to keep your streak alive';
      document.getElementById('streakCount').textContent = count;
    } else {
      pill.style.display = 'none';
    }
  }

  const msg = document.getElementById('streakMsg');
  if (!msg) return;
  if (count > 0 && !activeToday) {
    msg.innerHTML = `🔥 <b>${count}-day streak</b> at risk — complete a quest today to keep it alive!`;
  } else if (count > 0) {
    msg.innerHTML = `🔥 <b>${count}-day streak</b> — keep it going!`;
  } else {
    msg.innerHTML = state.doneCount > 0
      ? `<b>${state.doneCount}</b> quest${state.doneCount === 1 ? '' : 's'} slain — start a new streak today!`
      : 'Complete quests to earn XP and level up!';
  }
}

// Detects a calendar-day rollover (on load and while the app stays open).
// This is the hook recurring quests will later extend to auto-revive tasks.
function checkDailyReset() {
  const todayKey = dayKey(Date.now());
  if (state.lastActiveDay === todayKey) return;

  const wasFirstRun = state.lastActiveDay == null;
  const streakBefore = computeStreak().count;
  state.lastActiveDay = todayKey; // device-local only; not part of the synced profile
  saveState();
  render();

  // Nudge the user to protect an existing streak when a fresh day begins.
  if (!wasFirstRun && streakBefore > 0) {
    showToast(`🔥 ${streakBefore}-day streak — complete a quest today to keep it!`);
  }
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
  const byOrder = (a, b) => a.order - b.order;
  const active = state.tasks.filter(t => !t.done && filterFn(t)).sort(byOrder);
  const done   = state.tasks.filter(t =>  t.done && filterFn(t)).sort(byOrder);
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
  // Cards are draggable only when collapsed, so dragging never fights with
  // selecting text in the expanded notes textarea.
  const dragAttrs = isExpanded ? '' : ` draggable="true"`
    + ` ondragstart="onTaskDragStart(event, ${t.id})" ondragover="onTaskDragOver(event, ${t.id})"`
    + ` ondragleave="onTaskDragLeave(event)" ondrop="onTaskDrop(event, ${t.id})" ondragend="onTaskDragEnd()"`;
  return `<div class="task-card${t.done ? ' done' : ''}${isExpanded ? ' expanded' : ''}${isTiming ? ' timing' : ''}"${dragAttrs}>
    <div class="task-main" onclick="toggleExpand(event, ${t.id})">
      <span class="drag-grip" title="Drag to reorder" onclick="event.stopPropagation()" aria-hidden="true">⠿</span>
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
  markDirty('task', id);
}
function setFilter(id) { activeFilter = id; render(); }

/* ----- Drag to reorder -----
   Each task carries a numeric `order`; the lists render sorted by it. On drop
   we set the dragged task's order to the midpoint between its new neighbors,
   so only that one task changes (and only it gets marked dirty for sync). */
let dragTaskId = null;

function onTaskDragStart(event, id) {
  dragTaskId = id;
  event.dataTransfer.effectAllowed = 'move';
  try { event.dataTransfer.setData('text/plain', String(id)); } catch (_) {}
  event.currentTarget.classList.add('dragging');
}
function dropIsBefore(event) {
  const r = event.currentTarget.getBoundingClientRect();
  return (event.clientY - r.top) < r.height / 2;
}
function onTaskDragOver(event, overId) {
  if (dragTaskId == null || dragTaskId === overId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const card = event.currentTarget;
  const before = dropIsBefore(event);
  card.classList.toggle('drop-before', before);
  card.classList.toggle('drop-after', !before);
}
function onTaskDragLeave(event) {
  event.currentTarget.classList.remove('drop-before', 'drop-after');
}
function onTaskDrop(event, overId) {
  event.preventDefault();
  const before = dropIsBefore(event);
  event.currentTarget.classList.remove('drop-before', 'drop-after');
  if (dragTaskId != null && dragTaskId !== overId) reorderTask(dragTaskId, overId, before);
  dragTaskId = null;
}
function onTaskDragEnd() {
  dragTaskId = null;
  document.querySelectorAll('.dragging, .drop-before, .drop-after')
    .forEach(el => el.classList.remove('dragging', 'drop-before', 'drop-after'));
}

function reorderTask(draggedId, targetId, before) {
  const dragged = state.tasks.find(t => t.id === draggedId);
  const target = state.tasks.find(t => t.id === targetId);
  if (!dragged || !target) return;
  // Siblings = what the user currently sees in the same list (done-state +
  // active filter), in display order, excluding the dragged card itself.
  const siblings = state.tasks
    .filter(t => t.done === target.done && (activeFilter === 'all' || t.category === activeFilter) && t.id !== draggedId)
    .sort((a, b) => a.order - b.order);
  const idx = siblings.findIndex(t => t.id === targetId);
  let lo, hi;
  if (before) {
    lo = idx > 0 ? siblings[idx - 1].order : target.order - 2;
    hi = target.order;
  } else {
    lo = target.order;
    hi = idx < siblings.length - 1 ? siblings[idx + 1].order : target.order + 2;
  }
  dragged.order = (lo + hi) / 2;
  saveState(); render();
  markDirty('task', dragged.id);
}

function addTask() {
  const inp = document.getElementById('taskInput');
  const name = inp.value.trim();
  if (!name) return;
  const xp = parseInt(document.getElementById('xpPick').value, 10);
  const category = document.getElementById('catPick').value;
  // New quests land at the top of the list (smallest order).
  const minOrder = state.tasks.length ? Math.min(...state.tasks.map(t => t.order)) : 0;
  const newTask = { id: Date.now(), name, desc: '', xp, done: false, category, trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: Date.now(), order: minOrder - 1 };
  state.tasks.unshift(newTask);
  inp.value = '';
  saveState(); render();
  markDirty('task', newTask.id);
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
  markDirty('task', t.id);
  markDirty('profile');
}
function completeTaskFromTimer(id) {
  const t = state.tasks.find(t => t.id === id);
  if (!t || t.done) return;
  if (t.timerStartedAt) pauseTaskTimer(id, false);
  toggleTask(id);
}
function deleteTask(id) {
  const existed = state.tasks.some(t => t.id === id);
  state.tasks = state.tasks.filter(t => t.id !== id);
  if (expandedTaskId === id) expandedTaskId = null;
  if (pomo.taskId === id) pomo.taskId = null;
  saveState(); render();
  if (existed) markDirty('task-deleted', id);
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
