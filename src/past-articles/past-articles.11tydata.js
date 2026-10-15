import { teaser, readBody, ymd, wordCount } from "../../lib/content.js";
import { shareImage } from "../../lib/share-image.js";

export default {
  layout: "layouts/article.njk",
  eleventyComputed: {
    permalink: (data) => {
      const d = ymd(data.date);
      return `/${d.slice(0, 4)}/${d.slice(5, 7)}/${data.page.fileSlug}/`;
    },
    teaser: (data) => teaser(data.summary, readBody(data.page.inputPath)),
    readMinutes: (data) => Math.max(1, Math.round(wordCount(readBody(data.page.inputPath)) / 230)),
    shareImage: async (data) => shareImage(data.image),
  },
};
