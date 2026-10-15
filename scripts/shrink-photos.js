// Shrinks photos uploaded through Pages CMS so the website's storage doesn't fill up.
// Phone photos are often 3–8 MB; the website never shows anything wider than 1,200 pixels,
// so anything larger than 1,600 pixels (or heavier than 600 KB) is resized and re-saved
// under the same name. Run by .github/workflows/shrink-photos.yml after each upload.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const MAX = 1600;
const MAX_BYTES = 600 * 1024;
const exts = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (exts.has(path.extname(e.name).toLowerCase())) yield p;
  }
}

let saved = 0;
for (const file of walk(process.argv[2] || "src/media")) {
  const before = fs.statSync(file).size;
  const img = sharp(file, { failOn: "none" }).rotate();
  const meta = await img.metadata();
  if (Math.max(meta.width || 0, meta.height || 0) <= MAX && before <= MAX_BYTES) continue;
  const ext = path.extname(file).toLowerCase();
  let out = img.resize({ width: MAX, height: MAX, fit: "inside", withoutEnlargement: true });
  if (ext === ".png") out = out.png({ compressionLevel: 9 });
  else if (ext === ".webp") out = out.webp({ quality: 80 });
  else out = out.jpeg({ quality: 82, mozjpeg: true });
  const buf = await out.toBuffer();
  if (buf.length < before) {
    fs.writeFileSync(file, buf);
    saved += before - buf.length;
    console.log(`${file}: ${(before / 1024).toFixed(0)} KB → ${(buf.length / 1024).toFixed(0)} KB`);
  }
}
console.log(`Saved ${(saved / 1048576).toFixed(1)} MB`);
