// Articles, events and notices that aren't on the website yet: drafts, and anything dated in
// the future (or dated today, before the 6 a.m. go-live). They're shown only on the unlisted
// preview pages at /preview/, so editors can check how they'll look before they go live.
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { isPublished, ymd, teaser, wordCount, issueFriday } from "../../lib/content.js";
import { shareImage } from "../../lib/share-image.js";

function mdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((f) => {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) return mdFiles(p);
    return f.name.endsWith(".md") ? [p] : [];
  });
}

export default async function () {
  const files = [
    ...mdFiles("src/articles").map((file) => ({ file, isAnn: false })),
    ...mdFiles("src/past-articles").map((file) => ({ file, isAnn: false })),
    ...mdFiles("src/announcements").map((file) => ({ file, isAnn: true })),
  ];
  const items = [];
  for (const { file, isAnn } of files) {
    let parsed;
    try {
      parsed = matter(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const data = parsed.data || {};
    if (isPublished(data) || !data.title) continue;
    // Like Eleventy's page.fileSlug: a leading "2026-10-23-" date is not part of the address.
    const slug = path.basename(file, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
    const date = ymd(data.date);
    const kind = isAnn ? (data.type === "notice" ? "notice" : data.type === "event" || ymd(data.start_date) ? "event" : "notice") : "";
    const where = isAnn ? `announcements/${slug}` : `${date.slice(0, 4) || "undated"}/${date.slice(5, 7) || "00"}/${slug}`;
    items.push({
      slug,
      file,
      isAnn,
      kind,
      date,
      issue: date ? issueFriday(date) : "",
      status: data.draft === true ? "draft" : "scheduled",
      data,
      body: parsed.content,
      teaser: teaser(data.summary, parsed.content, isAnn ? 36 : 48),
      readMinutes: Math.max(1, Math.round(wordCount(parsed.content) / 230)),
      shareImage: await shareImage(data.image),
      url: `/preview/${where}/`,
      liveUrl: isAnn ? `/announcements/${slug}/` : `/${date.slice(0, 4)}/${date.slice(5, 7)}/${slug}/`,
    });
  }
  return items.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || a.data.title.localeCompare(b.data.title));
}
