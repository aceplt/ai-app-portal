// Frontend portal for AI Create App News
// Supports connected backend (Cloudflare Workers + D1) with offline/localStorage fallback.

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
    status: 'approved',
    likes: 12
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
    status: 'approved',
    likes: 8
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
    status: 'approved',
    likes: 5
  }
];

const STORAGE_SUBMISSIONS_KEY = 'aicn_submissions';
const STORAGE_SUBMISSIONS_FALLBACK_KEY = 'aicn_pending_submissions';
const STORAGE_LIKES_KEY = 'aicn_likes';
const STORAGE_VOTES_KEY = 'aicn_votes'; // backwards compat
const STORAGE_LIKED_KEY = 'aicn_liked';
const STORAGE_VOTED_KEY = 'aicn_voted'; // backwards compat
const STORAGE_AUTO_THRESHOLD_KEY = 'aicn_auto_threshold';
const STORAGE_USER_KEY = 'aicn_user';
const STORAGE_REVIEWS_KEY = 'aicn_reviews';
const STORAGE_REVIEWED_KEY = 'aicn_reviewed';
const STORAGE_API_BASE_URL_KEY = 'aicn_api_base_url';
const STORAGE_ADMIN_KEY = 'aicn_admin_key';

const DEFAULT_WORKER_BASE = 'https://aicreateappnews-backend.automatic-beetle.workers.dev';

function getApiBaseUrl() {
  const stored = String(localStorage.getItem(STORAGE_API_BASE_URL_KEY) || '').trim();
  return stored || DEFAULT_WORKER_BASE;
}

function getAdminKey() {
  return String(localStorage.getItem(STORAGE_ADMIN_KEY) || '').trim();
}

