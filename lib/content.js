// Shared helpers used by the website build and the weekly newsletter.
import fs from "node:fs";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import markdownItIns from "markdown-it-ins";

export const TIMEZONE = "America/New_York";

export const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
// Keep curly quotes, but don't turn "(R)" after a candidate's name into "®" (or "(c)" into "©").
md.disable("replacements");
// Pages CMS saves underlined text as ++text++ (common when pasting from Word or an email).
// Show it as underlined instead of as plus signs.
md.use(markdownItIns);

// Give headings an id ("## Get involved" -> id="get-involved") so pages can link to a section.
md.core.ruler.push("heading_ids", (state) => {
  const used = new Set();
  state.tokens.forEach((tok, i) => {
    if (tok.type !== "heading_open" || tok.attrGet("id")) return;
    let slug = state.tokens[i + 1].content.toLowerCase().replace(/[\u2018\u2019'"]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!slug) return;
    let n = 2, base = slug;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    tok.attrSet("id", slug);
  });
});

// ---- Photos side by side ----------------------------------------------------------------
// Photos placed one right after another in an article (with nothing but an optional short
// italic caption line between them) are shown side by side, up to three in a row, all the
// same height and never trimmed. On phones they stack (see .photo-group in site.css). This
// lets editors arrange photos just by where they put them in Pages CMS or the Google Doc.

// A picture's width ÷ height, read from the file's header (JPEG, PNG, GIF or WebP).
const ratioCache = new Map();
export function imageRatio(src) {
  const rel = String(src || "").replace(/^https?:\/\/[^/]+/, "").split(/[?#]/)[0];
  if (ratioCache.has(rel)) return ratioCache.get(rel);
  let ratio = 1.5;
  try {
    const file = decodeURIComponent(rel).replace(/^.*?\/media\//, "src/media/");
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(256 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, n);
    let w = 0, h = 0;
    if (b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") { w = b.readUInt32BE(16); h = b.readUInt32BE(20); }
    else if (b.toString("ascii", 0, 3) === "GIF") { w = b.readUInt16LE(6); h = b.readUInt16LE(8); }
    else if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8X") { w = 1 + b.readUIntLE(24, 3); h = 1 + b.readUIntLE(27, 3); }
      else if (kind === "VP8 ") { w = b.readUInt16LE(26) & 0x3fff; h = b.readUInt16LE(28) & 0x3fff; }
      else if (kind === "VP8L") { const v = b.readUInt32LE(21); w = 1 + (v & 0x3fff); h = 1 + ((v >> 14) & 0x3fff); }
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      let orient = 1;
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m === 0xe1 && b.toString("ascii", i + 4, i + 8) === "Exif") {
          // Phone photos are often stored sideways with an "orientation" note; 5–8 mean turned 90°.
          const t = i + 10, le = b.toString("ascii", t, t + 2) === "II";
          const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
          const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
          const ifd = t + u32(t + 4);
          for (let k = 0, cnt = u16(ifd); k < cnt; k++) if (u16(ifd + 2 + k * 12) === 0x0112) orient = u16(ifd + 2 + k * 12 + 8);
        }
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
          h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7);
          if (orient >= 5 && orient <= 8) [w, h] = [h, w];
          break;
        }
        i += 2 + len;
      }
    }
    if (w > 0 && h > 0) ratio = Math.min(4, Math.max(0.3, w / h));
  } catch { /* not found or unreadable: assume an ordinary landscape photo */ }
  ratioCache.set(rel, ratio);
  return ratio;
}

md.core.ruler.push("photo_rows", (state) => {
  const t = state.tokens;
  const blank = (c) => c.type === "softbreak" || c.type === "hardbreak" || (c.type === "text" && !c.content.trim());
  const isPara = (i) => t[i] && t[i].type === "paragraph_open" && t[i].level === 0 && t[i + 1]?.type === "inline" && t[i + 2]?.type === "paragraph_close";
  // The pictures in a paragraph that holds nothing else, or null.
  const pictures = (i) => {
    if (!isPara(i)) return null;
    const kids = t[i + 1].children || [];
    const imgs = kids.filter((c) => c.type === "image");
    return imgs.length && kids.every((c) => c.type === "image" || blank(c)) ? imgs : null;
  };
  // A short paragraph that is all italics, used as a caption under a picture.
  const isCaption = (i) => {
    if (!isPara(i)) return false;
    const kids = (t[i + 1].children || []).filter((c) => !blank(c));
    return kids.length >= 3 && kids[0].type === "em_open" && kids[kids.length - 1].type === "em_close" &&
      kids.filter((c) => c.type === "em_open").length === 1 && t[i + 1].content.length <= 200;
  };
  const html = (content) => Object.assign(new state.Token("html_block", "", 0), { content, block: true });
  const inlineOf = (children, content) => Object.assign(new state.Token("inline", "", 0), { children, content });
  const out = [];
  for (let i = 0; i < t.length; ) {
    const units = [];
    let j = i;
    for (let imgs; (imgs = pictures(j)); ) {
      if (imgs.length === 1 && isCaption(j + 3)) { units.push({ img: imgs[0], caption: t[j + 4] }); j += 6; }
      else { imgs.forEach((img) => units.push({ img })); j += 3; }
    }
    if (units.length < 2) { out.push(t[i]); i++; continue; }
    // Up to three in a row, rows as even as possible (4 → 2 + 2, 5 → 3 + 2, 7 → 3 + 2 + 2).
    const rows = Math.ceil(units.length / 3);
    out.push(html(`<div class="photo-group">\n`));
    for (let r = 0, k = 0; r < rows; r++) {
      const size = Math.floor(units.length / rows) + (r < units.length % rows ? 1 : 0);
      out.push(html(`<div class="photo-row">\n`));
      for (const u of units.slice(k, k + size)) {
        const ratio = imageRatio(u.img.attrGet("src")).toFixed(3);
        out.push(html(`<figure class="photo-row-item" style="--ratio: ${ratio}">`));
        out.push(inlineOf([u.img], u.img.content));
        if (u.caption) { out.push(html(`<figcaption>`)); out.push(u.caption); out.push(html(`</figcaption>`)); }
        out.push(html(`</figure>\n`));
      }
      out.push(html(`</div>\n`));
      k += size;
    }
    out.push(html(`</div>\n`));
    i = j;
  }
  state.tokens = out;
});

// Today's date in Boxborough as "YYYY-MM-DD".
// NEWS_TODAY=2026-09-18 can be set to preview the site as of another day.
export function todayET() {
  if (process.env.NEWS_TODAY) return process.env.NEWS_TODAY;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// The hour (0-23) in Boxborough right now. NEWS_HOUR=5 can be set to test the go-live time;
// when NEWS_TODAY fakes the date, the hour defaults to midday.
export function nowHourET() {
  if (process.env.NEWS_HOUR) return Number(process.env.NEWS_HOUR);
  if (process.env.NEWS_TODAY) return 12;
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
}

// Articles and announcements dated today appear from this hour on (6 a.m.), so editors
// working late Thursday night can save without Friday's issue going live early.
export const GO_LIVE_HOUR = 6;

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

// Front-matter dates are calendar days, so they are handled as plain "YYYY-MM-DD" strings
// (formatting a Date in local time can turn September 17 into September 16).
// Dates follow AP style, as newspapers do: "Sept. 24, 2026", "Friday, Oct. 9, 2026".
const AP_MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun.", "Mon.", "Tue.", "Wed.", "Thu.", "Fri.", "Sat."];

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_PLURAL = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

// "Sat", "saturday", ["Thu","Fri"] -> [6] / [4, 5]
export function weekdayList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,\s]+/);
  return [...new Set(list.map((v) => DAY_KEYS.indexOf(String(v).trim().slice(0, 3).toLowerCase())).filter((i) => i >= 0))].sort((a, b) => a - b);
}

