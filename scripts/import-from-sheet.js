// Imports the week's stories from the editors' tracker sheet (Google Sheets) into the website.
// Run by .github/workflows/import-stories.yml ("Import stories from the tracker sheet" in Pages CMS).
//
// Articles tab: rows whose "Abby/ Cassie review" cell is filled in and whose "Publication date(s)"
// is the coming issue (or within the next month). For each, it reads the Google Doc (or Word file)
// in "Link to document", downloads the photos in "Link to photo, if applicable", and saves the
// article, scheduled for its publication date (it goes live at 6 a.m. that day; until then it's
// on the Preview page). "Top story?" and "Flyer, chart, or logo? (no trimming of photo)" (any
// heading containing "flyer") set those options.
//
// Announcements & Events tab: switched off for now ("import_announcements": false in
// src/_data/importer.json). When on, it imports rows with a "Post date"; optional columns fill in
// the event details: "Event or notice", "Event date", "Last day", "Time", "Place", "Town", "Remove after".
//
// Running it again updates what it imported earlier (matched by the Doc), unless someone has since
// edited the item in Pages CMS: those edits are kept and the item is listed as "kept".
// Settings: src/_data/importer.json. A summary is saved to src/_data/importReport.json and shown
// on the Preview page.
//
// Testing without the internet: IMPORT_FIXTURES=<folder with map.json> maps URLs to local files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import matter from "gray-matter";
import sharp from "sharp";
import mammoth from "mammoth";
import TurndownService from "turndown";
import { todayET, issueFriday, addDays, ymd, formatDate } from "../lib/content.js";

const S = JSON.parse(fs.readFileSync("src/_data/importer.json", "utf8"));
const SHEET_ID = (S.sheet_url.match(/\/d\/([\w-]{20,})/) || [])[1];
const ISSUE = (process.env.ISSUE || "").trim();
const FIXTURES = process.env.IMPORT_FIXTURES || "";
const FIXMAP = FIXTURES ? JSON.parse(fs.readFileSync(path.join(FIXTURES, "map.json"), "utf8")) : null;
const today = todayET();

// "Fri., Oct. 23, 1:52 a.m." in Boxborough time, for the summary on the Preview page.
function nowText() {
  const now = new Date();
  const t = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(now);
  return `${formatDate(todayET(), "eventday")}, ${t.replace(/\s?AM$/i, " a.m.").replace(/\s?PM$/i, " p.m.").replace(/:00 /, " ")}`;
}
const report = { ran_at: new Date().toISOString(), ran_at_text: nowText(), issue: ISSUE || issueFriday(today), added: [], updated: [], unchanged: [], kept: [], problems: [] };
const problem = (title, message) => {
  report.problems.push({ title, message });
  console.warn(`PROBLEM ${title}: ${message}`);
};

// ---------------------------------------------------------------- Fetching
class NotShared extends Error {}

async function get(url) {
  if (FIXMAP) {
    const f = FIXMAP[url];
    if (!f) throw new NotShared("not shared");
    return { buf: fs.readFileSync(path.join(FIXTURES, f.file)), type: f.type || "", name: f.name || "" };
  }
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Boxborough News story import)" } });
      if (res.status === 401 || res.status === 403 || res.status === 404) throw new NotShared(`not shared (HTTP ${res.status})`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="([^"]+)"/i);
      return { buf, type: res.headers.get("content-type") || "", name: m ? decodeURIComponent(m[1]) : "" };
    } catch (err) {
      if (err instanceof NotShared) throw err;
      last = err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw last;
}

function sniff(buf) {
  const head = buf.subarray(0, 16);
  if (head[0] === 0xff && head[1] === 0xd8) return "jpeg";
  if (head.subarray(0, 4).toString("hex") === "89504e47") return "png";
  if (head.subarray(0, 4).toString() === "%PDF") return "pdf";
  if (head.subarray(0, 4).toString() === "GIF8") return "gif";
  if (head.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  if (buf.subarray(4, 12).toString().startsWith("ftyp")) return "heic";
  if (head[0] === 0x50 && head[1] === 0x4b) return "docx";
  const text = buf.subarray(0, 600).toString("utf8").toLowerCase();
  if (text.includes("<html") || text.includes("<!doctype html")) return "html";
  return "text";
}

const fileId = (url) => (url.match(/\/d\/([\w-]{15,})/) || url.match(/[?&]id=([\w-]{15,})/) || [])[1] || "";
const download = (id) => get(`https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`);
const urlsIn = (text) => (String(text || "").match(/https?:\/\/[^\s,;]+/g) || []).map((u) => u.replace(/[).]+$/, ""));

