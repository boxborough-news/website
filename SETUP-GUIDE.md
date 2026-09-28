# Boxborough News: One-Time Setup Guide

This guide is for the one volunteer who sets the system up. It takes about an hour of clicking through websites. You don't need to write any code. Once it's done, editors only ever use Pages CMS and Kit (see `EDITOR-GUIDE.md`).

**Running cost: $0 a year.** You'll keep paying the renewal for the boxboroughnews.org domain name as you do today.

| Piece | Service | Cost |
|---|---|---|
| Stores the articles and hosts the website | GitHub + GitHub Pages | Free |
| The editing screens editors use | Pages CMS (app.pagescms.org) | Free, open source |
| Sends the weekly email | Kit (kit.com), "Newsletter" plan | Free up to 10,000 subscribers |

Use a shared Boxborough News account (e.g. boxboroughnews@gmail.com) for every sign-up below, so the paper never depends on one person's login.

---

## Part A: Put the website on GitHub (about 15 minutes)

1. **Create a GitHub account** at https://github.com/signup using the shared email address.
2. **Create an organization** (free plan) called something like `boxboroughnews`: click your profile picture → **Your organizations** → **New organization**. An organization makes it easy to add a second administrator later.
3. **Create a repository** in the organization: **New repository**, name it `website`, choose **Public**, and click **Create repository**. (Free GitHub Pages needs a public repository. Everything in it is published anyway.)
4. **Upload the project files.** The easiest way is **GitHub Desktop** (https://desktop.github.com): clone the empty repository, copy every file from this folder into it, and click **Commit** then **Push**.
   *Important:* the folder includes hidden items (`.github` and `.pages.yml`) that must be uploaded too. GitHub Desktop handles them. Dragging files into the GitHub web page often skips them.
5. **Turn on GitHub Pages:** in the repository, go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
6. **Tell the site its temporary address.** Until you move the domain over (Part E), the site lives at `https://boxboroughnews.github.io/website/` (organization name, then repository name). Go to **Settings → Secrets and variables → Actions → Variables** → **New repository variable**:
   - Name: `SITE_URL`
   - Value: `https://boxboroughnews.github.io/website`
7. **Publish for the first time:** open the **Actions** tab → **Publish website** → **Run workflow**. After two or three minutes, a green tick appears. Visit the address above and the site should be there.

## Part B: Set up the editing screens and invite editors (about 10 minutes)

1. Go to **https://app.pagescms.org** and choose **Sign in with GitHub** (use the shared GitHub account).
2. When asked, **install the Pages CMS GitHub App** on the `boxboroughnews` organization. You can limit it to just the `website` repository.
3. Open the **website** repository. You'll see Articles, Announcements & Events, Town Hall notice, Weekly email settings, Pages and Site settings. These are configured by the `.pages.yml` file, so there's nothing to set up.
4. **Check the town meetings list.** The home page lists upcoming town meetings from the Town of Boxborough's own calendar feed (the same one behind the Google Calendar on the old site). It's already set up and refreshes twice a day. After the first publish, check that the list appears under the Town Hall notice. If it doesn't, open **Actions → Publish website**, open the latest run, and look for a "Could not read the town calendar" message.
5. **Invite each editor by email** from the repository's **Collaborators** screen in Pages CMS. Editors sign in with their email address and don't need a GitHub account. Send them `EDITOR-GUIDE.md`.

## Part C: Set up the weekly email with Kit (about 20 minutes)

1. **Sign up** at https://kit.com on the free **Newsletter** plan, using the shared email address.
2. **Finish Kit's sender setup** (Settings → Email). Confirm the "from" address and enter a mailing address for the footer. Email law (CAN-SPAM) requires a physical address in bulk email, and a P.O. box is fine. Kit adds this address and an unsubscribe link to every email automatically.
3. **Bring over your current subscribers.** Open the Google Sheet that collects responses from the current Google Form, choose **File → Download → CSV**, then in Kit go to **Grow → Subscribers → Import** and upload the file.
4. **Create a sign-up form:** **Grow → Landing Pages & Forms → Create new → Form → Inline**. Pick a simple style and save it. Then:
   - Click **Publish → HTML**, copy the code, and in Pages CMS open **Site settings** and paste it into **Newsletter sign-up form code**. A sign-up form now appears on the site.
   - Also copy the form's **hosted link** (under Publish → Share) into **Newsletter sign-up link**.
   - Once this works, stop accepting responses on the old Google Form.
5. **Connect Kit to the website** so the Friday draft can be created:
   - In Kit: **Settings → Developer → Add a new key** (a "V4" API key). Copy it.
   - In GitHub: repository **Settings → Secrets and variables → Actions → Secrets → New repository secret**. Name: `KIT_API_KEY`. Value: paste the key.

**If you'd rather not use Kit,** skip step 5. Each Friday the job then reports that the email is ready at `/newsletter/this-week/`. An editor opens that page, selects everything, copies it, and pastes it into any email program (Mailchimp, beehiiv, even Gmail for a small list).

## Part D: Test the whole thing (10 minutes)

1. In Pages CMS, add a test article with today's date and a photo, and click **Save**.
2. In GitHub, the **Actions** tab shows **Publish website** running. When it finishes, the article is on the site.
3. In Pages CMS, click the **Create this week's email draft now** action (or in GitHub: Actions → **Weekly newsletter draft** → Run workflow).
4. In Kit, open **Send → Broadcasts**. The draft should be there. Send it to yourself with **Preview → Send test email** and check it on your phone.
5. Delete the test article, or tick **Draft**.

**About the sample articles:** the site comes with about 30 recent articles (September 3–24, 2026) and a few announcements copied automatically from the current website, so you can see it with real content. Before launch, either check them against the originals or delete them. The plan is to leave older articles on the old Google Site (see Part E).

## Part E: Launch day, moving boxboroughnews.org over (15 minutes, then up to a day for DNS)

1. **Keep the old site as an archive.** In Google Sites, open the site's **Publish settings** and note its `sites.google.com/view/…` address. It stays online there after the domain moves. In Pages CMS **Site settings**, paste it into **Old website address**. Links to it appear in the footer, archive and "page not found" page.
2. **Remove the custom domain from Google Sites** (Settings → Custom domains).
3. **Point the domain at GitHub.** At whichever company the domain is registered with (possibly Squarespace Domains, which took over Google Domains), set these DNS records:
   - `A` records for `boxboroughnews.org` (the "@" host): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www`: `boxboroughnews.github.io`
4. In GitHub: **Settings → Pages → Custom domain**, enter `www.boxboroughnews.org`, and click **Save**. Once it verifies (this can take a few hours), tick **Enforce HTTPS**.
5. **Update the site address:** change the `SITE_URL` variable (Part A, step 6) to `https://www.boxboroughnews.org`, then re-run **Publish website**.

GitHub's own instructions: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

---

## How it works (for whoever maintains it later)

```
Editor clicks Save in Pages CMS
        │  (Pages CMS saves the article as a file in the GitHub repository)
        ▼
GitHub Actions "Publish website" runs  ──►  builds the site with Eleventy  ──►  GitHub Pages (the live site)
        ▲
        └── also runs twice a day (~5 a.m. and ~1 p.m.) so scheduled articles appear, the Town Hall box expires, and town meetings refresh

Friday ~6 a.m.: GitHub Actions "Weekly newsletter draft"
        builds the site, takes /newsletter/this-week.json  ──►  Kit API: creates (or updates) a DRAFT broadcast
```

- **Content** is plain text files in `src/articles`, `src/announcements` and `src/pages`, plus settings in `src/_data/*.json`. Because the content is just files, the paper can never be locked into any service.
- **Every change is versioned.** Anything can be restored from the repository's history on GitHub.
- **Photos:** editors' uploads go in `src/media`. The build publishes resized copies (640 px and 1280 px, WebP and JPEG) plus a 1200 px image for email and Facebook previews. Full-size originals are not published, which keeps the site small.
- **Search** uses Pagefind and runs entirely inside the static site, with no outside service.

### Changing things
- **Sections** (News, Features…): edit `src/_data/sections.json`, *and* add the same option to the `section` field in `.pages.yml`.
- **Colors and fonts:** the variables at the top of `src/assets/css/site.css`. The logo and wordmark images are in `src/assets/brand/`.
- **Email design:** `lib/newsletter.js`.
- **Timing of the Friday draft:** the `cron` line in `.github/workflows/newsletter.yml` (in UTC).

### Working on the site on your own computer
```
npm install
npm start                      # live preview at http://localhost:8080
NEWS_TODAY=2026-09-18 npm start   # preview the site as it looked on a given day
npm run build                  # full build including search, into _site/
```

### Limits to keep in mind
- GitHub Pages sites should stay under 1 GB. At roughly 450 KB of resized images per photo, that's around 2,000 photos. After several years, very old images can be moved off-site if needed.
- **If the site ever outgrows 1 GB,** move the hosting to Cloudflare Pages, which is also free. It has no total size limit and allows up to 20,000 files, and it builds from the same GitHub repository, so editors notice no change. Check the site's size once a year (the published size is shown in the Actions tab, in the upload step of **Publish website**).
- The repository keeps full-size photo originals. Asking editors to upload photos under about 3 MB keeps it small.
- GitHub pauses scheduled jobs in repositories that have had no activity for 60 days. Weekly publishing prevents this. After a long break, re-enable the workflows from the Actions tab.
- Pages CMS's free hosted service is run by a small open-source project. If it ever went away, the same `.pages.yml` works with a self-hosted copy of Pages CMS, and the content is untouched either way.
