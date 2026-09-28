// The same newsletter as data, used by the Friday job that creates the email draft.
import { makeIssue } from "./issue-data.js";

export default class {
  data() {
    return { permalink: "/newsletter/this-week.json", eleventyExcludeFromCollections: true };
  }
  render(data) {
    const issue = makeIssue(data);
    const clean = (html) => html.replace(/ eleventy:ignore/g, "");
    return JSON.stringify(
      { ...issue, bodyHtml: clean(issue.bodyHtml), fullHtml: clean(issue.fullHtml) },
      null,
      2
    );
  }
}
