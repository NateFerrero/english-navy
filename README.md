# english-navy

The English Navy — a tiny **front-end-only** web app for user sign-up.

No build step, no framework, and **zero external dependencies**. It is plain ES
modules (`.mjs`) loaded via `<script type="module">`, with pushState routing and
an in-browser mock API.

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

Requires Node.js (used only for a tiny built-in static file server — no npm
install needed).

```bash
npm start
# or:
node server.mjs
```

Then open:

- http://localhost:3000/?api=mock — recommended (uses the in-browser mock API)
- http://localhost:3000/ — no backend exists yet, so sign-up will report that
  you need `?api=mock`.

Set `PORT` to change the port (defaults to `3000`).

## Project layout

```
index.html          App shell; loads src/app.mjs as a module
styles.css          Styling (no external fonts)
server.mjs          Zero-dependency static server with SPA fallback
src/
  app.mjs           Bootstrap: registers routes, starts router
  router.mjs        PushState router (no hash)
  layout.mjs        Shared header/nav chrome
  ui.mjs            DOM helpers + inline SVG crest
  api/
    index.mjs       Chooses mock vs real API (?api=mock -> sessionStorage)
    mock.mjs        In-browser mock backend (sessionStorage "database")
    real.mjs        Placeholder that fails until a real backend exists
  views/
    home.mjs
    signup.mjs
    welcome.mjs
    notfound.mjs
```

## How the mock toggle works

`src/api/index.mjs` reads `?api=` on load and writes it to `sessionStorage`.
Every API call then routes to the mock or the (not-yet-built) real API based on
that stored value, so navigating with pushState — which drops the query string —
keeps using the mock for the rest of the session.
