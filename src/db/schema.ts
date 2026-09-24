/**
 * wwdc-mcp-server — SQLite schema
 *
 * Tables:
 *   - sessions          WWDC video sessions (2020..current)
 *   - tutorials         DocC tutorial pages
 *   - pathways          Curated learning tracks
 *   - hig_entries       Human Interface Guidelines topics
 *   - evolution         Swift Evolution proposals
 *   - apple_docs        Apple Developer documentation DocC pages
 *   - sample_code       Extracted sample-code bundles
 *   - embeddings        Ollama nomic-embed-text vectors (768-dim) per doc_id
 *   - ingest_status     Last-run metadata per source
 *
 * FTS5 virtual tables provide keyword search.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

export function openDb(dbPath: string): DatabaseType {
  const db: DatabaseType = new Database(dbPath);
  // WAL can fail on SMB/NFS/sandboxed mounts; fall back silently.
  try { db.pragma("journal_mode = WAL"); } catch { /* fall through */ }
  try { db.pragma("synchronous = NORMAL"); } catch { /* noop */ }
  db.pragma("foreign_keys = ON");
  // Allow up to 60 s for write locks during concurrent ingest + server reads.
  try { db.pragma("busy_timeout = 60000"); } catch { /* noop */ }
  return db;
}

export function migrate(db: DatabaseType): void {
  db.exec(`
    -- Core content tables -----------------------------------------------
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      session_number TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      url TEXT NOT NULL,
      duration INTEGER,
      topics TEXT,                 -- JSON array
      platforms TEXT,              -- JSON array
      speakers TEXT,               -- JSON array
      transcript TEXT,
      sample_code_urls TEXT,       -- JSON array
      related_docs TEXT,           -- JSON array
      video_url TEXT,
      deep_links TEXT,             -- JSON array of {label,seconds,url}
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_year ON sessions(year);

    CREATE TABLE IF NOT EXISTS tutorials (
      id TEXT PRIMARY KEY,         -- slug e.g. "swiftui/creating-and-combining-views"
      title TEXT NOT NULL,
      category TEXT,
      role TEXT,
      estimated_time TEXT,
      doc_url TEXT,                -- DocC URI
      url TEXT NOT NULL,           -- human URL
      body TEXT,                   -- extracted text/markdown
      raw_json TEXT,               -- original DocC JSON
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tutorials_category ON tutorials(category);

    CREATE TABLE IF NOT EXISTS pathways (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT,
      steps TEXT NOT NULL,         -- JSON array of PathwayStep
      source_url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS hig_entries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      platform TEXT,               -- JSON array
      category TEXT,
      summary TEXT,
      body TEXT,
      url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS evolution (
      id TEXT PRIMARY KEY,         -- "SE-0428"
      number INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT,
      authors TEXT,                -- JSON array
      review_manager TEXT,
      implementation TEXT,         -- JSON array
      swift_version TEXT,
      body TEXT,
      url TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apple_docs (
      id TEXT PRIMARY KEY,         -- normalized /documentation path, e.g. "swiftui/view"
      title TEXT NOT NULL,
      role TEXT,
      symbol_kind TEXT,
      modules TEXT,                -- JSON array
      platforms TEXT,              -- JSON array
      url TEXT NOT NULL,
      abstract TEXT,
      body TEXT,
      topic_sections TEXT,         -- JSON array
      references_json TEXT,        -- JSON array of normalized documentation paths
      raw_json TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_apple_docs_role ON apple_docs(role);
    CREATE INDEX IF NOT EXISTS idx_apple_docs_symbol_kind ON apple_docs(symbol_kind);

    CREATE TABLE IF NOT EXISTS sample_code (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      kind TEXT NOT NULL,
      extracted_at TEXT,
      files TEXT,                  -- JSON array of file paths
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sample_code_session ON sample_code(session_id);

    -- Swift Language Reference (docs.swift.org/swift-book) --------------
    CREATE TABLE IF NOT EXISTS swift_book (
      id TEXT PRIMARY KEY,          -- normalized chapter slug, e.g. "thebasics"
      title TEXT NOT NULL,
      section TEXT,                 -- parent section, e.g. "Language Guide"
      body TEXT,
      url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_swift_book_section ON swift_book(section);

    CREATE VIRTUAL TABLE IF NOT EXISTS swift_book_fts USING fts5(
      id UNINDEXED,
      title,
      section,
      body,
      content='swift_book',
      content_rowid='rowid',
      tokenize='porter'
    );

    -- App Store Review Guidelines -----------------------------------------
    CREATE TABLE IF NOT EXISTS appstore_guidelines (
      id TEXT PRIMARY KEY,          -- anchor slug, e.g. "safety-1-1"
      section_number TEXT,          -- e.g. "1.1"
      title TEXT NOT NULL,
      body TEXT,
      url TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_appstore_section ON appstore_guidelines(section_number);

    CREATE VIRTUAL TABLE IF NOT EXISTS appstore_guidelines_fts USING fts5(
      id UNINDEXED,
      section_number,
      title,
      body,
      content='appstore_guidelines',
      content_rowid='rowid',
      tokenize='porter'
    );

    -- Swift Forums (forums.swift.org) -------------------------------------
    CREATE TABLE IF NOT EXISTS swift_forum_posts (
      id TEXT PRIMARY KEY,
      topic_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      content TEXT,
      author TEXT,
      post_count INTEGER DEFAULT 1,
      reply_count INTEGER DEFAULT 0,
      created_at TEXT,
      url TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS swift_forum_posts_fts USING fts5(
      id UNINDEXED, title, category, content,
      content='swift_forum_posts', content_rowid='rowid', tokenize='porter'
    );

    CREATE TRIGGER IF NOT EXISTS swift_forum_posts_ai AFTER INSERT ON swift_forum_posts BEGIN
      INSERT INTO swift_forum_posts_fts(rowid, id, title, category, content)
        VALUES (new.rowid, new.id, new.title, new.category, new.content);
    END;

    -- Apple Developer Forums (RSS) ----------------------------------------
    CREATE TABLE IF NOT EXISTS apple_dev_forum_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tags TEXT,
      content TEXT,
      author TEXT,
      url TEXT,
      published_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS apple_dev_forum_posts_fts USING fts5(
      id UNINDEXED, title, tags, content,
      content='apple_dev_forum_posts', content_rowid='rowid', tokenize='porter'
    );

    CREATE TRIGGER IF NOT EXISTS apple_dev_forum_posts_ai AFTER INSERT ON apple_dev_forum_posts BEGIN
      INSERT INTO apple_dev_forum_posts_fts(rowid, id, title, tags, content)
        VALUES (new.rowid, new.id, new.title, new.tags, new.content);
    END;

    -- Release notes -------------------------------------------------------
    CREATE TABLE IF NOT EXISTS release_notes (
      id TEXT PRIMARY KEY,
      os TEXT NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      url TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_release_notes_os ON release_notes(os);
    CREATE INDEX IF NOT EXISTS idx_release_notes_version ON release_notes(version);

    CREATE VIRTUAL TABLE IF NOT EXISTS release_notes_fts USING fts5(
      id UNINDEXED,
      os,
      version,
      title,
      content,
      content='release_notes',
      content_rowid='rowid',
      tokenize='porter'
    );

  `);

  // Deprecation columns on apple_docs — added conditionally because SQLite
  // does not support "ALTER TABLE … ADD COLUMN IF NOT EXISTS".
  const appleDocsCols = new Set(
    db.prepare("PRAGMA table_info(apple_docs)").all().map((r: any) => r.name)
  );
  for (const [col, def] of [
    ["deprecated",         "INTEGER DEFAULT 0"],
    ["deprecated_at",      "TEXT"],
    ["introduced_at",      "TEXT"],
    ["deprecated_message", "TEXT"],
  ] as [string, string][]) {
    if (!appleDocsCols.has(col)) {
      db.exec(`ALTER TABLE apple_docs ADD COLUMN ${col} ${def}`);
    }
  }

  db.exec(`

    -- Semantic embeddings ------------------------------------------------
    -- Stored as raw Float32 blob; cosine similarity computed in JS.
    CREATE TABLE IF NOT EXISTS embeddings (
      doc_id TEXT PRIMARY KEY,     -- e.g. "session:wwdc2025-10042" | "tutorial:swiftui/..."
      kind TEXT NOT NULL,
      vector BLOB NOT NULL,
      dim INTEGER NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_kind ON embeddings(kind);

    -- Session summaries (LLM-generated) ----------------------------------
    CREATE TABLE IF NOT EXISTS session_summaries (
      session_id TEXT PRIMARY KEY REFERENCES sessions(id),
      summary TEXT NOT NULL,
      key_apis TEXT,                   -- JSON array of API names mentioned
      key_topics TEXT,                 -- JSON array of topic strings
      code_patterns TEXT,              -- JSON array of code pattern descriptions
      difficulty TEXT,                 -- "beginner" | "intermediate" | "advanced"
      model_used TEXT,
      generated_at TEXT DEFAULT (datetime('now'))
    );

    -- Cross-reference graph ----------------------------------------------
    CREATE TABLE IF NOT EXISTS cross_references (
      from_type TEXT NOT NULL,    -- 'session', 'doc', 'hig', 'evolution', 'sample_code'
      from_id TEXT NOT NULL,
      to_type TEXT NOT NULL,
      to_id TEXT NOT NULL,
      relationship TEXT NOT NULL, -- 'mentions_api', 'introduces_api', 'deprecates', 'implements_proposal', 'demonstrates_hig', 'related_session'
      weight REAL DEFAULT 1.0,
      PRIMARY KEY (from_type, from_id, to_type, to_id, relationship)
    );
    CREATE INDEX IF NOT EXISTS idx_xref_from ON cross_references(from_type, from_id);
    CREATE INDEX IF NOT EXISTS idx_xref_to ON cross_references(to_type, to_id);

    -- Ingest status ------------------------------------------------------
    CREATE TABLE IF NOT EXISTS ingest_status (
      source TEXT PRIMARY KEY,
      last_run_at TEXT NOT NULL,
      last_success_at TEXT,
      items_ingested INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      notes TEXT
    );

    -- FTS5 virtual tables -----------------------------------------------
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      id UNINDEXED,
      title,
      description,
      transcript,
      topics,
      content='sessions',
      content_rowid='rowid',
      tokenize='porter'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS tutorials_fts USING fts5(
      id UNINDEXED,
      title,
      category,
      body,
      content='tutorials',
      content_rowid='rowid',
      tokenize='porter'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS hig_fts USING fts5(
      id UNINDEXED,
      title,
      summary,
      body,
      content='hig_entries',
      content_rowid='rowid',
      tokenize='porter'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS evolution_fts USING fts5(
      id UNINDEXED,
      title,
      body,
      status,
      content='evolution',
      content_rowid='rowid',
      tokenize='porter'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS apple_docs_fts USING fts5(
      id UNINDEXED,
      title,
      abstract,
      body,
      modules,
      platforms,
      content='apple_docs',
      content_rowid='rowid',
      tokenize='porter'
    );
\n    -- FTS5 external-content sync triggers. Bulk rebuilds repair old state;\n    -- these keep every searchable source synchronized incrementally.\n    CREATE TRIGGER IF NOT EXISTS sessions_fts_ai AFTER INSERT ON sessions BEGIN\n      INSERT INTO sessions_fts(rowid,id,title,description,transcript,topics) VALUES(new.rowid,new.id,new.title,new.description,new.transcript,new.topics);\n    END;\n    CREATE TRIGGER IF NOT EXISTS sessions_fts_ad AFTER DELETE ON sessions BEGIN\n      INSERT INTO sessions_fts(sessions_fts,rowid,id,title,description,transcript,topics) VALUES('delete',old.rowid,old.id,old.title,old.description,old.transcript,old.topics);\n    END;\n    CREATE TRIGGER IF NOT EXISTS sessions_fts_au AFTER UPDATE ON sessions BEGIN\n      INSERT INTO sessions_fts(sessions_fts,rowid,id,title,description,transcript,topics) VALUES('delete',old.rowid,old.id,old.title,old.description,old.transcript,old.topics);\n      INSERT INTO sessions_fts(rowid,id,title,description,transcript,topics) VALUES(new.rowid,new.id,new.title,new.description,new.transcript,new.topics);\n    END;\n    CREATE TRIGGER IF NOT EXISTS tutorials_fts_ai AFTER INSERT ON tutorials BEGIN\n      INSERT INTO tutorials_fts(rowid,id,title,category,body) VALUES(new.rowid,new.id,new.title,new.category,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS tutorials_fts_ad AFTER DELETE ON tutorials BEGIN\n      INSERT INTO tutorials_fts(tutorials_fts,rowid,id,title,category,body) VALUES('delete',old.rowid,old.id,old.title,old.category,old.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS tutorials_fts_au AFTER UPDATE ON tutorials BEGIN\n      INSERT INTO tutorials_fts(tutorials_fts,rowid,id,title,category,body) VALUES('delete',old.rowid,old.id,old.title,old.category,old.body);\n      INSERT INTO tutorials_fts(rowid,id,title,category,body) VALUES(new.rowid,new.id,new.title,new.category,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS hig_fts_ai AFTER INSERT ON hig_entries BEGIN\n      INSERT INTO hig_fts(rowid,id,title,summary,body) VALUES(new.rowid,new.id,new.title,new.summary,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS hig_fts_ad AFTER DELETE ON hig_entries BEGIN\n      INSERT INTO hig_fts(hig_fts,rowid,id,title,summary,body) VALUES('delete',old.rowid,old.id,old.title,old.summary,old.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS hig_fts_au AFTER UPDATE ON hig_entries BEGIN\n      INSERT INTO hig_fts(hig_fts,rowid,id,title,summary,body) VALUES('delete',old.rowid,old.id,old.title,old.summary,old.body);\n      INSERT INTO hig_fts(rowid,id,title,summary,body) VALUES(new.rowid,new.id,new.title,new.summary,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS evolution_fts_ai AFTER INSERT ON evolution BEGIN\n      INSERT INTO evolution_fts(rowid,id,title,body,status) VALUES(new.rowid,new.id,new.title,new.body,new.status);\n    END;\n    CREATE TRIGGER IF NOT EXISTS evolution_fts_ad AFTER DELETE ON evolution BEGIN\n      INSERT INTO evolution_fts(evolution_fts,rowid,id,title,body,status) VALUES('delete',old.rowid,old.id,old.title,old.body,old.status);\n    END;\n    CREATE TRIGGER IF NOT EXISTS evolution_fts_au AFTER UPDATE ON evolution BEGIN\n      INSERT INTO evolution_fts(evolution_fts,rowid,id,title,body,status) VALUES('delete',old.rowid,old.id,old.title,old.body,old.status);\n      INSERT INTO evolution_fts(rowid,id,title,body,status) VALUES(new.rowid,new.id,new.title,new.body,new.status);\n    END;\n    CREATE TRIGGER IF NOT EXISTS apple_docs_fts_ai AFTER INSERT ON apple_docs BEGIN\n      INSERT INTO apple_docs_fts(rowid,id,title,abstract,body,modules,platforms) VALUES(new.rowid,new.id,new.title,new.abstract,new.body,new.modules,new.platforms);\n    END;\n    CREATE TRIGGER IF NOT EXISTS apple_docs_fts_ad AFTER DELETE ON apple_docs BEGIN\n      INSERT INTO apple_docs_fts(apple_docs_fts,rowid,id,title,abstract,body,modules,platforms) VALUES('delete',old.rowid,old.id,old.title,old.abstract,old.body,old.modules,old.platforms);\n    END;\n    CREATE TRIGGER IF NOT EXISTS apple_docs_fts_au AFTER UPDATE ON apple_docs BEGIN\n      INSERT INTO apple_docs_fts(apple_docs_fts,rowid,id,title,abstract,body,modules,platforms) VALUES('delete',old.rowid,old.id,old.title,old.abstract,old.body,old.modules,old.platforms);\n      INSERT INTO apple_docs_fts(rowid,id,title,abstract,body,modules,platforms) VALUES(new.rowid,new.id,new.title,new.abstract,new.body,new.modules,new.platforms);\n    END;\n    CREATE TRIGGER IF NOT EXISTS swift_book_fts_ai AFTER INSERT ON swift_book BEGIN\n      INSERT INTO swift_book_fts(rowid,id,title,section,body) VALUES(new.rowid,new.id,new.title,new.section,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS swift_book_fts_ad AFTER DELETE ON swift_book BEGIN\n      INSERT INTO swift_book_fts(swift_book_fts,rowid,id,title,section,body) VALUES('delete',old.rowid,old.id,old.title,old.section,old.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS swift_book_fts_au AFTER UPDATE ON swift_book BEGIN\n      INSERT INTO swift_book_fts(swift_book_fts,rowid,id,title,section,body) VALUES('delete',old.rowid,old.id,old.title,old.section,old.body);\n      INSERT INTO swift_book_fts(rowid,id,title,section,body) VALUES(new.rowid,new.id,new.title,new.section,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS appstore_guidelines_fts_ai AFTER INSERT ON appstore_guidelines BEGIN\n      INSERT INTO appstore_guidelines_fts(rowid,id,section_number,title,body) VALUES(new.rowid,new.id,new.section_number,new.title,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS appstore_guidelines_fts_ad AFTER DELETE ON appstore_guidelines BEGIN\n      INSERT INTO appstore_guidelines_fts(appstore_guidelines_fts,rowid,id,section_number,title,body) VALUES('delete',old.rowid,old.id,old.section_number,old.title,old.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS appstore_guidelines_fts_au AFTER UPDATE ON appstore_guidelines BEGIN\n      INSERT INTO appstore_guidelines_fts(appstore_guidelines_fts,rowid,id,section_number,title,body) VALUES('delete',old.rowid,old.id,old.section_number,old.title,old.body);\n      INSERT INTO appstore_guidelines_fts(rowid,id,section_number,title,body) VALUES(new.rowid,new.id,new.section_number,new.title,new.body);\n    END;\n    CREATE TRIGGER IF NOT EXISTS swift_forum_posts_ad AFTER DELETE ON swift_forum_posts BEGIN\n      INSERT INTO swift_forum_posts_fts(swift_forum_posts_fts,rowid,id,title,category,content) VALUES('delete',old.rowid,old.id,old.title,old.category,old.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS swift_forum_posts_au AFTER UPDATE ON swift_forum_posts BEGIN\n      INSERT INTO swift_forum_posts_fts(swift_forum_posts_fts,rowid,id,title,category,content) VALUES('delete',old.rowid,old.id,old.title,old.category,old.content);\n      INSERT INTO swift_forum_posts_fts(rowid,id,title,category,content) VALUES(new.rowid,new.id,new.title,new.category,new.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS apple_dev_forum_posts_ad AFTER DELETE ON apple_dev_forum_posts BEGIN\n      INSERT INTO apple_dev_forum_posts_fts(apple_dev_forum_posts_fts,rowid,id,title,tags,content) VALUES('delete',old.rowid,old.id,old.title,old.tags,old.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS apple_dev_forum_posts_au AFTER UPDATE ON apple_dev_forum_posts BEGIN\n      INSERT INTO apple_dev_forum_posts_fts(apple_dev_forum_posts_fts,rowid,id,title,tags,content) VALUES('delete',old.rowid,old.id,old.title,old.tags,old.content);\n      INSERT INTO apple_dev_forum_posts_fts(rowid,id,title,tags,content) VALUES(new.rowid,new.id,new.title,new.tags,new.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS release_notes_fts_ai AFTER INSERT ON release_notes BEGIN\n      INSERT INTO release_notes_fts(rowid,id,os,version,title,content) VALUES(new.rowid,new.id,new.os,new.version,new.title,new.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS release_notes_fts_ad AFTER DELETE ON release_notes BEGIN\n      INSERT INTO release_notes_fts(release_notes_fts,rowid,id,os,version,title,content) VALUES('delete',old.rowid,old.id,old.os,old.version,old.title,old.content);\n    END;\n    CREATE TRIGGER IF NOT EXISTS release_notes_fts_au AFTER UPDATE ON release_notes BEGIN\n      INSERT INTO release_notes_fts(release_notes_fts,rowid,id,os,version,title,content) VALUES('delete',old.rowid,old.id,old.os,old.version,old.title,old.content);\n      INSERT INTO release_notes_fts(rowid,id,os,version,title,content) VALUES(new.rowid,new.id,new.os,new.version,new.title,new.content);\n    END;\n  `);
}

/** Rebuild FTS indexes from base tables. Call after bulk ingest. */
export function rebuildFts(db: DatabaseType): void {
  db.exec(`
    INSERT INTO sessions_fts(sessions_fts) VALUES('rebuild');
    INSERT INTO tutorials_fts(tutorials_fts) VALUES('rebuild');
    INSERT INTO hig_fts(hig_fts) VALUES('rebuild');
    INSERT INTO evolution_fts(evolution_fts) VALUES('rebuild');
    INSERT INTO apple_docs_fts(apple_docs_fts) VALUES('rebuild');
    INSERT INTO swift_book_fts(swift_book_fts) VALUES('rebuild');
    INSERT INTO appstore_guidelines_fts(appstore_guidelines_fts) VALUES('rebuild');
    INSERT INTO release_notes_fts(release_notes_fts) VALUES('rebuild');
    INSERT INTO swift_forum_posts_fts(swift_forum_posts_fts) VALUES('rebuild');
    INSERT INTO apple_dev_forum_posts_fts(apple_dev_forum_posts_fts) VALUES('rebuild');
  `);
}
