// A short fingerprint of the stylesheet, added to its address (site.css?v=…). It changes whenever
// the stylesheet does, so browsers fetch the new one at once instead of reusing a saved copy for up
// to 10 minutes (which could show a new page with old styling).
import fs from "node:fs";
import crypto from "node:crypto";

export default function () {
  const css = fs.readFileSync("src/assets/css/site.css");
  return { css: crypto.createHash("sha1").update(css).digest("hex").slice(0, 10) };
}
