/**
 * Swift Forums ingest — forums.swift.org (Discourse API, public/no auth).
 *
 * Fetches topic lists from swift-evolution, using-swift, and development
 * categories, then optionally fetches the first post body for each topic.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import axios from "axios";
import pLimit from "p-limit";
import { recordIngest } from "../db/queries.js";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BASE_URL = "https://forums.swift.org";

const CATEGORY_MAP: Record<number, string> = {
  18: "swift-evolution",
  6: "using-swift",
  7: "development",
};

interface DiscourseTopic {
  id: number;
  title: string;
  slug: string;
  category_id: number;
  posts_count: number;
  reply_count: number;
  created_at: string;
  last_posted_at?: string;
}

interface DiscourseTopicList {
  topic_list?: {
    topics?: DiscourseTopic[];
  };
}

interface DiscoursePost {
  cooked?: string;
}

interface DiscourseTopicDetail {
  post_stream?: {
    posts?: DiscoursePost[];
  };
  details?: {
    created_by?: { username?: string };
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCategoryPage(
  categoryId: number,
  page: number,
): Promise<DiscourseTopic[]> {
  try {
    const url = `${BASE_URL}/c/${categoryId}.json?page=${page}`;
    const resp = await axios.get<DiscourseTopicList>(url, { timeout: 15000 });
    return resp.data?.topic_list?.topics ?? [];
  } catch {
    return [];
  }
}

async function fetchTopicFirstPost(
  slug: string,
  topicId: number,
): Promise<{ content: string; author: string }> {
  try {
    const url = `${BASE_URL}/t/${slug}/${topicId}.json`;
    const resp = await axios.get<DiscourseTopicDetail>(url, { timeout: 15000 });
    const posts = resp.data?.post_stream?.posts ?? [];
    const cooked = posts[0]?.cooked ?? "";
    const author = resp.data?.details?.created_by?.username ?? "";
    return { content: stripHtml(cooked).slice(0, 4000), author };
  } catch {
    return { content: "", author: "" };
  }
}

const CATEGORY_CONFIGS: { id: number; maxPages: number }[] = [
  { id: 18, maxPages: 20 }, // swift-evolution
  { id: 6,  maxPages: 10 }, // using-swift
  { id: 7,  maxPages: 10 }, // development
];

const MAX_TOPICS = 500;
const MIN_POSTS = 2;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 800;
const CONCURRENCY = 3;

export async function ingestSwiftForums(
  db: DatabaseType,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;

  // Collect topics across all categories
  const allTopics: (DiscourseTopic & { categoryName: string })[] = [];

  for (const { id: categoryId, maxPages } of CATEGORY_CONFIGS) {
    const categoryName = CATEGORY_MAP[categoryId] ?? String(categoryId);
    for (let page = 0; page < maxPages; page++) {
      const topics = await fetchCategoryPage(categoryId, page);
      if (topics.length === 0) break;
      for (const t of topics) {
        if (t.posts_count >= MIN_POSTS) {
          allTopics.push({ ...t, categoryName });
        }
      }
      if (allTopics.length >= MAX_TOPICS) break;
      await delay(200);
    }
    if (allTopics.length >= MAX_TOPICS) break;
  }

  const topics = allTopics.slice(0, MAX_TOPICS);

  // Fetch first post content in batches
  const limit = pLimit(CONCURRENCY);
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO swift_forum_posts
      (id, topic_id, title, category, content, author, post_count, reply_count, created_at, url, updated_at)
    VALUES
      (@id, @topic_id, @title, @category, @content, @author, @post_count, @reply_count, @created_at, @url, datetime('now'))
  `);

  for (let i = 0; i < topics.length; i += BATCH_SIZE) {
    const batch = topics.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((topic) =>
        limit(async () => {
          try {
            const { content, author } = await fetchTopicFirstPost(topic.slug, topic.id);
            upsert.run({
              id: `t/${topic.slug}/${topic.id}`,
              topic_id: topic.id,
              title: topic.title,
              category: topic.categoryName,
              content,
              author,
              post_count: topic.posts_count,
              reply_count: topic.reply_count,
              created_at: topic.created_at,
              url: `${BASE_URL}/t/${topic.slug}/${topic.id}`,
            });
            ingested++;
          } catch {
            errors++;
          }
        }),
      ),
    );
    if (i + BATCH_SIZE < topics.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  recordIngest(db, "swift-forums", ingested, errors, `topics: ${topics.length}`);
  return { ingested, errors };
}
