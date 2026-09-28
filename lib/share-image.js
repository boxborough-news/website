// Makes a 1200px-wide JPEG of an article's main photo for social-media
// previews and the weekly email (phone photos are often 4–8 MB).
import fs from "node:fs";
import Image from "@11ty/eleventy-img";

export async function shareImage(src) {
  if (!src) return null;
  if (/^https?:\/\//.test(src)) return src;
  const file = "src" + (src.startsWith("/") ? src : "/" + src);
  if (!fs.existsSync(file)) return null;
  try {
    const meta = await Image(file, {
      widths: [1200],
      formats: ["jpeg"],
      outputDir: "_site/img/share/",
      urlPath: "/img/share/",
      sharpJpegOptions: { quality: 78, mozjpeg: true },
    });
    return meta.jpeg[0].url;
  } catch (err) {
    console.warn(`[share-image] Could not process ${src}: ${err.message}`);
    return null;
  }
}
