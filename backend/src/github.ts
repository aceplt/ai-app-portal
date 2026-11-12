export type GitHubRepo = { owner: string; name: string; fullName: string };

function parseGitHubRepoUrl(githubUrl: string): GitHubRepo | null {
  try {
    const u = new URL(githubUrl);
    // Accept https://github.com/<owner>/<repo>[/...]
    const parts = u.pathname.split('/').filter(Boolean);
    if (u.hostname !== 'github.com') return null;
    if (parts.length < 2) return null;
    const owner = parts[0];
    const name = parts[1].replace(/\.git$/, '');
    if (!owner || !name) return null;
    return { owner, name, fullName: `${owner}/${name}` };
  } catch {
    return null;
  }
}

export function parseGitHubRepoFromUrl(githubUrl: string): GitHubRepo | null {
  // If user passed just "owner/repo"
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubUrl.trim())) {
    const [owner, name] = githubUrl.trim().split('/');
    return { owner, name: name.replace(/\.git$/, ''), fullName: `${owner}/${name}` };
  }

  return parseGitHubRepoUrl(githubUrl);
}

type GitHubSecuritySignal = {
  ok: boolean;
  repo?: GitHubRepo;
  openDependabotAlerts?: number;
  openVulnerabilityAlerts?: number;
  // 1..5 where 5 means safer
  securityConfidence?: number;
  error?: string;
};

function mapToConfidence({ dependabotOpen, vulnOpen }: { dependabotOpen: number; vulnOpen: number }): number {
  // Simple mapping:
  // - 0 alerts => 5
  // - low alerts => 4
  // - moderate => 3
  // - high => 2
  // - very high => 1
  const total = dependabotOpen + vulnOpen;
  if (total <= 0) return 5;
  if (total <= 3) return 4;
  if (total <= 7) return 3;
  if (total <= 15) return 2;
  return 1;
}

async function githubCountAlerts(url: string, token: string): Promise<number> {
  // We only need a count-ish value.
  const res = await fetch(url, {
    headers: {
      'authorization': `Bearer ${token}`,
      'accept': 'application/vnd.github+json',
      'user-agent': 'aicreateappnews-backend'
    }
  });

  if (!res.ok) {
    return 0;
  }

  const data = await res.json();

  // Many endpoints return an array.
  if (Array.isArray(data)) return data.length;

  // Some endpoints may return { total_count: number }
  if (typeof data?.total_count === 'number') return data.total_count;

  return 0;
}

export async function getGitHubSecuritySignal(githubUrl: string, token: string): Promise<GitHubSecuritySignal> {
  const repo = parseGitHubRepoFromUrl(githubUrl);
  if (!repo) return { ok: false, error: 'invalid github repo url', repo: undefined };
  if (!token) return { ok: false, error: 'missing GITHUB_TOKEN', repo };

  // These endpoints require auth and permissions.
  // If the endpoint is unavailable for your token, we degrade gracefully.
  const dependabotUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/dependabot/alerts?per_page=100`;
  const vulnUrl = `https://api.github.com/repos/${repo.owner}/${repo.name}/vulnerability-alerts?per_page=100`;

  const [dependabotOpen, openVulnerabilityAlerts] = await Promise.all([
    githubCountAlerts(dependabotUrl, token),
    githubCountAlerts(vulnUrl, token)
  ]);

  const securityConfidence = mapToConfidence({ dependabotOpen, vulnOpen: openVulnerabilityAlerts });

  return {
    ok: true,
    repo,
    openDependabotAlerts: dependabotOpen,
    openVulnerabilityAlerts: openVulnerabilityAlerts,
    securityConfidence
  };
}
