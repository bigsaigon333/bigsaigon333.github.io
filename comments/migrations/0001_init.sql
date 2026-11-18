-- 마이그레이션은 추가만 한다. 이미 배포한 파일은 고치지 않고 새 번호 파일을 더한다.
-- 시각은 모두 Unix epoch 밀리초(INTEGER)다.

CREATE TABLE users (
  id INTEGER PRIMARY KEY,            -- GitHub 숫자 id
  login TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  github_created_at INTEGER NOT NULL, -- GitHub 가입 시각
  banned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,       -- bearer 토큰의 sha256(hex). 토큰 원문은 저장하지 않는다.
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  origin TEXT NOT NULL,              -- 로그인을 시작한 사이트 출처(허용 목록 안)
  mode TEXT NOT NULL,                -- 'popup' | 'redirect'
  return_to TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,               -- 존재를 확인한 글 id 캐시
  created_at INTEGER NOT NULL
);

CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  quote_exact TEXT,                  -- 글 전체 thread 면 아래 다섯 칸이 NULL
  quote_prefix TEXT,
  quote_suffix TEXT,
  pos_start INTEGER,
  pos_end INTEGER,
  resolved_at INTEGER,
  resolved_by INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX threads_post ON threads(post_id, created_at, id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  deleted_at INTEGER,                -- soft delete. 본문은 남기되 API 는 내보내지 않는다.
  deleted_by INTEGER
);
CREATE INDEX comments_thread ON comments(thread_id, created_at, id);

CREATE TABLE write_events (
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX write_events_user ON write_events(user_id, at);