// The first date on or after `from` (and not after `until`) that falls on one of the days.
export function nextOnDays(from, until, days) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (until && d > until) return "";
    if (days.includes(weekdayIndex(d))) return d;
  }
  return "";
}

// [4,5,6,0] -> "Thursdays–Sundays"; [6] -> "Saturdays"; [1,3] -> "Mondays and Wednesdays"
export function daysLabel(value) {
  const days = weekdayList(value);
  if (!days.length) return "";
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d)); // Monday first
  const pos = (d) => [1, 2, 3, 4, 5, 6, 0].indexOf(d);
  const consecutive = order.every((d, i) => i === 0 || pos(d) === pos(order[i - 1]) + 1);
  if (order.length >= 3 && consecutive) return `${DAY_PLURAL[order[0]]}\u2013${DAY_PLURAL[order.at(-1)]}`;
  if (order.length === 1) return DAY_PLURAL[order[0]];
  return order.slice(0, -1).map((d) => DAY_PLURAL[d]).join(", ") + " and " + DAY_PLURAL[order.at(-1)];
}

export function weekdayIndex(ymdString) {
  return new Date(ymdString + "T12:00:00Z").getUTCDay();
}

export function formatDate(value, style = "long") {
  const s = ymd(value);
  if (!s) return "";
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7)) - 1;
  const d = Number(s.slice(8, 10));
  const wd = weekdayIndex(s);
  switch (style) {
    case "short": return `${AP_MONTHS[m]} ${d}`;                                   // Sept. 24
    case "weekday": return `${WEEKDAYS[wd]}, ${AP_MONTHS[m]} ${d}, ${y}`;            // Friday, Oct. 9, 2026
    case "weekdayshort": return `${WEEKDAYS[wd]}, ${AP_MONTHS[m]} ${d}`;            // Friday, Oct. 9
    case "eventday": return `${WEEKDAYS_SHORT[wd]}, ${AP_MONTHS[m]} ${d}`;          // Fri., Oct. 9
    case "dayname": return WEEKDAYS[wd];                                            // Friday
    case "month": return `${MONTHS[m]} ${y}`;                                       // October 2026
    case "monthshort": return MONTHS[m].slice(0, 3);                                // Oct (date badges)
    case "daynum": return String(d);
    default: return `${AP_MONTHS[m]} ${d}, ${y}`;                                   // Sept. 24, 2026
  }
}

