// The most recent email as a web page, at /newsletter/latest/ — the sample linked from the
// Subscribe page. It shows the last published issue (not the coming Friday's unfinished one),
// with the events and meetings it listed on the day it went out.
import { makeIssue } from "./issue-data.js";
import { formatDate } from "../../lib/content.js";

export default class {
  data() {
    return { permalink: "/newsletter/latest/index.html", eleventyExcludeFromCollections: true };
  }
  render(data) {
    if (!data.collections.latestIssue) return "";
    const issue = makeIssue(data, "latest");
    const when = formatDate(issue.issueDate, "weekday");
    const banner =
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;background:#1e2a4d;color:#ffffff;padding:12px 16px;text-align:center;">` +
      `A sample of our free Friday email: this is the issue sent ${when}. ` +
      `<a href="${data.siteUrl}/subscribe/" style="color:#a9d8f5;font-weight:bold;">Sign up</a></div>`;
    return issue.fullHtml.replace(/<body([^>]*)>/i, (m) => m + banner);
  }
}
