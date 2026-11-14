// Frontend portal demo
// Uses local sample data + localStorage for submissions + voting.
// Later: connect to Cloudflare Workers + database.

const sampleNews = [
  {
    title: 'New model release: instant code generation improvements',
    summary: 'A new model improves tool-usage and supports multi-language code workflows.',
    url: 'https://example.com/news/model-release',
    publishedAt: '2026-11-11',
    source: 'AI News Digest'
  },
  {
    title: 'AI agent frameworks add safer submission + moderation pipelines',
    summary: 'Developers are adopting approval workflows to manage user-generated apps.',
    url: 'https://example.com/news/moderation',
    publishedAt: '2026-11-10',
    source: 'Dev Tools'
  },
  {
    title: 'Community apps: Python + HTML starters trend',
    summary: 'Popular repos combine Python backends with simple HTML frontends for quick launches.',
    url: 'https://example.com/news/community-trends',
    publishedAt: '2026-11-09',
    source: 'Community'
  }
];

const sampleApps = [
  {
    id: 'app_radar',
    name: 'AppRadar',
    description: 'Directory + search for AI apps with tag-based browsing.',
    languages: ['Python', 'HTML'],
    tags: ['directory', 'search'],
    githubUrl: 'https://github.com/example/app-radar',
    demoUrl: 'https://example.com/app-radar',
    author: 'alice',
    submittedAt: '2026-11-11',
    status: 'approved'
  },
  {
    id: 'news_miner',
    name: 'NewsMiner',
    description: 'Scrapes RSS feeds and summarizes AI model updates.',
    languages: ['Python'],
    tags: ['news', 'rss'],
    githubUrl: 'https://github.com/example/news-miner',
    demoUrl: 'https://example.com/news-miner',
    author: 'bob',
    submittedAt: '2026-11-10',
    status: 'approved'
  },
  {
    id: 'codeforge_cpp',
    name: 'CodeForge C++',
    description: 'C++ templates + analysis helpers for common algorithms.',
    languages: ['C++'],
    tags: ['cpp', 'templates'],
    githubUrl: 'https://github.com/example/codeforge-cpp',
    demoUrl: 'https://example.com/codeforge-cpp',
    author: 'charlie',
    submittedAt: '2026-11-09',
    status: 'approved'
  }
];

const STORAGE_SUBMISSIONS_KEY = 'aicn_submissions';
const STORAGE_SUBMISSIONS_FALLBACK_KEY = 'aicn_pending_submissions';
const STORAGE_VOTES_KEY = 'aicn_votes'; // { [appId]: number }
const STORAGE_VOTED_KEY = 'aicn_voted'; // Set-ish array
const STORAGE_AUTO_THRESHOLD_KEY = 'aicn_auto_threshold';
const STORAGE_USER_KEY = 'aicn_user';
const STORAGE_REVIEWS_KEY = 'aicn_reviews';
const STORAGE_REVIEWED_KEY = 'aicn_reviewed';
const STORAGE_API_BASE_URL_KEY = 'aicn_api_base_url'; // optional override

const DEFAULT_GITHUB_WORKER_BASE = 'https://aicreateappnews-backend.automatic-beetle.workers.dev';

function getApiBaseUrl() {
  // If empty, use same-origin relative /api/... (requires Workers routing).
  // If set (ex: https://<worker>.<acct>.workers.dev), we call that instead.
  // For now we also default to the currently deployed workers.dev Worker.
  const stored = String(localStorage.getItem(STORAGE_API_BASE_URL_KEY) || '').trim();
  return stored || DEFAULT_GITHUB_WORKER_BASE;
}

function formatDate(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return s;
  }
}

function uniq(arr) { return [...new Set(arr)]; }

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else if (c) node.appendChild(c);
  }
  return node;
}

function loadSubmissions() {
  const raw = localStorage.getItem(STORAGE_SUBMISSIONS_KEY);
  const fallbackRaw = localStorage.getItem(STORAGE_SUBMISSIONS_FALLBACK_KEY);
  const rawToUse = raw ?? fallbackRaw;
  if (!rawToUse) return [];
  try {
    const subs = JSON.parse(rawToUse);
    if (!Array.isArray(subs)) return [];
    // Normalize
    return subs.map(s => ({
      status: s.status || 'pending',
      ...s,
    }));
  } catch {
    return [];
  }
}

