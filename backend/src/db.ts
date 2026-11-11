import type { D1Database } from '@cloudflare/workers-types';

export type SubmissionRow = {
  id: string;
  name: string;
  description: string;
  languages: string; // stored as comma-separated (demo)
  tags: string; // stored as comma-separated (demo)
  githubUrl: string | null;
  demoUrl: string | null;
  author: string;
  submittedAt: string;
  status: 'pending' | 'approved';
};

export async function listPendingSubmissions(db: D1Database, limit = 100): Promise<SubmissionRow[]> {
  const res = await db.prepare(
    `SELECT * FROM submissions WHERE status = 'pending' ORDER BY submittedAt DESC LIMIT ?`
  ).bind(limit).all();
  return (res.results as any) as SubmissionRow[];
}

export async function autoApproveByVotes(db: D1Database, threshold: number): Promise<number> {
  // Approve submissions with votes >= threshold
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

  // D1 returns changes as affectedRows (depending on driver); keep it simple for demo.
  return (res.meta as any)?.changes ?? 0;
}

export async function upsertVote(db: D1Database, submissionId: string, userKey: string): Promise<void> {
  // Prevent duplicate votes per userKey
  await db.prepare(
    `INSERT OR IGNORE INTO votes (submissionId, userKey) VALUES (?, ?)`
  ).bind(submissionId, userKey).run();
}

export async function voteCount(db: D1Database, submissionId: string): Promise<number> {
  const res = await db.prepare(
    `SELECT COUNT(*) AS c FROM votes WHERE submissionId = ?`
  ).bind(submissionId).first<{ c: number }>();
  // D1 first() may return {c: number} or undefined
  return Number((res as any)?.c ?? 0);
}
