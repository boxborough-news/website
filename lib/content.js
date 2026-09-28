// Shared helpers used by the website build and the weekly newsletter.
import fs from "node:fs";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";

export const TIMEZONE = "America/New_York";

export const md = new MarkdownIt({ html: true, linkify: true, typographer: true });

// Today's date in Boxborough as "YYYY-MM-DD".
// NEWS_TODAY=2026-09-18 can be set to preview the site as of another day.
export function todayET() {
  if (process.env.NEWS_TODAY) return process.env.NEWS_TODAY;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// Normalize a front-matter date (Date object or string) to "YYYY-MM-DD".
export function ymd(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function addDays(ymdString, days) {
  const d = new Date(ymdString + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Front-matter dates are calendar days, so format them in UTC to avoid
// a September 17 article showing up as September 16.
export function formatDate(value, style = "long") {
  const s = ymd(value);
  if (!s) return "";
  const d = new Date(s + "T12:00:00Z");
  const options = {
    long: { month: "long", day: "numeric", year: "numeric" },
    short: { month: "short", day: "numeric" },
    weekday: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
    eventday: { weekday: "short", month: "short", day: "numeric" },
    month: { month: "long", year: "numeric" },
    monthshort: { month: "short" },
    daynum: { day: "numeric" },
  }[style];
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(d);
}

export function isPublished(data) {
  if (data.draft === true) return false;
  const d = ymd(data.date);
  return !d || d <= todayET();
}

export function stripHtml(html) {
  return String(html)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// A short teaser: the editor's summary if given, otherwise the opening words.
export function teaser(summary, markdownBody, words = 48) {
  if (summary && String(summary).trim()) return String(summary).trim();
  const firstParas = String(markdownBody || "")
    .split(/\n\s*\n/)
    .filter((p) => p.trim() && !p.trim().startsWith("!["))
    .slice(0, 2)
    .join("\n\n");
  const text = stripHtml(md.render(firstParas));
  const list = text.split(" ");
  if (list.length <= words) return text;
  return list.slice(0, words).join(" ").replace(/[,;:–—-]+$/, "") + "…";
}

export function readBody(inputPath) {
  try {
    return matter(fs.readFileSync(inputPath, "utf8")).content;
  } catch {
    return "";
  }
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wordCount(markdownBody) {
  return stripHtml(md.render(String(markdownBody || ""))).split(" ").filter(Boolean).length;
}

// Curly quotes for headlines typed with straight quotes: "Work Party" → “Work Party”
export function smartQuotes(s) {
  return String(s ?? "")
    .replace(/(^|[\s(\[{\u2014\u2013-])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s(\[{\u2014\u2013-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

export function words(s, n) {
  const list = String(s ?? "").split(/\s+/);
  if (list.length <= n) return String(s ?? "");
  return list.slice(0, n).join(" ").replace(/[,;:\u2013\u2014-]+$/, "") + "\u2026";
}
