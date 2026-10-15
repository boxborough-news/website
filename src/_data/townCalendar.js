// Upcoming town meetings, read from the Town of Boxborough's online calendar feed
// (the same feed that fed the Google Calendar on the old website).
// The site rebuilds twice a day, so this list stays current by itself.
//
// For testing without internet access: TOWN_ICS_FILE=tools/sample-town-calendar.ics
import fs from "node:fs";
import ical from "node-ical";
import { todayET, addDays, issueFriday, TIMEZONE } from "../../lib/content.js";

const DAYS_AHEAD = 13; // today plus the next 13 days
const MAX_EVENTS = 14;

function etParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")), minute: Number(get("minute")) };
}

// Newspaper style: 7 p.m., 10:30 a.m.
function clock({ hour, minute }, withMeridiem = true) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute ? `:${String(minute).padStart(2, "0")}` : "";
  return `${h}${m}${withMeridiem ? (hour < 12 ? " a.m." : " p.m.") : ""}`;
}

function timeLabel(ev, start, end) {
  if (ev.datetype === "date") return "All day";
  const s = etParts(start);
  if (!end) return clock(s);
  const e = etParts(end);
  const placeholderEnd = e.hour === 23 && e.minute >= 30; // the town uses 11:59 p.m. to mean "no set end"
  if (e.ymd !== s.ymd || placeholderEnd || end <= start) return clock(s);
  const sameHalf = (s.hour < 12) === (e.hour < 12);
  return `${clock(s, !sameHalf)}–${clock(e)}`;
}

