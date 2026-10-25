# Public demo: GitHub Pages + tunneled API

The web app is a static SPA, so it can live on GitHub Pages while the API runs elsewhere
(e.g. on a home box behind an ngrok tunnel).

## Frontend (GitHub Pages)
- `.github/workflows/pages.yml` builds `packages/web` on every push to `main` and deploys it.
- Enable once: **Settings → Pages → Source: GitHub Actions**.
- API URL: repo variable `DEMO_API_URL` (falls back to the URL hardcoded in the workflow).
- `VITE_BASE=/<repo>/` sets the Vite base path; the router uses it as `basename`.
- `404.html` is a copy of `index.html` so deep links work.
- Every API request carries `ngrok-skip-browser-warning: 1` to bypass ngrok's interstitial.

## Backend (.env for the API host)
```
NODE_ENV=production
CORS_ORIGIN=https://<user>.github.io
SIWE_DOMAIN=<user>.github.io            # comma-separated lists are accepted
SIWE_URI=https://<user>.github.io
COOKIE_SAMESITE=none                     # cross-site cookies (Pages ↔ tunnel); forces Secure
API_PORT=127.0.0.1:3000                  # publish only on loopback; the tunnel reaches it
POSTGRES_PORT=127.0.0.1:5432
```
Then `docker compose up -d postgres migrate risk-service collector api` and
`ngrok http 3000 --url=https://<your-static-domain>`.

Note: browsers that block third-party cookies (Safari, Chrome incognito) will not keep the
SIWE session across the two sites; browsing pools and explanations still works.
