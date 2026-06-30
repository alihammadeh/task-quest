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
// A stable per-week key: the dayKey of that week's Monday. Handles year
// boundaries for free and is used to detect weekly-recurrence rollovers.
function weekKey(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const offset = (d.getDay() + 6) % 7; // days since Monday (Mon=0 ... Sun=6)
  d.setDate(d.getDate() - offset);
  return dayKey(d.getTime());
}
function shortDayLabel(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Set of day-keys that had XP-earning activity (task completion or pomodoro).
function activeDayKeySet(s = state) {
  const set = new Set();
  for (const e of (s.history || [])) {
    if (e.type === 'task_complete' || e.type === 'pomodoro_complete') set.add(dayKey(e.at));
  }
  return set;
}
// Consecutive active days ending today, or ending yesterday if today isn't
// active yet (the streak is still alive but "at risk" until you act today).
// Returns { count, activeToday }.
function computeStreak(s = state) {
  const set = activeDayKeySet(s);
  const DAY = 24 * 60 * 60 * 1000;
  const today = startOfDay(Date.now());
  const activeToday = set.has(dayKey(today));
  const anchor = activeToday ? today : today - DAY;
  if (!set.has(dayKey(anchor))) return { count: 0, activeToday: false };
  let count = 0;
  while (set.has(dayKey(anchor - count * DAY))) count++;
  return { count, activeToday };
}
// Longest consecutive-active-day run anywhere in history.
function longestStreak(s = state) {
  const keys = [...activeDayKeySet(s)].sort();
  const DAY = 24 * 60 * 60 * 1000;
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const ms = startOfDay(new Date(k + 'T00:00:00').getTime());
    run = (prev !== null && ms - prev === DAY) ? run + 1 : 1;
    prev = ms;
    if (run > best) best = run;
  }
  return best;
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
        <div class="stats-empty-icon"><svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="var(--text-subtle)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20.5h18"/><rect x="5" y="11" width="3.4" height="7.5" rx="1"/><rect x="10.3" y="7" width="3.4" height="11.5" rx="1"/><rect x="15.6" y="13.5" width="3.4" height="5" rx="1"/></svg></div>
        <div class="stats-empty-title">Nothing to show yet</div>
        <div class="stats-empty-desc">Finish a few tasks or a focus session, and your activity will start showing up here.</div>
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

    <div class="stats-section-title">Highlights</div>
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
  yAxisLeft += `<text x="${P.l - 6}" y="${P.t - 4}" text-anchor="end" font-size="9" fill="var(--text-subtle)" font-weight="500">PTS</text>`;
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
      <title>${shortDayLabel(d.ms)}: ${d.xp} pts, ${d.tasksDone} tasks, ${Math.round(d.trackedSec / 60)} min tracked</title>
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
      <div class="stats-summary-item"><div class="stats-summary-num">${totalXP}</div><div class="stats-summary-lbl">Total points</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${avgXP}</div><div class="stats-summary-lbl">Daily average</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${formatDuration(totalMin * 60)}</div><div class="stats-summary-lbl">Total tracked</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${best.xp}</div><div class="stats-summary-lbl">Best day (${shortDayLabel(best.ms)})</div></div>
    </div>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-swatch" style="background:var(--accent)"></span>Points</span>
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
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="1.5" fill="${color}"><title>${shortDayLabel(dayMs)}: ${xp} pts</title></rect>`;
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

  // Streak: consecutive active days (shared with the header pill).
  const streak = computeStreak().count;

  root.innerHTML = `
    <div class="stats-summary-row">
      <div class="stats-summary-item"><div class="stats-summary-num">${streak}</div><div class="stats-summary-lbl">Current streak</div></div>
      <div class="stats-summary-item"><div class="stats-summary-num">${longestStreak()}</div><div class="stats-summary-lbl">Longest streak</div></div>
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
    { label: 'Best day', value: `${bestDayVal} pts`, sub: bestDayLabel },
    { label: 'Best week', value: `${bestWeek} pts`, sub: 'rolling 7-day' },
    { label: 'Tasks finished', value: completionEvents.length, sub: 'all-time (last 365d)' },
    { label: 'Focus sessions', value: pomoEvents.length, sub: `${totalFocusMins}m of focus` },
    { label: 'Longest task time', value: formatDuration(longestTaskSec), sub: 'single task' },
    { label: 'Total points', value: state.totalXP, sub: 'all time' },
  ];

  root.innerHTML = records.map(r => `
    <div class="record-card">
      <div class="record-icon"><span class="record-dot"></span></div>
      <div class="record-text">
        <div class="record-value">${r.value}</div>
        <div class="record-label">${r.label}</div>
        <div class="record-sub">${r.sub}</div>
      </div>
    </div>
  `).join('');
}