// ---------------------------------------------------------------- Sheet
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1${name ? `&sheet=${encodeURIComponent(name)}` : ""}`;
  const { buf } = await get(url);
  if (sniff(buf) === "html") throw new NotShared("the tracker sheet isn't shared with \"anyone with the link\"");
  const rows = parseCsv(buf.toString("utf8"));
  const header = (rows.shift() || []).map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  // Find a column by its heading: every word given must appear in it.
  const col = (...words) => header.findIndex((h) => words.every((w) => h.split(" ").includes(w) || h.includes(w)));
  const exact = (word) => header.findIndex((h) => h === word);
  return { rows: rows.filter((r) => r.some((c) => c.trim())), col, exact };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "10.23.26", "10/23/2026", "Oct. 23, 2026" or "Nov 7" → "2026-10-23". The first date in the cell.
function sheetDate(value, nearYear = today.slice(0, 4)) {
  const s = String(value || "");
  const pad = (n) => String(n).padStart(2, "0");
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  m = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    let y = m[3] ? Number(m[3]) : Number(nearYear);
    if (!m[3] && `${y}-${pad(mo)}-${pad(m[2])}` < addDays(today, -60)) y += 1;
    return `${y}-${pad(mo)}-${pad(m[2])}`;
  }
  return "";
}

function wantedDate(d) {
  if (!d) return false;
  if (ISSUE) return d === ISSUE;
  const from = [S.import_from || "", addDays(today, -7)].sort().pop();
  return d >= from && d <= addDays(today, 30);
}

// ---------------------------------------------------------------- Documents
const turndown = new TurndownService({ headingStyle: "atx", emDelimiter: "*", bulletListMarker: "-" });
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function docTitle(id) {
  try {
    const { buf } = await get(`https://docs.google.com/document/d/${id}/edit`);
    const h = buf.toString("utf8");
    const m = h.match(/<meta property="og:title" content="([^"]*)"/) || h.match(/<title>([^<]*?)(?: - Google Docs)?<\/title>/);
    return m ? decode(m[1]).trim() : "";
  } catch {
    return "";
  }
}

// Reads the text at a link: a Google Doc, a Word file or a text file in Drive.
// Returns { markdown, title } or { file: { buf, kind } } for a PDF or picture (a flyer).
async function readDocument(url) {
  const id = fileId(url);
  if (!id) throw new Error(`the link isn't a Google Docs or Drive link: ${url}`);
  const isNativeDoc = /docs\.google\.com\/document\//.test(url) && !/rtpof=true/.test(url);
  if (isNativeDoc) {
    try {
      const { buf } = await get(`https://docs.google.com/document/d/${id}/export?format=md`);
      if (sniff(buf) !== "html") return { markdown: buf.toString("utf8"), title: await docTitle(id) };
    } catch (err) {
      if (!(err instanceof NotShared)) throw err;
    }
  }
  const { buf, name } = await download(id);
  const kind = sniff(buf);
  if (kind === "html") throw new NotShared("not shared");
  const title = (name || "").replace(/\.[a-z0-9]+$/i, "");
  if (kind === "docx") {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return { markdown: turndown.turndown(value), title };
  }
  if (kind === "text") return { markdown: buf.toString("utf8"), title };
  return { file: { buf, kind }, title };
}

