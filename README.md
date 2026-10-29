# TapBlast

Live classroom quiz game (Kahoot-style). Teachers build quizzes and host games;
players join from their phones with a 6-digit code.

Built with **React + TypeScript + Vite**, data in **Firebase** (Google sign-in +
Realtime Database). Published to GitHub Pages by `.github/workflows/static.yml`
on every push to `main`.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (scoring, game flow, PDF import)
npm run e2e        # full game in a headless browser against a fake Firebase
npm run screenshots # every screen at phone/tablet/desktop/wide sizes -> e2e/screenshots/
npm run build      # type-check + production build into dist/
```

## Where things live

| Path | What |
| --- | --- |
| `src/game/rules.ts` | Scoring and game rules (Kahoot formula, streak bonus, ranks). Pure functions, unit-tested. |
| `src/game/hostController.ts` | Game flow: countdown → question → time's up → results → scoreboard → podium. |
| `src/game/roomStore.ts` | Where a game lives: Firebase for live games, memory for the editor's Preview. |
| `src/screens/` | Login, library, editor, host game, player (student) screens. |
| `src/styles/app.css` | The original stylesheet. The "RESPONSIVE CLEAN-UP" section at the end has the final say on layout. |
| `e2e/` | End-to-end test and the fake Firebase it uses. |
| `public/legacy/` | The previous single-file version, kept as a fallback at `/legacy/`. |

## Scoring (same as Kahoot)

- Correct answer: `round((1 - (time / time limit) / 2) × 1000)`, so 500–1000 points; wrong or no answer: 0.
- Double points questions ×2, "No points" questions 0.
- Answer streak bonus: +100 per correct answer in a row after the first, up to +500.
- Time while the host has the game paused doesn't count.