// The town's feed sometimes includes HTML (e.g. "<p>…</p>") and entities in text fields.
function plainText(value) {
  return String(value || "")
    .replace(/<\/p>\s*<p[^>]*>/gi, ", ")
    .replace(/<br\s*\/?>/gi, ", ")
    .replace(/<\/?[a-z][^>]*>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// The town's titles are typed by many hands: "Planning Board Meeting - Boxborough MA 01719",
// "Select Board Meeting -", "TOWN OFFICES ARE CLOSED - Indigenous People Day", "Boxbrorough".
function cleanTitle(raw) {
  let t = plainText(raw)
    .replace(/\bBoxbrorough\b/gi, "Boxborough")
    .replace(/\s*[-\u2013]\s*Boxborough,?\s*MA\s*\d{5}\s*$/i, "")
    .replace(/\s*[-\u2013]\s*$/, "")
    .trim();
  // Shouted titles ("TOWN OFFICES ARE CLOSED") -> sentence case; short acronyms like FSBC stay.
  const shouted = t.split(/\s+/).filter((w) => /^[A-Z]{3,}$/.test(w));
  if (shouted.length >= 3) {
    t = t.replace(/\b[A-Z]{3,}\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
  }
  // "Planning Board Meeting" -> "Planning Board" (but keep "Town Meeting" and "Joint meeting").
  if (/\b(board|committee|commission|council|corps|authority|trust)\b/i.test(t) && !/\b(town|joint)\s+meeting$/i.test(t)) {
    t = t.replace(/\s+meeting$/i, "");
  }
  return t;
}

const isClosure = (title) => /\b(offices?|town hall)\b.*\bclosed\b|\bclosed\b.*\b(holiday|day)\b/i.test(title);

// Several boards often list the same joint meeting separately (a "Tri-Board" meeting can
// appear three times). Same day, same time, and "joint"/"tri-board" in each title -> one row.
function mergeJoint(events) {
  const out = [];
  for (const e of events) {
    const joint = /\bjoint\b|tri-?board/i.test(e.title);
    const twin = joint && out.find((o) => o.date === e.date && o.time === e.time && o.joint);
    if (twin) {
      twin.boards.push(boardName(e.title));
      continue;
    }
    out.push({ ...e, joint, boards: joint ? [boardName(e.title)] : [] });
  }
  for (const o of out) {
    if (o.joint && o.boards.length > 1) {
      const tri = /tri-?board/i.test(o.title);
      o.title = `${tri ? "Tri-Board" : "Joint"} meeting: ${[...new Set(o.boards)].join(", ")}`;
    }
    delete o.joint;
    delete o.boards;
  }
  return out;
}
const boardName = (title) => title.split(/\s+(?:joint|with|meeting|at)\b/i)[0].trim();

function cleanLocation(loc) {
  if (!loc) return "";
  let l = plainText(loc).replace(/^[-\u2013\s]+/, "").split(" - ")[0].replace(/\s+>\s+/g, ", ").replace(/[\s,-]+$/, "").trim();
  if (/^Boxborough,?\s*MA/i.test(l) || !l) return "";
  return l;
}

function dayLabel(ymd) {
  const d = new Date(ymd + "T12:00:00Z");
  const f = (o) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(d);
  return { weekday: f({ weekday: "short" }), day: f({ day: "numeric" }), month: f({ month: "short" }), long: f({ weekday: "long", month: "long", day: "numeric" }) };
}

async function loadText(url) {
  if (process.env.TOWN_ICS_FILE) return fs.readFileSync(process.env.TOWN_ICS_FILE, "utf8");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "BoxboroughNewsWebsite/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export default async function () {
  const settings = JSON.parse(fs.readFileSync("src/_data/townhall.json", "utf8"));
  const url = settings.calendar_feed;
  const empty = { ok: false, days: [], events: [], link: settings.calendar_link || "" };
  if (!url && !process.env.TOWN_ICS_FILE) return empty;

  let data;
  try {
    data = ical.sync.parseICS(await loadText(url));
  } catch (err) {
    console.warn(`[townCalendar] Could not read the town calendar (${err.message}). The meetings list will be left out of this build.`);
    return empty;
  }

  const today = todayET();
  // Also read back to the most recent Friday, so the sample of the latest email (sent that
  // Friday) can list the meetings it showed.
  const lastIssue = issueFriday(today) > today ? addDays(issueFriday(today), -7) : today;
  const first = lastIssue < today ? lastIssue : today;
  const last = addDays(today, DAYS_AHEAD);
  const from = new Date(first + "T00:00:00-05:00");
  const to = new Date(addDays(last, 1) + "T06:00:00Z");
  const events = [];

  for (const ev of Object.values(data)) {
    if (!ev || ev.type !== "VEVENT" || !ev.start) continue;
    if (ev.status && String(ev.status).toUpperCase() === "CANCELLED") continue;
    const duration = ev.end ? ev.end - ev.start : 0;
    let starts = [ev.start];
    if (ev.rrule) {
      try {
        starts = ev.rrule.between(from, to, true);
      } catch {
        starts = [ev.start];
      }
    }
    for (const start of starts) {
      const end = duration ? new Date(start.getTime() + duration) : null;
      const ymd = ev.datetype === "date" ? etParts(new Date(start.getTime() + 12 * 3600e3)).ymd : etParts(start).ymd;
      if (ymd < first || ymd > last) continue;
      events.push({
        date: ymd,
        sort: ev.datetype === "date" ? ymd + "T00" : start.toISOString(),
        time: timeLabel(ev, start, end),
        title: cleanTitle(ev.summary),
        location: cleanLocation(ev.location),
        closure: isClosure(plainText(ev.summary)),
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort));
  const everything = mergeJoint(events);
  const toDays = (list) => {
    const days = [];
    for (const e of list) {
      let day = days.find((d) => d.date === e.date);
      if (!day) days.push((day = { date: e.date, ...dayLabel(e.date), events: [] }));
      day.events.push(e);
    }
    return days;
  };
  const merged = everything.filter((e) => e.date >= today);
  const shown = merged.slice(0, MAX_EVENTS);
  // The week covered by the latest email, for its sample on the Subscribe page.
  const sinceIssue = toDays(everything.filter((e) => e.date >= lastIssue && e.date <= addDays(lastIssue, 7)).slice(0, MAX_EVENTS));
  return {
    ok: true, days: toDays(shown), events: shown, all: merged, more: merged.length > shown.length,
    sinceIssue, lastIssue, link: settings.calendar_link || "",
  };
}
