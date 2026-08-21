# Tesla Capital

Self-contained trading website: Node.js + Express, Neon Postgres (or JSON file
storage), Tailwind CSS. No other external services.

## Run locally

```bash
npm install
npm start          # -> http://localhost:3000
```

The site opens at `/pages/index.html`. The Tailwind CSS in `dist/` is pre-built
and committed — rebuild it only if you change classes: `npm run build`.

**Admin console:** `/admin/` — password-only login, default password `biggod`
(override with the `ADMIN_PASSWORD` env var). On first boot the app seeds the
`admin@xteam.local` admin account.

**Data:** with `DATABASE_URL` set, everything lives in Neon Postgres. Without
it, the app falls back to JSON files in `./data/` (local dev, gitignored).

## Environment variables

| Variable          | Default       | Purpose                                                       |
| ----------------- | ------------- | ------------------------------------------------------------- |
| `PORT`            | `3000`        | Web port (Render injects this — don't set it there)           |
| `HTTPS`           | unset         | `true` → session cookie gets the Secure flag (set on Render)  |
| `DATABASE_URL`    | unset         | Neon Postgres pooled connection string. When set, all data is stored here (recommended on Render) |
| `DATA_DIR`        | `./data`      | JSON-file storage dir — only used when `DATABASE_URL` is empty |
| `ADMIN_PASSWORD`  | `biggod`      | Admin console password (password-only login)                  |
| `NODE_ENV`        | —             | `production` on Render                                        |

## Deploy to Render

1. Upload this folder as a Git repo (or point Render at your repo).
2. Render auto-detects the `render.yaml` blueprint. Confirm the service.
3. **Create the Neon database** — Render Dashboard → *New +* → *PostgreSQL →
   Neon*. Open the Neon project → *Connect* → copy the **Pooled** connection
   string (host contains `-pooler`).
4. In the service's *Environment* tab, set `DATABASE_URL` to that pooled
   string. (`render.yaml` declares it with `sync: false` so Render keeps your
   pasted value.)
5. Confirm `HTTPS=true`. First boot connects to Neon, creates the `app_data`
   table, and seeds the admin account.

> No persistent disk is needed — Neon is the durable storage. If you deploy
> without `DATABASE_URL`, the app silently uses JSON files on Render's
> ephemeral filesystem and data resets on every deploy/sleep.

## Content constraints (do not break)

- No references to `xteamfxtrdes.com`, `coingecko`, `coinmarketcap`, `/storage/`,
  `/uploads/`, `csrf`, `Laravel`, or `unsplash` anywhere in source.
- All deposits are crypto-only via the payment modal.
- Self-contained local assets; only external CDNs allowed are fonts.bunny.net,
  unpkg (lucide), cdn.jsdelivr.net (chart.js), s3.tradingview.com (tv.js).
