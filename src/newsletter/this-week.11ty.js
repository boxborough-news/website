// The newsletter as a web page, at /newsletter/this-week/
// Editors can open this to preview the email, or copy and paste it into any email program.
import { makeIssue } from "./issue-data.js";

export default class {
  data() {
    return { permalink: "/newsletter/this-week/index.html", eleventyExcludeFromCollections: true };
  }
  render(data) {
    return makeIssue(data).fullHtml;
  }
}
