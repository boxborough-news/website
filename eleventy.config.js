import fs from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import rssPlugin from "@11ty/eleventy-plugin-rss";
import {
  md, todayET, ymd, addDays, formatDate, isPublished, teaser, stripHtml, smartQuotes, words,
} from "./lib/content.js";

const site = JSON.parse(fs.readFileSync("src/_data/site.json", "utf8"));
// SITE_URL (set in the GitHub workflow) wins over the value in Site Settings.
const siteUrl = (process.env.SITE_URL || site.url).replace(/\/$/, "");
const pathPrefix = new URL(siteUrl + "/").pathname;

const byNewest = (a, b) =>
  ymd(b.data.date).localeCompare(ymd(a.data.date)) ||
  (b.data.top_story === true) - (a.data.top_story === true) ||
  a.data.title.localeCompare(b.data.title);

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  // Uploaded documents (PDF flyers, agendas…) are published as-is. Uploaded photos are NOT:
  // only the resized versions made below go on the site, which keeps it small and fast.
  eleventyConfig.addPassthroughCopy("src/media/**/*.{pdf,PDF,doc,docx,xls,xlsx,ppt,pptx,txt,csv,mp3,m4a,mp4}");

  eleventyConfig.addGlobalData("siteUrl", siteUrl);
  eleventyConfig.addGlobalData("today", todayET());

  // Drafts, and articles dated in the future, are left out until their day comes.
  // (The site rebuilds itself every morning, so scheduled articles appear on time.)
  eleventyConfig.addPreprocessor("unpublished", "md", (data) => {
    const p = data.page.inputPath;
    if (!p.includes("/articles/") && !p.includes("/announcements/")) return;
    if (!isPublished(data)) return false;
  });

  // ---- Plugins -------------------------------------------------------------
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPlugin(rssPlugin);
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ["webp", "jpeg"],
    widths: [640, 1280],
    sharpJpegOptions: { quality: 78, mozjpeg: true },
    sharpWebpOptions: { quality: 76 },
    outputDir: "_site/img/",
    urlPath: "/img/",
    failOnError: false,
    htmlOptions: {
      imgAttributes: {
        loading: "lazy",
        decoding: "async",
        sizes: "(min-width: 760px) 700px, 100vw",
      },
    },
  });

  // ---- Collections ---------------------------------------------------------
  const articles = (api) => api.getFilteredByGlob("src/articles/*.md").sort(byNewest);
  const announcements = (api) => api.getFilteredByGlob("src/announcements/*.md").sort(byNewest);

  eleventyConfig.addCollection("articles", articles);
  eleventyConfig.addCollection("news", (api) => articles(api).filter((i) => i.data.section === "news"));
  eleventyConfig.addCollection("features", (api) => articles(api).filter((i) => i.data.section === "features"));
  eleventyConfig.addCollection("announcements", announcements);
  eleventyConfig.addCollection("menuPages", (api) =>
    api
      .getFilteredByGlob("src/pages/*.md")
      .filter((p) => p.data.show_in_menu)
      .sort((a, b) => (a.data.menu_order || 99) - (b.data.menu_order || 99))
  );
  eleventyConfig.addCollection("everything", (api) => [...articles(api), ...announcements(api)].sort(byNewest));

  eleventyConfig.addCollection("upcomingEvents", (api) => {
    const today = todayET();
    return announcements(api)
      .filter((i) => ymd(i.data.event_date) >= today)
      .sort((a, b) => ymd(a.data.event_date).localeCompare(ymd(b.data.event_date)));
  });

  // Section listing pages, 20 stories per page: /news/, /news/page-2/ …
  eleventyConfig.addCollection("sectionPages", (api) => {
    const sections = JSON.parse(fs.readFileSync("src/_data/sections.json", "utf8"));
    const pages = [];
    for (const s of sections) {
      const items =
        s.key === "announcements" ? announcements(api) : articles(api).filter((i) => i.data.section === s.key);
      const size = 20;
      const total = Math.max(1, Math.ceil(items.length / size));
      for (let n = 0; n < total; n++) {
        pages.push({
          section: s,
          items: items.slice(n * size, (n + 1) * size),
          number: n + 1,
          total,
          url: n === 0 ? s.path : `${s.path}page-${n + 1}/`,
          prev: n === 0 ? null : n === 1 ? s.path : `${s.path}page-${n}/`,
          next: n + 1 < total ? `${s.path}page-${n + 2}/` : null,
        });
      }
    }
    return pages;
  });

  // Archive grouped by month, newest first.
  eleventyConfig.addCollection("archiveMonths", (api) => {
    const groups = new Map();
    for (const item of [...articles(api), ...announcements(api)].sort(byNewest)) {
      const key = ymd(item.data.date).slice(0, 7);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, label: formatDate(key + "-01", "month"), items }));
  });

  // What goes into this week's newsletter: everything dated in the 7 days ending today.
  eleventyConfig.addCollection("thisWeek", (api) => {
    const end = todayET();
    const start = addDays(end, -6);
    const inWeek = (i) => ymd(i.data.date) >= start && ymd(i.data.date) <= end;
    return {
      start,
      end,
      news: articles(api).filter((i) => i.data.section === "news" && inWeek(i)),
      features: articles(api).filter((i) => i.data.section === "features" && inWeek(i)),
      announcements: announcements(api).filter(inWeek),
    };
  });

  // ---- Filters -------------------------------------------------------------
  eleventyConfig.addFilter("date", (v, style) => formatDate(v, style));
  eleventyConfig.addFilter("ymd", (v) => ymd(v));
  eleventyConfig.addFilter("isoDate", (v) => ymd(v) + "T12:00:00Z");
  eleventyConfig.addFilter("markdown", (s) => md.render(String(s || "")));
  eleventyConfig.addFilter("markdownInline", (s) => md.renderInline(String(s || "")));
  eleventyConfig.addFilter("smart", (s) => smartQuotes(s));
  eleventyConfig.addFilter("words", (s, n) => words(s, n));
  eleventyConfig.addFilter("plain", (s) => stripHtml(s));
  eleventyConfig.addFilter("limit", (arr, n) => (arr || []).slice(0, n));
  eleventyConfig.addFilter("offset", (arr, n) => (arr || []).slice(n));
  eleventyConfig.addFilter("excludeAll", (arr, ...lists) => {
    const skip = new Set(lists.flat().map((i) => i.url));
    return (arr || []).filter((i) => !skip.has(i.url));
  });
  eleventyConfig.addFilter("exclude", (arr, url) => (arr || []).filter((i) => i.url !== url));
  eleventyConfig.addFilter("sectionInfo", (key, sections) => sections.find((s) => s.key === key) || sections[0]);
  eleventyConfig.addFilter("absolute", (url) => (/^https?:/.test(url) ? url : siteUrl + String(url).replace(pathPrefix, "/")));
  eleventyConfig.addFilter("encode", (s) => encodeURIComponent(String(s)));
  eleventyConfig.addFilter("afterToday", (v) => !v || ymd(v) >= todayET());
  eleventyConfig.addFilter("teaser", (data, body) => teaser(data.summary, body));
  eleventyConfig.addFilter("topStoryFirst", (arr) => {
    const list = [...(arr || [])];
    const idx = list.findIndex((i) => i.data.top_story === true && ymd(i.data.date) >= addDays(ymd(list[0]?.data.date), -6));
    if (idx > 0) list.unshift(list.splice(idx, 1)[0]);
    return list;
  });
  eleventyConfig.addFilter("longDate", () => formatDate(todayET(), "weekday"));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "11ty.js"],
    pathPrefix,
  };
}
