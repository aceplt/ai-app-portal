import type { D1Database } from '@cloudflare/workers-types';

export type SubmissionRow = {
  id: string;
  name: string;
  description: string;
  languages: string; // stored as comma-separated
  tags: string; // stored as comma-separated
  githubUrl: string | null;
  demoUrl: string | null;
  screenshotDataUrl: string | null;
  author: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  likes?: number;
};

export async function listSubmissionsWithLikes(
  db: D1Database,
  status: string,
  limit = 100
): Promise<(SubmissionRow & { likes: number })[]> {
  const res = await db.prepare(
    `SELECT s.*, COUNT(v.userKey) AS likes
     FROM submissions s
     LEFT JOIN votes v ON s.id = v.submissionId
     WHERE s.status = ?
     GROUP BY s.id
     ORDER BY s.submittedAt DESC
     LIMIT ?`
  ).bind(status, limit).all();

  return (res.results as any[]).map(r => ({
    id: r.id,
    name: r.name,
    description: r.description,
    languages: r.languages,
    tags: r.tags,
    githubUrl: r.githubUrl || null,
    demoUrl: r.demoUrl || null,
    screenshotDataUrl: r.screenshotDataUrl || null,
    author: r.author,
    submittedAt: r.submittedAt,
    status: r.status,
    likes: Number(r.likes || 0)
  }));
}

export async function listPendingSubmissions(
  db: D1Database,
  limit = 100
): Promise<(SubmissionRow & { likes: number })[]> {
  return listSubmissionsWithLikes(db, 'pending', limit);
}

export async function submissionExists(db: D1Database, id: string): Promise<boolean> {
  const res = await db.prepare(`SELECT 1 FROM submissions WHERE id = ?`).bind(id).first();
  return !!res;
}

export async function autoApproveByLikes(db: D1Database, threshold: number): Promise<number> {
  // Approve submissions with likes (votes) >= threshold
  const res = await db.prepare(
    `UPDATE submissions
     SET status = 'approved'
     WHERE status = 'pending'
       AND id IN (
         SELECT submissionId
         FROM votes
         GROUP BY submissionId
         HAVING COUNT(*) >= ?
       )`
  ).bind(threshold).run();

  return (res.meta as any)?.changes ?? 0;
}

export const autoApproveByVotes = autoApproveByLikes;

export async function upsertLike(db: D1Database, submissionId: string, userKey: string): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT OR IGNORE INTO votes (submissionId, userKey, createdAt) VALUES (?, ?, ?)`
  ).bind(submissionId, userKey, now).run();
}

export const upsertVote = upsertLike;

export async function likeCount(db: D1Database, submissionId: string): Promise<number> {
  const res = await db.prepare(
    `SELECT COUNT(*) AS c FROM votes WHERE submissionId = ?`
  ).bind(submissionId).first<{ c: number }>();
  return Number((res as any)?.c ?? 0);
}

export const voteCount = likeCount;

export async function setSubmissionStatus(
  db: D1Database,
  id: string,
  status: 'approved' | 'rejected' | 'pending'
): Promise<boolean> {
  const res = await db.prepare(
    `UPDATE submissions SET status = ? WHERE id = ?`
  ).bind(status, id).run();
  return ((res.meta as any)?.changes ?? 0) > 0;
}

export async function deleteSubmission(db: D1Database, id: string): Promise<boolean> {
  await db.prepare(`DELETE FROM votes WHERE submissionId = ?`).bind(id).run();
  const res = await db.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  return ((res.meta as any)?.changes ?? 0) > 0;
}

export async function cleanQaSubmissions(db: D1Database): Promise<number> {
  await db.prepare(
    `DELETE FROM votes WHERE submissionId IN (
       SELECT id FROM submissions
       WHERE id LIKE 'sub_qa_%'
          OR (id LIKE 'local_%' AND name LIKE 'QA TEST%')
          OR tags LIKE '%qa-test%'
          OR description LIKE '%Automated QA test%'
     )`
  ).run();

  const res = await db.prepare(
    `DELETE FROM submissions
     WHERE id LIKE 'sub_qa_%'
        OR (id LIKE 'local_%' AND name LIKE 'QA TEST%')
        OR tags LIKE '%qa-test%'
        OR description LIKE '%Automated QA test%'`
  ).run();

  return (res.meta as any)?.changes ?? 0;
}
