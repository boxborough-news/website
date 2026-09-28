// Collects this week's stories and turns them into the newsletter.
import { buildNewsletter } from "../../lib/newsletter.js";
import { todayET, ymd, addDays } from "../../lib/content.js";

export function makeIssue(data) {
  const { collections, site, newsletter, townhall, siteUrl, townCalendar } = data;
  const abs = (u) => (u ? (/^https?:/.test(u) ? u : siteUrl + u) : "");
  const toItem = (i) => ({
    title: i.data.title,
    url: abs(i.url),
    teaser: i.data.teaser,
    image: abs(i.data.shareImage),
    imageAlt: i.data.image_alt,
    imageFit: i.data.image_fit,
    event_date: i.data.event_date,
    event_time: i.data.event_time,
    location: i.data.location,
  });
  const week = collections.thisWeek;
  const news = [...week.news];
  const topIdx = news.findIndex((i) => i.data.top_story === true);
  if (topIdx > 0) news.unshift(news.splice(topIdx, 1)[0]);
  const showTownhall =
    newsletter.include_townhall && townhall.show && townhall.body && (!townhall.hide_after || ymd(townhall.hide_after) >= todayET());

  return buildNewsletter({
    issueDate: week.end,
    news: news.map(toItem),
    features: week.features.map(toItem),
    announcements: week.announcements.map(toItem),
    events: newsletter.include_events ? collections.upcomingEvents.slice(0, 6).map(toItem) : [],
    site: { ...site, url: siteUrl },
    settings: newsletter,
    townhall: showTownhall ? townhall : null,
    meetings: newsletter.include_townhall && townCalendar && townCalendar.ok
      ? townCalendar.days.filter((d) => d.date <= addDays(week.end, 7))
      : [],
    calendarLink: townCalendar ? townCalendar.link : "",
  });
}
