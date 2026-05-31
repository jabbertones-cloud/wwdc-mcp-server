/**
 * wwdc-mcp-server — constants
 *
 * Endpoint bases, limits, cache paths.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root (one level up from src/)
export const PROJECT_ROOT = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const FIXTURES_DIR = path.join(PROJECT_ROOT, "fixtures");
export const DB_PATH = process.env.WWDC_MCP_DB ?? path.join(DATA_DIR, "wwdc.db");
export const CACHE_DIR = path.join(DATA_DIR, "cache");

// Response size budget (tokens ≈ chars / 4, 25K chars ≈ 6K tokens)
export const CHARACTER_LIMIT = 25_000;

// Apple developer endpoints
export const APPLE_BASE = "https://developer.apple.com";
export const APPLE_DOCS_BASE = `${APPLE_BASE}/documentation`;
export const APPLE_TUTORIALS_DATA = `${APPLE_BASE}/tutorials/data/tutorials`;
export const APPLE_TUTORIALS_HTML = `${APPLE_BASE}/tutorials`;
export const APPLE_WWDC_BASE = `${APPLE_BASE}/videos/wwdc`;
export const APPLE_WWDC_PLAY = `${APPLE_BASE}/videos/play/wwdc`;
export const APPLE_HIG_BASE = `${APPLE_BASE}/design/human-interface-guidelines`;
export const APPLE_HIG_JSON = `${APPLE_BASE}/tutorials/data/design/human-interface-guidelines`;

// Swift Evolution — GitHub repo
export const SWIFT_EVOLUTION_REPO =
  "https://raw.githubusercontent.com/apple/swift-evolution/main";
export const SWIFT_EVOLUTION_PROPOSALS = `${SWIFT_EVOLUTION_REPO}/proposals`;
export const SWIFT_EVOLUTION_INDEX_API =
  "https://api.github.com/repos/apple/swift-evolution/contents/proposals";

// Ollama — local embeddings, no paid API
export const OLLAMA_BASE = process.env.OLLAMA_BASE ?? "http://127.0.0.1:11434";
export const OLLAMA_EMBED_MODEL =
  process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
export const OLLAMA_EMBED_DIM = 768;

// HTTP client tuning
export const USER_AGENT =
  "wwdc-mcp-server/0.1.3 (+https://github.com/jabbertones-cloud/wwdc-mcp-server)";
export const REQUEST_TIMEOUT_MS = 20_000;
export const REQUEST_RETRY = 2;
export const REQUEST_CONCURRENCY = 4; // Be polite to Apple

// WWDC year range (extend as new years arrive)
export const WWDC_YEARS: readonly number[] = [
  2020, 2021, 2022, 2023, 2024, 2025,
] as const;

// Ingest cadence (used by external schedulers, documented for reference)
export const INGEST_CADENCE_REGULAR_HOURS = 24;
export const INGEST_CADENCE_WWDC_WEEK_MIN = 30;

// Default pagination
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
