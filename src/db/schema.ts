/**
 * wwdc-mcp-server — SQLite schema
 *
 * Tables:
 *   - sessions          WWDC video sessions (2020..current)
 *   - tutorials         DocC tutorial pages
 *   - pathways          Curated learning tracks
 *   - hig_entries       Human Interface Guidelines topics
 *   - evolution         Swift Evolution proposals
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

    -- FTS5 external-content sync triggers ---------------------------------
    -- Without these, upserts to the content tables never reach the FTS
    -- index and search silently returns nothing. rebuildFts() repairs bulk
    -- state; the triggers keep incremental ingest searchable.
    CREATE TRIGGER IF NOT EXISTS sessions_fts_ai AFTER INSERT ON sessions BEGIN
      INSERT INTO sessions_fts(rowid, id, title, description, transcript, topics)
      VALUES (new.rowid, new.id, new.title, new.description, new.transcript, new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS sessions_fts_ad AFTER DELETE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, id, title, description, transcript, topics)
      VALUES ('delete', old.rowid, old.id, old.title, old.description, old.transcript, old.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS sessions_fts_au AFTER UPDATE ON sessions BEGIN
      INSERT INTO sessions_fts(sessions_fts, rowid, id, title, description, transcript, topics)
      VALUES ('delete', old.rowid, old.id, old.title, old.description, old.transcript, old.topics);
      INSERT INTO sessions_fts(rowid, id, title, description, transcript, topics)
      VALUES (new.rowid, new.id, new.title, new.description, new.transcript, new.topics);
    END;
    CREATE TRIGGER IF NOT EXISTS tutorials_fts_ai AFTER INSERT ON tutorials BEGIN
      INSERT INTO tutorials_fts(rowid, id, title, category, body)
      VALUES (new.rowid, new.id, new.title, new.category, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS tutorials_fts_ad AFTER DELETE ON tutorials BEGIN
      INSERT INTO tutorials_fts(tutorials_fts, rowid, id, title, category, body)
      VALUES ('delete', old.rowid, old.id, old.title, old.category, old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS tutorials_fts_au AFTER UPDATE ON tutorials BEGIN
      INSERT INTO tutorials_fts(tutorials_fts, rowid, id, title, category, body)
      VALUES ('delete', old.rowid, old.id, old.title, old.category, old.body);
      INSERT INTO tutorials_fts(rowid, id, title, category, body)
      VALUES (new.rowid, new.id, new.title, new.category, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS hig_fts_ai AFTER INSERT ON hig_entries BEGIN
      INSERT INTO hig_fts(rowid, id, title, summary, body)
      VALUES (new.rowid, new.id, new.title, new.summary, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS hig_fts_ad AFTER DELETE ON hig_entries BEGIN
      INSERT INTO hig_fts(hig_fts, rowid, id, title, summary, body)
      VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.body);
    END;
    CREATE TRIGGER IF NOT EXISTS hig_fts_au AFTER UPDATE ON hig_entries BEGIN
      INSERT INTO hig_fts(hig_fts, rowid, id, title, summary, body)
      VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.body);
      INSERT INTO hig_fts(rowid, id, title, summary, body)
      VALUES (new.rowid, new.id, new.title, new.summary, new.body);
    END;
    CREATE TRIGGER IF NOT EXISTS evolution_fts_ai AFTER INSERT ON evolution BEGIN
      INSERT INTO evolution_fts(rowid, id, title, body, status)
      VALUES (new.rowid, new.id, new.title, new.body, new.status);
    END;
    CREATE TRIGGER IF NOT EXISTS evolution_fts_ad AFTER DELETE ON evolution BEGIN
      INSERT INTO evolution_fts(evolution_fts, rowid, id, title, body, status)
      VALUES ('delete', old.rowid, old.id, old.title, old.body, old.status);
    END;
    CREATE TRIGGER IF NOT EXISTS evolution_fts_au AFTER UPDATE ON evolution BEGIN
      INSERT INTO evolution_fts(evolution_fts, rowid, id, title, body, status)
      VALUES ('delete', old.rowid, old.id, old.title, old.body, old.status);
      INSERT INTO evolution_fts(rowid, id, title, body, status)
      VALUES (new.rowid, new.id, new.title, new.body, new.status);
    END;
  `);
}

/** Rebuild FTS indexes from base tables. Call after bulk ingest. */
export function rebuildFts(db: DatabaseType): void {
  db.exec(`
    INSERT INTO sessions_fts(sessions_fts) VALUES('rebuild');
    INSERT INTO tutorials_fts(tutorials_fts) VALUES('rebuild');
    INSERT INTO hig_fts(hig_fts) VALUES('rebuild');
    INSERT INTO evolution_fts(evolution_fts) VALUES('rebuild');
  `);
}
