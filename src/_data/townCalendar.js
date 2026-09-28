// Upcoming town meetings, read from the Town of Boxborough's online calendar feed
// (the same feed that fed the Google Calendar on the old website).
// The site rebuilds twice a day, so this list stays current by itself.
//
// For testing without internet access: TOWN_ICS_FILE=tools/sample-town-calendar.ics
import fs from "node:fs";
import ical from "node-ical";
import { todayET, addDays, TIMEZONE } from "../../lib/content.js";

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

function cleanLocation(loc) {
  if (!loc) return "";
  let l = String(loc).split(" - ")[0].replace(/\s*>\s*/g, ", ").trim();
  if (/^Boxborough,?\s*MA/i.test(l)) return "";
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

  const first = todayET();
  const last = addDays(first, DAYS_AHEAD);
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
        title: String(ev.summary || "").trim(),
        location: cleanLocation(ev.location),
      });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort));
  const shown = events.slice(0, MAX_EVENTS);
  const days = [];
  for (const e of shown) {
    let day = days.find((d) => d.date === e.date);
    if (!day) days.push((day = { date: e.date, ...dayLabel(e.date), events: [] }));
    day.events.push(e);
  }
  return { ok: true, days, events: shown, more: events.length > shown.length, link: settings.calendar_link || "" };
}
