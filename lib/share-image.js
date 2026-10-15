// Makes a 1200px-wide JPEG of an article's main photo for social-media
// previews and the weekly email (phone photos are often 4–8 MB).
import fs from "node:fs";
import Image from "@11ty/eleventy-img";

// Shared with the photo resizing in eleventy.config.js. Because the settings match,
// the 1200px JPEG made here is the very same file the article page uses, so each
// photo is stored once rather than twice.
export const imageOptions = {
  sharpJpegOptions: { quality: 78, mozjpeg: true },
  sharpWebpOptions: { quality: 76 },
  outputDir: "_site/img/",
  urlPath: "/img/",
};

export async function shareImage(src) {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  const file = "src" + (src.startsWith("/") ? src : "/" + src);
  if (!fs.existsSync(file)) return null;
  try {
    const meta = await Image(file, { ...imageOptions, widths: [1200], formats: ["jpeg"] });
    return meta.jpeg[0].url;
  } catch (err) {
    console.warn(`[share-image] Could not process ${src}: ${err.message}`);
    return null;
  }
}
