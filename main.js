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
  markDirty('category', id);
}
function renameCategory(id, name) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  cat.name = name.trim() || cat.name;
  saveState(); render();
  markDirty('category', id);
}
function setCatColor(id, color) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;
  cat.color = color;
  saveState(); renderCatEditList(); render();
  markDirty('category', id);
}
function deleteCategory(id) {
  if (id === 'general') return;
  if (!confirm('Delete this category? Its tasks will move to General.')) return;
  state.categories = state.categories.filter(c => c.id !== id);
  // Any task that was in this category needs its row updated too
  const reassignedTaskIds = [];
  state.tasks.forEach(t => { if (t.category === id) { t.category = 'general'; reassignedTaskIds.push(t.id); } });
  if (activeFilter === id) activeFilter = 'all';
  saveState(); renderCatEditList(); render();
  markDirty('category-deleted', id);
  reassignedTaskIds.forEach(tid => markDirty('task', tid));
}

function resetAll() {
  if (!confirm('This will erase all your tasks, XP, achievements, and categories. Continue?')) return;
  localStorage.removeItem(STORAGE_KEY);
  LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem(DIRTY_KEY);
  // Clear in-memory dirty queue too
  autoSync.dirty.tasks.clear();
  autoSync.dirty.deletedTasks.clear();
  autoSync.dirty.categories.clear();
  autoSync.dirty.deletedCategories.clear();
  autoSync.dirty.profile = false;
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
checkDailyReset();
initAuth();
loadDirtyQueue();

// Catch a calendar-day rollover while the app stays open (long-lived tab) or
// when the user returns to it after it's been backgrounded past midnight.
setInterval(checkDailyReset, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDailyReset();
});
// If we already have an active session on load, give it a beat then try to push any dirty items
// and pull latest cloud state. We wait so initAuth can populate auth.currentUser.
setTimeout(() => {
  if (auth.currentUser) {
    if (!dirtyQueueIsEmpty()) scheduleFlush();
    else maybeAutoPullOnLoad();
  }
}, 1500);
