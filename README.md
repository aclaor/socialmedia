# Clipleey

A short-video social app that runs entirely on Cloudflare: one Worker, a D1 database and an R2 bucket for the videos. No build step.

## What is in it

- Swipeable full-screen video feed with a ranked "For you" tab and a "Following" tab
- Accounts (sign up, log in, edit profile and photo, change password, delete account)
- Post a video from a file or record one with the camera; captions, #hashtags, @mentions, public or private, comments on or off
- Likes (button or double-tap), comments with replies and comment likes, saves, shares, view counts
- Follow and block people; profiles with Videos, Liked and Saved tabs; follower lists
- Discover page: search for videos, people and hashtags; trending hashtags; creators to follow
- Inbox: activity notifications and direct messages
- Reporting, plus a review queue in Settings for admins (the first account created is an admin)
- Search engine support: per-page titles, descriptions, social previews and structured data, `/sitemap.xml` (with video entries), `/robots.txt`, verification tags and IndexNow

## Deploy on Cloudflare

1. In the Cloudflare dashboard, open **R2** once and turn it on for your account (video files are stored there).
2. Go to **Workers & Pages → Create → Import a repository** and pick this repo. Keep the default deploy command, `npx wrangler deploy`.
3. Deploy. The database (`clipleey-db`) and the bucket (`clipleey-media`) are created automatically, and the tables are created on the first visit.
4. Open the site and create your account first, so that you are the admin.
5. Add your own domain under the Worker's **Settings → Domains & Routes**.

Every push to `main` redeploys the site.

## Get it into Google and Bing

1. Add the site in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters). If the domain's DNS is on Cloudflare, the DNS verification method needs no code change. To verify with a tag instead, paste the codes into `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` in `wrangler.jsonc`.
2. In both tools, submit the sitemap: `https://your-domain/sitemap.xml`.
3. Optional: set `INDEXNOW_KEY` in `wrangler.jsonc` to any 32-character hex string. New videos are then sent to Bing as soon as they are posted.

Public videos, profiles, hashtag pages and Discover are indexable. Private videos, the inbox, settings and upload pages are not.

## Settings (`wrangler.jsonc`)

| Name | What it does |
| --- | --- |
| `SITE_NAME` | The name shown in the app and in search results |
| `GOOGLE_SITE_VERIFICATION`, `BING_SITE_VERIFICATION` | Search engine verification codes |
| `INDEXNOW_KEY` | Turns on instant Bing notifications |
| `ADMIN_USERNAMES` | Extra admins, comma-separated |

If you rename the site, also update `public/manifest.webmanifest`, `public/og.png` and the icons.

## Run it locally

```
npm install
npm run dev
```

## Limits to know about

- Videos are stored and played as uploaded (MP4, WebM or MOV, up to 95 MB). There is no transcoding.
- The feed ranking is a simple formula (engagement with a recency decay, unwatched videos first), not machine learning.
- The Terms, Privacy and Guidelines pages are starting text. Review them before you launch.
