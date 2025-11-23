# notion_bookcase

## New Features ! !

- [x] 🥳 Support Sync Source from [Goodreads](https://www.goodreads.com)
- [x] 🥳 Support Sync Source from [Douban](https://www.douban.com)

## Introduction

- [x] Use douban rss source to sync book reading status.
- [x] Use douban page crawler to sync book reading status.
- [x] Use goodreads page crawler to sync book reading status.
- [x] Uses official `@notionhq/client` with strict env validation (`NOTION_TOKEN`, `NOTION_BOOK_DATABASE_ID`, `DOUBAN_USER_ID`, `GOODREADS_USER_ID`).
- [x] Sync scripts fail fast on missing env / Notion errors and log successes with counts.

## Showcase

[BenMix's Bookcase](https://benmix.com/benmix/a40e2bf289d244edbcf2acf0b6acdfc2?v=61358fa5f66942bd8aeaeb714c3d808d)

<img width='70%' src='/assets/screenshot_showcase.png'/>

## How to Use

### 1. Fork the repository.

- git clone the respository or fork the repository
- you can use github actions to create schedule task

### 2. Creating a Notion Intergretion.

- create a notion integretion.
- copy the notion integretion token.
- [Learn more](https://developers.notion.com/docs/create-a-notion-integration#step-1-create-an-integration)

### 3. Duplicating the [notion template](https://benmix.notion.site/d7bb93e54a9e43b3ad04762492880f6f?v=8a0e46806aaa4a2d905639d4c3043bcc)

<img width='70%' src='/assets/screenshot_notion_database.png'/>

### 4. Connecting to Your Notion Database

- add your created integretion to your notion's database.
- [Learn more](https://developers.notion.com/docs/create-a-notion-integration#step-2-share-a-database-with-your-integration)

### 5. Getting Database id

- copy the cloned template's database id.
- please save it, we will use it soon.
- [Learn more](https://developers.notion.com/docs/create-a-notion-integration#step-3-save-the-database-id)

### 6. Getting User id From BookSource

- Douban Source
  - goto your douban homepage, copy your douban's id,
  - please save it. we will use it soon.
    <img width='70%' src='/assets/screenshot_doban_user_id.png'/>
- GoodReads Source
  - goto your goodreads profile page, copy your goodreads's id,
  - please save it. we will use it soon.
    <img width='70%' src='/assets/screenshot_goodreads_profile.png'/>

### 7. Setting secrets for git actions.

- add below secrets to your repository actions configuration.
- add **NOTION_TOKEN**([STEP 2](#2-creating-a-notion-intergretion)),
- add **NOTION_BOOK_DATABASE_ID**([STEP 5](#5-get-database-id))
- add **DOUBAN_USER_ID** ([STEP 6](#6-get-user-id-from-booksource))
- add **GOODREADS_USER_ID** ([STEP 6](#6-get-user-id-from-booksource))
  <img width='70%' src='/assets/screenshot_add_secrets.png'/>

### 8. Sync Data

- first sync, you must run sync_full action to full sync your douban's book
  reading data.

### 9. Finally

- set the schedule to execute the sync_rss action.
- you can update the workflow configuration to modify the timing.

## License

The Project is undering [MIT License](/LICENSE)
