import { teaser, openingText, readBody, ymd, wordCount, cleanTitle } from "../../lib/content.js";
import { shareImage } from "../../lib/share-image.js";

export default {
  layout: "layouts/article.njk",
  eleventyComputed: {
    title: (data) => cleanTitle(data.title),
    byline: (data) => (typeof data.byline === "string" ? data.byline.trim().replace(/^by\s+/i, "By ") : data.byline),
    permalink: (data) => {
      const d = ymd(data.date);
      return `/${d.slice(0, 4)}/${d.slice(5, 7)}/${data.page.fileSlug}/`;
    },
    teaser: (data) => teaser(data.summary, readBody(data.page.inputPath)),
    opening: (data) => openingText(data.summary, readBody(data.page.inputPath)),
    readMinutes: (data) => Math.max(1, Math.round(wordCount(readBody(data.page.inputPath)) / 230)),
    shareImage: async (data) => shareImage(data.image),
  },
};
