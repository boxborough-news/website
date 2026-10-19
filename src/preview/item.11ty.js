// One preview page per unpublished article, event or notice, at /preview/…/, using the same
// layout as the real page. Hidden from search engines and from the site's own search.
import { md } from "../../lib/content.js";

const FIELDS = [
  "title", "summary", "byline", "organizer", "location", "town", "start_date", "end_date", "time",
  "weekdays", "sessions", "cost", "registration", "link", "image", "image_alt", "image_fit",
  "image_focus", "image_caption", "image_credit", "top_story",
];

export default class {
  data() {
    const computed = {};
    for (const f of FIELDS) computed[f] = (d) => d.pv.data[f];
    return {
      layout: "layouts/article.njk",
      pagination: { data: "previewItems", size: 1, alias: "pv", addAllPagesToCollections: false },
      permalink: (d) => d.pv.url,
      eleventyExcludeFromCollections: true,
      noindex: true,
      preview: true,
      eleventyComputed: {
        ...computed,
        date: (d) => d.pv.date,
        section: (d) => (d.pv.isAnn ? "announcements" : d.pv.data.section),
        kind: (d) => d.pv.kind,
        teaser: (d) => d.pv.teaser,
        readMinutes: (d) => (d.pv.isAnn ? null : d.pv.readMinutes),
        shareImage: (d) => d.pv.shareImage,
      },
    };
  }
  render(d) {
    return md.render(d.pv.body || "");
  }
}