// "Sept. 25–Nov. 8" / "Oct. 3–4" / "Oct. 20"
export function formatRange(start, end) {
  const a = ymd(start);
  const b = ymd(end);
  if (!a) return "";
  if (!b || b === a) return formatDate(a, "short");
  if (a.slice(0, 7) === b.slice(0, 7)) return `${formatDate(a, "short")}\u2013${Number(b.slice(8, 10))}`;
  return `${formatDate(a, "short")}\u2013${formatDate(b, "short")}`;
}

// The Monday that starts the week containing a date.
export function weekStart(ymdString) {
  const wd = weekdayIndex(ymdString);
  return addDays(ymdString, wd === 0 ? -6 : 1 - wd);
}

// The Friday issue an article belongs to: the Friday on or after its date.
export function issueFriday(value) {
  const s = ymd(value);
  const wd = weekdayIndex(s);
  return addDays(s, (5 - wd + 7) % 7);
}

// ---- Event times and calendar files ------------------------------------------
// Reads the start (and end) time from what editors type, e.g. "7 p.m.", "10:30 a.m.–noon",
// "3–6 p.m.", "7:00 – 8:00 p.m.". Returns null when there's no single clear time
// (e.g. "Thu.–Sat. 7:30 p.m., Sun. 3 p.m."), so the calendar entry becomes all-day.
export function parseTimeRange(text) {
  const t = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const one = "(noon|midnight|\\d{1,2}(?::\\d{2})?)\\s*(a\\.?m\\.?|p\\.?m\\.?)?";
  const re = new RegExp(`^${one}(?:\\s*[\u2013\u2014-]\\s*|\\s+to\\s+)?(?:${one})?$`);
  const m = t.match(re);
  if (!m) return null;
  const toMinutes = (val, mer, fallbackMer) => {
    if (!val) return null;
    if (val === "noon") return 12 * 60;
    if (val === "midnight") return 0;
    const [h, mm = "0"] = val.split(":");
    let hour = Number(h);
    const merid = (mer || fallbackMer || "").replace(/\./g, "");
    if (!merid) return null;
    if (hour === 12) hour = 0;
    if (merid === "pm") hour += 12;
    return hour * 60 + Number(mm);
  };
  const endMer = m[4] || (m[3] === "noon" ? "pm" : "");
  const start = toMinutes(m[1], m[2], endMer);
  const end = toMinutes(m[3], m[4], m[2]);
  if (start == null) return null;
  return { start, end: end != null && end > start ? end : null };
}

