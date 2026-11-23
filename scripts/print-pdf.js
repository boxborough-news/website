// Makes a PDF copy of the printable weekly flyer after the site is built:
//   _site/print/this-week.pdf  (always the current issue)
// Run by the publish workflow after "npm run build". It uses the Chrome that's already on GitHub's
// machines (or CHROME_PATH), serves _site on a local port, and prints it to letter size.
// If it fails, the website still publishes; only the PDF isn't refreshed that time.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium } from "playwright-core";

const SITE = path.resolve("_site");
// The site's address prefix on GitHub Pages (e.g. /website), from SITE_URL, so links resolve.
const prefix = new URL(process.env.SITE_URL || "http://x/").pathname.replace(/\/$/, "");
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (prefix && p.startsWith(prefix)) p = p.slice(prefix.length) || "/";
  let file = path.join(SITE, p);
  if (!file.startsWith(SITE)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

const pages = [
  { url: "/print/this-week/", out: "print/this-week.pdf" },
];

async function main() {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  const opts = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
  const browser = await chromium.launch(opts);
  try {
    const page = await browser.newPage();
    for (const p of pages) {
      await page.goto(base + p.url, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // The weekly sheet trims itself to fit one page once its fonts are in; wait for that.
      await page.waitForFunction(() => !document.querySelector("[data-trim]") || document.body.hasAttribute("data-fitted"), null, { timeout: 10000 }).catch(() => {});
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: path.join(SITE, p.out), format: "Letter", preferCSSPageSize: true, printBackground: true });
      const count = (fs.readFileSync(path.join(SITE, p.out), "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
      console.log(`Made ${p.out} (${count} page${count === 1 ? "" : "s"})`);
      if (count !== 1) console.warn(`::warning::${p.out} came out at ${count} pages instead of one.`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(`::warning::Couldn't make the printable PDF: ${err.message}`);
  server.close();
  process.exitCode = 0; // never stop the site from publishing
});
