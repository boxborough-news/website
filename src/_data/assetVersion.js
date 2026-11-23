// Short fingerprints of the stylesheets, added to their addresses (site.css?v=…). Each changes
// whenever its stylesheet does, so browsers fetch the new one at once instead of reusing a saved
// copy for up to 10 minutes (which could show a new page with old styling).
import fs from "node:fs";
import crypto from "node:crypto";

const hash = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10);

export default function () {
  return { css: hash("src/assets/css/site.css"), print: hash("src/assets/css/print.css") };
}
