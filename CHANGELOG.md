# Changelog

All notable changes to Task Quest are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (PWA + offline)
- **Installable app** — added `manifest.json` (name "Tasks", standalone display, coffee `#6f4e37` theme, cream `#faf6ee` background) and a set of fox app icons in `/icons` (192 + 512 px, plus a maskable 512 variant, an Apple touch icon, and a favicon), rasterized from the inline fox SVG.
- **Works offline** — a service worker (`sw.js`) precaches the full app shell with a cache-first strategy: `index.html`, `styles.css`, `config.js`, all eight JS modules, the manifest, the icons, **and the Supabase CDN bundle** (the app can't boot offline without it). The cache name is versioned (`tasks-shell-v1`) and old caches are cleaned up on activate.
- **Cloud calls stay live** — all requests to `*.supabase.co` and every non-`GET` request bypass the cache and go straight to the network, so REST/auth traffic is never stale and the dirty queue remains the single source of truth for writes.
- **Update flow** — `pwa.js` registers the worker and, when a new version is waiting, shows a small "A new version is ready" bar with a Reload button (no surprise reloads). It also captures `beforeinstallprompt` to offer an **Install app** button in the footer.
- **Faster reconnect** — on the browser `online` event, the dirty queue flushes immediately instead of waiting for the 10-second retry timer.
- `<head>` now links the manifest, light/dark `theme-color` metas, and Apple touch-icon / web-app meta tags.

### Changed (calm redesign — coffee & cream)
- **New look and tone** — moved away from the "video-game" styling toward something calmer and more elegant. A warm **coffee-&-cream** palette (espresso accent on soft paper) replaces the purple scheme, with a matching deep-roast dark mode.
- **A fox mascot** — a small, hand-drawn (inline SVG) fox now lives in the header and delivers a short, contextual line of encouragement in place of the old XP-bar shout. It reacts to your streak, how much you've done today, and an empty list.
- **Numbers tucked away** — the header no longer shows Level / XP counters. Progress is hinted at by a quiet, unlabeled sliver under the mascot. The points/levels/streak engine still runs underneath; it's just not in your face.
- **Calmer language** — "Task Quest ⚔" → "Tasks"; tabs are now **To do / Done / Progress / Milestones**; quests → tasks; the "+N XP" badge on each card became a plain effort tag (**Quick / Normal / Focused / Big**); toasts and the mascot speak in plain, warm sentences.
- **Friendlier icons** — the emoji "badges" (⚔🏆💎🚀…) became a single consistent **milestone seal** that fills with a check when earned; milestone names were reworded (e.g. "First blood" → "First step"). Stats records lost their emoji for tidy accent dots, and the streak's 🔥 is gone.
- No data or behavior changes — same storage schema, same sync. This is purely presentation.


### Added (v0.7.0 in progress — Phase 2+3a+3b+3c of cross-device sync)
- Supabase auth integration: Google sign-in, profile display in header with avatar/name, sign-out menu
- `config.js` file for Supabase credentials
- Auth works as an optional feature — app remains fully functional without login
- **Phase 3a: Manual cloud sync** — "☁ Save to cloud" and "⬇ Load from cloud" buttons in the profile menu
- "Last synced" indicator under your email in the auth menu
- **Phase 3b: First-login conflict resolution** — automatically detects whether local and/or cloud has data on first sign-in. If both sides have data, shows a choice modal.
- **Phase 3c: Auto-sync on every change** — adding, completing, editing, or deleting anything triggers a debounced sync (1.5s after last change). Granular: only modified records are sent, not the whole state. Failed syncs are queued in localStorage and retried automatically.
- Auto-pull on app load (when signed in with no local changes pending) to surface edits from other devices.
- Sync status indicator updates live: "Will sync shortly..." → "Syncing..." → "Synced just now" → "Sync error — will retry"

### Added (streaks & daily reset)
- **Streak tracking** — consecutive active days (any day you earn XP from completing a task or a Pomodoro), derived from the existing `history` log. A streak stays "alive but at risk" through the day after your last active day, so finishing a quest before midnight keeps it going.
- **Header streak pill** (`🔥 N day`) shown when a streak is active; dims when today isn't active yet, with a tooltip prompting you to keep it alive.
- Streak-aware message under the XP bar (secured / at-risk / start-a-new-streak states).
- **Daily-reset hook** — detects a calendar-day rollover on load, on a 1-minute interval, and on tab focus; nudges you with a toast to protect an existing streak. (This is the hook recurring quests will extend to auto-revive tasks.)
- "Longest streak" added to the Stats dashboard summary, alongside the existing current-streak and active-days counts.
- Three new achievements: 🔥 Warming up (3-day), ⚡ On fire (7-day), 🌋 Unbreakable (30-day).
- New local-only state field `lastActiveDay` (device-local; not synced to the cloud).

### Added (drag to reorder)
- **Drag to reorder tasks** within the active/done lists via native HTML5 drag-and-drop, with a grip affordance (⠿) on hover and a colored drop indicator showing where the card will land.
- Tasks now carry a numeric `order`; lists render sorted by it. Reordering uses a fractional-midpoint scheme, so a single drag changes only the moved task's order (and marks only that one record dirty for sync).
- New quests are inserted at the top of the list.
- Cards are draggable only while collapsed, so dragging never interferes with selecting text in the expanded notes field.

#### ⚠️ Requires a one-time Supabase migration
The `tasks` table needs a `sort_order` column for reorder state to sync:
```sql
alter table public.tasks add column if not exists sort_order double precision;
```
Existing rows backfill lazily (a "Save to cloud" rewrites them all); the app works locally without the migration, but cloud sync of order needs it.

### Added (recurring quests)
- **Recurring quests** — set a task to repeat **Daily**, **Weekdays (Mon–Fri)**, or **Weekly** from a "🔁 Repeat" picker in the task detail. A `🔁 Daily`/`Weekdays`/`Weekly` pill shows on the card.
- When a new period begins, a completed recurring quest **auto-revives** (becomes active again) and its subtasks are unchecked for a fresh run. This rides the existing daily-reset hook, so it triggers on load, on the 1-minute interval, and on tab focus — and a `🔁 N renewed` toast confirms it.
- **Reviving keeps everything you earned** — the XP, completion count, and history from each period's completion stay recorded. A daily quest pays out every day you finish it, and your streak/stats reflect every completion. Weekdays-recurring tasks skip the weekend (a Friday completion comes back Monday).
- Changing a task's recurrence to a schedule it's already overdue for revives it immediately.

#### ⚠️ Requires a one-time Supabase migration
The `tasks` table needs a `recurrence` column for repeat settings to sync:
```sql
alter table public.tasks add column if not exists recurrence text;
```
The app works locally without it; cloud sync of recurrence needs it.

### Added (subtasks)
- **Subtasks** — break an epic quest into a checklist of smaller steps. Each task now has a `subtasks` list; open a task to add, check off, or delete steps inline.
- A progress bar and `N/M done` count appear in the expanded view; a `☑ N/M` pill (turning green when all are done) shows on the collapsed card.
- Subtasks carry no XP of their own — completing the parent quest is still what pays out. They're purely for breaking work down.
- The notes field's placeholder dropped its old "sub-tasks" hint now that subtasks are a first-class feature.

#### ⚠️ Requires a one-time Supabase migration
The `tasks` table needs a `subtasks` column for the checklist to sync across devices:
```sql
alter table public.tasks add column if not exists subtasks jsonb not null default '[]'::jsonb;
```
The app works locally without the migration; cloud sync of subtasks needs it. Existing rows backfill lazily (a "Save to cloud" rewrites them all).

### Changed (refactor)
- **Split `app.js` (~2,260 lines) into seven focused modules** — `auth.js`, `sync.js`, `state.js`, `pomodoro.js`, `ui.js`, `stats.js`, `main.js` — loaded as plain `<script>` tags in dependency order (no build step, no ES modules; they still share global scope so inline `onclick` handlers keep working). Pure code-move refactor: the concatenation of the modules is byte-for-byte identical to the previous `app.js`, so there is no behavior change.

Ideas being considered for future releases:
- Cross-device sync via Supabase + Google login
- AI auto-categorization of new tasks
- Streaks and daily reset
- Drag to reorder tasks
- Long break every 4 Pomodoro sessions
- PWA install + offline support
- Recurring quests

## [0.6.1] — 2025-05-07

### Changed
- Daily XP chart upgraded to dual-axis: XP earned shown as bars (left axis), minutes tracked as a teal line overlay (right axis).
- Activity heatmap reduced in size and centered (cells went from 14×14 to 9×9, capped at 360px wide).
- Summary row gained a "Total tracked" card alongside XP totals.
- Chart tooltips now display all three metrics: XP earned, tasks completed, minutes tracked.

### Added
- Visual legend above the daily chart explaining the bar/line series.

### Notes
- No data migration. Pure visual polish.

## [0.6.0] — 2025-05-07

### Added
- **Stats dashboard** as a new tab between Done and Achievements.
- Daily XP bar chart for the last 30 days with summary cards (total XP, daily average, best day).
- Activity heatmap covering the last 12 weeks (GitHub-contributions style) with current streak and active-days counters.
- Time-by-category donut chart with legend showing exact durations and percentages.
- Six "Records" cards: best day, best rolling 7-day window, total tasks completed, Pomodoros completed, longest single task time, total XP / current level.
- Append-only `history` array recording every task completion and Pomodoro session as a timestamped event.
- `createdAt` and `completedAt` fields on tasks.

### Changed
- localStorage schema bumped to `task-quest-v5`.

### Notes
- Existing tasks completed before this version won't show up in the charts (no historical timestamps), but their counts are preserved in the records section. Future activity populates everything in real time.
- History is bounded to the last 365 days to keep localStorage healthy.
- All charts are hand-rolled SVG — zero external chart libraries.

## [0.5.0] — 2025-05-06

### Changed
- **Refactored single-file app into three files:** `index.html` (structure), `styles.css` (all styling), `app.js` (all logic).
- README rewritten with architecture notes, file structure, and a clearer roadmap.

### Notes
- No behavioral change. Pure refactor to set the foundation for future features (AI categorization, calendar integration, cross-device sync).
- GitHub Pages continues to deploy with no config changes — it's all still static files.

## [0.4.0] — 2025-05-06

### Added
- **Fullscreen Pomodoro experience** that takes over the entire viewport when active.
- Digital flip-style countdown — each digit animates by sliding up to reveal the next number.
- Editable focus and break durations (1–120 min focus, 1–60 min break) directly under the clock. Editable when paused, locked when running.
- Auto-transition to break phase when focus ends, with teal background tint.
- Sound effects via Web Audio API (no audio files): soft tick every second, urgent boop in the last 10 seconds, 3-note ascending bell at phase end.
- Sound on/off toggle (🔊/🔇) that persists across sessions.
- Last-10-seconds visual pulse on the screen for added urgency.
- Current task display below the clock: category, name, description, XP, and live time tracked.
- "Switch task" and "✓ Complete this task" actions inside the Pomodoro view.
- "Pick the next quest" handoff list when completing a task mid-session.
- Pomodoro and per-task timers are auto-synced — starting/pausing one affects the other.
- ESC key closes the overlay.

### Changed
- localStorage schema bumped to `task-quest-v4`. Settings now stored under `state.settings` (focusMins, breakMins, soundOn).

## [0.3.0] — 2025-05-05

### Added
- **Per-task descriptions** — click any task to expand and see/edit a description textarea (notes, links, sub-steps, context).
- **Per-task timers** — start/pause/complete buttons inside the expanded view. Only one task can time at once; starting another auto-pauses the first.
- Time accumulates across pause/resume cycles and persists across browser sessions.
- Live time pill on collapsed task cards.
- 📝 description indicator on tasks with notes.
- Bonus +1 XP per 5 minutes tracked on a task.
- Two new achievements: ⏰ Logged in (1 hour tracked), ⏳ Time master (10 hours tracked).
- Robust against tab closes — running timers finalize on `beforeunload`.

### Changed
- localStorage schema bumped to `task-quest-v3`.

## [0.2.0] — 2025-05-05

### Added
- **Task categories** with colored tag pills on every card.
- Default categories: General, Work, Personal, Health, Learning.
- Filter chips above the active and done lists with live counts.
- "⚙ Manage" modal for renaming, recoloring, adding, or deleting categories (8-color palette).
- New achievement: 🎨 Well-rounded (complete tasks in 3 categories).

### Changed
- localStorage schema bumped to `task-quest-v2` with automatic migration from v1.
- General category is undeletable (acts as fallback when other categories are deleted).

## [0.1.0] — 2025-05-05

### Added
- Initial release as a single self-contained HTML file.
- Task list with add, complete, delete, and XP rewards (10/25/50/100 tiers).
- 11-level XP system with progress bar and level-up notifications.
- Tabs: Active, Done, Achievements.
- Pomodoro focus timer (25 min) with +15 XP bonus on completion.
- 10 achievements covering task completion milestones, level milestones, and focus sessions.
- Persistent storage via localStorage.
- Light + dark mode (auto-detected from system).
- Reset-everything escape hatch in the footer.
- Deployable to GitHub Pages or any static host.
