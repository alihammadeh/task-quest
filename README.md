# Task Quest

A gamified to-do app that helps you beat procrastination. XP rewards, levels, achievements, fullscreen Pomodoro timer with break phases, per-task time tracking, category management, and a history dashboard with charts.

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
  index.html    ← HTML structure only (~115 lines)
  styles.css    ← all styling, light + dark mode (~280 lines)
  app.js        ← all logic: state, rendering, timer, achievements (~840 lines)
  README.md     ← this file
```

The split was done after v4 to make future features (AI categorization, calendar sync, etc.) easier to add. Each file has a single responsibility.

## Architecture notes

**State management:** Single `state` object held in memory, persisted to `localStorage` under `task-quest-v4`. Schema migrations from v1/v2/v3 are automatic on load.

**Rendering:** Pure functions read from `state` and rebuild the DOM. No virtual DOM, no framework — just `innerHTML` reassignment after each mutation. Fine at this scale; the entire UI re-renders in <5ms.

**Pomodoro:** Uses absolute timestamps (`endsAt`) rather than counting intervals — survives tab focus loss, OS sleep, etc. accurately. Audio is generated via Web Audio API (no audio files).

**Per-task timer:** When running, only `timerStartedAt` is stored. Effective time = `trackedSec + (now - timerStartedAt)`. This means even if the tab is closed, the math still works on reload.

## Why it works (gamification)

- **Variable rewards** — XP amounts vary (10/25/50/100), more dopamine-engaging than uniform rewards
- **Sunk-cost progress bar** — the level XP bar makes you reluctant to stop near a level-up
- **Big quests for hard tasks** — assigning your most-avoided task as `+100 XP` reframes dread as anticipation
- **Pomodoro built in** — 25-min focus session with bonus XP, plus per-task time logging earns +1 XP per 5 minutes

## Ideas for improvements

**UI-only (still single-file-architecture friendly):**
- Streaks + daily reset — track consecutive active days
- Drag to reorder tasks within a category
- Stats view — XP/time-by-category, charts
- Themes — let users pick color schemes
- Long break every 4 sessions (classic Pomodoro pattern)
- Subtasks for breaking down epic quests
- Recurring quests — daily/weekly tasks that auto-revive
- Custom XP amounts and category colors
- Export/import JSON

**Bigger projects (need a backend):**
- AI auto-categorization of new tasks (OpenAI/Anthropic API call)
- Calendar integration (Google/Apple)
- Cross-device sync (Supabase, Firebase, or custom)
- Auth (Clerk, Supabase Auth)
- Notion/Slack/Linear integrations
- PWA install + offline support (manifest + service worker)

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
      "xpFromTime": 0
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
