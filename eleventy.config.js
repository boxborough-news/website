import fs from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import rssPlugin from "@11ty/eleventy-plugin-rss";
import {
  md, todayET, ymd, addDays, formatDate, formatRange, isPublished, teaser, stripHtml, smartQuotes, words,
  weekStart, issueFriday, parseTimeRange, icsCalendar, googleCalendarUrl,
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

  // ---- Events and notices -------------------------------------------------
  // (Worked out here rather than read from computed data, which isn't ready when collections are built.)
  const kindOf = (i) => (i.data.type === "notice" ? "notice" : i.data.type === "event" || ymd(i.data.start_date) ? "event" : "notice");
  const isEvent = (i) => kindOf(i) === "event";
  const isNotice = (i) => kindOf(i) === "notice";
  const startOf = (i) => ymd(i.data.start_date);
  const endOf = (i) => ymd(i.data.end_date) || ymd(i.data.start_date);
  const minutes = (t) => (parseTimeRange(t) || { start: -1 }).start;

  // One row per date people can attend: a single event is one row, a series with
  // "sessions" is one row per session. Rows that have ended are dropped.
  function eventRows(api) {
    const today = todayET();
    const rows = [];
    for (const item of announcements(api).filter(isEvent)) {
      const d = item.data;
      const base = { item, url: item.url, organizer: d.organizer || "" };
      if (Array.isArray(d.sessions) && d.sessions.length) {
        for (const s of d.sessions) {
          const date = ymd(s.date);
          if (!date || date < today) continue;
          rows.push({ ...base, date, end: date, sort: date, ongoing: false, title: s.title || d.title, series: d.title,
            time: s.time || "", location: s.location || d.location || "", town: s.town || d.town || "" });
        }
      } else {
        const start = startOf(item);
        const end = endOf(item);
        if (!start || end < today) continue;
        const ongoing = start < today;
        rows.push({ ...base, date: start, end, sort: ongoing ? today : start, ongoing, title: d.title, series: "",
          time: d.time || "", location: d.location || "", town: d.town || "" });
      }
    }
    return rows.sort((a, b) => a.sort.localeCompare(b.sort) || (a.ongoing - b.ongoing) || minutes(a.time) - minutes(b.time) || a.title.localeCompare(b.title));
  }
  eleventyConfig.addCollection("eventRows", eventRows);

  // Upcoming rows grouped into This week / Next week / Later (weeks run Monday to Sunday).
  eleventyConfig.addCollection("eventGroups", (api) => {
    const today = todayET();
    const thisSun = addDays(weekStart(today), 6);
    const nextSun = addDays(thisSun, 7);
    const groups = [
      { key: "this-week", label: "This week", range: formatRange(today, thisSun), rows: [] },
      { key: "next-week", label: "Next week", range: formatRange(addDays(thisSun, 1), nextSun), rows: [] },
      { key: "later", label: "Later", range: "", rows: [] },
    ];
    for (const r of eventRows(api)) {
      groups[r.sort <= thisSun ? 0 : r.sort <= nextSun ? 1 : 2].rows.push(r);
    }
    // Beyond next week, a series shows once ("6 sessions, Oct. 27–Nov. 21") instead of a row per session.
    const later = [];
    for (const r of groups[2].rows) {
      if (!r.series) { later.push(r); continue; }
      const first = later.find((x) => x.url === r.url && x.count);
      if (first) { first.count++; first.end = r.date; continue; }
      const d = r.item.data;
      later.push({ ...r, title: r.series, series: "", count: 1, time: "", location: d.location || "", town: d.town || "" });
    }
    groups[2].rows = later;
    return groups;
  });

  // The next seven days, for the home page. Tops up from later dates when the week is quiet.
  eleventyConfig.addCollection("eventsThisWeek", (api) => {
    const rows = eventRows(api);
    const weekEnd = addDays(todayET(), 6);
    const week = rows.filter((r) => r.sort <= weekEnd);
    return week.length >= 3 ? week.slice(0, 6) : rows.slice(0, Math.max(week.length, 4));
  });

  // Each upcoming event once (a series appears once, at its next session), for the email
  // and "Other upcoming events".
  eleventyConfig.addCollection("upcomingEvents", (api) => {
    const seen = new Set();
    return eventRows(api).filter((r) => (seen.has(r.url) ? false : seen.add(r.url)));
  });

  eleventyConfig.addCollection("pastEvents", (api) => {
    const today = todayET();
    return announcements(api)
      .filter((i) => isEvent(i) && endOf(i) && endOf(i) < today)
      .sort((a, b) => endOf(b).localeCompare(endOf(a)));
  });

  eleventyConfig.addCollection("notices", (api) => {
    const today = todayET();
    return announcements(api).filter((i) => isNotice(i) && (!ymd(i.data.expires) || ymd(i.data.expires) >= today));
  });
  eleventyConfig.addCollection("expiredNotices", (api) => {
    const today = todayET();
    return announcements(api).filter((i) => isNotice(i) && ymd(i.data.expires) && ymd(i.data.expires) < today);
  });

  // Every event, past and future, for the subscribable calendar feed.
  eleventyConfig.addCollection("allEvents", (api) => announcements(api).filter(isEvent));

  // ---- Home page story selection ------------------------------------------
  // Lead: the story ticked "Top story" in the latest week; otherwise the newest
  // News story with a photo. Then four more News stories, then headlines.
  eleventyConfig.addCollection("homeStories", (api) => {
    const all = articles(api);
    const news = all.filter((i) => i.data.section === "news");
    const newest = ymd(all[0]?.data.date);
    const lead =
      all.find((i) => i.data.top_story === true && ymd(i.data.date) >= addDays(newest, -6)) ||
      news.find((i) => i.data.image) || news[0] || all[0];
    const rest = news.filter((i) => i !== lead);
    const features = all.filter((i) => i.data.section === "features" && i !== lead);
    return {
      lead,
      issue: lead ? issueFriday(newest) : "",
      secondary: rest.slice(0, 4),
      headlines: rest.slice(4, 10),
      features: features.slice(0, 3),
    };
  });

  // Section listing pages (News, Features), 20 stories per page: /news/, /news/page-2/ …
  eleventyConfig.addCollection("sectionPages", (api) => {
    const sections = JSON.parse(fs.readFileSync("src/_data/sections.json", "utf8"));
    const pages = [];
    for (const s of sections) {
      const items = articles(api).filter((i) => i.data.section === s.key);
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

  // Archive grouped by Friday issue, newest first. Events are listed on /events/past/ instead.
  eleventyConfig.addCollection("archiveIssues", (api) => {
    const groups = new Map();
    for (const item of [...articles(api), ...announcements(api).filter(isNotice)].sort(byNewest)) {
      const key = issueFriday(item.data.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.entries()].map(([key, items]) => ({ key, label: formatDate(key, "long"), items }));
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
  eleventyConfig.addFilter("range", (a, b) => formatRange(a, b));
  eleventyConfig.addFilter("rangeLong", (a, b) => (ymd(a) ? formatRange(a, b) + ", " + ymd(b || a).slice(0, 4) : ""));
  eleventyConfig.addFilter("plusDays", (v, n) => addDays(ymd(v), n));
  eleventyConfig.addFilter("uniqueBy", (arr, key) => {
    const seen = new Set();
    return (arr || []).filter((x) => (seen.has(x[key]) ? false : seen.add(x[key])));
  });
  eleventyConfig.addFilter("meetingsWithin", (all, days, max) => {
    const horizon = addDays(todayET(), days - 1);
    const rows = (all || []).filter((e) => e.date <= horizon).slice(0, max);
    return { rows, later: (all || []).length - rows.length };
  });
  eleventyConfig.addFilter("excludeUrl", (rows, url) => (rows || []).filter((r) => r.url !== url));
  eleventyConfig.addFilter("isBoxborough", (town) => /boxborough/i.test(String(town || "")));
  // Calendar links for one event page.
  eleventyConfig.addFilter("gcal", (title, start, end, time, place, url) =>
    googleCalendarUrl({ title, start, end, time, location: place, url })
  );
  eleventyConfig.addFilter("icsFile", (items, name) =>
    icsCalendar(name, (items || []).flatMap((i) => {
      const d = i.data;
      const url = siteUrl + i.url.replace(pathPrefix, "/");
      const where = (loc, town) => [loc, town && !/online/i.test(town) ? town : ""].filter(Boolean).join(", ");
      if (Array.isArray(d.sessions) && d.sessions.length) {
        return d.sessions.map((s, n) => ({ uid: `${i.page.fileSlug}-${n + 1}@boxboroughnews.org`, title: s.title || d.title, start: s.date, time: s.time, location: where(s.location || d.location, s.town || d.town), url, description: d.title }));
      }
      return [{ uid: `${i.page.fileSlug}@boxboroughnews.org`, title: d.title, start: d.start_date, end: d.end_date, time: d.time, location: where(d.location, d.town), url, description: d.organizer ? "Organized by " + d.organizer : "" }];
    }))
  );
  eleventyConfig.addFilter("mapsUrl", (place) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    templateFormats: ["md", "njk", "11ty.js"],
    pathPrefix,
  };
}
