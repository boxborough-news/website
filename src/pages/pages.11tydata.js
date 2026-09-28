export default {
  layout: "layouts/page.njk",
  eleventyComputed: {
    // A page saved as "outside-the-box.md" appears at /outside-the-box/
    permalink: (data) => `/${data.page.fileSlug}/`,
  },
};
