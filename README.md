# Bookwar

A spellbook word duel for the browser. Wizards spell words on a board of hexagon rune stones,
break curse runes before they sink to the bottom and topple their tower, and forge mana
crystals from long words.

Planned modes: **Solo** (Classic and Action), **Siege** (2–5 player elimination) and **Duel**
(1v1, timed), with AI opponents.

Built with TanStack Start (React 19), Vite, Nitro, Tailwind CSS, shadcn/ui and Drizzle on Neon
Postgres.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env.local` holds `DATABASE_URL`, `GEMINI_API_KEY` and `NEON_AUTH_BASE_URL`. If
`DATABASE_URL` is missing, `npm run dev` creates a temporary Neon database (it expires after
72 hours unless you claim it).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm run preview` | Production build / run it |
| `npm test` | Run the Vitest suite once (`npm run test:watch` to watch) |
| `npm run check` | Biome lint + format check (`npx biome check --write` to fix) |
| `npm run db:generate` / `db:migrate` / `db:studio` | Drizzle migrations and studio |
| `npm run build:dictionary -- <enable1.txt>` | Rebuild the word list (see below) |

## Project layout

- `src/game/` — the game engine: plain TypeScript with no React or Node APIs, shared by the
  browser and the server. `reduce(state, action, words)` is the only way a game changes; all
  tuning numbers are in `src/game/config.ts`.
- `src/game/dictionary/` — the word list (`words.txt`), loader, blocklist and prophecy words.
- `src/routes/` — pages (TanStack Router file-based routing).
- `src/components/ui/` — shadcn/ui components.
- `src/db/` — Drizzle schema and client.

## Word list

`src/game/dictionary/words.txt` is built from the public-domain
[ENABLE1](https://github.com/dolph/dictionary) word list: 3–15 letter words, no "q" without a
following "u" (the board only has a "Qu" stone), and no words from `blocklist.ts`. To rebuild
it, download `enable1.txt` and run `npm run build:dictionary -- path/to/enable1.txt`.