const plain = (b) => String(b || "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_#>`\\]/g, "").replace(/\s+/g, " ").trim();
const norm = (s) => plain(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();

function blocksOf(markdown) {
  let md = String(markdown || "").replace(/\r/g, "").replace(/ /g, " ");
  md = md.replace(/^\[image\d+\]:\s*<?data:.*$/gm, "").replace(/!\[[^\]]*\]\[image\d+\]/g, "").replace(/!\[[^\]]*\]\(data:[^)]*\)/g, "");
  md = md.replace(/https:\/\/www\.google\.com\/url\?q=([^&)\s]+)[^)\s]*/g, (m, u) => decodeURIComponent(u));
  // Google's export can put a divider line (---) directly above the headline; give it its own block.
  md = md.replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "\n$1\n");
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const isRule = (b) => /^(-{3,}|\*{3,}|_{3,})$/.test(b);
  while (blocks.length && isRule(blocks[0])) blocks.shift();
  while (blocks.length && isRule(blocks[blocks.length - 1])) blocks.pop();
  return blocks;
}

// Splits a story into headline, byline and body. The headline is the Doc's first line when it's
// short and bold (or a heading); otherwise the Doc's title; otherwise the sheet's working title.
function splitStory(markdown, docTitleText, fallbackTitle) {
  const blocks = blocksOf(markdown);
  const dateLine = /^\(?\s*\d{1,2}[-\s][a-z]{3,9}\.?[-\s]\d{2,4}\s*\)?$/i;
  for (let i = 0; i < Math.min(3, blocks.length); i++) if (dateLine.test(plain(blocks[i]))) blocks.splice(i--, 1);
  const shortLine = (b) => b && !b.includes("\n") && plain(b).split(" ").length <= 22 && !/[.!?:]["”’)]?$/.test(plain(b));
  const dt = (docTitleText || "").replace(/\.(docx?|pdf|txt)$/i, "").trim();
  const usefulDocTitle = dt && !/^(untitled|copy of)/i.test(dt);
  let title = "";
  if (blocks.length && shortLine(blocks[0]) && (/^(#{1,3}\s|\*\*|__)/.test(blocks[0]) || (usefulDocTitle && norm(blocks[0]) === norm(dt)))) {
    title = plain(blocks.shift());
  } else if (usefulDocTitle) {
    title = dt;
    if (blocks.length && norm(blocks[0]) === norm(dt)) blocks.shift();
  } else {
    title = fallbackTitle;
  }
  let byline = "";
  if (blocks.length && /^by\s+\S/i.test(plain(blocks[0])) && plain(blocks[0]).split(" ").length <= 10) byline = plain(blocks.shift());
  if (blocks.length) blocks[0] = blocks[0].replace(/^\(\s*\d{1,2}-[a-z]{3}-\d{2}\s*\)\s*/i, "");
  return { title, byline, body: blocks.join("\n\n") };
}

function slugify(t) {
  const words = String(t).toLowerCase().replace(/[’'‘"“”]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
  let s = "";
  for (const w of words) {
    if (s && (s + "-" + w).length > 60) break;
    s = s ? `${s}-${w}` : w;
  }
  return s || "story";
}

// ---------------------------------------------------------------- Photos
function pdfToJpeg(buf) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flyer-"));
  fs.writeFileSync(path.join(dir, "in.pdf"), buf);
  execFileSync("pdftoppm", ["-jpeg", "-r", "150", "-f", "1", "-l", "1", "-singlefile", path.join(dir, "in.pdf"), path.join(dir, "out")]);
  const out = fs.readFileSync(path.join(dir, "out.jpg"));
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

// Saves a picture (or the first page of a PDF) as a web-sized JPEG. Returns its /media/… address.
async function savePicture(source, destNoExt) {
  let { buf, kind } = source;
  if (kind === "pdf") buf = pdfToJpeg(buf);
  else if (kind === "heic") throw new Error("the photo is in iPhone HEIC format; please save it as a JPG");
  else if (!["jpeg", "png", "gif", "webp"].includes(kind)) throw new Error("the photo link isn't a picture or PDF");
  const out = await sharp(buf, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  fs.mkdirSync(path.dirname(destNoExt), { recursive: true });
  fs.writeFileSync(destNoExt + ".jpg", out);
  return "/" + path.relative("src", destNoExt + ".jpg").split(path.sep).join("/");
}

async function fetchPicture(url, destNoExt) {
  const id = fileId(url);
  if (!id) throw new Error(`the photo link isn't a Google Drive link: ${url}`);
  const { buf } = await download(id);
  const kind = sniff(buf);
  if (kind === "html") throw new NotShared("the photo isn't shared with \"anyone with the link\"");
  return savePicture({ buf, kind }, destNoExt);
}

// "top photo (thumbnail…): URL  Nathan Soule: URL" → [{ label, url }]
function labeledLinks(cell) {
  const out = [];
  const re = /https?:\/\/[^\s,;]+/g;
  let last = 0, m;
  while ((m = re.exec(cell))) {
    const label = cell.slice(last, m.index).replace(/[:\-–—\s]+$/, "").replace(/^[\s,;]+/, "").trim();
    out.push({ label, url: m[0].replace(/[).]+$/, "") });
    last = m.index + m[0].length;
  }
  return out;
}

// Puts the article's other photos where they belong in the text:
//  1. where the Doc has a line like "[Photo: Nathan Soule]" or "[Photo 2]" (2 = its place in the
//     sheet's photo cell), the photo replaces that line;
//  2. otherwise just above the first short or bold line that contains the photo's label, such as
//     "Captain Tim Blankenship:" for a photo labeled "Tim Blankenship";
//  3. otherwise at the end of the article, with its label as a caption (and a note in the summary).
function placePhotos(story, extras) {
  const blocks = story.body ? story.body.split(/\n\n/) : [];
  const labelOf = (x) => (x.label && !/\b(photo|image|picture)\b/i.test(x.label) ? x.label : "");
  const picture = (x, caption) => `![${labelOf(x) || story.title}](${x.saved})${caption && labelOf(x) ? `\n\n*${labelOf(x)}*` : ""}`;
  const marker = (b) => (plain(b).match(/^\[\s*(?:photo|picture|image)\s*(?:#|no\.?)?\s*:?\s*([^\]]*)\]$/i) || [])[1];
  const isPicture = (b) => b.trim().startsWith("![");
  const atEnd = [];
  for (const x of extras) {
    const label = norm(labelOf(x));
    let i = blocks.findIndex((b) => {
      const m = marker(b);
      return m !== undefined && ((label && norm(m) === label) || norm(m) === String(x.n));
    });
    if (i >= 0) {
      const next = blocks[i + 1] || "";
      blocks[i] = picture(x, !(label && norm(next).includes(label)));
      continue;
    }
    if (label) {
      i = blocks.findIndex((b, k) => {
        if (k === 0 || isPicture(b) || marker(b) !== undefined || !norm(b).includes(label)) return false;
        const lead = (b.match(/^\s*(\*\*|__)(.+?)\1/) || [])[2];
        return plain(b).split(" ").length <= 12 || (lead && norm(lead).includes(label));
      });
      if (i >= 0) {
        blocks.splice(i, 0, picture(x, false));
        continue;
      }
    }
    atEnd.push(x);
  }
  for (const x of atEnd) {
    blocks.push(picture(x, true));
    problem(story.title, `photo ${x.n}${labelOf(x) ? ` (${labelOf(x)})` : ""} was put at the end of the article. To place it, type [Photo: ${labelOf(x) || x.n}] on its own line in the Doc where it belongs, then import again.`);
  }
  return blocks.join("\n\n");
}

// Photos already on the site that match the words of a note like "use firestation": each
// photo is known by its file name and by the headline and description of the stories that use
// it. Best matches first, then the most recently used. Returns up to three short descriptions.
let photoIndex = null;
function suggestPhotos(note) {
  const compact = (x) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const STOP = new Set(["use", "used", "using", "same", "photo", "photos", "picture", "pic", "pics", "image", "images", "the", "a", "an", "of", "from",
    "as", "at", "for", "and", "or", "one", "old", "last", "week", "weeks", "see", "existing", "file", "jpg", "jpeg", "png", "please", "our", "in", "on", "with", "to"]);
  const words = [...new Set(String(note).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w)))];
  if (!words.length) return [];
  if (!photoIndex) {
    photoIndex = new Map();
    const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    for (const f of walk("src/media")) if (/\.(jpe?g|png|gif|webp)$/i.test(f)) {
      photoIndex.set("/" + path.relative("src", f).split(path.sep).join("/"), { text: path.basename(f), used: "", title: "" });
    }
    for (const f of [...walk("src/articles"), ...walk("src/past-articles"), ...walk("src/announcements")]) {
      if (!f.endsWith(".md")) continue;
      let d;
      try { d = matter(fs.readFileSync(f, "utf8")).data; } catch { continue; }
      const p = photoIndex.get(d.image);
      if (!p) continue;
      p.text += ` ${d.title || ""} ${d.image_alt || ""}`;
      const when = ymd(d.date);
      if (when > p.used) Object.assign(p, { used: when, title: d.title || "" });
    }
  }
  const scored = [];
  // Long words may run together ("firestation" finds fire-station); short ones must be whole words.
  const need = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
  for (const [src, p] of photoIndex) {
    const text = compact(p.text), own = new Set(p.text.toLowerCase().split(/[^a-z0-9]+/));
    const hits = words.filter((w) => (w.length >= 5 ? text.includes(w) : own.has(w))).length;
    if (hits >= need) scored.push({ src, hits, ...p });
  }
  scored.sort((a, b) => b.hits - a.hits || b.used.localeCompare(a.used) || a.src.localeCompare(b.src));
  const best = scored.length ? scored[0].hits : 0;
  return scored.filter((x) => x.hits === best).slice(0, 3).map((x) =>
    `${x.src.replace(/^\/media\//, "")}${x.title ? ` (used with "${x.title}", ${formatDate(x.used)})` : ""}`);
}

// ---------------------------------------------------------------- Writing files
const DATE_FIELDS = new Set(["date", "start_date", "end_date", "expires"]);
function frontMatter(data) {
  const lines = Object.entries(data).map(([k, v]) => {
    if (typeof v === "boolean") return `${k}: ${v}`;
    if (DATE_FIELDS.has(k) && /^\d{4}-\d{2}-\d{2}$/.test(v || "")) return `${k}: ${v}`;
    return `${k}: ${JSON.stringify(v == null ? "" : String(v))}`;
  });
  return `---\n${lines.join("\n")}\n---\n`;
}
const fieldText = (v) => (v instanceof Date ? ymd(v) : typeof v === "boolean" ? String(v) : String(v ?? ""));
const hashOf = (data, body, fields) =>
  crypto.createHash("sha1").update(JSON.stringify([fields.map((f) => fieldText(data[f])), String(body || "").trim()])).digest("hex").slice(0, 16);

function findExisting(dir, source, file) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".md")) continue;
    const p = path.join(dir, f);
    const text = fs.readFileSync(p, "utf8");
    if (text.includes(`import_source: ${JSON.stringify(source)}`) || p === file) return p;
  }
  return null;
}

// Writes an item, unless an earlier import of it has since been edited in Pages CMS.
function save({ dir, file, data, body, fields, label }) {
  const source = data.import_source;
  const existing = findExisting(dir, source, file);
  data.import_hash = hashOf(data, body, fields);
  if (existing) {
    const old = matter(fs.readFileSync(existing, "utf8"));
    const untouched = old.data.import_hash && hashOf(old.data, old.content, fields) === old.data.import_hash;
    if (!untouched) return report.kept.push(label);
    if (old.data.import_hash === data.import_hash) return report.unchanged.push(label);
    data.draft = old.data.draft === true ? true : data.draft; // keep a Draft tick
    fs.writeFileSync(existing, frontMatter(data) + body.trim() + "\n");
    return report.updated.push(label);
  }
  fs.writeFileSync(file, frontMatter(data) + body.trim() + "\n");
  report.added.push(label);
}

// ---------------------------------------------------------------- Articles
const ARTICLE_FIELDS = ["title", "date", "section", "byline", "image", "image_fit", "top_story", "draft"];

async function importArticles() {
  const tab = await readTab(S.articles_tab);
  const c = {
    title: tab.exact("article") >= 0 ? tab.exact("article") : tab.col("article"),
    type: tab.col("content", "type"),
    top: tab.col("top", "story"),
    flyer: tab.col("flyer"),
    pub: tab.col("publication", "date"),
    review: tab.col("abby", "review") >= 0 ? tab.col("abby", "review") : tab.col("cassie", "review"),
    doc: tab.col("link", "document"),
    photo: tab.col("link", "photo"),
  };
  for (const [k, v] of Object.entries(c)) if (v < 0 && !["top", "flyer", "photo"].includes(k)) throw new Error(`the articles tab has no "${k}" column`);
  const seen = new Set();
  for (const r of tab.rows) {
    const cell = (i) => (i >= 0 ? (r[i] || "").trim() : "");
    const pub = sheetDate(cell(c.pub));
    if (!cell(c.review) || !wantedDate(pub)) continue;
    const working = cell(c.title) || "(untitled)";
    const docUrl = urlsIn(cell(c.doc))[0];
    if (!docUrl) { problem(working, "no link in \"Link to document\""); continue; }
    const docId = fileId(docUrl);
    if (seen.has(docId)) continue;
    seen.add(docId);
    try {
      const doc = await readDocument(docUrl);
      if (doc.file) throw new Error("the document link is a picture or PDF, not a Doc or Word file");
      const story = splitStory(doc.markdown, doc.title, working);
      if (!story.body) throw new Error("the document is empty");
      const type = cell(c.type).toLowerCase();
      const section = /feature/.test(type) ? "features" : /news/.test(type) ? "news" : "";
      if (!section) problem(story.title, `"Content type" is "${cell(c.type)}"; filed under News`);
      const slug = slugify(story.title);
      const file = path.join("src/articles", `${pub}-${slug}.md`);
      const existing = findExisting("src/articles", `doc:${docId}`, file);
      const base = existing ? path.basename(existing, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "") : slug;
      // Photos: the one labeled "top"/"thumbnail" (or the first) is the main photo; the rest go
      // at the end of the article, each with its label as a caption.
      let image = "";
      const extras = [];
      const photos = labeledLinks(cell(c.photo));
      // A photo cell with words but no link (e.g. "use firestation"): say so on the Preview page
      // and suggest photos already on the site that match, so an editor can pick one.
      const photoNote = cell(c.photo).trim();
      if (!photos.length && photoNote) {
        const matches = suggestPhotos(photoNote);
        problem(story.title, `the photo cell says "${photoNote}" but has no link, so the story came in without a photo. ` +
          `Choose one in Pages CMS (open the article, click Main photo and pick it from the photo library).` +
          (matches.length ? ` Photos already on the site that may match: ${matches.join("; ")}.` : ` No photo on the site has a name matching those words.`));
      }
      const mainIdx = Math.max(0, photos.findIndex((p) => /\b(top|thumbnail|main|lead)\b/i.test(p.label)));
      for (const [i, p] of photos.entries()) {
        try {
          const saved = await fetchPicture(p.url, path.join("src/media", i === mainIdx ? base : `${base}-${extras.length + 2}`));
          if (i === mainIdx) image = saved;
          else extras.push({ ...p, saved, n: i + 1 });
        } catch (err) {
          problem(story.title, `photo ${i + 1}: ${err.message}`);
        }
      }
      const body = placePhotos(story, extras);
      save({
        dir: "src/articles",
        file,
        fields: ARTICLE_FIELDS,
        label: story.title,
        body,
        data: {
          title: story.title,
          date: pub,
          section: section || "news",
          byline: story.byline,
          summary: "",
          image,
          image_alt: "",
          image_caption: "",
          image_fit: /^y/i.test(cell(c.flyer)) ? "full" : "photo",
          image_credit: "",
          top_story: /^y/i.test(cell(c.top)),
          draft: false,
          import_source: `doc:${docId}`,
        },
      });
    } catch (err) {
      problem(working, err instanceof NotShared ? "the document isn't shared with \"anyone with the link\"" : err.message);
    }
  }
}

// ---------------------------------------------------------------- Announcements & events
const ANNOUNCEMENT_FIELDS = ["title", "date", "type", "start_date", "end_date", "time", "location", "town", "organizer", "expires", "image", "draft"];

async function importAnnouncements() {
  let tab;
  try {
    tab = await readTab(S.announcements_tab);
  } catch (err) {
    return problem(S.announcements_tab, err.message);
  }
  const c = {
    post: tab.col("post", "date"),
    title: tab.exact("notice") >= 0 ? tab.exact("notice") : tab.col("notice"),
    organizer: tab.col("submitting"),
    inbox: tab.col("in", "box"),
    text: tab.col("link", "announcement"),
    flyer: tab.col("flyer"),
    kind: tab.col("event", "or", "notice"),
    start: tab.col("event", "date"),
    end: tab.col("last", "day"),
    time: tab.col("time"),
    place: tab.col("place"),
    town: tab.col("town"),
    expires: tab.col("remove", "after"),
  };
  if (c.post < 0) {
    console.log(`The "${S.announcements_tab}" tab has no "Post date" column yet, so no announcements were imported.`);
    return;
  }
  const seen = new Set();
  for (const r of tab.rows) {
    const cell = (i) => (i >= 0 ? (r[i] || "").trim() : "");
    const post = sheetDate(cell(c.post));
    if (!wantedDate(post)) continue;
    const title = cell(c.title);
    if (!title) continue;
    const textCell = cell(c.text);
    const links = urlsIn(textCell);
    const key = links[0] ? `file:${fileId(links[0])}` : `title:${slugify(title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const slug = slugify(title);
      const file = path.join("src/announcements", `${post}-${slug}.md`);
      const existing = findExisting("src/announcements", key, file);
      const base = existing ? path.basename(existing, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "") : slug;
      let body = "";
      let flyerSource = null;
      if (links[0]) {
        const doc = await readDocument(links[0]);
        if (doc.file) flyerSource = doc.file;
        else body = splitStory(doc.markdown, title, title).body;
      } else {
        body = textCell;
      }
      let image = "";
      const flyerUrl = urlsIn(cell(c.flyer))[0];
      try {
        if (flyerUrl) image = await fetchPicture(flyerUrl, path.join("src/media/announcements", base));
        else if (flyerSource) image = await savePicture(flyerSource, path.join("src/media/announcements", base));
      } catch (err) {
        problem(title, `flyer: ${err.message}`);
      }
      if (!body && image) problem(title, "there's only a flyer; please type the key facts (date, time, place) into the details");
      const kindText = cell(c.kind).toLowerCase();
      const start = sheetDate(cell(c.start), post.slice(0, 4));
      const type = /event/.test(kindText) ? "event" : /notice/.test(kindText) ? "notice" : start ? "event" : "notice";
      let draft = false;
      if (type === "event" && !start) {
        draft = true;
        problem(title, "it's an event but has no \"Event date\"; saved as a draft until the date is added in Pages CMS");
      }
      const town = cell(c.town) || (/in\s*box/i.test(cell(c.inbox)) ? "Boxborough" : "");
      save({
        dir: "src/announcements",
        file,
        fields: ANNOUNCEMENT_FIELDS,
        label: title,
        body,
        data: {
          title,
          date: post,
          type,
          start_date: start,
          end_date: sheetDate(cell(c.end), post.slice(0, 4)),
          time: cell(c.time),
          location: cell(c.place),
          town,
          organizer: cell(c.organizer),
          cost: "",
          registration: "",
          link: "",
          expires: type === "notice" ? sheetDate(cell(c.expires), post.slice(0, 4)) : "",
          summary: "",
          image,
          image_alt: "",
          image_fit: "full",
          image_caption: "",
          draft,
          import_source: key,
        },
      });
    } catch (err) {
      problem(title, err instanceof NotShared ? "the announcement link isn't shared with \"anyone with the link\"" : err.message);
    }
  }
}

// ---------------------------------------------------------------- Run
try {
  if (!SHEET_ID) throw new Error("src/_data/importer.json has no valid sheet_url");
  await importArticles();
  if (S.import_announcements) await importAnnouncements();
} catch (err) {
  problem("Tracker sheet", err instanceof NotShared ? "the tracker sheet isn't shared with \"anyone with the link\"" : err.message);
}
fs.writeFileSync("src/_data/importReport.json", JSON.stringify(report, null, 2) + "\n");
const lines = [
  `## Story import for ${report.issue}`,
  `New: ${report.added.length} · Updated: ${report.updated.length} · Unchanged: ${report.unchanged.length} · Kept as edited in Pages CMS: ${report.kept.length} · Problems: ${report.problems.length}`,
  ...report.added.map((t) => `- New: ${t}`),
  ...report.updated.map((t) => `- Updated: ${t}`),
  ...report.kept.map((t) => `- Kept as edited in Pages CMS: ${t}`),
  ...report.problems.map((p) => `- Problem with "${p.title}": ${p.message}`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