function getAdminHeaders() {
  const key = getAdminKey();
  return {
    'content-type': 'application/json',
    ...(key ? { 'authorization': `Bearer ${key}`, 'x-admin-key': key } : {})
  };
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
  const raw = localStorage.getItem(STORAGE_SUBMISSIONS_KEY) || localStorage.getItem(STORAGE_SUBMISSIONS_FALLBACK_KEY);
  if (!raw) return [];
  try {
    const subs = JSON.parse(raw);
    if (!Array.isArray(subs)) return [];
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

function loadLikes() {
  try {
    const raw = localStorage.getItem(STORAGE_LIKES_KEY) || localStorage.getItem(STORAGE_VOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLikes(likes) {
  localStorage.setItem(STORAGE_LIKES_KEY, JSON.stringify(likes));
  localStorage.setItem(STORAGE_VOTES_KEY, JSON.stringify(likes));
}

function loadLikedSet() {
  try {
    const raw = localStorage.getItem(STORAGE_LIKED_KEY) || localStorage.getItem(STORAGE_VOTED_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveLikedSet(set) {
  const arr = [...set];
  localStorage.setItem(STORAGE_LIKED_KEY, JSON.stringify(arr));
  localStorage.setItem(STORAGE_VOTED_KEY, JSON.stringify(arr));
}

function getLikeCount(appId, serverLikes) {
  if (typeof serverLikes === 'number') return serverLikes;
  const likes = loadLikes();
  return Number(likes[appId] || 0);
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
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  return (
    /^https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(t) ||
    /^github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*\/?$/.test(t) ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)
  );
}

function normalizeMaybeUrl(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  t = t.replace(/\\/g, '/');

  const lower = t.toLowerCase();
  if (lower.startsWith('http:/')) {
    t = 'https://' + t.slice('http:/'.length);
  }
  if (lower.startsWith('http://')) {
    t = 'https://' + t.slice('http://'.length);
  }
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

function normalizeGitHubRepoInput(raw) {
  let t = String(raw || '').trim();
  if (!t) return '';
  t = t.replace(/\\/g, '/');

  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) {
    return 'https://github.com/' + t;
  }
  if (/^github\.com\//i.test(t)) {
    return 'https://' + t;
  }
  if (/^https?:\/\/github\.com\//i.test(t)) {
    return t.replace(/^http:\/\//i, 'https://');
  }

  const m = t.match(/github\.com\/(.+)$/i);
  if (m && m[1]) {
    const tail = m[1].replace(/\.git$/i, '');
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
    const baseRaw = String(getApiBaseUrl() || '').trim();
    const base = baseRaw.replace(/\/+$/, '').replace(/\/api$/i, '');

    apiUrl = base + '/api/security-check?githubUrl=' + encodeURIComponent(githubUrl);
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

function getAutoConfig() {
  return {
    minLikes: getAutoThreshold(),
    minVotes: getAutoThreshold(),
    minReviews: getAutoMinReviews(),
    minAvgRating: getAutoMinAvgRating(),
    minAgeHours: getAutoMinAgeHours()
  };
}

function shouldAutoApprove(submission, reviewStats, likes, cfg) {
  if (submission.status !== 'pending') return false;
  const threshold = cfg.minLikes ?? cfg.minVotes ?? 5;
  if (likes < threshold) return false;
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
  const likes = loadLikes();
  const reviews = loadReviews();

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
    const lk = Number(likes[s.id] || 0);
    const rs = reviewStatsByApp.get(s.id) || { count: 0, avg: 0 };
    if (shouldAutoApprove(s, rs, lk, cfg)) {
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

function renderApps(list, container, { enableLikes = true, onLike = null, onReview = null } = {}) {
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

    const currentLikes = getLikeCount(app.id, app.likes);
    badges.appendChild(el('span', { class: 'badge', id: `likeBadge_${app.id}` }, [
      currentLikes === 1 ? '❤️ 1 like' : `❤️ ${currentLikes} likes`
    ]));

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

    if (enableLikes) {
      const likedSet = loadLikedSet();
      const already = likedSet.has(app.id);
      const cfg = getAutoConfig();

      const likeRow = el('div', { class: 'form-row', style: 'margin-top:12px; align-items:center' });
      const likeBtn = el('button', {
        class: 'btn btn-small',
        disabled: already ? 'disabled' : undefined
      }, [already ? '❤️ Liked' : '🤍 Like']);

      likeBtn.addEventListener('click', async () => {
        if (likedSet.has(app.id)) return;
        likeBtn.disabled = true;
        likeBtn.textContent = '❤️ Liked';

        if (typeof onLike === 'function') {
          await onLike(app.id);
        }
      });

      likeRow.appendChild(likeBtn);
      likeRow.appendChild(
        el('div', { class: 'item-meta', style: 'margin-left:10px' }, [
          `Auto-approve threshold: likes ≥ ${cfg.minLikes}` +
          (cfg.minReviews > 0 ? `, reviews ≥ ${cfg.minReviews}` : '')
        ])
      );
      card.appendChild(likeRow);

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
      reviewText.rows = 2;
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

        const reviews = loadReviews();
        reviews.unshift({
          id: 'rev_' + Math.random().toString(16).slice(2),
          appId: app.id,
          rating,
          text,
          createdAt: new Date().toISOString()
        });
        saveReviews(reviews);

        reviewedSet.add(app.id);
        saveReviewedSet(reviewedSet);

        if (typeof onReview === 'function') onReview(app.id);
      });

      reviewWrap.appendChild(ratingSel);
      reviewWrap.appendChild(reviewText);
      reviewWrap.appendChild(reviewBtn);
      card.appendChild(reviewWrap);
    }

    container.appendChild(card);
  });
}

function onIndexPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const newsOut = document.getElementById('newsList');
  if (newsOut) renderNews(sampleNews.slice(0, 3), newsOut);

  const appsOut = document.getElementById('appsList');
  if (appsOut) {
    const { approved } = getAllApps();
    renderApps(approved.slice(0, 4), appsOut, { enableLikes: false });
  }
}

function onNewsPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const input = document.getElementById('newsQuery');
  const btn = document.getElementById('newsSearch');
  const sourceSel = document.getElementById('newsSource');
  const out = document.getElementById('newsListFull');
  if (!out) return;

  const all = [...sampleNews];
  if (sourceSel) {
    const sources = uniq(all.map(n => n.source)).sort();
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

async function fetchBackendApps() {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return [];
  try {
    const base = apiBase.replace(/\/+$/, '').replace(/\/api$/i, '');
    const res = await fetch(base + '/api/apps?status=approved&limit=100');
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }
}

async function sendLikeToBackend(appId) {
  const apiBase = getApiBaseUrl();
  if (!apiBase) return null;
  try {
    const base = apiBase.replace(/\/+$/, '').replace(/\/api$/i, '');
    const userKey = ensureUserKey();
    const res = await fetch(base + '/api/likes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ submissionId: appId, userKey })
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

async function onAppsPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  autoApprovePending(getAutoConfig());

  const query = document.getElementById('appsQuery');
  const lang = document.getElementById('langFilter');
  const category = document.getElementById('categoryFilter');
  const btn = document.getElementById('appsRefresh');
  const out = document.getElementById('appsListFull');
  if (!out) return;

  // Fetch approved apps from backend worker
  const backendApproved = await fetchBackendApps();

  const { approved, pending } = getAllApps();

  // Merge backend approved apps with local apps, de-duping by ID
  const knownIds = new Set();
  const allMerged = [];

  for (const a of backendApproved) {
    if (!knownIds.has(a.id)) {
      knownIds.add(a.id);
      allMerged.push({ ...a, status: 'approved' });
    }
  }
  for (const a of approved) {
    if (!knownIds.has(a.id)) {
      knownIds.add(a.id);
      allMerged.push(a);
    }
  }
  for (const p of pending) {
    if (!knownIds.has(p.id)) {
      knownIds.add(p.id);
      allMerged.push(p);
    }
  }

  const allLangs = uniq(allMerged.flatMap(a => a.languages || [])).sort();
  for (const l of allLangs) {
    if (!Array.from(lang?.options || []).some(o => o.value === l)) {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      lang.appendChild(opt);
    }
  }

  const allCats = uniq(allMerged.flatMap(a => a.tags || [])).sort();
  for (const c of allCats) {
    if (!Array.from(category?.options || []).some(o => o.value === c)) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      category.appendChild(opt);
    }
  }

  const apply = () => {
    autoApprovePending(getAutoConfig());

    const q = (query?.value || '').trim().toLowerCase();
    const lf = (lang?.value || '').trim();
    const cf = (category?.value || '').trim();

    let filtered = allMerged;
    if (cf) filtered = filtered.filter(a => (a.tags || []).includes(cf));
    if (lf) filtered = filtered.filter(a => (a.languages || []).includes(lf));
    if (q) {
      filtered = filtered.filter(a =>
        (a.name + a.description + (a.tags || []).join(' ') + (a.languages || []).join(' ')).toLowerCase().includes(q)
      );
    }

    // Sort: approved first, then by likes desc
    filtered = filtered.sort((a, b) => {
      const apv = (a.status || 'approved') === 'approved' ? 0 : 1;
      const bpv = (b.status || 'approved') === 'approved' ? 0 : 1;
      if (apv !== bpv) return apv - bpv;
      return getLikeCount(b.id, b.likes) - getLikeCount(a.id, a.likes);
    });

    renderApps(filtered, out, {
      enableLikes: true,
      onLike: async (appId) => {
        // Record locally
        const likes = loadLikes();
        likes[appId] = (Number(likes[appId] || 0) + 1);
        saveLikes(likes);

        const likedSet = loadLikedSet();
        likedSet.add(appId);
        saveLikedSet(likedSet);

        // Sync to backend Worker
        const backendResult = await sendLikeToBackend(appId);
        if (backendResult?.likes) {
          const item = allMerged.find(x => x.id === appId);
          if (item) item.likes = backendResult.likes;
        }

        autoApprovePending(getAutoConfig());
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
      const maxBytes = 40 * 1024;
      if (file.size > maxBytes) {
        status.textContent = 'Screenshot is too large. Upload an image under ~40KB.';
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

    // Save to Cloudflare Worker D1 backend
    (async () => {
      try {
        const apiBase = getApiBaseUrl();
        if (!apiBase) return;
        const base = apiBase.replace(/\/+$/, '').replace(/\/api$/i, '');

        const resp = await fetch(base + '/api/submissions', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: sub.id,
            name: sub.name,
            description: sub.description,
            languages: sub.languages,
            tags: sub.tags,
            githubUrl: sub.githubUrl,
            demoUrl: sub.demoUrl,
            screenshotDataUrl: sub.screenshotDataUrl,
            author: sub.author,
            submittedAt: sub.submittedAt
          })
        });

        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data?.submissionId) {
          const current = loadSubmissions();
          const idx = current.findIndex(x => x.id === sub.id);
          if (idx >= 0) {
            current[idx] = { ...current[idx], id: data.submissionId, status: 'pending' };
            saveSubmissions(current);
          }
        }
      } catch {
        // ignore offline fallback
      }
    })();

    status.textContent = 'Submitted ✅ Pending community likes. Saved locally & synced to backend.';
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
  const adminKeyInput = document.getElementById('adminKeyInput');

  if (thresholdInput) thresholdInput.value = String(getAutoThreshold());
  if (minReviewsInput) minReviewsInput.value = String(getAutoMinReviews());
  if (minRatingInput) minRatingInput.value = String(getAutoMinAvgRating());
  if (minAgeHoursInput) minAgeHoursInput.value = String(getAutoMinAgeHours());
  if (apiBaseInput) apiBaseInput.value = getApiBaseUrl();
  if (adminKeyInput) adminKeyInput.value = getAdminKey();

  const render = async () => {
    const cfg = getAutoConfig();

    let pending = [];
    const apiBase = String(apiBaseInput?.value || '')
      .trim()
      .replace(/\/+$/, '')
      .replace(/\/api$/, '');

    let backendOk = false;
    if (apiBase) {
      try {
        const res = await fetch(apiBase + '/api/admin/pending?limit=200', {
          headers: getAdminHeaders()
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data?.items)) {
          pending = data.items;
          backendOk = true;
        } else if (res.status === 401) {
          autoStatus.textContent = '⚠️ 401 Unauthorized: please enter the correct Admin Secret Key above.';
          return;
        }
      } catch {
        // fallback to local demo
      }
    }

    if (!backendOk) {
      const subs = loadSubmissions();
      pending = subs.filter(s => s.status === 'pending');
    }

    autoStatus.textContent =
      `${backendOk ? '⚡ Backend Connected (D1)' : '💻 Local Demo Mode'}. ` +
      `Min likes: ${cfg.minLikes}, ` +
      `Min reviews: ${cfg.minReviews}, ` +
      `Avg security confidence ≥ ${cfg.minAvgRating}, ` +
      `Min age: ${cfg.minAgeHours}h. ` +
      `Pending submissions: ${pending.length}.`;

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
      row.appendChild(el('div', { class: 'item-meta' }, ['Languages: ' + ((item.languages || []).join(', ') || '-')]));
      row.appendChild(el('div', { class: 'item-meta' }, ['Author: ' + (item.author || '-')]));

      const likes = getLikeCount(item.id, item.likes);
      row.appendChild(el('div', { class: 'item-meta', style: 'font-weight:600' }, [
        `❤️ Likes: ${likes} (threshold: ${cfg.minLikes})`
      ]));

      const rs = getReviewStats(item.id);
      row.appendChild(el('div', { class: 'item-meta' }, [`Reviews: ${rs.count} (need ${cfg.minReviews})`]));
      row.appendChild(el('div', { class: 'item-meta' }, [`Avg security confidence: ${rs.avg.toFixed(1)} (need ${cfg.minAvgRating})`]));

      // Actions row
      const actionRow = el('div', { class: 'form-row', style: 'margin-top:10px; gap:8px; flex-wrap:wrap;' });

      if (backendOk) {
        // 1. Like button
        const likeBtn = el('button', { class: 'btn btn-small' }, ['❤️ Like']);
        likeBtn.addEventListener('click', async () => {
          const userKey = ensureUserKey();
          await fetch(apiBase + '/api/likes', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ submissionId: item.id, userKey })
          }).catch(() => null);
          render();
        });
        actionRow.appendChild(likeBtn);

        // 2. Direct Approve button
        const approveBtn = el('button', { class: 'btn btn-small', style: 'background:#16a34a' }, ['✅ Approve']);
        approveBtn.addEventListener('click', async () => {
          await fetch(apiBase + '/api/admin/approve', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ id: item.id })
          }).catch(() => null);
          render();
        });
        actionRow.appendChild(approveBtn);

        // 3. Reject button
        const rejectBtn = el('button', { class: 'btn btn-small btn-ghost', style: 'color:#ea580c' }, ['❌ Reject']);
        rejectBtn.addEventListener('click', async () => {
          await fetch(apiBase + '/api/admin/reject', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ id: item.id })
          }).catch(() => null);
          render();
        });
        actionRow.appendChild(rejectBtn);

        // 4. Delete button
        const deleteBtn = el('button', { class: 'btn btn-small btn-ghost', style: 'color:#dc2626' }, ['🗑️ Delete']);
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(`Permanently delete "${item.name}"?`)) return;
          await fetch(apiBase + '/api/admin/delete', {
            method: 'POST',
            headers: getAdminHeaders(),
            body: JSON.stringify({ id: item.id })
          }).catch(() => null);
          render();
        });
        actionRow.appendChild(deleteBtn);
      } else {
        // Local demo mode approve button
        const demoApproveBtn = el('button', { class: 'btn btn-small' }, ['Approve (demo)']);
        demoApproveBtn.addEventListener('click', () => {
          const subs = loadSubmissions();
          const target = subs.find(s => s.id === item.id);
          if (target) {
            target.status = 'approved';
            saveSubmissions(subs);
          }
          render();
        });
        actionRow.appendChild(demoApproveBtn);
      }

      row.appendChild(actionRow);
      out.appendChild(row);
    });
  };

  const saveConfig = () => {
    localStorage.setItem(STORAGE_API_BASE_URL_KEY, String(apiBaseInput?.value || '').trim());
    localStorage.setItem(STORAGE_ADMIN_KEY, String(adminKeyInput?.value || '').trim());
  };

  apiBaseInput?.addEventListener('input', () => { saveConfig(); render(); });
  adminKeyInput?.addEventListener('input', () => { saveConfig(); render(); });

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

  runBtn?.addEventListener('click', async () => {
    const apiBase = String(apiBaseInput?.value || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
    const threshold = Number(thresholdInput?.value || getAutoThreshold());

    if (apiBase) {
      try {
        const resp = await fetch(apiBase + '/api/admin/run-auto-approve', {
          method: 'POST',
          headers: getAdminHeaders(),
          body: JSON.stringify({ minLikes: threshold, threshold })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok) {
          alert(`Auto-approve complete: ${data?.changed ?? 0} submission(s) approved.`);
        }
      } catch (e) {
        alert('Auto-approve backend request failed: ' + e);
      }
    }

    autoApprovePending(getAutoConfig());
    render();
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_SUBMISSIONS_KEY);
    localStorage.removeItem(STORAGE_LIKES_KEY);
    localStorage.removeItem(STORAGE_LIKED_KEY);
    localStorage.removeItem(STORAGE_VOTES_KEY);
    localStorage.removeItem(STORAGE_VOTED_KEY);
    localStorage.removeItem(STORAGE_REVIEWS_KEY);
    localStorage.removeItem(STORAGE_REVIEWED_KEY);
    localStorage.removeItem(STORAGE_AUTO_THRESHOLD_KEY);
    localStorage.removeItem('aicn_auto_min_reviews');
    localStorage.removeItem('aicn_auto_min_avg_rating');
    localStorage.removeItem('aicn_auto_min_age_hours');
    location.reload();
  });

  render();
}

function route() {
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
