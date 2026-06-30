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

  const revived = reviveRecurringTasks(); // auto-revive due recurring quests

  saveState();
  render();

  // One nudge per rollover: announce revived quests, else protect the streak.
  if (revived > 0) {
    showToast(`🔁 ${revived} recurring quest${revived === 1 ? '' : 's'} renewed`);
  } else if (!wasFirstRun && streakBefore > 0) {
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
  const subs = t.subtasks || [];
  const subDone = subs.filter(s => s.done).length;
  const subPillHTML = subs.length
    ? `<span class="sub-pill${subDone === subs.length ? ' complete' : ''}">☑ ${subDone}/${subs.length}</span>`
    : '';
  const recurPillHTML = t.recurrence ? `<span class="recur-pill">🔁 ${recurrenceLabel(t.recurrence)}</span>` : '';
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
          ${subPillHTML}
          ${recurPillHTML}
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
    ${recurrenceHTML(t)}
    ${subtasksHTML(t)}
    <textarea class="desc-area" placeholder="Add notes, links, context..." onchange="updateDesc(${t.id}, this.value)" onclick="event.stopPropagation()">${escHtml(t.desc || '')}</textarea>
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

// Recurring quests: a `recurrence` of 'daily' | 'weekdays' | 'weekly' makes a
// completed task auto-revive (become active again) when a new period begins.
// Reviving keeps the XP/history already earned — each period's completion pays
// out — it just resets the task's done state. See reviveRecurringTasks().
const RECURRENCE_LABELS = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly' };
function recurrenceLabel(r) { return RECURRENCE_LABELS[r] || ''; }

function recurrenceHTML(t) {
  const r = t.recurrence || '';
  const opt = (v, label) => `<option value="${v}"${r === v ? ' selected' : ''}>${label}</option>`;
  return `<div class="recur-row" onclick="event.stopPropagation()">
    <span class="recur-label">🔁 Repeat</span>
    <select class="recur-select" onchange="setRecurrence(${t.id}, this.value)">
      ${opt('', 'Does not repeat')}
      ${opt('daily', 'Daily')}
      ${opt('weekdays', 'Weekdays (Mon–Fri)')}
      ${opt('weekly', 'Weekly')}
    </select>
  </div>`;
}

// Checklist for breaking an epic quest into smaller steps. Subtasks are a
// simple { id, name, done } list on the task — no XP of their own; finishing
// the parent quest is what pays out. Shown inside the expanded task detail.
function subtasksHTML(t) {
  const subs = t.subtasks || [];
  const doneN = subs.filter(s => s.done).length;
  const pct = subs.length ? Math.round((doneN / subs.length) * 100) : 0;
  const rows = subs.map(s => `
    <li class="subtask-row${s.done ? ' done' : ''}">
      <button class="subtask-check${s.done ? ' done' : ''}" onclick="event.stopPropagation();toggleSubtask(${t.id}, ${s.id})" aria-label="${s.done ? 'Uncheck subtask' : 'Check subtask'}">${s.done ? '✓' : ''}</button>
      <span class="subtask-name">${escHtml(s.name)}</span>
      <button class="subtask-del" onclick="event.stopPropagation();deleteSubtask(${t.id}, ${s.id})" aria-label="Delete subtask">✕</button>
    </li>`).join('');
  return `<div class="subtasks" onclick="event.stopPropagation()">
    <div class="subtasks-head">
      <span class="subtasks-label">Subtasks</span>
      ${subs.length ? `<span class="subtasks-progress">${doneN}/${subs.length} done</span>` : ''}
    </div>
    ${subs.length ? `<div class="subtask-bar"><div class="subtask-bar-fill" style="width:${pct}%"></div></div>` : ''}
    ${rows ? `<ul class="subtask-list">${rows}</ul>` : ''}
    <div class="subtask-add">
      <input type="text" class="subtask-input" data-subtask-input="${t.id}" placeholder="Add a subtask..." maxlength="120"
        onkeydown="if(event.key==='Enter'){event.preventDefault();addSubtask(${t.id}, this.value);}" onclick="event.stopPropagation()" />
      <button class="subtask-add-btn" onclick="event.stopPropagation();addSubtaskFromBtn(${t.id})">+ Add</button>
    </div>
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
/* ----- Subtasks (checklist inside a task) ----- */
function addSubtaskFromBtn(taskId) {
  const inp = document.querySelector(`[data-subtask-input="${taskId}"]`);
  if (inp) addSubtask(taskId, inp.value);
}
function addSubtask(taskId, rawName) {
  const name = (rawName || '').trim();
  if (!name) return;
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return;
  if (!Array.isArray(t.subtasks)) t.subtasks = [];
  let sid = Date.now();
  while (t.subtasks.some(s => s.id === sid)) sid++; // avoid collisions on rapid adds
  t.subtasks.push({ id: sid, name, done: false });
  saveState(); render();
  markDirty('task', taskId);
  // Re-render replaced the input; refocus it so the user can keep adding.
  const inp = document.querySelector(`[data-subtask-input="${taskId}"]`);
  if (inp) inp.focus();
}
function toggleSubtask(taskId, subId) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t || !Array.isArray(t.subtasks)) return;
  const s = t.subtasks.find(s => s.id === subId);
  if (!s) return;
  s.done = !s.done;
  saveState(); render();
  markDirty('task', taskId);
}
function deleteSubtask(taskId, subId) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t || !Array.isArray(t.subtasks)) return;
  t.subtasks = t.subtasks.filter(s => s.id !== subId);
  saveState(); render();
  markDirty('task', taskId);
}

/* ----- Recurring quests ----- */
// True when a done recurring task's last completion is in an earlier period
// than `now`, so it's due to come back. Missing completedAt = stale, revive.
function recurrenceShouldRevive(t, now) {
  if (!t.recurrence || !t.done) return false;
  if (!t.completedAt) return true;
  if (t.recurrence === 'weekly') return weekKey(t.completedAt) !== weekKey(now);
  if (t.recurrence === 'weekdays') {
    const dow = new Date(now).getDay(); // 0 Sun ... 6 Sat
    const isWeekday = dow >= 1 && dow <= 5;
    return isWeekday && dayKey(t.completedAt) !== dayKey(now);
  }
  return dayKey(t.completedAt) !== dayKey(now); // daily
}
// Bring due recurring tasks back to active for the new period. Does NOT touch
// totalXP/doneCount/history — the past completion stays earned and recorded;
// we only reset done/completedAt and uncheck subtasks. Returns the count.
function reviveRecurringTasks(now = Date.now()) {
  let revived = 0;
  state.tasks.forEach(t => {
    if (!recurrenceShouldRevive(t, now)) return;
    t.done = false;
    delete t.completedAt;
    if (Array.isArray(t.subtasks)) t.subtasks.forEach(s => { s.done = false; });
    markDirty('task', t.id);
    revived++;
  });
  return revived;
}
function setRecurrence(taskId, value) {
  const t = state.tasks.find(t => t.id === taskId);
  if (!t) return;
  t.recurrence = value || null; // '' (does not repeat) -> null
  markDirty('task', taskId);
  // If it's already complete from a previous period, bring it back immediately.
  reviveRecurringTasks();
  saveState(); render();
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
  const newTask = { id: Date.now(), name, desc: '', xp, done: false, category, trackedSec: 0, timerStartedAt: null, xpFromTime: 0, createdAt: Date.now(), order: minOrder - 1, subtasks: [], recurrence: null };
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