function saveSubmissions(subs) {
  localStorage.setItem(STORAGE_SUBMISSIONS_KEY, JSON.stringify(subs));
  localStorage.removeItem(STORAGE_SUBMISSIONS_FALLBACK_KEY);
}

function loadVotes() {
  try {
    const raw = localStorage.getItem(STORAGE_VOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveVotes(votes) {
  localStorage.setItem(STORAGE_VOTES_KEY, JSON.stringify(votes));
}

function loadVoted() {
  try {
    const raw = localStorage.getItem(STORAGE_VOTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveVoted(set) {
  localStorage.setItem(STORAGE_VOTED_KEY, JSON.stringify([...set]));
}

function getAutoThreshold() {
  const raw = localStorage.getItem(STORAGE_AUTO_THRESHOLD_KEY);
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function setAutoThreshold(n) {
  localStorage.setItem(STORAGE_AUTO_THRESHOLD_KEY, String(n));
}

function getAutoMinReviews() {
  const raw = localStorage.getItem('aicn_auto_min_reviews');
  const n = raw ? Number(raw) : 10;
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

function setAutoMinReviews(n) {
  localStorage.setItem('aicn_auto_min_reviews', String(n));
}

function getAutoMinAvgRating() {
  const raw = localStorage.getItem('aicn_auto_min_avg_rating');
  const n = raw ? Number(raw) : 4.0;
  return Number.isFinite(n) && n > 0 ? n : 4.0;
}

function setAutoMinAvgRating(n) {
  localStorage.setItem('aicn_auto_min_avg_rating', String(n));
}

function getAutoMinAgeHours() {
  const raw = localStorage.getItem('aicn_auto_min_age_hours');
  const n = raw ? Number(raw) : 2;
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

function setAutoMinAgeHours(n) {
  localStorage.setItem('aicn_auto_min_age_hours', String(n));
}

function ensureUserKey() {
  let v = localStorage.getItem(STORAGE_USER_KEY);
  if (!v) {
    v = 'user_' + Math.random().toString(16).slice(2) + '_' + Date.now().toString(16);
    localStorage.setItem(STORAGE_USER_KEY, v);
  }
  return v;
}

function loadReviews() {
  try {
    const raw = localStorage.getItem(STORAGE_REVIEWS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveReviews(reviews) {
  localStorage.setItem(STORAGE_REVIEWS_KEY, JSON.stringify(reviews));
}

function loadReviewedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_REVIEWED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveReviewedSet(set) {
  localStorage.setItem(STORAGE_REVIEWED_KEY, JSON.stringify([...set]));
}

function getReviewStats(appId) {
  const reviews = loadReviews().filter(r => r.appId === appId);
  if (!reviews.length) return { count: 0, avg: 0 };

  let sum = 0;
  for (const r of reviews) sum += Number(r.rating || 0);
  const avg = sum / reviews.length;
  return { count: reviews.length, avg };
}

function isLikelyGitHubRepoInput(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  // Accept:
  // - https://github.com/<owner>/<repo>
  // - http://github.com/<owner>/<repo>
  // - github.com/<owner>/<repo>
  // - <owner>/<repo>
  return (
    /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(t) ||
    /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(t) ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)
  );
}

function normalizeMaybeUrl(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';

  // Fix common copy/paste mistakes like `http:\github.com/...`
  // by converting backslashes to forward slashes first.
  t = t.replace(/\\/g, '/');

  const lower = t.toLowerCase();
  // After backslash->slash, `http:\github.com/...` becomes `http:/github.com/...`
  if (lower.startsWith('http:/')) {
    t = 'https://' + t.slice('http:/'.length);
  }
  if (lower.startsWith('http://')) {
    t = 'https://' + t.slice('http://'.length);
  }

  // If already has protocol, keep it
  if (/^https?:\/\//i.test(t)) return t;

  // Otherwise, treat as host/path and prefix https://
  return 'https://' + t;
}

function normalizeGitHubRepoInput(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';

  t = t.replace(/\\/g, '/');

  // If user typed just owner/repo
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) {
    return 'https://github.com/' + t;
  }

  // If user typed github.com/owner/repo
  if (/^github\.com\//i.test(t)) {
    return 'https://' + t;
  }

  // If user typed http(s)://github.com/...
  if (/^https?:\/\/github\.com\//i.test(t)) {
    return t.replace(/^http:\/\//i, 'https://');
  }

  // If the user typed something weird that still contains github.com/owner/repo
  const m = t.match(/github\.com\/(.+)$/i);
  if (m && m[1]) {
    const tail = m[1].replace(/\.git$/i, '');
    // Expect owner/repo
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(tail)) {
      const parts = tail.split('/');
      return 'https://github.com/' + parts[0] + '/' + parts[1];
    }
  }

  return t;
}

async function fetchGitHubSecurity(githubUrl) {
  let apiUrl = '';
  try {
    if (!isLikelyGitHubRepoInput(githubUrl)) {
      return {
        ok: false,
        error: 'Invalid GitHub repo URL. Use https://github.com/<owner>/<repo>',
        securityConfidence: null,
        status: null,
        apiUrl: null,
        raw: null
      };
    }
    // Use admin-provided base URL (localStorage) with safe normalization.
    const baseRaw = String(getApiBaseUrl() || '').trim();

    // Allow inputs like:
    // - https://worker...workers.dev
    // - https://worker...workers.dev/
    // - https://worker...workers.dev/api  (we’ll strip trailing /api)
    const base = baseRaw
      .replace(/\/+$/, '')
      .replace(/\/api$/i, '');

    apiUrl =
      base +
      '/api/security-check' +
      '?githubUrl=' + encodeURIComponent(githubUrl);

    const resp = await fetch(apiUrl, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store'
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        error: data?.error || 'failed',
        securityConfidence: null,
        status: resp.status,
        apiUrl,
        raw: data
      };
    }

    return { ok: true, securityConfidence: data?.securityConfidence, raw: data, apiUrl };
  } catch (e) {
    return {
      ok: false,
      error: 'network/worker not connected',
      securityConfidence: null,
      apiUrl,
      debug: String(e || 'unknown error')
    };
  }
}

function getVoteCount(appId) {
  const votes = loadVotes();
  return Number(votes[appId] || 0);
}

function getAutoConfig() {
  return {
    minVotes: getAutoThreshold(),
    minReviews: getAutoMinReviews(),
    minAvgRating: getAutoMinAvgRating(),
    minAgeHours: getAutoMinAgeHours()
  };
}

function shouldAutoApprove(submission, reviewStats, voteCount, cfg) {
  if (submission.status !== 'pending') return false;
  if (voteCount < cfg.minVotes) return false;
  if (reviewStats.count < cfg.minReviews) return false;
  if (reviewStats.avg < cfg.minAvgRating) return false;

  if (submission.submittedAt) {
    const ageMs = Date.now() - new Date(submission.submittedAt).getTime();
    const ageHours = Number.isFinite(ageMs) ? ageMs / 3600000 : 0;
    if (ageHours < cfg.minAgeHours) return false;
  }

  return true;
}

function autoApprovePending(cfg) {
  const subs = loadSubmissions();
  const votes = loadVotes();
  const reviews = loadReviews();

  // Pre-group reviews by appId for speed
  const reviewByApp = new Map();
  for (const r of reviews) {
    if (!reviewByApp.has(r.appId)) reviewByApp.set(r.appId, []);
    reviewByApp.get(r.appId).push(r);
  }

  const reviewStatsByApp = new Map();
  for (const [appId, list] of reviewByApp.entries()) {
    let sum = 0;
    for (const r of list) sum += Number(r.rating || 0);
    const avg = list.length ? sum / list.length : 0;
    reviewStatsByApp.set(appId, { count: list.length, avg });
  }

  let changed = false;
  const next = subs.map(s => {
    if (s.status !== 'pending') return s;
    const vc = Number(votes[s.id] || 0);
    const rs = reviewStatsByApp.get(s.id) || { count: 0, avg: 0 };
    if (shouldAutoApprove(s, rs, vc, cfg)) {
      changed = true;
      return { ...s, status: 'approved' };
    }
    return s;
  });

  if (changed) saveSubmissions(next);
  return changed;
}

function getAllApps() {
  const subs = loadSubmissions();
  const pending = subs.filter(s => s.status === 'pending');
  const approved = subs.filter(s => s.status === 'approved');

  const approvedMerged = [...sampleApps, ...approved].map(a => ({
    ...a,
    status: a.status || 'approved'
  }));

  const pendingMerged = pending.map(p => ({
    ...p,
    status: 'pending'
  }));

  return { approved: approvedMerged, pending: pendingMerged };
}

function renderNews(list, container) {
  container.innerHTML = '';
  list.forEach(item => {
    const row = el('div', { class: 'item' });

    const title = el('div', { class: 'item-title' });
    title.appendChild(
      el('a', { href: item.url, target: '_blank', rel: 'noopener' }, [item.title])
    );
    title.appendChild(el('div', { class: 'item-meta' }, [formatDate(item.publishedAt)]));

    row.appendChild(title);
    row.appendChild(el('div', { class: 'item-desc' }, [item.summary]));
    row.appendChild(el('div', { class: 'item-meta' }, ['Source: ' + item.source]));

    container.appendChild(row);
  });
}

function renderApps(list, container, { enableVoting = false, onVote = null, onReview = null } = {}) {
  container.innerHTML = '';

  list.forEach(app => {
    const card = el('div', { class: 'app-card' });
    card.appendChild(el('h3', {}, [app.name]));

    if (app.screenshotDataUrl) {
      const img = el('img', {
        src: app.screenshotDataUrl,
        alt: app.name + ' screenshot',
        style: 'width:100%; max-height:220px; object-fit:cover; border-radius:12px; margin-top:10px;'
      });
      card.appendChild(img);
    }

    const metaPieces = [];
    metaPieces.push('by ' + (app.author || 'unknown'));
    if (app.submittedAt) metaPieces.push(formatDate(app.submittedAt));

    card.appendChild(el('div', { class: 'item-meta' }, [metaPieces.join(' · ') || '']));

    const badges = el('div', { class: 'badges' });
    badges.appendChild(el('span', { class:'badge' }, [app.status === 'approved' ? 'Approved' : 'Pending']));

    const rs = getReviewStats(app.id);
    if (rs.count > 0) {
      badges.appendChild(el('span', { class:'badge' }, [`${rs.avg.toFixed(1)}★ Sec (${rs.count} reviews)`]));
    }
    if (enableVoting) {
      badges.appendChild(el('span', { class: 'badge' }, [getVoteCount(app.id) + ' votes']));
    }

    (app.languages || []).forEach(l => badges.appendChild(el('span', { class: 'badge' }, [l])));
    card.appendChild(badges);

    card.appendChild(el('div', { class: 'item-desc' }, [app.description || '']));

    const links = el('div', { class: 'item-meta' });
    const parts = [];
    if (app.githubUrl) parts.push(el('a', { href: app.githubUrl, target: '_blank', rel: 'noopener' }, ['GitHub']));
    if (app.demoUrl) parts.push(el('a', { href: app.demoUrl, target: '_blank', rel: 'noopener' }, ['Demo']));

    if (parts.length) {
      links.appendChild(el('span', {}, ['Links: ']));
      parts.forEach((p, i) => {
        links.appendChild(p);
        if (i === 0 && parts[1]) links.appendChild(document.createTextNode(' | '));
      });
      card.appendChild(links);
    }

    if (enableVoting) {
      const voted = loadVoted();
      const already = voted.has(app.id);
      const cfg = getAutoConfig();

      const voteRow = el('div', { class: 'form-row', style: 'margin-top:12px' });
      const voteBtn = el('button', { class: 'btn btn-small', disabled: already ? 'disabled' : undefined }, [already ? 'Voted ✅' : 'Upvote']);

      voteBtn.addEventListener('click', () => {
        if (voted.has(app.id)) return;

        if (typeof onVote === 'function') {
          onVote(app.id);
          return;
        }
      });

      voteRow.appendChild(voteBtn);
      voteRow.appendChild(
        el('div', { class: 'item-meta', style: 'margin-left:10px' }, [
          `Auto-approve demo: votes ≥ ${cfg.minVotes}, reviews ≥ ${cfg.minReviews}, rating ≥ ${cfg.minAvgRating}`
        ]
      ));
      card.appendChild(voteRow);

      const reviewedSet = loadReviewedSet();
      const alreadyReviewed = reviewedSet.has(app.id);

      const reviewWrap = el('div', {
        class: 'form-row',
        style: 'margin-top:12px; flex-direction:column; align-items:stretch; gap:8px'
      });

      reviewWrap.appendChild(el('div', { class: 'item-meta' }, ['Security confidence (1–5):']));

      const ratingSel = document.createElement('select');
      ratingSel.className = 'select';
      for (let i = 1; i <= 5; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = String(i);
        if (i === 5) opt.selected = true;
        ratingSel.appendChild(opt);
      }

      const reviewText = document.createElement('textarea');
      reviewText.className = 'textarea';
      reviewText.rows = 3;
      reviewText.placeholder = 'Risk notes (why you trust/don’t trust this app)';

      const reviewBtn = el(
        'button',
        { class: 'btn btn-small', disabled: alreadyReviewed ? 'disabled' : undefined },
        [alreadyReviewed ? 'Reviewed ✅' : 'Submit review']
      );

      reviewBtn.addEventListener('click', () => {
        if (alreadyReviewed) return;

        const rating = Number(ratingSel.value);
        const text = String(reviewText.value || '').trim();
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) return;
        if (text.length < 5) return;

        const userKey = ensureUserKey();
        const reviews = loadReviews();
        reviews.unshift({
          appId: app.id,
          rating,
          text,
          userKey,
          author: 'you',
          submittedAt: new Date().toISOString().slice(0, 10)
        });
        saveReviews(reviews);

        reviewedSet.add(app.id);
        saveReviewedSet(reviewedSet);

        if (typeof onReview === 'function') onReview(app.id);

        reviewText.value = '';
      });

      reviewWrap.appendChild(ratingSel);
      reviewWrap.appendChild(reviewText);
      reviewWrap.appendChild(reviewBtn);

      const securityBtn = el(
        'button',
        {
          class: 'btn btn-small',
          style: 'margin-top:8px',
          disabled: alreadyReviewed || !app.githubUrl ? 'disabled' : undefined
        },
        ['Check GitHub security']
      );

      const secStatus = el('div', { class: 'item-meta', style: 'margin-top:6px; opacity:0.9' }, ['']);

      securityBtn.addEventListener('click', async () => {
        securityBtn.textContent = 'Checking...';
        secStatus.textContent = 'Working...';

        const res = await fetchGitHubSecurity(app.githubUrl);
        if (!res.ok) {
          const detail = res?.status ? ` (${res.status})` : '';
          const urlLine = res?.apiUrl ? `\nURL: ${res.apiUrl}` : '';
          const debugLine = res?.debug ? `\nDebug: ${res.debug}` : '';
          secStatus.textContent = `Worker call failed${detail}: ${res.error || 'failed'}${urlLine}${debugLine}`;
          securityBtn.textContent = 'Check GitHub security';
          return;
        }

        const rating = Number(res.securityConfidence);
        if (!Number.isFinite(rating)) {
          secStatus.textContent = 'No GitHub signal found.';
          securityBtn.textContent = 'Check GitHub security';
          return;
        }

        const cfg = getAutoConfig();
        const minNeeded = cfg.minAvgRating;
        const isLow = rating < minNeeded;

        const dependabot = res?.raw?.openDependabotAlerts;
        const vulns = res?.raw?.openVulnerabilityAlerts;
        const dependabotPart = Number.isFinite(dependabot)
          ? `Dependabot alerts: ${dependabot}. `
          : '';
        const vulnPart = Number.isFinite(vulns)
          ? `Vulnerability alerts: ${vulns}. `
          : '';

        // Save as this user's security confidence review (counts toward auto-approve gate)
        const userKey = ensureUserKey();
        const reviews = loadReviews();

        reviews.unshift({
          appId: app.id,
          rating,
          text: isLow
            ? `GitHub security is LOW (confidence ${rating}/5). ${dependabotPart}${vulnPart}Recommendation: do not auto-approve; require manual review.`
            : `GitHub security looks OK (confidence ${rating}/5). ${dependabotPart}${vulnPart}Recommendation: eligible for auto-approve gate.`,
          userKey,
          author: 'you',
          submittedAt: new Date().toISOString().slice(0, 10)
        });
        saveReviews(reviews);

        const reviewedSet2 = loadReviewedSet();
        reviewedSet2.add(app.id);
        saveReviewedSet(reviewedSet2);

        secStatus.textContent = isLow
          ? `GitHub security confidence: ${rating}/5 (LOW — auto-approve requires ≥ ${minNeeded}).`
          : `GitHub security confidence: ${rating}/5`;
        securityBtn.textContent = isLow ? 'GitHub checked ⚠️' : 'GitHub checked ✅';

        if (typeof onReview === 'function') onReview(app.id);
      });

      reviewWrap.appendChild(securityBtn);
      reviewWrap.appendChild(secStatus);

      card.appendChild(reviewWrap);
    }

    container.appendChild(card);
  });
}

function onIndexPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const newsList = document.getElementById('newsList');
  const appsList = document.getElementById('appsList');

  if (newsList) renderNews(sampleNews.slice(0, 2), newsList);

  if (appsList) {
    const { approved } = getAllApps();
    const ranked = [...approved].sort((a, b) => {
      const dv = getVoteCount(b.id) - getVoteCount(a.id);
      if (dv !== 0) return dv;
      return String(b.submittedAt || '').localeCompare(String(a.submittedAt || ''));
    });
    renderApps(ranked.slice(0, 2), appsList, { enableVoting: false });
  }
}

function onNewsPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const input = document.getElementById('newsQuery');
  const btn = document.getElementById('newsRefresh');
  const sourceSel = document.getElementById('newsSourceFilter');
  const out = document.getElementById('newsListFull');
  if (!out) return;

  const all = [...sampleNews].sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));

  // Populate sources dropdown (demo)
  if (sourceSel) {
    const sources = uniq(all.map(n => n.source || 'Unknown')).sort();
    sourceSel.innerHTML = '';

    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All sources';
    sourceSel.appendChild(optAll);

    sources.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      sourceSel.appendChild(opt);
    });
  }

  const apply = () => {
    const q = (input?.value || '').trim().toLowerCase();
    const selectedSource = sourceSel?.value || 'all';

    let filtered = all;
    if (sourceSel && selectedSource !== 'all') {
      filtered = filtered.filter(n => n.source === selectedSource);
    }

    if (q) {
      filtered = filtered.filter(n => (n.title + n.summary + n.source).toLowerCase().includes(q));
    }

    renderNews(filtered, out);
  };

  apply();
  input?.addEventListener('input', apply);
  sourceSel?.addEventListener('change', apply);
  btn?.addEventListener('click', apply);
}

function onAppsPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Apply on visit (demo auto-approve)
  autoApprovePending(getAutoConfig())

  const query = document.getElementById('appsQuery');
  const lang = document.getElementById('langFilter');
  const btn = document.getElementById('appsRefresh');
  const out = document.getElementById('appsListFull');
  if (!out) return;

  const { approved, pending } = getAllApps();
  const all = [...pending, ...approved];

  const allLangs = uniq(all.flatMap(a => a.languages || [])).sort();
  for (const l of allLangs) {
    if (!Array.from(lang?.options || []).some(o => o.value === l)) {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      lang.appendChild(opt);
    }
  }

  const allCats = uniq(all.flatMap(a => a.tags || [])).sort();
  for (const c of allCats) {
    if (!Array.from(category?.options || []).some(o => o.value === c)) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      category.appendChild(opt);
    }
  }

  const apply = () => {
    autoApprovePending(getAutoConfig())

    const { approved: ap, pending: pn } = getAllApps();
    const merged = [...pn, ...ap];

    const q = (query?.value || '').trim().toLowerCase();
    const lf = (lang?.value || '').trim();
    const cf = (category?.value || '').trim();

    let filtered = merged;
    if (cf) filtered = filtered.filter(a => (a.tags || []).includes(cf));
    if (lf) filtered = filtered.filter(a => (a.languages || []).includes(lf));
    if (q) {
      filtered = filtered.filter(a =>
        (a.name + a.description + (a.tags || []).join(' ') + (a.languages || []).join(' ')).toLowerCase().includes(q)
      );
    }

    // Sort: approved first, then by votes desc
    filtered = filtered.sort((a, b) => {
      const apv = (a.status || 'approved') === 'approved' ? 0 : 1;
      const bpv = (b.status || 'approved') === 'approved' ? 0 : 1;
      if (apv !== bpv) return apv - bpv;
      return getVoteCount(b.id) - getVoteCount(a.id);
    });

    renderApps(filtered, out, {
      enableVoting: true,
      onVote: (appId) => {
        const votes = loadVotes();
        votes[appId] = (Number(votes[appId] || 0) + 1);
        saveVotes(votes);

        const voted = loadVoted();
        voted.add(appId);
        saveVoted(voted);

        autoApprovePending(getAutoConfig())
        apply();
      },
      onReview: () => {
        autoApprovePending(getAutoConfig());
        apply();
      }
    });
  };

  apply();
  query?.addEventListener('input', apply);
  category?.addEventListener('change', apply);
  lang?.addEventListener('change', apply);
  btn?.addEventListener('click', apply);
}

function onSubmitPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const form = document.getElementById('submitForm');
  const status = document.getElementById('submitStatus');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fd = new FormData(form);

    const fileToDataUrl = (file) =>
      new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

    const screenshotInput = form.querySelector('input[name="screenshotFile"]');
    const file = screenshotInput?.files?.[0] || null;
    let screenshotDataUrl = null;
    if (file) {
      const maxBytes = 750 * 1024;
      if (file.size > maxBytes) {
        status.textContent = 'Screenshot is too large. Upload an image under ~750KB.';
        return;
      }
      status.textContent = 'Uploading screenshot...';
      screenshotDataUrl = await fileToDataUrl(file);
    }
    const name = fd.get('name');
    const description = fd.get('description');
    const languages = fd.get('languages');
    const tags = fd.get('tags');
    const githubUrl = fd.get('githubUrl');
    const demoUrl = fd.get('demoUrl');
    const author = fd.get('author');

    const sub = {
      id: 'local_' + Math.random().toString(16).slice(2),
      name: String(name || '').trim(),
      description: String(description || '').trim(),
      languages: String(languages || '').split(',').map(s => s.trim()).filter(Boolean),
      tags: String(tags || '').split(',').map(s => s.trim()).filter(Boolean),
      githubUrl: normalizeGitHubRepoInput(String(githubUrl || '')) || null,
      demoUrl: normalizeMaybeUrl(String(demoUrl || '')) || null,
      screenshotDataUrl,
      author: String(author || '').trim(),
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'pending'
    };

    const subs = loadSubmissions();
    subs.unshift(sub);
    saveSubmissions(subs);

    status.textContent = 'Submitted ✅ Pending approval (demo voting enables auto-approve). Saved to this browser (localStorage).';
    form.reset();

    setTimeout(() => { location.href = './apps.html'; }, 800);
  });
}

function onAdminPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const out = document.getElementById('pendingList');
  if (!out) return;

  const autoStatus = document.getElementById('autoStatus');
  const thresholdInput = document.getElementById('thresholdInput');
  const minReviewsInput = document.getElementById('minReviewsInput');
  const minRatingInput = document.getElementById('minRatingInput');
  const minAgeHoursInput = document.getElementById('minAgeHoursInput');
  const runBtn = document.getElementById('runAutoApprove');
  const clearBtn = document.getElementById('clearDemo');
  const apiBaseInput = document.getElementById('apiBaseInput');

  const render = () => {
    const cfg = getAutoConfig();
    const subs = loadSubmissions();
    const pending = subs.filter(s => s.status === 'pending');

    autoStatus.textContent =
      `Auto-approve demo is ON. ` +
      `Min votes: ${cfg.minVotes}, ` +
      `Min reviews: ${cfg.minReviews}, ` +
      `Avg security confidence ≥ ${cfg.minAvgRating}, ` +
      `Min age: ${cfg.minAgeHours}h. ` +
      `Local stored submissions: ${subs.length}. Pending: ${pending.length}.`;

    out.innerHTML = '';
    if (!pending.length) {
      out.appendChild(el('div', { class: 'item' }, ['No pending submissions.']));
      return;
    }

    pending.forEach(item => {
      const row = el('div', { class: 'item' });
      const title = el('div', { class: 'item-title' });

      title.appendChild(el('div', {}, [item.name]));
      title.appendChild(el('div', { class: 'item-meta' }, [formatDate(item.submittedAt)]));

      row.appendChild(title);
      row.appendChild(el('div', { class: 'item-desc' }, [item.description]));
      row.appendChild(el('div', { class: 'item-meta' }, ['Languages: ' + ((item.languages || []).join(', ') || '-') ]));
      row.appendChild(el('div', { class: 'item-meta' }, ['Author: ' + (item.author || '-') ]));

      const votes = getVoteCount(item.id);
      row.appendChild(el('div', { class: 'item-meta' }, [`Votes: ${votes} (need ${cfg.minVotes})`]));
      const rs = getReviewStats(item.id);
      row.appendChild(el('div', { class: 'item-meta' }, [`Reviews: ${rs.count} (need ${cfg.minReviews})`]));
      row.appendChild(el('div', { class: 'item-meta' }, [`Avg security confidence: ${rs.avg.toFixed(1)} (need ${cfg.minAvgRating})`]));

      out.appendChild(row);
    });
  };

  if (thresholdInput) thresholdInput.value = String(getAutoThreshold());
  if (minReviewsInput) minReviewsInput.value = String(getAutoMinReviews());
  if (minRatingInput) minRatingInput.value = String(getAutoMinAvgRating());
  if (minAgeHoursInput) minAgeHoursInput.value = String(getAutoMinAgeHours());
  if (apiBaseInput) apiBaseInput.value = getApiBaseUrl();

  const saveApiBase = () => {
    localStorage.setItem(
      STORAGE_API_BASE_URL_KEY,
      String(apiBaseInput?.value || '').trim()
    );
  };
  apiBaseInput?.addEventListener('input', saveApiBase);
  apiBaseInput?.addEventListener('change', saveApiBase);
  apiBaseInput?.addEventListener('blur', saveApiBase);

  thresholdInput?.addEventListener('change', () => {
    const n = Number(thresholdInput.value);
    if (Number.isFinite(n) && n > 0) setAutoThreshold(n);
    render();
  });

  minReviewsInput?.addEventListener('change', () => {
    const n = Number(minReviewsInput.value);
    if (Number.isFinite(n) && n >= 0) setAutoMinReviews(n);
    render();
  });

  minRatingInput?.addEventListener('change', () => {
    const n = Number(minRatingInput.value);
    if (Number.isFinite(n) && n > 0) setAutoMinAvgRating(n);
    render();
  });

  minAgeHoursInput?.addEventListener('change', () => {
    const n = Number(minAgeHoursInput.value);
    if (Number.isFinite(n) && n >= 0) setAutoMinAgeHours(n);
    render();
  });

  runBtn?.addEventListener('click', () => {
    autoApprovePending(getAutoConfig());
    render();
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_SUBMISSIONS_KEY);
    localStorage.removeItem(STORAGE_VOTES_KEY);
    localStorage.removeItem(STORAGE_VOTED_KEY);
    localStorage.removeItem(STORAGE_REVIEWS_KEY);
    localStorage.removeItem(STORAGE_REVIEWED_KEY);
    localStorage.removeItem(STORAGE_AUTO_THRESHOLD_KEY);
    localStorage.removeItem('aicn_auto_min_reviews');
    localStorage.removeItem('aicn_auto_min_avg_rating');
    localStorage.removeItem('aicn_auto_min_age_hours');
    localStorage.removeItem(STORAGE_API_BASE_URL_KEY);
    location.reload();
  });

  render();
}

function route() {
  // Cloudflare Pages sometimes serves extensionless routes.
  // Make routing tolerant to both `/apps.html` and `/apps`.
  const rawPath = location.pathname || '/';
  const path = rawPath.replace(/\/+$/, '');

  const page =
    path.endsWith('apps.html') || path.endsWith('apps') ? 'apps' :
    path.endsWith('news.html') || path.endsWith('news') ? 'news' :
    path.endsWith('submit.html') || path.endsWith('submit') ? 'submit' :
    path.endsWith('admin.html') || path.endsWith('admin') ? 'admin' :
    'index';

  if (page === 'index') return onIndexPage();
  if (page === 'news') return onNewsPage();
  if (page === 'apps') return onAppsPage();
  if (page === 'submit') return onSubmitPage();
  if (page === 'admin') return onAdminPage();
}

route();
