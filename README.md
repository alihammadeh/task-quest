# Task Quest

A gamified to-do app that helps you beat procrastination. XP rewards, levels, achievements, and a Pomodoro focus timer — all in a single HTML file.

## Run it

Just open `index.html` in any browser. That's it. Your data persists in browser localStorage.

To use it as a "real" web app:
- **Local file** — double-click `index.html`. Bookmark it.
- **Local server** — `python3 -m http.server` in this folder, then visit `http://localhost:8000`
- **Deploy free** — drag-drop the folder into [Netlify Drop](https://app.netlify.com/drop), or push to GitHub and turn on Pages, or use Vercel/Cloudflare Pages.
- **Install as a PWA** — would take ~30 lines (manifest + service worker) to install on phone/desktop. Easy next step.

## Why it works

Procrastination is a motivation problem. The trick:
- **Variable rewards** — XP amounts vary (10/25/50/100), which is more dopamine-engaging than uniform rewards.
- **Sunk-cost progress bar** — the level XP bar makes you reluctant to stop near a level-up.
- **Big quests for hard tasks** — assigning your most-avoided task as `+100 XP` reframes the dread as anticipation.
- **Pomodoro built in** — 25-minute focus session with a +15 XP bonus.

## Files

```
task-quest/
  index.html    ← the entire app (HTML + CSS + JS in one file)
  README.md     ← this file
```

## Ideas for improvements

Easy wins:
- **Task categories** (work, personal, health) with colored tags
- **Daily reset / streaks** — tracks consecutive days you complete a task
- **Sound effects** on level-up (Web Audio API, no assets needed)
- **Recurring quests** — daily/weekly tasks that auto-revive
- **Subtasks** for breaking down epic quests
- **Due dates** with overdue penalty (lose XP)
- **Custom XP amounts** instead of preset tiers
- **Drag to reorder** tasks
- **Export/import JSON** so you can move data between devices

Bigger projects:
- **PWA support** — manifest.json + service worker → installs to phone
- **Sync across devices** — drop in Firebase/Supabase or a tiny Cloudflare Worker
- **Habit tracker mode** — separate from one-off quests
- **Boss battles** — group several tasks into a "boss" with health bar
- **Themes** — let users pick color schemes
- **Stats dashboard** — completed tasks per day, XP per week, focus minutes logged

## Data shape

Saved to `localStorage` under key `task-quest-v1`:

```json
{
  "tasks": [{ "id": 123, "name": "...", "xp": 25, "done": false }],
  "totalXP": 0,
  "doneCount": 0,
  "focusSessions": 0,
  "unlockedAchs": ["first", "five"]
}
```

Want help shipping any of the ideas above? Just ask.
