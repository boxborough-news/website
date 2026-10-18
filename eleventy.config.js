import fs from "node:fs";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import rssPlugin from "@11ty/eleventy-plugin-rss";
import { imageOptions } from "./lib/share-image.js";
import {
  md, todayET, ymd, addDays, formatDate, formatRange, isPublished, teaser, stripHtml, smartQuotes, words, sentences,
  weekStart, issueFriday, parseTimeRange, icsCalendar, googleCalendarUrl, weekdayList, nextOnDays, daysLabel, continued,
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
    if (!/\/(past-)?articles\/|\/announcements\//.test(p)) return;
    if (!isPublished(data)) return false;
  });

  // ---- Plugins -------------------------------------------------------------
  eleventyConfig.addPlugin(HtmlBasePlugin);
  eleventyConfig.addPlugin(rssPlugin);
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    ...imageOptions,
    formats: ["webp", "jpeg"],
    widths: [640, 1200],
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
  // Articles: src/articles holds the last two months; older ones live in src/past-articles/YEAR/MONTH/
  // (moved there automatically each month, see scripts/archive-old-articles.js). Where a file
  // lives makes no difference to the website: addresses, sections and search are the same.
  const articles = (api) => api.getFilteredByGlob(["src/articles/*.md", "src/past-articles/**/*.md"]).sort(byNewest);
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
  function eventRows(api, from) {
    const today = from || todayET();
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
        const days = weekdayList(d.weekdays);
        if (days.length && end > start) {
          // A run on certain days each week (a market every Saturday, a show Thursday to Sunday):
          // list it on its next date, with "Runs through …".
          const next = nextOnDays(start > today ? start : today, end, days);
          if (!next) continue;
          rows.push({ ...base, date: next, end: next, sort: next, ongoing: false, runsThrough: end,
            days: /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(d.time || "") ? "" : daysLabel(d.weekdays),
            title: d.title, series: "", time: d.time || "", location: d.location || "", town: d.town || "" });
          continue;
        }
        const ongoing = start < today;
        rows.push({ ...base, date: start, end, sort: ongoing ? today : start, ongoing, title: d.title, series: "",
          time: d.time || "", location: d.location || "", town: d.town || "" });
      }
    }
    return rows.sort((a, b) => a.sort.localeCompare(b.sort) || (a.ongoing - b.ongoing) || minutes(a.time) - minutes(b.time) || a.title.localeCompare(b.title));
  }
  eleventyConfig.addCollection("eventRows", (api) => eventRows(api));

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
    return groups;
  });

  // The next seven days, for the home page. Tops up from later dates when the week is quiet.
  eleventyConfig.addCollection("eventsThisWeek", (api) => {
    // The home page box: the coming week's events, Boxborough first, then nearby towns.
    // Repeat sessions of the same thing (a two-day show, several performances) become one line.
    const today = todayET();
    const rows = eventRows(api);
    const within = (days) => rows.filter((r) => r.sort <= addDays(today, days - 1));
    const merge = (list) => {
      const out = [];
      for (const r of list) {
        const key = r.url + "|" + r.title;
        const hit = out.find((x) => x.key === key);
        if (hit) { hit.last = r.date; hit.times.add(r.time); continue; }
        out.push({ ...r, key, first: r.date, last: r.date, times: new Set([r.time]) });
      }
      return out.map((x) => ({
        ...x,
        time: x.times.size === 1 ? [...x.times][0] : "",
        venue: String(x.location || "").split(/,| \(/)[0].trim(),
      }));
    };
    const isBox = (r) => /boxborough/i.test(r.town || "");
    let box = merge(within(7).filter(isBox));
    if (box.length < 3) box = merge(within(14).filter(isBox)).slice(0, 4);
    const near = merge(within(7).filter((r) => !isBox(r)));
    return { boxborough: box.slice(0, 7), nearby: near.slice(0, 5) };
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
  // The home page is built around the latest Friday issue:
  //   lead      the story ticked "Top story" in that issue (otherwise its first News story with a photo)
  //   news      the rest of that issue's News stories
  //   features  that issue's Features (or the three most recent, if the issue has none)
  //   earlier   stories from previous issues, as a compact list
  eleventyConfig.addCollection("homeStories", (api) => {
    const all = articles(api);
    if (!all.length) return { lead: null, issue: "", news: [], features: [], featuresAreCurrent: false, earlier: [] };
    const issue = issueFriday(all[0].data.date);
    const inIssue = all.filter((i) => issueFriday(i.data.date) === issue);
    const lead =
      inIssue.find((i) => i.data.top_story === true) ||
      inIssue.find((i) => i.data.section === "news" && i.data.image) ||
      inIssue.find((i) => i.data.image) || inIssue[0];
    const news = inIssue.filter((i) => i !== lead && i.data.section === "news");
    let features = inIssue.filter((i) => i !== lead && i.data.section === "features");
    const featuresAreCurrent = features.length > 0;
    if (!featuresAreCurrent) features = all.filter((i) => i !== lead && i.data.section === "features").slice(0, 3);
    const shown = new Set([lead, ...news, ...features]);
    // The two previous issues, each as its own group.
    const earlier = [];
    for (const i of all.filter((x) => !shown.has(x) && issueFriday(x.data.date) < issue)) {
      const key = issueFriday(i.data.date);
      let g = earlier.find((x) => x.issue === key);
      if (!g) { if (earlier.length === 2) break; earlier.push((g = { issue: key, items: [] })); }
      g.items.push(i);
    }
    return { lead, issue, news, features, featuresAreCurrent, earlier };
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

  // Archive grouped by Friday issue, newest first, one page per year at /archive/2025/ and
  // so on. /archive/ shows the latest year as well. Events are on /events/past/.
  eleventyConfig.addCollection("archiveYears", (api) => {
    const years = new Map();
    for (const item of articles(api)) {
      const key = issueFriday(item.data.date);
      const y = key.slice(0, 4);
      if (!years.has(y)) years.set(y, new Map());
      const groups = years.get(y);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
    const list = [...years.entries()].map(([year, groups]) => {
      const issues = [...groups.entries()].map(([key, items]) => ({ key, label: formatDate(key, "long"), items }));
      // "Jump to month" links: each month points at its first (latest) issue on the page.
      const months = new Map();
      for (const i of issues) if (!months.has(i.key.slice(5, 7))) months.set(i.key.slice(5, 7), i.key);
      return {
        year,
        url: `/archive/${year}/`,
        issues,
        months: [...months.entries()].sort().map(([m, key]) => ({ label: MONTHS[+m - 1], key })),
      };
    });
    const all = list.map(({ year, url }) => ({ year, url }));
    const pages = list.map((y) => ({ ...y, all }));
    return list.length ? [{ ...pages[0], url: "/archive/", latest: true }, ...pages] : [];
  });

  // The most recent issue that has been published (the latest Friday with articles), for the
  // sample email on the Subscribe page. Its events start from the issue's own date, as sent.
  eleventyConfig.addCollection("latestIssue", (api) => {
    const all = articles(api);
    if (!all.length) return null;
    const date = issueFriday(all[0].data.date);
    const start = addDays(date, -6);
    const inWeek = (i) => ymd(i.data.date) >= start && ymd(i.data.date) <= date;
    const seen = new Set();
    return {
      date,
      news: all.filter((i) => i.data.section === "news" && inWeek(i)),
      features: all.filter((i) => i.data.section === "features" && inWeek(i)),
      announcements: announcements(api).filter(inWeek),
      events: eventRows(api, date).filter((r) => (seen.has(r.url) ? false : seen.add(r.url))),
    };
  });

  // What goes into this week's newsletter.
  eleventyConfig.addCollection("thisWeek", (api) => {
    // The issue is dated the coming Friday (or today, on a Friday) and covers the seven days ending then.
    const end = issueFriday(todayET());
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
  // Link to an issue on the archive page for its year.
  eleventyConfig.addFilter("issueUrl", (key, years) => {
    const y = (years || []).find((x) => x.year === String(key).slice(0, 4));
    return `${y ? y.url : "/archive/"}#issue-${key}`;
  });
  eleventyConfig.addFilter("isoDate", (v) => ymd(v) + "T12:00:00Z");
  eleventyConfig.addFilter("markdown", (s) => md.render(String(s || "")));
  eleventyConfig.addFilter("markdownInline", (s) => md.renderInline(String(s || "")));
  eleventyConfig.addFilter("smart", (s) => smartQuotes(s));
  eleventyConfig.addFilter("words", (s, n) => words(s, n));
  eleventyConfig.addFilter("sentences", (s, n) => sentences(s, n));
  eleventyConfig.addFilter("continued", (s) => continued(s));
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
  eleventyConfig.addFilter("issueOf", (v) => issueFriday(v));
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
  eleventyConfig.addFilter("gcal", (title, start, end, time, place, url, weekdays) =>
    googleCalendarUrl({ title, start, end, time, location: place, url, weekdays })
  );
  eleventyConfig.addFilter("daysLabel", (v) => daysLabel(v));
  // "Saturday, Nov. 21, 2026" when all sessions share a day; otherwise "7 dates, Oct. 17–31, 2026".
  eleventyConfig.addFilter("sessionsWhen", (list) => {
    const days = [...new Set((list || []).map((x) => ymd(x.date)).filter(Boolean))].sort();
    if (!days.length) return "";
    if (days.length === 1) return formatDate(days[0], "weekday");
    return `${days.length} dates, ${formatRange(days[0], days.at(-1))}, ${days.at(-1).slice(0, 4)}`;
  });
  // Sessions still to come (all of them, if the series is over).
  eleventyConfig.addFilter("upcomingSessions", (list) => {
    const today = todayET();
    const all = Array.isArray(list) ? list : [];
    const next = all.filter((x) => ymd(x.date) >= today);
    return next.length ? next : all;
  });
  eleventyConfig.addFilter("icsFile", (items, name) =>
    icsCalendar(name, (items || []).flatMap((i) => {
      const d = i.data;
      const url = siteUrl + i.url.replace(pathPrefix, "/");
      const where = (loc, town) => [loc, town && !/online/i.test(town) ? town : ""].filter(Boolean).join(", ");
      if (Array.isArray(d.sessions) && d.sessions.length) {
        return d.sessions.map((s, n) => ({ uid: `${i.page.fileSlug}-${n + 1}@boxboroughnews.org`, title: s.title || d.title, start: s.date, time: s.time, location: where(s.location || d.location, s.town || d.town), url, description: d.title }));
      }
      return [{ uid: `${i.page.fileSlug}@boxboroughnews.org`, title: d.title, start: d.start_date, end: d.end_date, time: d.time, weekdays: d.weekdays, location: where(d.location, d.town), url, description: d.organizer ? "Organized by " + d.organizer : "" }];
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
