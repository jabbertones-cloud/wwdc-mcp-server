/**
 * Apple Developer Forums ingest — developer.apple.com/forums RSS feeds.
 *
 * Fetches public RSS feeds, parses XML with cheerio, and stores posts
 * in the apple_dev_forum_posts table.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import axios from "axios";
import * as cheerio from "cheerio";
import { recordIngest } from "../db/queries.js";

const RSS_FEEDS = [
  "https://developer.apple.com/forums/feeds/recent",
  "https://developer.apple.com/forums/feeds/tags/swiftui",
  "https://developer.apple.com/forums/feeds/tags/swift",
  "https://developer.apple.com/forums/feeds/tags/combine",
];

const MAX_ITEMS = 200;

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a stable id from an Apple Dev Forum URL path. */
function idFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\/forums\//, "").replace(/\/$/, "") || url;
  } catch {
    return url;
  }
}

interface ForumPost {
  id: string;
  title: string;
  tags: string;
  content: string;
  author: string;
  url: string;
  published_at: string;
}

async function fetchFeed(feedUrl: string): Promise<ForumPost[]> {
  try {
    const resp = await axios.get<string>(feedUrl, {
      timeout: 15000,
      responseType: "text",
      headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const posts: ForumPost[] = [];

    $("item").each((_, el) => {
      const item = $(el);
      const title = item.find("title").first().text().trim();
      const link = item.find("link").first().text().trim() || (item.find("link").attr("href") ?? "");
      const description = item.find("description").first().text().trim();
      const author =
        (item.find("author").first().text().trim() ||
        item.find("dc\\:creator, creator").first().text().trim());
      const pubDate = item.find("pubDate").first().text().trim();

      const tags: string[] = [];
      item.find("category").each((_, catEl) => {
        const cat = $(catEl).text().trim();
        if (cat) tags.push(cat);
      });

      if (!title || !link) return;

      posts.push({
        id: idFromUrl(link),
        title,
        tags: tags.join(" "),
        content: stripHtml(description).slice(0, 2000),
        author,
        url: link,
        published_at: pubDate,
      });
    });

    return posts;
  } catch {
    return [];
  }
}

export async function ingestAppleDevForums(
  db: DatabaseType,
): Promise<{ ingested: number; errors: number }> {
  let ingested = 0;
  let errors = 0;

  const seen = new Set<string>();
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO apple_dev_forum_posts
      (id, title, tags, content, author, url, published_at, updated_at)
    VALUES
      (@id, @title, @tags, @content, @author, @url, @published_at, datetime('now'))
  `);

  for (const feedUrl of RSS_FEEDS) {
    if (seen.size >= MAX_ITEMS) break;
    try {
      const posts = await fetchFeed(feedUrl);
      for (const post of posts) {
        if (seen.size >= MAX_ITEMS) break;
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        try {
          upsert.run(post);
          ingested++;
        } catch {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }

  recordIngest(db, "apple-dev-forums", ingested, errors, `feeds: ${RSS_FEEDS.length}`);
  return { ingested, errors };
}
