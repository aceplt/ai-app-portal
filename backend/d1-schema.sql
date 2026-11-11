-- D1 schema (starter)

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  languages TEXT NOT NULL,
  tags TEXT NOT NULL,
  githubUrl TEXT,
  demoUrl TEXT,
  author TEXT NOT NULL,
  submittedAt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved'))
);

CREATE TABLE IF NOT EXISTS votes (
  submissionId TEXT NOT NULL,
  userKey TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (submissionId, userKey),
  FOREIGN KEY (submissionId) REFERENCES submissions(id)
);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT NOT NULL,
  publishedAt TEXT,
  source TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
