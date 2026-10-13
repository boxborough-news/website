// Downloads photos that articles still link to on other websites (for example, images
// imported from the old Google Sites website) and saves them in src/media/imported/,
// then points the articles at the saved copies. Safe to run more than once.
//
// Run by the "Save imported photos" workflow on GitHub, or locally with:
//   node tools/save-remote-photos.js
import fs from "node:fs";
import path from "node:path";

const DIRS = ["src/articles", "src/announcements"];
const OUT = "src/media/imported";
const REMOTE = /https:\/\/[a-z0-9.-]*googleusercontent\.com\/[^\s"')]+/g;

fs.mkdirSync(OUT, { recursive: true });
let saved = 0, failed = 0;

for (const dir of DIRS) {
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const file = path.join(dir, name);
    let text = fs.readFileSync(file, "utf8");
    const urls = [...new Set(text.match(REMOTE) || [])];
    if (!urls.length) continue;
    const slug = name.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "").slice(0, 60);
    let n = 0;
    for (const url of urls) {
      n++;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const type = res.headers.get("content-type") || "";
        const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
        const local = `${OUT}/${slug}-${n}.${ext}`;
        fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
        text = text.split(url).join("/" + local.replace(/^src\//, ""));
        saved++;
        console.log(`Saved ${local}`);
      } catch (err) {
        failed++;
        console.warn(`Could not download a photo for ${name}: ${err.message}`);
      }
    }
    fs.writeFileSync(file, text);
  }
}
console.log(`Done: ${saved} photo(s) saved, ${failed} failed.`);
