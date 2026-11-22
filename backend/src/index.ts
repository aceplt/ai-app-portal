import { NEWS_SOURCES } from './sources';
import {
  autoApproveByLikes,
  autoApproveByVotes,
  cleanQaSubmissions,
  deleteSubmission,
  likeCount,
  listPendingSubmissions,
  listSubmissionsWithLikes,
  setSubmissionStatus,
  submissionExists,
  upsertLike,
  upsertVote,
  voteCount
} from './db';
import { getGitHubSecuritySignal } from './github';

type Json = Record<string, any>;

function json(body: any, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS,DELETE',
      'access-control-allow-headers': 'content-type, accept, authorization, x-admin-key',
      ...(init.headers || {})
    }
  });
}

function checkAdminAuth(request: Request, env: any): boolean {
  const configuredKey = String(env.ADMIN_KEY || env.ADMIN_SECRET || '').trim();
  // If no admin key configured in Worker env, allow access in dev/demo mode
  if (!configuredKey) return true;

  const authHeader = request.headers.get('authorization') || '';
  const customHeader = request.headers.get('x-admin-key') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : customHeader.trim();
  return token === configuredKey;
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS,DELETE',
          'access-control-allow-headers': 'content-type, accept, authorization, x-admin-key'
        }
      });
    }

    if (pathname === '/api/health') {
      return json({ ok: true, service: 'aicreateappnews-backend' });
    }

    // --- News ---
    if (request.method === 'GET' && pathname === '/api/news') {
      const limit = Number(searchParams.get('limit') || 20);
      const source = searchParams.get('source') || null;

      return json({
        items: [
          {
            title: 'Demo: wire up multi-source news ingestion',
            summary: 'Use scheduled ingestion to populate news_items in D1.',
            url: 'https://example.com/demo',
            publishedAt: new Date().toISOString().slice(0, 10),
            source: source || 'demo'
          }
        ].slice(0, limit)
      });
    }

    // --- Security check (GitHub Dependabot + vulnerability alerts) ---
    if (request.method === 'GET' && pathname === '/api/security-check') {
      const githubUrl = String(searchParams.get('githubUrl') || '');
      const token = env.GITHUB_TOKEN || '';

      const signal = await getGitHubSecuritySignal(githubUrl, token);
      if (!signal.ok) {
        return json({ ok: false, error: signal.error || 'failed', repo: signal.repo }, { status: 400 });
      }

      return json({
        ok: true,
        repo: signal.repo?.fullName,
        openDependabotAlerts: signal.openDependabotAlerts,
        openVulnerabilityAlerts: signal.openVulnerabilityAlerts,
        securityConfidence: signal.securityConfidence
      });
    }

    // --- Apps (approved list / directory with real like counts) ---
    if (request.method === 'GET' && pathname === '/api/apps') {
      const limit = Number(searchParams.get('limit') || 20);
      if (!env.DB) {
        return json({ items: [], limit });
      }

      const status = String(searchParams.get('status') || 'approved');
      try {
        const items = await listSubmissionsWithLikes(env.DB, status, limit);
        return json({ items, limit });
      } catch (e: any) {
        return json({ ok: false, error: 'd1_apps_failed', details: String(e?.message || e) }, { status: 500 });
      }
    }

    // --- Debug D1 schema (safe, no secrets) ---
    if (request.method === 'GET' && pathname === '/api/debug-d1') {
      if (!env.DB) {
        return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });
      }

      try {
        const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all();
        const tableNames = (tables.results as any[]).map(r => r.name);

        let submissionsCols: any[] = [];
        try {
          const cols = await env.DB.prepare(`PRAGMA table_info(submissions)`).all();
          submissionsCols = cols.results as any[];
        } catch {
          submissionsCols = [];
        }

        return json({ ok: true, tableNames, submissionsCols });
      } catch (e: any) {
        return json({ ok: false, error: 'debug_failed', details: String(e?.message || e) }, { status: 500 });
      }
    }

    // --- Submissions ---
    if (request.method === 'POST' && pathname === '/api/submissions') {
      const body = (await request.json().catch(() => null)) as Json | null;
      if (!body) return json({ ok: false, error: 'invalid json' }, { status: 400 });

      if (!env.DB) {
        return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });
      }

      const name = String(body.name || '').trim();
      if (!name) {
        return json({ ok: false, error: 'name is required' }, { status: 400 });
      }

      const submissionId = String(body.id || `sub_${Math.random().toString(16).slice(2)}`).trim();
      const description = String(body.description || '').trim();

      // Normalize languages & tags (accept arrays or comma-delimited strings)
      const rawLanguages = Array.isArray(body.languages)
        ? body.languages
        : typeof body.languages === 'string'
        ? body.languages.split(',')
        : [];
      const languages = rawLanguages.map((s: any) => String(s).trim()).filter(Boolean).join(',');

      const rawTags = Array.isArray(body.tags)
        ? body.tags
        : typeof body.tags === 'string'
        ? body.tags.split(',')
        : [];
      const tags = rawTags.map((s: any) => String(s).trim()).filter(Boolean).join(',');

      const githubUrl = body.githubUrl ? String(body.githubUrl).trim() : null;
      const demoUrl = body.demoUrl ? String(body.demoUrl).trim() : null;
      const author = String(body.author || 'unknown').trim();

      // Enforce max screenshot data size (~500KB)
      const rawScreenshot = body.screenshotDataUrl ? String(body.screenshotDataUrl) : null;
      const screenshotDataUrl = rawScreenshot && rawScreenshot.length < 500000 ? rawScreenshot : null;

      const submittedAt = typeof body.submittedAt === 'string' && body.submittedAt.length >= 10
        ? body.submittedAt.slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      try {
        await env.DB.prepare(
          `INSERT INTO submissions
            (id, name, description, languages, tags, githubUrl, demoUrl, screenshotDataUrl, author, submittedAt, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description,
             languages = excluded.languages,
             tags = excluded.tags,
             githubUrl = excluded.githubUrl,
             demoUrl = excluded.demoUrl,
             screenshotDataUrl = coalesce(excluded.screenshotDataUrl, submissions.screenshotDataUrl),
             author = excluded.author`
        ).bind(
          submissionId,
          name,
          description,
          languages,
          tags,
          githubUrl,
          demoUrl,
          screenshotDataUrl,
          author,
          submittedAt
        ).run();

        return json({ ok: true, submissionId });
      } catch (e: any) {
        return json({ ok: false, error: 'd1_insert_submission_failed', details: String(e?.message || e) }, { status: 500 });
      }
    }

    // --- Likes / Voting ---
    if (request.method === 'GET' && (pathname === '/api/likes' || pathname === '/api/votes')) {
      const submissionId = String(searchParams.get('submissionId') || '');
      if (!submissionId) return json({ ok: false, error: 'missing submissionId' }, { status: 400 });
      if (!env.DB) return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });

      const count = await likeCount(env.DB, submissionId);
      return json({ ok: true, submissionId, likes: count, votes: count });
    }

    if (request.method === 'POST' && (pathname === '/api/likes' || pathname === '/api/votes')) {
      const body = (await request.json().catch(() => null)) as Json | null;
      if (!body) return json({ ok: false, error: 'invalid json' }, { status: 400 });

      const submissionId = String(body.submissionId || '');
      if (!submissionId) return json({ ok: false, error: 'missing submissionId' }, { status: 400 });

      if (!env.DB) return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });

      // Verify submission exists
      const exists = await submissionExists(env.DB, submissionId);
      if (!exists) {
        return json({ ok: false, error: 'submission not found' }, { status: 404 });
      }

      // Robust voter identity: combine client IP with optional userKey to prevent console spam
      const ip = request.headers.get('cf-connecting-ip') || 'anon';
      const clientKey = String(body.userKey || '').trim().slice(0, 64);
      const voterKey = clientKey ? `${ip}:${clientKey}` : ip;

      await upsertLike(env.DB, submissionId, voterKey);
      const count = await likeCount(env.DB, submissionId);

      return json({ ok: true, submissionId, likes: count, votes: count });
    }

    // --- Admin Endpoints (protected by checkAdminAuth) ---
    if (pathname.startsWith('/api/admin/')) {
      if (!checkAdminAuth(request, env)) {
        return json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }

      if (!env.DB) {
        return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });
      }

      if (request.method === 'GET' && pathname === '/api/admin/pending') {
        const limit = Number(searchParams.get('limit') || 100);
        const pending = await listPendingSubmissions(env.DB, limit);
        return json({ items: pending });
      }

      if (request.method === 'POST' && pathname === '/api/admin/run-auto-approve') {
        const body = (await request.json().catch(() => ({}))) as Json;
        // Server enforces sensible threshold (defaults to 5, min 1)
        const requestedThreshold = Number(body.minLikes ?? body.threshold);
        const threshold = Number.isFinite(requestedThreshold) && requestedThreshold > 0
          ? requestedThreshold
          : Number(env.MIN_LIKES || 5);

        const changed = await autoApproveByLikes(env.DB, threshold);
        return json({ ok: true, changed, threshold });
      }

      if (request.method === 'POST' && pathname === '/api/admin/approve') {
        const body = (await request.json().catch(() => ({}))) as Json;
        const id = String(body.id || '');
        if (!id) return json({ ok: false, error: 'missing id' }, { status: 400 });

        const success = await setSubmissionStatus(env.DB, id, 'approved');
        return json({ ok: success, id, status: 'approved' });
      }

      if (request.method === 'POST' && pathname === '/api/admin/reject') {
        const body = (await request.json().catch(() => ({}))) as Json;
        const id = String(body.id || '');
        if (!id) return json({ ok: false, error: 'missing id' }, { status: 400 });

        const success = await setSubmissionStatus(env.DB, id, 'rejected');
        return json({ ok: success, id, status: 'rejected' });
      }

      if (request.method === 'POST' && (pathname === '/api/admin/delete' || pathname === '/api/admin/submissions/delete')) {
        const body = (await request.json().catch(() => ({}))) as Json;
        const id = String(body.id || '');
        if (!id) return json({ ok: false, error: 'missing id' }, { status: 400 });

        const success = await deleteSubmission(env.DB, id);
        return json({ ok: success, id });
      }

      if (request.method === 'POST' && pathname === '/api/admin/clean-qa') {
        const deleted = await cleanQaSubmissions(env.DB);
        return json({ ok: true, deleted });
      }
    }

    return json({ ok: false, error: 'not found' }, { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: any, ctx: ExecutionContext) {
    if (controller.cron === 'ingest_news') {
      const now = new Date().toISOString();
      console.log(`[ingest_news] scheduled tick at ${now}. Sources:`, NEWS_SOURCES.map(s => s.id));
    }
  }
};
