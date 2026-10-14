# Bookwar

A spellbook word duel for the browser. Wizards spell words on a board of hexagon rune stones,
break curse runes before they sink to the bottom and topple their tower, and forge mana
crystals from long words.

Modes: **Solo** (Classic and Action), **Duel** (1v1 on the clock) and **Siege** (2–5 wizards,
the lowest score is cut each round). Duels and sieges are played live against friends (room
code or invite link), through quick match, or against built-in AI rivals.

Everyone can play as a guest. Players who sign in (Neon Auth) get their Solo scores on the
leaderboard and keep a match history.

Built with TanStack Start (React 19), Vite, Nitro, Tailwind CSS, shadcn/ui and Drizzle on Neon
Postgres.

## Getting started

```bash
npm install
npm run db:migrate # create the tables (once, and after pulling new migrations)
npm run dev        # http://localhost:3000
```

`.env.local` holds:

| Variable | What it's for |
| --- | --- |
| `DATABASE_URL` | Direct Postgres connection, used by migrations (`drizzle-kit`) |
| `DATABASE_URL_POOLED` | Pooled connection the app uses (falls back to `DATABASE_URL`) |
| `NEON_AUTH_BASE_URL` | Neon Auth URL; the server checks login tokens against its keys |
| `VITE_NEON_AUTH_URL` | The same URL for the browser: `VITE_NEON_AUTH_URL=${NEON_AUTH_BASE_URL}` |

`VITE_NEON_AUTH_URL` is built into the browser code, so it must be set when running
`npm run build`. Without it, Bookwar runs guest-only. If `DATABASE_URL` is missing,
`npm run dev` creates a temporary Neon database (it expires after 72 hours unless you claim it).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm run preview` | Production build / run it |
| `npm test` | Run the Vitest suite once (`npm run test:watch` to watch) |
| `npm run check` | Biome lint + format check (`npx biome check --write` to fix) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations and studio |
| `npm run build:dictionary -- <enable1.txt>` | Rebuild the word list (see below) |

To run a production build locally: `npm run build`, then
`node --env-file=.env.local .output/server/index.mjs`. Live games keep their rooms in memory,
so run one long-lived server process (not serverless functions).

## Project layout

- `src/game/` — the game engine: plain TypeScript with no React or Node APIs, shared by the
  browser and the server. `reduce(state, action, words)` is the only way a game changes; all
  tuning numbers are in `src/game/config.ts`. `replay.ts` replays a game from its seed and
  move log.
- `src/game/dictionary/` — the word list (`words.txt`), loader, blocklist and prophecy words.
- `src/routes/` — pages (TanStack Router file-based routing).
- `src/server/realtime/` — the live game server (rooms, quick match, WebSocket hub);
  `src/server/bot/` — the AI rivals.
- `src/server/accounts/` — login-token checks, server functions for accounts and
  leaderboards, and their database queries.
- `src/db/` — Drizzle schema and client; migrations are in `drizzle/`.
- `src/components/ui/` — shadcn/ui components.

## Accounts and leaderboards

- The browser signs in with Neon Auth directly (email and password, or Google). Bookwar's
  server never sees passwords; it checks the short-lived login token (a JWT) that the browser
  sends with server-function calls and with the game server's hello message.
- On first sign-in, the guest's wizard name and local high scores move to the account.
- Solo scores are checked: every finished game is sent with its seed and move log, and the
  server replays it with the same engine and stores the score it gets. Old local scores
  without a move log are kept on the player's account page but stay off the leaderboard.
- Duel and Siege boards count wins against other people; matches against only AI rivals are
  kept in the player's history but don't count.
- Neon's shared email service sends password-reset codes during development. Production needs
  custom SMTP set up in the Neon console, and the site's domain added to Neon Auth's trusted
  domains. The Google sign-in uses Neon's shared Google app, which is for development only.

## Word list

`src/game/dictionary/words.txt` is built from the public-domain
[ENABLE1](https://github.com/dolph/dictionary) word list: 3–15 letter words, no "q" without a
following "u" (the board only has a "Qu" stone), and no words from `blocklist.ts`. To rebuild
it, download `enable1.txt` and run `npm run build:dictionary -- path/to/enable1.txt`.