const icsEscape = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsFold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 74) { out.push(rest.slice(0, 74)); rest = " " + rest.slice(74); }
  out.push(rest);
  return out.join("\r\n");
};
const hhmm = (min) => String(Math.floor(min / 60)).padStart(2, "0") + String(min % 60).padStart(2, "0") + "00";

// One VEVENT. ev: {uid, title, start, end, time, location, url, description}
export function icsEvent(ev, stamp) {
  const lines = ["BEGIN:VEVENT", `UID:${ev.uid}`, `DTSTAMP:${stamp}`];
  const times = parseTimeRange(ev.time);
  const days = weekdayList(ev.weekdays);
  if (days.length && ev.end && ymd(ev.end) > ymd(ev.start)) {
    // A run that happens on certain days each week, e.g. Saturdays from July 11 to Oct. 24.
    const first = nextOnDays(ymd(ev.start), ymd(ev.end), days) || ymd(ev.start);
    const f = first.replace(/-/g, "");
    if (times) {
      lines.push(`DTSTART;TZID=America/New_York:${f}T${hhmm(times.start)}`);
      lines.push(`DTEND;TZID=America/New_York:${f}T${hhmm(times.end ?? times.start + 60)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${f}`);
      lines.push(`DTEND;VALUE=DATE:${addDays(first, 1).replace(/-/g, "")}`);
    }
    lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAYS[d]).join(",")};UNTIL=${ymd(ev.end).replace(/-/g, "")}T235959Z`);
    ev = { ...ev, end: "" };
  }
  const start = ymd(ev.start).replace(/-/g, "");
  const lastDay = ymd(ev.end || ev.start);
  if (lines.some((l) => l.startsWith("RRULE"))) {
    // dates already set above
  } else if (times && (!ev.end || ymd(ev.end) === ymd(ev.start))) {
    lines.push(`DTSTART;TZID=America/New_York:${start}T${hhmm(times.start)}`);
    lines.push(`DTEND;TZID=America/New_York:${start}T${hhmm(times.end ?? times.start + 60)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${addDays(lastDay, 1).replace(/-/g, "")}`);
  }
  lines.push(`SUMMARY:${icsEscape(ev.title)}`);
  if (ev.location) lines.push(`LOCATION:${icsEscape(ev.location)}`);
  const desc = [ev.time && !times ? ev.time : "", ev.description || "", ev.url || ""].filter(Boolean).join("\n\n");
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  lines.push("END:VEVENT");
  return lines.map(icsFold).join("\r\n");
}

export function icsCalendar(name, events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Boxborough News//Events//EN", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEscape(name)}`, "X-WR-TIMEZONE:America/New_York",
    "BEGIN:VTIMEZONE", "TZID:America/New_York",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:-0500", "TZOFFSETTO:-0400", "TZNAME:EDT", "DTSTART:19700308T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:-0400", "TZOFFSETTO:-0500", "TZNAME:EST", "DTSTART:19701101T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU", "END:STANDARD",
    "END:VTIMEZONE",
    ...events.map((e) => icsEvent(e, stamp)),
    "END:VCALENDAR", "",
  ].join("\r\n");
}

