// Friday job: turn this week's newsletter into a DRAFT in Kit (kit.com).
// Nothing is ever sent automatically: an editor reviews the draft in Kit and presses Send.
//
// Needs the site to be built first (it reads _site/newsletter/this-week.json).
// Settings:
//   KIT_API_KEY   (GitHub secret)  Kit → Settings → Developer → "Add a new key" (V4)
//   --dry-run                      print what would be sent without contacting Kit
import fs from "node:fs";

const API = process.env.KIT_API_BASE || "https://api.kit.com/v4";
const KEY = process.env.KIT_API_KEY;
const DRY = process.argv.includes("--dry-run");
const summaryFile = process.env.GITHUB_STEP_SUMMARY;

function report(lines) {
  const text = lines.join("\n");
  console.log(text);
  if (summaryFile) fs.appendFileSync(summaryFile, text + "\n");
}

const issuePath = "_site/newsletter/this-week.json";
if (!fs.existsSync(issuePath)) {
  console.error(`Couldn't find ${issuePath}. Build the site first (npx eleventy).`);
  process.exit(1);
}
const issue = JSON.parse(fs.readFileSync(issuePath, "utf8"));
const settings = JSON.parse(fs.readFileSync("src/_data/newsletter.json", "utf8"));
const site = JSON.parse(fs.readFileSync("src/_data/site.json", "utf8"));
const previewUrl = (process.env.SITE_URL || site.url).replace(/\/$/, "") + "/newsletter/this-week/";

if (!issue.count) {
  report([
    "## No newsletter draft this week",
    `Nothing was published in the 7 days up to ${issue.issueDate}, so no draft was created.`,
  ]);
  process.exit(0);
}

const payload = {
  subject: issue.subject,
  preview_text: issue.previewText.length > 140 ? issue.previewText.slice(0, 140).replace(/\s+\S*$/, "") + "…" : issue.previewText,
  content: issue.bodyHtml,
  description: `Weekly newsletter for ${issue.issueDate} (created automatically)`,
  public: false,
  published_at: new Date().toISOString(),
  send_at: null,
};
if (settings.kit_email_template_id) payload.email_template_id = Number(settings.kit_email_template_id);

if (DRY) {
  console.log(JSON.stringify({ ...payload, content: payload.content.slice(0, 400) + " …" }, null, 2));
  process.exit(0);
}

if (!KEY) {
  report([
    "## Newsletter is ready to copy",
    `No Kit API key is set up, so no draft was created in Kit.`,
    `Open ${previewUrl} , select everything (Ctrl+A / Cmd+A), copy, and paste into a new email.`,
    `Subject: ${issue.subject}`,
  ]);
  process.exit(0);
}

async function kit(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json", "X-Kit-Api-Key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json.errors ? json.errors.join("; ") : text.slice(0, 300);
    throw new Error(`Kit said ${res.status}: ${msg}`);
  }
  return json;
}

try {
  // If a draft with the same subject already exists (e.g. the button was pressed twice), update it.
  let existing = null;
  try {
    const list = await kit("GET", "/broadcasts?per_page=50");
    existing = (list.broadcasts || []).find((b) => b.subject === payload.subject && !b.send_at);
  } catch (err) {
    console.warn("Could not list existing broadcasts, will create a new draft:", err.message);
  }
  const result = existing
    ? await kit("PUT", `/broadcasts/${existing.id}`, payload)
    : await kit("POST", "/broadcasts", payload);
  const id = result.broadcast?.id ?? existing?.id;
  report([
    `## Newsletter draft ${existing ? "updated" : "created"} in Kit`,
    `**${issue.subject}**. ${issue.count} stories. Draft #${id}.`,
    "",
    "Next: log in to Kit, open **Send → Broadcasts**, find the draft, check it, and click **Send**.",
    `Web preview: ${previewUrl}`,
  ]);
} catch (err) {
  report([
    "## Could not create the Kit draft",
    String(err.message),
    "",
    `The newsletter is still available to copy and paste from ${previewUrl}`,
  ]);
  process.exit(1);
}
