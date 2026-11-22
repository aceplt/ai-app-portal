# AI Create App News — Portal (Cloudflare Pages-ready)

Frontend portal for `aicreateappnews.com`.

## What’s working now

- **Apps directory**: shows approved apps (from Cloudflare D1 worker when connected, plus local submissions) with real community like counts.
- **Likes system**: visitors can click "❤️ Like" on apps. Likes are persisted to Cloudflare D1 with duplicate prevention per user/IP.
- **Auto-approve**: when a pending submission reaches the like threshold (default: 5 likes), it automatically gets **Approved** and featured in the apps directory.
- **Admin portal**:
  - View pending submissions with live like counts from D1.
  - One-click actions per submission: **Like**, **Approve**, **Reject**, or **Delete**.
  - Configure like threshold and run batch auto-approval.
  - Optional `ADMIN_KEY` authentication header support (`Bearer <token>` / `x-admin-key`).
- **AI News feed**: filters by keyword and **source** (demo dropdown).

Files:
- `apps.html`, `submit.html`, `admin.html`, `news.html`
- `app.js`

## Pages Deployment

Because this is static HTML/CSS/JS, it can be deployed directly to **Cloudflare Pages** (no build required):
1. Create a Cloudflare Pages project.
2. Connect your Git repo (`ai-app-portal`).
3. Set build setting to **"Static (no build)"**.
4. Add custom domain `aicreateappnews.com` in Pages.
5. Update DNS in your registrar to point to Cloudflare.

## Backend Endpoints (Cloudflare Workers + D1)

- `GET /api/health` → `{ ok: true, service: "aicreateappnews-backend" }`
- `GET /api/news?limit=20&source=...` → `{ items: [{title, summary, url, publishedAt, source}] }`
- `GET /api/apps?limit=20&status=approved` → `{ items: [{id, name, description, languages, tags, githubUrl, demoUrl, author, submittedAt, status, likes}] }`
- `POST /api/submissions` → `{ ok: true, submissionId }` (validates types, handles upsert/conflicts)
- `POST /api/likes` (and `POST /api/votes`) → `{ ok: true, submissionId, likes, votes }` (IP + userKey duplicate prevention)
- `GET /api/likes?submissionId=...` → `{ ok: true, submissionId, likes }`
- `GET /api/admin/pending` → `{ items: [...] }` (includes live like counts, protected by `ADMIN_KEY` if set)
- `POST /api/admin/run-auto-approve` → `{ ok: true, changed, threshold }`
- `POST /api/admin/approve` → `{ ok: true, id, status: "approved" }`
- `POST /api/admin/reject` → `{ ok: true, id, status: "rejected" }`
- `POST /api/admin/delete` → `{ ok: true, id }` (deletes submission & associated likes)
- `POST /api/admin/clean-qa` → `{ ok: true, deleted: N }`
