# AI Create App News — Portal (Cloudflare Pages-ready)

This is the **frontend portal** for `aicreateappnews.com`.

## Pages
- `/` Home + Latest AI news + Latest Apps
- `/apps.html` Apps directory
- `/submit.html` Submit an app (flows to backend later)
- `/news.html` AI news feed
- `/admin.html` Admin placeholder (will require auth + approvals)

## Backend integration (next step)
This frontend expects backend endpoints you’ll host on **Cloudflare Workers**:
- `GET /api/news?limit=20` → `{ items: [{title, summary, url, publishedAt, source}] }`
- `GET /api/apps?limit=20` → `{ items: [{name, description, languages, tags, githubUrl, demoUrl, author, submittedAt}] }`
- `POST /api/submissions` → `{ ok: true, submissionId }`
- Admin endpoints (example): `GET /api/admin/pending`, `POST /api/admin/approve`.

For now, the portal uses **local sample data** so you can test the UI immediately.

## Deploy
Because this is static HTML/CSS/JS, it can be deployed directly to **Cloudflare Pages** (no build required).
1. Create a Cloudflare Pages project.
2. Connect your Git repo (or upload/import this folder).
3. Set the Pages build setting to **"Static (no build)"**.
4. Add custom domain `aicreateappnews.com` in Pages.
5. Update DNS in your registrar to point to Cloudflare.

When you have Workers + database set up, I’ll wire the real API calls.
