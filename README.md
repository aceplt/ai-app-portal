# AI Create App News — Portal (Cloudflare Pages-ready)

Frontend portal for `aicreateappnews.com`.

## What’s working now (frontend demo)

- **Apps directory**: shows approved apps + locally submitted apps.
- **Voting (demo)**: visitors can “Upvote” apps. Votes are stored in the browser (`localStorage`).
- **Auto-approve (demo)**: when a pending submission reaches the vote threshold, it flips to **Approved** and appears in the main directory.
- **Admin (placeholder)**: shows pending submissions + current vote counts and can run auto-approve (demo).
- **AI News feed**: filters by keyword and **source** (demo dropdown).

Files:
- `apps.html`, `submit.html`, `admin.html`, `news.html`
- `app.js`

## Pages

Because this is static HTML/CSS/JS, it can be deployed directly to **Cloudflare Pages** (no build required).

Deploy:
1. Create a Cloudflare Pages project.
2. Connect your Git repo (or import this folder).
3. Set build setting to **"Static (no build)"**.
4. Add custom domain `aicreateappnews.com` in Pages.
5. Update DNS in your registrar to point to Cloudflare.

## Backend integration (next step)

This frontend expects backend endpoints on **Cloudflare Workers** (and a database on **Cloudflare D1**):

- `GET /api/news?limit=20&source=...` → `{ items: [{title, summary, url, publishedAt, source}] }`
- `GET /api/apps?limit=20` → `{ items: [{name, description, languages, tags, githubUrl, demoUrl, author, submittedAt}] }`
- `POST /api/submissions` → `{ ok: true, submissionId }`
- `POST /api/votes` → upvote submission/app (prevents duplicate votes per user)
- `GET /api/admin/pending`
- `POST /api/admin/run-auto-approve` (or approve specific submissions)

### Workers + D1 starter skeleton

I added a **starter** Workers/D1 skeleton under `backend/`:
- `backend/wrangler.toml`
- `backend/src/index.ts`
- `backend/src/db.ts`
- `backend/d1-schema.sql`

It currently returns **stub news** and has placeholder endpoints for apps/submissions/votes/admin so you can wire the real logic next.

## Notes / limitations

- Current voting + auto-approve is **browser-local demo**.
- For real moderation (“busting”), approvals, and multi-user voting, wire the frontend to the Workers API + D1 and add proper auth/rate limits.
