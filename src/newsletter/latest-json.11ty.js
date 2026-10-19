// The most recent published issue as data. Used only for test drafts: running the
// "Weekly newsletter draft" job with "Test with the most recent issue" ticked turns this
// into a Kit draft titled "TEST – …", so the whole email can be tried before a real Friday.
import { makeIssue } from "./issue-data.js";

export default class {
  data() {
    return { permalink: "/newsletter/latest.json", eleventyExcludeFromCollections: true };
  }
  render(data) {
    if (!data.collections.latestIssue) return JSON.stringify({ count: 0, issueDate: "" });
    const issue = makeIssue(data, "latest");
    const clean = (html) => html.replace(/ eleventy:ignore/g, "");
    return JSON.stringify(
      { ...issue, bodyHtml: clean(issue.bodyHtml), fullHtml: clean(issue.fullHtml) },
      null,
      2
    );
  }
}
