// The coming Friday's email as it will look, at /preview/email/: like /newsletter/this-week/,
// but also including the articles, events and notices scheduled for that issue (not drafts).
// Their links point to their preview pages until they go live.
import { makeIssue } from "../newsletter/issue-data.js";
import { formatDate } from "../../lib/content.js";

export default class {
  data() {
    return { permalink: "/preview/email/index.html", eleventyExcludeFromCollections: true };
  }
  render(data) {
    const week = data.collections.thisWeek;
    const asItem = (p) => ({ url: p.url, data: { ...p.data, teaser: p.teaser, shareImage: p.shareImage } });
    const coming = data.previewItems.filter((p) => p.status === "scheduled" && p.date >= week.start && p.date <= week.end);
    const pick = (list, test) => [...list, ...coming.filter(test).map(asItem)];
    const preview = {
      ...data,
      collections: {
        ...data.collections,
        thisWeek: {
          ...week,
          news: pick(week.news, (p) => !p.isAnn && p.data.section === "news"),
          features: pick(week.features, (p) => !p.isAnn && p.data.section === "features"),
          announcements: pick(week.announcements, (p) => p.isAnn),
        },
      },
    };
    const issue = makeIssue(preview);
    const banner =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;background:#fff4d6;color:#262b36;padding:12px 16px;text-align:center;border-bottom:1px solid #e3c873;">` +
      `<strong>Preview</strong> of the email for ${formatDate(issue.issueDate, "weekday")}, including ${coming.length} scheduled item${coming.length === 1 ? "" : "s"}. ` +
      `The real draft is made in Kit shortly after 6 a.m. that Friday. <a href="${data.siteUrl}/preview/" style="color:#1e2a4d;font-weight:bold;">All previews</a></div>`;
    return issue.fullHtml.replace(/<body([^>]*)>/i, (m) => m + banner);
  }
}
