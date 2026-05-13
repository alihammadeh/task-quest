# Changelog

All notable changes to Task Quest are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (v0.7.0 in progress — Phase 2+3a+3b of cross-device sync)
- Supabase auth integration: Google sign-in, profile display in header with avatar/name, sign-out menu
- `config.js` file for Supabase credentials
- Auth works as an optional feature — app remains fully functional without login
- **Phase 3a: Manual cloud sync** — "☁ Save to cloud" and "⬇ Load from cloud" buttons in the profile menu
- "Last synced" indicator under your email in the auth menu
- **Phase 3b: First-login conflict resolution** — automatically detects whether local and/or cloud has data on first sign-in. If only one side has data, syncs in the right direction silently. If both have data, shows a choice modal: keep local vs. use cloud. Prevents the "new device wipes my real data" scenario.
- Note: this phase still requires manual sync after the first login. Phase 3c adds automatic background sync on every change.

Ideas being considered for future releases:
- Cross-device sync via Supabase + Google login
- AI auto-categorization of new tasks
- Streaks and daily reset
- Drag to reorder tasks
- Long break every 4 Pomodoro sessions
- PWA install + offline support
- Subtasks for breaking down epic quests
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
