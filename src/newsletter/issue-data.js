// Collects this week's stories and turns them into the newsletter.
import { buildNewsletter } from "../../lib/newsletter.js";
import { todayET, ymd, addDays, formatDate, formatRange, continued } from "../../lib/content.js";

export function makeIssue(data, mode = "next") {
  const { collections, site, newsletter, townhall, siteUrl, townCalendar } = data;
  const abs = (u) => (u ? (/^https?:/.test(u) ? u : siteUrl + u) : "");
  const toItem = (i) => ({
    title: i.data.title,
    url: abs(i.url),
    teaser: i.data.summary && String(i.data.summary).trim() ? i.data.teaser : continued(i.data.teaser),
    image: abs(i.data.shareImage),
    imageAlt: i.data.image_alt,
    imageFit: i.data.image_fit,
    event_date: i.data.start_date,
    event_time: i.data.time,
    location: [i.data.location, i.data.town].filter(Boolean).join(", "),
    type: i.data.type,
    organizer: i.data.organizer || "",
    start: ymd(i.data.start_date),
    end: ymd(i.data.end_date),
    topStory: i.data.top_story === true,
  });
  // Upcoming events come as rows (one per date; a series shows its next session).
  // A session of a series shows the series name on its detail line, unless the two say the same thing.
  const seriesNote = (r) => (r.series && r.series !== r.title && !r.series.includes(r.title) ? r.series : "");
  const toEvent = (r) => ({
    title: r.series && !seriesNote(r) ? r.series : r.title,
    series: seriesNote(r),
    date: r.date,
    town: r.town || "",
    url: abs(r.url),
    when: r.ongoing ? `Through ${formatDate(r.end, "eventday")}` : formatDate(r.date, "eventday"),
    event_time: [
      r.runsThrough ? `${r.days ? r.days + " through" : "Runs through"} ${formatDate(r.runsThrough, "short")}` : !r.ongoing && r.end !== r.date ? `Through ${formatDate(r.end, "short")}` : "",
      r.time,
    ].filter(Boolean).join(" · "),
    location: [r.location, r.town].filter(Boolean).join(", "),
  });
  // "next": the coming Friday's email (the draft editors preview and send).
  // "latest": the most recent email already published, shown as a sample on the Subscribe page.
  const latest = mode === "latest" ? collections.latestIssue : null;
  const week = latest ? { end: latest.date, news: latest.news, features: latest.features, announcements: latest.announcements } : collections.thisWeek;
  // The lead story, as on the home page: the one ticked "Top story", otherwise the first
  // News story with a photo. It opens the email with a large picture.
  const stories = [...week.news, ...week.features];
  const lead =
    stories.find((i) => i.data.top_story === true) ||
    week.news.find((i) => i.data.image) ||
    stories.find((i) => i.data.image) ||
    null;
  const news = week.news.filter((i) => i !== lead);
  const features = week.features.filter((i) => i !== lead);

  // The coming week's events (the seven days from the issue date), Boxborough first.
  const weekEnd = addDays(week.end, 6);
  const eventRows = latest ? latest.events : collections.upcomingEvents;
  const thisWeekEvents = eventRows.filter((r) => r.sort <= weekEnd).map(toEvent);
  const isBox = (ev) => /boxborough/i.test(ev.town);
  const shownEvents = new Set(thisWeekEvents.map((ev) => ev.url));
  const newItems = week.announcements.map(toItem);
  // Events announced this week that happen later: listed briefly with their date.
  const laterEvents = newItems
    .filter((a) => a.type === "event" && !shownEvents.has(a.url) && a.start && a.start > weekEnd)
    .sort((a, b) => a.start.localeCompare(b.start));
  const notices = newItems.filter((a) => a.type !== "event");
  const showTownhall =
    newsletter.include_townhall && townhall.show && townhall.body && (!townhall.hide_after || ymd(townhall.hide_after) >= todayET());

  return buildNewsletter({
    issueDate: week.end,
    lead: lead ? toItem(lead) : null,
    news: news.map(toItem),
    features: features.map(toItem),
    announcements: newItems,
    notices,
    events: newsletter.include_events
      ? {
          boxborough: thisWeekEvents.filter(isBox).slice(0, 6),
          nearby: thisWeekEvents.filter((ev) => !isBox(ev)).slice(0, 3),
          later: laterEvents.map((a) => ({ ...a, when: a.end && a.end > a.start ? formatRange(a.start, a.end) : formatDate(a.start, "eventday") })),
        }
      : { boxborough: [], nearby: [], later: [] },
    site: { ...site, url: siteUrl },
    settings: newsletter,
    townhall: showTownhall ? townhall : null,
    meetings: newsletter.include_townhall && townCalendar && townCalendar.ok
      ? latest
        ? (townCalendar.lastIssue === latest.date ? townCalendar.sinceIssue : [])
        : townCalendar.days.filter((d) => d.date <= addDays(week.end, 7))
      : [],
    calendarLink: townCalendar ? townCalendar.link : "",
  });
}
