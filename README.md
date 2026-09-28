# Boxborough News website

A free-to-run website and weekly newsletter for Boxborough News.

- **Editors** write in a simple web form (Pages CMS). No technical knowledge needed. → `EDITOR-GUIDE.md`
- **The website** rebuilds itself about two minutes after every save: home page, sections, article pages, archive, search, RSS.
- **The weekly email** is assembled every Friday morning from that week's articles and saved as a draft in Kit, ready for an editor to review and send.
- **Setting it up** takes about an hour, once. → `SETUP-GUIDE.md`

| Folder / file | What's in it |
|---|---|
| `src/articles/` | News and feature articles (one file each) |
| `src/announcements/` | Announcements and events |
| `src/pages/` | About, Contact, Outside the Box |
| `src/_data/` | Site settings, Town Hall notice, newsletter settings, sections |
| `src/media/` | Photos and documents uploaded by editors |
| `src/_includes/`, `src/*.njk` | Page templates |
| `src/assets/` | Styles, fonts, icons |
| `src/assets/brand/` | Logo, wordmark, email header and default sharing image |
| `lib/` | Shared code, including the newsletter email design |
| `src/_data/townCalendar.js` | Reads upcoming meetings from the town's calendar feed |
| `tools/sample-town-calendar.ics` | Sample feed for testing without internet (`TOWN_ICS_FILE=tools/sample-town-calendar.ics npm start`) |
| `scripts/create-newsletter-draft.js` | Sends the weekly draft to Kit |
| `.pages.yml` | Defines the editor's forms in Pages CMS |
| `.github/workflows/` | Automatic publishing and the Friday newsletter job |

Built with [Eleventy](https://www.11ty.dev), [Pages CMS](https://pagescms.org), [Pagefind](https://pagefind.app) and [Kit](https://kit.com). Fonts: Newsreader and Public Sans (SIL Open Font License). Colors are taken from the Boxborough News logo: navy, slate-lavender, schoolhouse red and sky blue (see the top of `src/assets/css/site.css`).
