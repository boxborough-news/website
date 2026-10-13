import { teaser, readBody, ymd } from "../../lib/content.js";
import { shareImage } from "../../lib/share-image.js";

// Announcements come in two kinds:
//   type: event   — something people can attend (start_date, optional end_date and sessions)
//   type: notice  — news releases and messages with no date to attend (optional expires date)
export default {
  layout: "layouts/article.njk",
  section: "announcements",
  eleventyComputed: {
    permalink: (data) => `/announcements/${data.page.fileSlug}/`,
    teaser: (data) => teaser(data.summary, readBody(data.page.inputPath), 36),
    shareImage: async (data) => shareImage(data.image),
    kind: (data) => (data.type === "notice" ? "notice" : data.type === "event" || ymd(data.start_date) ? "event" : "notice"),
    endDate: (data) => ymd(data.end_date) || ymd(data.start_date),
  },
};
