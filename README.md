# Sixstring Academy

A complete guitar school that runs in the browser: a tuner, a live fretboard camera, a sheet and tab
scanner, an interactive song player, a 35-unit theory path, three teacher courses (beginner,
intermediate, expert), every scale and chord, scale games, progressions with a backing band, and ear,
rhythm and technique training. It works on phones and desktops, and needs no server: all content and
logic ship with the app.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The microphone and camera work there (localhost counts as secure).

To try it on your phone on the same Wi-Fi network:

```bash
npm run dev:phone
```

Open the address it prints on your phone and accept the certificate warning (it is a self-signed
certificate; the microphone and camera need HTTPS).

## Host it

```bash
npm run build
```

This writes a static site to `dist/`. Upload that folder to any static host that serves HTTPS, for
example Netlify (drag and drop the folder), Cloudflare Pages, Vercel or GitHub Pages. No backend,
database or API keys are needed.

## Accounts (optional)

Learners can sign in with an email and a 6-digit code to keep the same progress on all their
devices (practise on the phone away from home, on the laptop with the guitar). It runs on a free
Supabase project and is switched on by two build-time variables, `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` (on Netlify: Site configuration > Environment variables, then redeploy).
Without them, accounts are simply not offered and everything stays on each device, as before.

- Step-by-step guide for the owner: **[docs/accounts-setup.md](docs/accounts-setup.md)**.
- The database table and its row-level security: [`supabase/schema.sql`](supabase/schema.sql)
  (run once in the Supabase SQL editor).
- How it works in the code: `src/core/platform/API.md` (Cloud sync, Accounts). Browser check:
  `node e2e/account.cjs` (two devices on a stand-in backend; no network needed).

`npm run build:artifact` builds a variant for hosting as a Claude artifact (microphone and camera are
not available there).

## Develop

```bash
npm run typecheck   # TypeScript, strict
npm test            # unit tests (vitest)
node e2e/run-all.cjs --list   # browser checks (Playwright with Chromium)
```

`CLAUDE.md` is the full build brief: layout, conventions, music conventions, design rules and content
rules. Each module under `src/core` has an `API.md` digest.

## Content and rights

Songs are traditional or public-domain melodies, or original studies written for this app. Recovered
traditional melodies are labelled "as commonly sung or played today". Modern songs are never
transcribed. Printed pieces you own can be brought in with Scan & Import.
