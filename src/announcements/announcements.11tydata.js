import { teaser, readBody } from "../../lib/content.js";
import { shareImage } from "../../lib/share-image.js";

export default {
  layout: "layouts/article.njk",
  section: "announcements",
  eleventyComputed: {
    permalink: (data) => `/announcements/${data.page.fileSlug}/`,
    teaser: (data) => teaser(data.summary, readBody(data.page.inputPath), 36),
    shareImage: async (data) => shareImage(data.image),
  },
};
