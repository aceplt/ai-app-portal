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

function getVoteCount(appId) {
  const votes = loadVotes();
  return Number(votes[appId] || 0);
}

function autoApprovePending(threshold) {
  const subs = loadSubmissions();
  const votes = loadVotes();
  let changed = false;

  const next = subs.map(s => {
    if (s.status !== 'pending') return s;
    const count = Number(votes[s.id] || 0);
    if (count >= threshold) {
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

function renderApps(list, container, { enableVoting = false, onVote = null } = {}) {
  container.innerHTML = '';

  list.forEach(app => {
    const card = el('div', { class: 'app-card' });
    card.appendChild(el('h3', {}, [app.name]));

    const metaPieces = [];
    metaPieces.push('by ' + (app.author || 'unknown'));
    if (app.submittedAt) metaPieces.push(formatDate(app.submittedAt));

    card.appendChild(el('div', { class: 'item-meta' }, [metaPieces.join(' · ') || '']));

    const badges = el('div', { class: 'badges' });
    badges.appendChild(el('span', { class: 'badge' }, [app.status === 'approved' ? 'Approved' : 'Pending']));
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
      voteRow.appendChild(el('div', { class: 'item-meta', style: 'margin-left:10px' }, [`Auto-approve at ${getAutoThreshold()} votes (demo).`]));
      card.appendChild(voteRow);
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
  autoApprovePending(getAutoThreshold());

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

  const apply = () => {
    autoApprovePending(getAutoThreshold());

    const { approved: ap, pending: pn } = getAllApps();
    const merged = [...pn, ...ap];

    const q = (query?.value || '').trim().toLowerCase();
    const lf = (lang?.value || '').trim();

    let filtered = merged;
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

        autoApprovePending(getAutoThreshold());
        apply();
      }
    });
  };

  apply();
  query?.addEventListener('input', apply);
  lang?.addEventListener('change', apply);
  btn?.addEventListener('click', apply);
}

function onSubmitPage() {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  const form = document.getElementById('submitForm');
  const status = document.getElementById('submitStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fd = new FormData(form);
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
      githubUrl: String(githubUrl || '').trim() || null,
      demoUrl: String(demoUrl || '').trim() || null,
      author: String(author || '').trim(),
      submittedAt: new Date().toISOString().slice(0, 10),
      status: 'pending'
    };

    const subs = loadSubmissions();
    subs.unshift(sub);
    saveSubmissions(subs);

    status.textContent = 'Submitted ✅ Pending approval (demo voting enables auto-approve).';
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
  const runBtn = document.getElementById('runAutoApprove');
  const clearBtn = document.getElementById('clearDemo');

  const render = () => {
    const threshold = getAutoThreshold();
    autoStatus.textContent = `Auto-approve demo is ON. Threshold: ${threshold} votes.`;

    const subs = loadSubmissions();
    const pending = subs.filter(s => s.status === 'pending');

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
      row.appendChild(el('div', { class: 'item-meta' }, [`Votes: ${votes} (need ${threshold})`]));

      out.appendChild(row);
    });
  };

  if (thresholdInput) thresholdInput.value = String(getAutoThreshold());

  if (thresholdInput) {
    thresholdInput.addEventListener('change', () => {
      const n = Number(thresholdInput.value);
      if (Number.isFinite(n) && n > 0) setAutoThreshold(n);
      render();
    });
  }

  runBtn?.addEventListener('click', () => {
    autoApprovePending(getAutoThreshold());
    render();
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_SUBMISSIONS_KEY);
    localStorage.removeItem(STORAGE_VOTES_KEY);
    localStorage.removeItem(STORAGE_VOTED_KEY);
    localStorage.removeItem(STORAGE_AUTO_THRESHOLD_KEY);
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
