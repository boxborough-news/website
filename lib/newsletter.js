// Builds the weekly email from this week's articles.
// Email clients are old-fashioned, so this uses tables and inline styles on purpose.
import { escapeHtml as e, formatDate, md, smartQuotes, words, ymd } from "./content.js";

const C = {
  ink: "#1b2547",
  text: "#262b36",
  muted: "#5d6273",
  navy: "#1e2a4d",
  slate: "#696b98",
  red: "#a23a45",
  rule: "#dcdde4",
  tint: "#eeeff6",
  paper: "#f2f3f7",
};
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

function sectionLabel(text) {
  return `<tr><td style="padding:28px 24px 6px 24px;">
  <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.navy};border-bottom:2px solid ${C.navy};padding-bottom:6px;">${e(text)}</div>
</td></tr>`;
}

function articleBlock(a, isLead) {
  const title = `<a href="${e(a.url)}" style="font-family:${SERIF};font-size:${isLead ? 26 : 20}px;line-height:1.25;font-weight:700;color:${C.ink};text-decoration:none;">${e(smartQuotes(a.title))}</a>`;
  const teaserHtml = `<p style="font-family:${SERIF};font-size:16px;line-height:1.55;color:${C.text};margin:8px 0 8px 0;">${e(isLead ? a.teaser : words(a.teaser, 28))}</p>
  <a href="${e(a.url)}" style="font-family:${SANS};font-size:14px;font-weight:700;color:${C.navy};text-decoration:none;">Read more &rarr;</a>`;

  // The top story gets a large picture; the rest get a small one beside the text.
  if (isLead || !a.image) {
    const full = a.imageFit === "full";
    const img = a.image
      ? `<a href="${e(a.url)}" style="text-decoration:none;display:block;${full ? "text-align:center;" : ""}"><img src="${e(a.image)}" alt="${e(a.imageAlt || "")}" width="${full ? 300 : 552}" style="display:${full ? "inline-block" : "block"};width:100%;max-width:${full ? 300 : 552}px;height:auto;border:0;margin:0 0 12px 0;" eleventy:ignore></a>`
      : "";
    return `<tr><td style="padding:16px 24px 18px 24px;border-bottom:1px solid ${C.rule};">
  ${img}
  ${title}
  ${teaserHtml}
</td></tr>`;
  }
  return `<tr><td style="padding:16px 24px 18px 24px;border-bottom:1px solid ${C.rule};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td valign="top" style="padding:0 16px 0 0;">
      ${title}
      ${teaserHtml}
    </td>
    <td valign="top" width="100" style="width:100px;">
      <a href="${e(a.url)}" style="text-decoration:none;"><img src="${e(a.image)}" alt="${e(a.imageAlt || "")}" width="100" style="display:block;width:100px;height:auto;border:0;" eleventy:ignore></a>
    </td>
  </tr></table>
</td></tr>`;
}

