# Tesla XTeam FX Trade

Self-contained trading website: Node.js + Express, JSON file storage, Tailwind CSS.
No external database or third-party services.

## Run locally

```bash
npm install
npm start          # -> http://localhost:3000
```

The site opens at `/pages/index.html`. The Tailwind CSS in `dist/` is pre-built and
committed — rebuild it only if you change classes: `npm run build`.

**Admin console:** `/admin/` — password-only login, default password `biggod`
(override with the `ADMIN_PASSWORD` env var). On first boot the app seeds the
`admin@xteam.local` admin account.

**Data:** JSON files in `./data/` (gitignored). Live accounts live there.

## Environment variables

| Variable          | Default       | Purpose                                                        |
| ----------------- | ------------- | -------------------------------------------------------------- |
| `PORT`            | `3000`        | Web port (Render injects this — don't set it there)            |
| `HTTPS`           | unset         | `true` → session cookie gets the Secure flag (set on Render)   |
| `DATA_DIR`        | `./data`      | Where JSON storage lives; point at a persistent disk on hosts  |
| `ADMIN_PASSWORD`  | `biggod`      | Admin console password (password-only login)                   |
| `NODE_ENV`        | —             | `production` on Render                                          |

## Deploy to Render

1. Upload this folder as a Git repo (or point Render at your repo).
2. Render auto-detects the `render.yaml` blueprint. Confirm the service settings.
3. Attach a **persistent disk** (paid plan) mounted at `/var/data` and keep
   `DATA_DIR=/var/data` so accounts/balances survive redeploys — the default
   filesystem is **ephemeral** and resets on every deploy.
4. Set `HTTPS=true` so sessions work over Render's HTTPS URL.
5. Deploy. First boot seeds the admin account and `data/` is created at the
   mount path on first request.

## Content constraints (do not break)

- No references to `xteamfxtrdes.com`, `coingecko`, `coinmarketcap`, `/storage/`,
  `/uploads/`, `csrf`, `Laravel`, or `unsplash` anywhere in source.
- All deposits are crypto-only via the payment modal.
- Self-contained local assets; only external CDNs allowed are fonts.bunny.net,
  unpkg (lucide), cdn.jsdelivr.net (chart.js), s3.tradingview.com (tv.js).
