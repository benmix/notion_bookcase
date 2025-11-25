# notion_bookcase

Keep Goodreads and Douban reading logs in sync with a Notion database. The project ships fully automated scripts, GitHub Actions workflows, and reference templates so you can bootstrap a personal reading hub in minutes.

## Highlights

- Syncs Douban (RSS + full crawl) and Goodreads shelves into a Notion database.
- Uses the official `@notionhq/client` and validates `NOTION_TOKEN`, `NOTION_BOOK_DATABASE_ID`, `DOUBAN_USER_ID`, `GOODREADS_USER_ID` before any work starts.
- Built with Deno + TypeScript plus `deno_dom`, `rss`, and `dayjs` for parsing and reliable scheduling.
- Scripts fail fast on upstream errors, log processed records, and can be triggered manually or on a schedule via GitHub Actions.

## Showcase

[BenMix's Bookcase](https://benmix.notion.site/a40e2bf289d244edbcf2acf0b6acdfc2?v=61358fa5f66942bd8aeaeb714c3d808d)

<img width='70%' src='/assets/screenshot_showcase.png'/>

## Tech Stack & Scripts

| Area        | Details |
|-------------|---------|
| Runtime     | Deno (TypeScript ES modules) |
| Libraries   | `@notionhq/client`, `deno_dom`, `rss`, `dayjs` |
| Commands    | `deno task start:douban:rss`, `deno task start:douban:full`, `deno task start:goodreads:full`, `deno task start:goodreads:part`, `deno task generate:cover-wall` |
| Direct run  | `deno run -A src/<script>.ts` |

> All commands assume the required environment variables are exported in your shell or
> injected by your CI provider.

## Detailed Setup Guide

The following walkthrough mirrors how the production automation is wired. Each step
includes the resources you need so you can follow along without leaving this README.

1. Get the code  

  > 1.1. Fork the repository (recommended) or clone it locally.
  
  > 1.2. Optional: enable GitHub Actions in your fork so you can schedule sync jobs later.

2. Create a Notion integration 
 
  > 2.1. Visit the [Notion integrations dashboard](https://www.notion.so/my-integrations).  
  
  > 2.2. Create a new internal integration and copy the **Secret** — that will be your `NOTION_TOKEN`. 
  
  > 2.3. [Full instructions](https://developers.notion.com/docs/create-a-notion-integration#step-1-create-an-integration).
  
3. Duplicate the starter Notion database
  
  > 3.1. Duplicate [this template](https://benmix.notion.site/d7bb93e54a9e43b3ad04762492880f6f?v=8a0e46806aaa4a2d905639d4c3043bcc) into your workspace.
  
  > 3.2. Keep the resulting database URL handy.

4. Share the database with your integration
  
  > 4.1. Open the duplicated database, click `Share`, and invite the integration from step 2.
  
  > 4.2. [Reference docs](https://developers.notion.com/docs/create-a-notion-integration#step-2-share-a-database-with-your-integration).

5. Capture the database ID
  
  > 5.1. With the database open, copy the UUID from the URL (it sits between the last `/` and the `?`). That value becomes `NOTION_BOOK_DATABASE_ID`.
  
  > 5.2. [Step-by-step guide](https://developers.notion.com/docs/create-a-notion-integration#step-3-save-the-database-id).

6. Collect your source user IDs
  
  > 6.1. **Douban:** open your Douban profile (e.g. `https://www.douban.com/people/<id>/`) and copy the `<id>` portion — that's `DOUBAN_USER_ID`.
  
  > 6.2. **Goodreads:** open your Goodreads profile (e.g. `https://www.goodreads.com/user/show/<id>-name`) and copy the numeric `<id>` — that's `GOODREADS_USER_ID`.

7. Configure secrets for automation, If you intend to run the GitHub Actions workflows included in this repo:

  > 7.1. Open `Settings` → `Secrets and variables` → `Actions` in your fork.
  
  > 7.2. Create the following repository secrets:
    - `NOTION_TOKEN`
    - `NOTION_BOOK_DATABASE_ID`
    - `DOUBAN_USER_ID`
    - `GOODREADS_USER_ID`

8. Run the first sync
  
  > 8.1. The first Douban import should be a full sync to backfill history:
  
```bash
    deno task start:douban:full
```
  
  > 8.2. Goodreads imports can also start with the full sync (`deno task start:goodreads:full`).

9. Schedule incremental syncs
  
  > 9.1. After the initial backfill, schedule the RSS-based incremental sync to keep the database up-to-date. The provided GitHub Actions workflow runs `deno task start:douban:rss`.
  
  > 9.2. Adjust the workflow cron expression if you want a different cadence.

## Manual Execution

When running locally you can export environment variables and run any script directly:

```bash
export NOTION_TOKEN="***"
export NOTION_BOOK_DATABASE_ID="***"
export DOUBAN_USER_ID="***"
export GOODREADS_USER_ID="***"

deno task start:goodreads:part   # Goodreads home-page incremental sync
```

Each script logs how many books were pulled and which records were sent to Notion. Failed
requests automatically retry a few times before being skipped.

## Troubleshooting

- **Missing env vars:** the process exits immediately with an explicit error. Double-check
  your shell exports or GitHub secrets.
- **Notion permission errors:** ensure the integration still has access to the database
  (step 4).
- **Rate limits:** rerun the job later — the scripts are idempotent and will skip entries
  already stored in Notion.

## License

This project is distributed under the [MIT License](./LICENSE).