// Google Calendar "add event" link for one event.
export function googleCalendarUrl(ev) {
  const times = parseTimeRange(ev.time);
  const days = weekdayList(ev.weekdays);
  if (days.length && ev.end && ymd(ev.end) > ymd(ev.start)) {
    const first = nextOnDays(ymd(ev.start), ymd(ev.end), days) || ymd(ev.start);
    ev = { ...ev, start: first, end: "", recur: `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => ICS_DAYS[d]).join(",")};UNTIL=${ymd(ev.end || first).replace(/-/g, "")}` , until: ev.end };
  }
  const s = ymd(ev.start).replace(/-/g, "");
  let dates;
  if (times && (!ev.end || ymd(ev.end) === ymd(ev.start))) dates = `${s}T${hhmm(times.start)}/${s}T${hhmm(times.end ?? times.start + 60)}`;
  else dates = `${s}/${addDays(ymd(ev.end || ev.start), 1).replace(/-/g, "")}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates, ctz: "America/New_York" });
  if (ev.recur) p.set("recur", ev.recur);
  if (ev.location) p.set("location", ev.location);
  p.set("details", [ev.time && !times ? ev.time : "", ev.url].filter(Boolean).join("\n"));
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

export function isPublished(data) {
  if (data.draft === true) return false;
  const d = ymd(data.date);
  const today = todayET();
  if (!d || d < today) return true;
  if (d > today) return false;
  return nowHourET() >= GO_LIVE_HOUR;
}

export function stripHtml(html) {
  return String(html)
    // Inline tags (links, emphasis) vanish without leaving a space, so "(<a>HERE</a>)"
    // becomes "(HERE)"; block tags and line breaks become a space.
    .replace(/<\/?(a|em|strong|b|i|u|span|sup|sub|small|code|abbr|mark)\b[^>]*>/gi, "")
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

// Abbreviations that end in a period but don't end a sentence.
const ABBREV = new Set(("jan feb mar apr aug sept sep oct nov dec mon tue tues wed thu thur thurs fri sat sun " +
  "mr mrs ms dr st rd ave blvd mass conn inc jr sr co corp vs etc no gov rep sen lt sgt capt det lt col gen prof u.s a.m p.m e.g i.e").split(" "));

export function splitSentences(text) {
  const out = [];
  let start = 0;
  const re = /[.!?]["\u201D\u2019)]*\s+(?=["\u201C\u2018(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index + 1);
    const lastWord = (before.match(/([A-Za-z.]+)\.$/) || [])[1] || "";
    if (ABBREV.has(lastWord.toLowerCase()) || /^[A-Z]$/.test(lastWord)) continue; // "Sept. 17", "John F. Kennedy"
    out.push(text.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

// Whole sentences, up to about maxWords. If even the first sentence is too long, it is
// shortened at a word boundary and ends with "…".
export function sentences(text, maxWords = 40) {
  const all = splitSentences(String(text || "").replace(/\s+/g, " ").trim());
  if (!all.length) return "";
  const count = (t) => t.split(" ").filter(Boolean).length;
  let out = all[0];
  if (count(out) > maxWords * 2 + 5) return words(out, maxWords);
  for (const next of all.slice(1)) {
    if (count(out) + count(next) > maxWords) break;
    out += " " + next;
  }
  return out;
}

// A short teaser: the editor's summary if given, otherwise whole sentences from the opening paragraphs.
export function teaser(summary, markdownBody, maxWords = 48) {
  if (summary && String(summary).trim()) return String(summary).trim();
  const firstParas = String(markdownBody || "")
    .split(/\n\s*\n/)
    .filter((p) => p.trim() && !p.trim().startsWith("![") && !p.trim().startsWith("#"))
    .slice(0, 3)
    .join("\n\n");
  return sentences(stripHtml(md.render(firstParas)), maxWords);
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

// An opening-paragraph teaser ends with an ellipsis to show the story continues.
// A final period becomes the ellipsis ("design." → "design…", "said.”" → "said…”");
// after a question mark or exclamation point the ellipsis is added ("why? …").
export function continued(text) {
  let t = String(text || "").trim().replace(/\s*…$/, "");
  if (!t) return t;
  if (/\.$/.test(t)) return t.replace(/\.+$/, "…");
  if (/\.([”"’')\]]+)$/.test(t)) return t.replace(/\.([”"’')\]]+)$/, "…$1");
  if (/[?!][”"’')\]]*$/.test(t)) return t + " …";
  return t + "…";
}
