import { NEWS_SOURCES } from './sources';
import { autoApproveByVotes, listPendingSubmissions, upsertVote, voteCount } from './db';
import { getGitHubSecuritySignal } from './github';

type Json = Record<string, any>;

function json(body: any, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type, accept',
      ...(init.headers || {})
    }
  });
}

export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const { pathname, searchParams } = url;

    // Basic CORS for Pages-hosted frontend (adjust as needed)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type, accept'
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

      // TODO: query D1 news_items
      // For now return stub if DB not ready.
      // When wired: select where source = ? (optional).
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

    // --- Apps (approved list) ---
    if (request.method === 'GET' && pathname === '/api/apps') {
      const limit = Number(searchParams.get('limit') || 20);
      if (!env.DB) {
        return json({ items: [], limit });
      }

      const status = String(searchParams.get('status') || 'approved');
      const res = await env.DB.prepare(
        `SELECT * FROM submissions
         WHERE status = ?
         ORDER BY submittedAt DESC
         LIMIT ?`
      ).bind(status, limit).all();

      const items = (res.results as any[]).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description,
        languages: String(r.languages || '').split(',').filter(Boolean),
        tags: String(r.tags || '').split(',').filter(Boolean),
        githubUrl: r.githubUrl || null,
        demoUrl: r.demoUrl || null,
        screenshotDataUrl: r.screenshotDataUrl || null,
        author: r.author,
        submittedAt: r.submittedAt,
        status: r.status
      }));

      return json({ items, limit });
    }

    // --- Submissions ---
    if (request.method === 'POST' && pathname === '/api/submissions') {
      const body = (await request.json().catch(() => null)) as Json | null;
      if (!body) return json({ ok: false, error: 'invalid json' }, { status: 400 });

      if (!env.DB) {
        return json({ ok: false, error: 'D1 DB not configured' }, { status: 500 });
      }

      const submissionId = body.id || `sub_${Math.random().toString(16).slice(2)}`;
      const now = new Date().toISOString();

      await env.DB.prepare(
        `INSERT INTO submissions
          (id, name, description, languages, tags, githubUrl, demoUrl, screenshotDataUrl, author, submittedAt, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
      ).bind(
        submissionId,
        body.name || 'unnamed',
        body.description || '',
        (body.languages || []).join(','),
        (body.tags || []).join(','),
        body.githubUrl || null,
        body.demoUrl || null,
        body.screenshotDataUrl || null,
        body.author || 'unknown',
        (body.submittedAt || now).slice(0, 10)
      ).run();

      return json({ ok: true, submissionId });
    }

    // --- Votes (demo) ---
    if (request.method === 'POST' && pathname === '/api/votes') {
      const body = (await request.json().catch(() => null)) as Json | null;
      if (!body) return json({ ok: false, error: 'invalid json' }, { status: 400 });

      const submissionId = String(body.submissionId || '');
      if (!submissionId) return json({ ok: false, error: 'missing submissionId' }, { status: 400 });

      // Demo user identity
      const userKey = String(body.userKey || request.headers.get('cf-connecting-ip') || 'anon');

      await upsertVote(env.DB, submissionId, userKey);
      const count = await voteCount(env.DB, submissionId);

      return json({ ok: true, submissionId, votes: count });
    }

    // --- Admin ---
    if (request.method === 'GET' && pathname === '/api/admin/pending') {
      // TODO: auth
      const limit = Number(searchParams.get('limit') || 100);
      const pending = await listPendingSubmissions(env.DB, limit);
      return json({ items: pending });
    }

    if (request.method === 'POST' && pathname === '/api/admin/run-auto-approve') {
      // TODO: auth
      const body = (await request.json().catch(() => ({}))) as Json;
      const threshold = Number(body.threshold || 5);
      const changed = await autoApproveByVotes(env.DB, threshold);
      return json({ ok: true, changed });
    }

    return json({ ok: false, error: 'not found' }, { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: any, ctx: ExecutionContext) {
    if (controller.cron === 'ingest_news') {
      const now = new Date().toISOString();
      console.log(`[ingest_news] scheduled tick at ${now}. Sources:`, NEWS_SOURCES.map(s => s.id));
      // TODO: persist ingestion run metadata to D1.
    }
  }
};
