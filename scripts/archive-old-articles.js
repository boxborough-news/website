// Keeps the editors' "Articles" list short: moves articles more than two months old from
// src/articles/ into src/past-articles/YEAR/MONTH/. Nothing changes on the website (an
// article's address comes from its date and file name, not its folder).
// Run monthly by .github/workflows/archive-old-articles.yml, or locally:
//   node scripts/archive-old-articles.js            (move)
//   node scripts/archive-old-articles.js --dry-run  (just list what would move)
import fs from "node:fs";
import path from "node:path";
import { todayET } from "../lib/content.js";

const FROM = "src/articles";
const TO = "src/past-articles";
const MONTHS_KEPT = 2;
const dryRun = process.argv.includes("--dry-run");

// The cutoff: the same day, two months ago (on Dec. 1, anything dated before Oct. 1 moves).
const [y, m, d] = todayET().split("-").map(Number);
const back = new Date(Date.UTC(y, m - 1 - MONTHS_KEPT, d));
const cutoff = back.toISOString().slice(0, 10);

let moved = 0;
for (const name of fs.readdirSync(FROM).filter((f) => f.endsWith(".md")).sort()) {
  const file = path.join(FROM, name);
  const text = fs.readFileSync(file, "utf8");
  const date =
    (text.match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m) || [])[1] ||
    (name.match(/^(\d{4}-\d{2}-\d{2})-/) || [])[1];
  if (!date || date >= cutoff) continue;
  const destDir = path.join(TO, date.slice(0, 4), date.slice(5, 7));
  const dest = path.join(destDir, name);
  if (fs.existsSync(dest)) {
    console.warn(`Skipped ${name}: a file with that name is already in ${destDir}.`);
    continue;
  }
  console.log(`${dryRun ? "Would move" : "Moved"} ${name} → ${destDir}/`);
  if (!dryRun) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.renameSync(file, dest);
  }
  moved++;
}
console.log(`${moved} article(s) ${dryRun ? "would be" : ""} moved (cutoff ${cutoff}).`.replace("  ", " "));