function eventRows(events) {
  return events
    .map(
      (ev) => `<tr><td style="padding:8px 24px;border-bottom:1px solid ${C.rule};">
  <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:${C.red};">${e(ev.when || formatDate(ev.event_date, "eventday"))}${ev.event_time ? " &middot; " + e(ev.event_time) : ""}</div>
  <a href="${e(ev.url)}" style="font-family:${SERIF};font-size:16px;line-height:1.35;font-weight:700;color:${C.ink};text-decoration:none;">${e(smartQuotes(ev.title))}</a>
  ${ev.series || ev.location ? `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin-top:2px;">${[ev.series, ev.location].filter(Boolean).map(e).join(" &middot; ")}</div>` : ""}
</td></tr>`
    )
    .join("\n");
}

function subLabel(text) {
  return `<tr><td style="padding:14px 24px 2px 24px;font-family:${SANS};font-size:13px;font-weight:700;color:${C.slate};">${e(text)}</td></tr>`;
}

function moreLink(href, text) {
  return `<tr><td style="padding:10px 24px 0 24px;font-family:${SANS};font-size:14px;"><a href="${e(href)}" style="color:${C.navy};font-weight:700;text-decoration:none;">${e(text)} &rarr;</a></td></tr>`;
}

// A short list of headlines with one line of detail each (later events, community notices).
function briefRows(items, detail) {
  return items
    .map(
      (a) => `<tr><td style="padding:8px 24px;border-bottom:1px solid ${C.rule};">
  <a href="${e(a.url)}" style="font-family:${SERIF};font-size:16px;line-height:1.35;font-weight:700;color:${C.ink};text-decoration:none;">${e(smartQuotes(a.title))}</a>
  ${detail(a) ? `<div style="font-family:${SANS};font-size:13px;color:${C.muted};margin-top:2px;">${detail(a)}</div>` : ""}
</td></tr>`
    )
    .join("\n");
}

/**
 * @param {object} o
 * @param {string} o.issueDate   "YYYY-MM-DD" the issue is dated
 * @param {object|null} o.lead  the top story, shown first with a large picture
 * @param {Array}  o.news        [{title,url,teaser,image,imageAlt}]
 * @param {Array}  o.features
 * @param {Array}  o.announcements  all announcements posted this week (counted, not listed)
 * @param {Array}  o.notices     community notices posted this week (listed as headlines)
 * @param {object} o.events      {boxborough, nearby}: the coming week's events [{title,url,when,event_time,location}];
 *                               later: events announced this week that happen after it
 * @param {object} o.site        site settings
 * @param {object} o.settings    newsletter settings
 * @param {object|null} o.townhall  {heading, body} if it should be shown
 */
export function buildNewsletter(o) {
  const { site, settings } = o;
  const siteUrl = site.url.replace(/\/$/, "");
  const dateLong = formatDate(o.issueDate, "weekday");
  const subject = (settings.subject || "Boxborough News – {date}").replace("{date}", formatDate(o.issueDate, "long"));

  const leadTitles = [...(o.lead ? [o.lead] : []), ...o.news, ...o.features].slice(0, 3).map((a) => smartQuotes(a.title));
  const previewText = leadTitles.length ? "This week: " + leadTitles.join(" · ") : "This week in Boxborough";

  const rows = [];
  rows.push(`<tr><td style="padding:22px 24px 14px 24px;text-align:center;border-bottom:4px solid ${C.navy};">
  <a href="${e(siteUrl)}/" style="text-decoration:none;"><img src="${e(siteUrl)}/assets/brand/email-header.png" width="480" alt="${e(site.title)}" style="display:block;margin:0 auto;width:100%;max-width:480px;height:auto;border:0;font-family:${SERIF};font-size:32px;font-weight:700;color:${C.navy};" eleventy:ignore></a>
  <div style="font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.muted};margin-top:10px;">${e(dateLong)} &middot; <a href="${e(siteUrl)}/" style="color:${C.muted};">Read on the web</a></div>
</td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:${C.slate};">&nbsp;</td></tr>`);

  // The editors' note: a few lines about this week's stories, signed, as in the paper's
  // earlier newsletter. It appears only in the issue it was written for (if a date is set).
  const introFor = ymd(settings.intro_issue);
  if (settings.intro && settings.intro.trim() && (!introFor || introFor === o.issueDate)) {
    const note = md
      .render(settings.intro)
      .replace(/<p>/g, '<p style="margin:0 0 12px 0;">')
      .replace(/<a /g, `<a style="color:${C.navy};font-weight:700;" `)
      .replace(/href="\/(?!\/)/g, `href="${e(siteUrl)}/`); // links to the site's own pages need the full address in an email
    const sig = settings.intro_signature && settings.intro_signature.trim()
      ? `<p style="margin:0;font-style:italic;color:${C.muted};">${e(settings.intro_signature.trim())}</p>`
      : "";
    rows.push(`<tr><td style="padding:24px 24px 6px 24px;font-family:${SERIF};font-size:17px;line-height:1.55;color:${C.text};border-bottom:1px solid ${C.rule};">${note}${sig}<div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div></td></tr>`);
  }

  // The order follows the home page: the lead story, News, Features, the week's events,
  // then community notices and town meetings.
  if (o.lead) rows.push(articleBlock(o.lead, true));
  if (o.news.length) {
    rows.push(sectionLabel("News"));
    o.news.forEach((a) => rows.push(articleBlock(a, false)));
  }
  if (o.features.length) {
    rows.push(sectionLabel("Features"));
    o.features.forEach((a) => rows.push(articleBlock(a, false)));
  }

  const ev = o.events || { boxborough: [], nearby: [], later: [] };
  if (ev.boxborough.length || ev.nearby.length || ev.later.length) {
    rows.push(sectionLabel("This week"));
    if (ev.boxborough.length) {
      rows.push(subLabel("In Boxborough"));
      rows.push(eventRows(ev.boxborough));
    }
    if (ev.nearby.length) {
      rows.push(subLabel("Nearby"));
      rows.push(eventRows(ev.nearby));
    }
    if (ev.later.length) {
      rows.push(subLabel("Newly announced"));
      rows.push(briefRows(ev.later, (a) => [a.when, a.location].filter(Boolean).map(e).join(" &middot; ")));
    }
    rows.push(moreLink(`${siteUrl}/events/`, "All events"));
  }

  if (o.notices && o.notices.length) {
    rows.push(sectionLabel("Community notices"));
    rows.push(briefRows(o.notices, (a) => (a.organizer ? "From " + e(a.organizer) : "")));
    rows.push(moreLink(`${siteUrl}/notices/`, "All notices"));
  }

  if (o.townhall) {
    rows.push(`<tr><td style="padding:28px 24px 0 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tint};border-left:4px solid ${C.slate};"><tr><td style="padding:14px 18px;">
    <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.slate};margin-bottom:4px;">${e(o.townhall.heading)}</div>
    <div style="font-family:${SERIF};font-size:15px;line-height:1.5;color:${C.text};">${md.render(o.townhall.body || "").replace(/<p>/g, '<p style="margin:6px 0;">').replace(/<a /g, `<a style="color:${C.navy};" `)}</div>
  </td></tr></table>
</td></tr>`);
  }

  if (o.meetings && o.meetings.length) {
    const items = o.meetings
      .map((d) => `<tr><td valign="top" width="92" style="padding:6px 8px 6px 0;font-family:${SANS};font-size:13px;font-weight:700;color:${C.navy};white-space:nowrap;">${e(formatDate(d.date, "eventday"))}</td><td style="padding:6px 0;font-family:${SANS};font-size:14px;line-height:1.4;color:${C.text};">${d.events
        .map((ev) => ev.closure
          ? `<span style="color:${C.muted};font-style:italic;">${e(ev.title)}</span>`
          : `<span style="color:${C.red};font-weight:700;">${e(ev.time)}</span> ${e(ev.title)}${ev.location ? ` <span style="color:${C.muted};font-size:12px;">(${e(ev.location)})</span>` : ""}`)
        .join("<br>")}</td></tr>`)
      .join("");
    rows.push(`<tr><td style="padding:${o.townhall ? "14px" : "28px"} 24px 0 24px;">
  <div style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${C.slate};margin-bottom:2px;">Upcoming town meetings</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.rule};">${items}</table>
  ${o.calendarLink ? `<div style="font-family:${SANS};font-size:12px;margin-top:6px;"><a href="${e(o.calendarLink)}" style="color:${C.navy};">Full town calendar and agendas &rarr;</a></div>` : ""}
</td></tr>`);
  }

  if (settings.include_outside_the_box) {
    rows.push(`<tr><td style="padding:26px 24px 0 24px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.tint};"><tr><td style="padding:14px 18px;font-family:${SERIF};font-size:15px;line-height:1.5;color:${C.text};">
    <a href="${e(siteUrl)}/outside-the-box/" style="font-weight:700;color:${C.navy};">Outside the Box</a>: looking for more local news? Our guide points you to the community newspapers in neighboring towns.
  </td></tr></table>
</td></tr>`);
  }

  rows.push(`<tr><td style="padding:26px 24px 8px 24px;font-family:${SERIF};font-size:15px;line-height:1.55;color:${C.text};">
  ${settings.closing ? `<p style="margin:0 0 12px 0;">${e(settings.closing)}</p>` : ""}
  <p style="margin:0;font-family:${SANS};font-size:13px;color:${C.muted};">
    <a href="${e(siteUrl)}/" style="color:${C.navy};font-weight:700;">${e(siteUrl.replace(/^https?:\/\//, ""))}</a>
    ${site.facebook_url ? ` &middot; <a href="${e(site.facebook_url)}" style="color:${C.muted};">Facebook</a>` : ""}
    ${site.instagram_url ? ` &middot; <a href="${e(site.instagram_url)}" style="color:${C.muted};">Instagram</a>` : ""}
    ${site.email ? ` &middot; <a href="mailto:${e(site.email)}" style="color:${C.muted};">${e(site.email)}</a>` : ""}
  </p>
</td></tr>`);

  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
${rows.join("\n")}
</table>`;

  const fullHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;">${e(previewText)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};"><tr><td style="padding:24px 8px;">
${bodyHtml}
</td></tr></table>
</body></html>`;

  const count = (o.lead ? 1 : 0) + o.news.length + o.features.length + o.announcements.length;
  return { subject, previewText, bodyHtml, fullHtml, count, issueDate: o.issueDate };
}
