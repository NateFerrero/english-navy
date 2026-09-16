# english-navy

The English Navy — a small web app for user sign-up.

- **Front end**: no build step, no framework, and **zero external dependencies**.
  Plain ES modules (`.mjs`) loaded via `<script type="module">`, with pushState
  routing and an in-browser mock API.
- **Back end**: plain-JavaScript (ESM) **Vercel serverless functions** under
  `/api`, using **Turso** with a two-tier database layout. Its only dependency
  is Turso's official `@libsql/client`; auth uses Node's built-in `crypto`.

## Highlights

- **No TypeScript, no React, no Vite, no bundler.**
- **No external dependencies or web fonts** — everything is local (system font
  stack, inline SVG crest).
- **PushState routing** (History API) — clean URLs, no `#` hash.
- **Mock API toggle**: open the app with `?api=mock`. That persists
  `api = "mock"` in `sessionStorage`, so the mock stays active across navigation
  and reloads for the whole session.
- **Sign up** with an email address and password.

## Run it

Requires Node.js.

```bash
npm install   # installs @libsql/client (backend only)
npm start     # or: node server.mjs
```

The dev server serves the static front end and routes `/api/*` to the same
handler modules Vercel runs, using the `local` database provider by default.

Then open:

- http://localhost:3000/ — uses the real backend API (local libSQL provider)
- http://localhost:3000/?api=mock — uses the in-browser mock API instead

Set `PORT` to change the port (defaults to `3000`).

## Project layout

```
index.html          App shell; loads src/app.mjs as a module
styles.css          Styling (no external fonts)
server.mjs          Static server + local /api router (dev only)
vercel.json         Vercel config (30s maxDuration per route, SPA rewrites)
.env.example        Backend environment variables (Turso, auth)
src/                FRONT END (zero dependencies)
  app.mjs           Bootstrap: registers routes, starts router
  router.mjs        PushState router (no hash)
  layout.mjs        Shared header/nav chrome
  ui.mjs            DOM helpers + inline SVG crest
  api/
    index.mjs       Chooses mock vs real API (?api= -> sessionStorage)
    mock.mjs        In-browser mock backend (sessionStorage "database")
    real.mjs        Real client: fetches the /api backend
  views/            home.mjs, signup.mjs, welcome.mjs, notfound.mjs
api/                BACKEND (Vercel serverless functions, ESM)
  health.js  signup.js  login.js  me.js  profile.js
lib/                BACKEND shared modules
  config.mjs        Env config + provider selection
  http.mjs          Request/response helpers (Node + Vercel compatible)
  auth.mjs          scrypt password hashing + HMAC session tokens
  db.mjs            libSQL client factories (primary + per-user)
  primary.mjs       Primary DB: users table + connection to secondary DBs
  userdb.mjs        Per-user secondary DB schema + profile access
  provisioner.mjs   Creates each user's database (Turso API or local file)
  session.mjs       Resolve authenticated user from Bearer token
```

## How the mock toggle works

`src/api/index.mjs` reads `?api=` on load and writes it to `sessionStorage`.
Every API call then routes to the mock or the real backend API based on that
stored value, so navigating with pushState — which drops the query string —
keeps the choice for the rest of the session. Use `?api=mock` for the in-browser
mock; the default (or `?api=real`) calls the backend under `/api`.

## Backend API (Vercel + Turso)

Plain-JavaScript ESM serverless functions live in `/api` and deploy to Vercel
as-is. Each route is capped at a **30s max duration** via `vercel.json`.

Routes:

| Method | Route          | Purpose                                             |
| ------ | -------------- | --------------------------------------------------- |
| GET    | `/api/health`  | Liveness + active DB provider                       |
| POST   | `/api/signup`  | Create account + provision the user's own database  |
| POST   | `/api/login`   | Authenticate, return a session token                |
| GET    | `/api/me`      | Current account (Bearer token)                      |
| GET    | `/api/profile` | Read the user's **secondary** database              |
| PUT    | `/api/profile` | Write the user's **secondary** database             |

### Two-tier database architecture

- **Primary database** — user accounts only. Each `users` row also stores the
  **connection** (`db_url` + `db_auth_token`) to that user's own database.
- **Secondary databases** — one Turso database **per user**, provisioned on
  sign-up. Per-user application data (e.g. `profile`) lives here, reached using
  the connection stored in the primary database.

### Providers

The same `@libsql/client` talks to both, selected by `DB_PROVIDER`:

- `turso` (production): per-user databases are created through the Turso
  Platform API and reached over `libsql://`.
- `local` (development, the default when no `TURSO_API_TOKEN` is set): per-user
  databases are local libSQL files under `.data/` — protocol-identical to Turso,
  so the whole flow runs end-to-end with no credentials.

### Configuration

See [`.env.example`](.env.example). For production on Vercel, set:
`TURSO_API_TOKEN`, `TURSO_ORG`, `TURSO_PRIMARY_DB_URL`,
`TURSO_PRIMARY_DB_AUTH_TOKEN`, and `AUTH_SECRET`. `TURSO_GROUP` is optional;
when it is blank, the app uses the only Turso group in the organization.

Locally, `npm start` runs everything (the dev server routes `/api/*` to the same
handler modules Vercel would run), defaulting to the `local` provider.
