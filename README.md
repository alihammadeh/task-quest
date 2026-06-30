# Task Quest

A calm, warm to-do app that helps you beat procrastination. A friendly coffee-cup companion offers gentle encouragement, with quiet progress, milestones, a fullscreen focus timer with break phases, per-task time tracking, category management, and a history dashboard with charts. Dressed in a soft coffee-&-cream palette with light + dark modes.

> The motivation engine (points, levels, streaks) still runs under the hood — it's just presented quietly now, without the "video-game" styling.

## Run it

Serve the folder with any static server (or just open `index.html` directly — works for most features but some browsers block local file `<link>`/`<script>` references). Recommended:

```bash
python3 -m http.server
# then visit http://localhost:8000
```

Or deploy free: drag-drop into [Netlify Drop](https://app.netlify.com/drop), push to GitHub Pages, or use Vercel/Cloudflare Pages.

## File structure

```
task-quest/
  index.html    ← HTML structure only
  styles.css    ← all styling, light + dark mode
  config.js     ← Supabase credentials (anon key; safe to commit with RLS on)
  manifest.json ← PWA manifest (installable app metadata)
  sw.js         ← service worker (offline app-shell cache)
  icons/        ← fox app icons (192/512, maskable, apple-touch, favicon)
  README.md     ← this file

  JS modules (plain <script> tags sharing global scope; load order matters):
  auth.js       ← constants + Supabase auth
  sync.js       ← manual sync, first-login conflict flow, auto-sync dirty queue
  state.js      ← state, load/save + migrations, level/time helpers, live timer
  pomodoro.js   ← Pomodoro state, sound (Web Audio), tick loop
  ui.js         ← render(), task list, drag-to-reorder, task mutations, achievements
  stats.js      ← stats dashboard (charts, heatmap, streaks)
  main.js       ← tabs, category modal, toasts, event listeners, app boot
  pwa.js        ← service-worker registration, update flow, install button (loads last)
```

The JS was originally one `app.js`; it was split into the modules above as it grew. They are **plain scripts, not ES modules** — they share global scope (so the inline `onclick` handlers in the HTML keep working) and are loaded in dependency order, with `main.js` (the boot block) last. No build step.

## Architecture notes

**State management:** Single `state` object held in memory, persisted to `localStorage` under `task-quest-v4`. Schema migrations from v1/v2/v3 are automatic on load.

**Rendering:** Pure functions read from `state` and rebuild the DOM. No virtual DOM, no framework — just `innerHTML` reassignment after each mutation. Fine at this scale; the entire UI re-renders in <5ms.

**Pomodoro:** Uses absolute timestamps (`endsAt`) rather than counting intervals — survives tab focus loss, OS sleep, etc. accurately. Audio is generated via Web Audio API (no audio files).

**Per-task timer:** When running, only `timerStartedAt` is stored. Effective time = `trackedSec + (now - timerStartedAt)`. This means even if the tab is closed, the math still works on reload.

**PWA / offline:** `sw.js` precaches the app shell (HTML, CSS, all JS modules, icons, manifest, and the Supabase CDN bundle) cache-first, so the app loads and runs with no network. Anything on `*.supabase.co` and all non-`GET` requests skip the cache and hit the network, so cloud data is never stale and offline writes still queue through `sync.js`'s dirty queue (which flushes on reconnect). The service worker needs a secure context — it activates over `https://` or `http://localhost`, not `file://`. **Bump `CACHE_VERSION` in `sw.js` whenever you change any shell file**, or installed users keep serving stale assets. Worth a Lighthouse PWA audit after shell changes.

## Why it works (quiet motivation)

- **A friendly companion** — the coffee-cup mascot offers a short, contextual line of encouragement (streak alive, a good day, a fresh start) instead of loud notifications
- **Effort, not points** — tasks are tagged Quick / Normal / Focused / Big rather than "+N XP"; the underlying weighting still drives the hidden progress
- **Gentle progress** — a quiet, unlabeled sliver under the mascot hints at growth, without a number to obsess over
- **Milestones, not badges** — a consistent seal fills in as you reach calm, plainly-named milestones
- **Focus timer built in** — a fullscreen focus session with break phases, plus per-task time logging

## Ideas for improvements

**UI-only (still single-file-architecture friendly):**
- Streaks + daily reset — track consecutive active days
- Drag to reorder tasks within a category
- Stats view — XP/time-by-category, charts
- Themes — let users pick color schemes
- Long break every 4 sessions (classic Pomodoro pattern)
- Custom XP amounts and category colors
- Export/import JSON

**Bigger projects (need a backend):**
- AI auto-categorization of new tasks (OpenAI/Anthropic API call)
- Calendar integration (Google/Apple)
- Cross-device sync (Supabase, Firebase, or custom)
- Auth (Clerk, Supabase Auth)
- Notion/Slack/Linear integrations
- ~~PWA install + offline support (manifest + service worker)~~ ✅ done

## Data shape (localStorage)

```json
{
  "tasks": [
    {
      "id": 1234567890,
      "name": "Task name",
      "desc": "Optional description",
      "xp": 25,
      "done": false,
      "category": "work",
      "trackedSec": 0,
      "timerStartedAt": null,
      "xpFromTime": 0,
      "order": 0,
      "subtasks": [{ "id": 1234567891, "name": "Step one", "done": false }],
      "recurrence": null
    }
  ],
  "categories": [{ "id": "work", "name": "Work", "color": "info" }],
  "totalXP": 0,
  "doneCount": 0,
  "focusSessions": 0,
  "unlockedAchs": [],
  "settings": { "focusMins": 25, "breakMins": 5, "soundOn": true }
}
```

## Branch workflow

Each new feature gets its own branch (e.g. `feat/streaks`), opened as a PR for diff review, then merged to `main`. Tag releases (`v0.4.0`, `v0.5.0`) for easy rollback.
