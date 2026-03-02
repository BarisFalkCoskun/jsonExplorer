# AGENTS.md

## Project Intent (Read First)

This repository is **not** a generic desktop clone.  
Its practical purpose is a **JSON/MongoDB data curation tool** with a file-explorer UX.

Primary use case:
- mount MongoDB
- browse DBs/collections/documents like folders/files
- rapidly sort/label/filter JSON documents for ML dataset preparation

## Product Context

Start with:
- `goal.md` for full workflow and constraints
- `todo.md` for planned extensions

Key emphasis from `goal.md`:
- keep high-frequency operations fast (especially visibility toggles/filtering)
- prefer client-side cached filtering where possible to avoid unnecessary network round-trips

## Architecture Landmarks

- `contexts/fileSystem/MongoDBFS.ts`
  MongoDB-backed BrowserFS implementation used by the file manager.
- `pages/api/mongodb/[...params].ts`
  API proxy for MongoDB operations (databases/collections/documents/document CRUD).
- `hooks/useMongoDBIntegration.ts`
  connection setup + mount/unmount behavior.
- `components/system/Files/*`
  core explorer interactions, sorting, keyboard shortcuts, context menus.

## Local Dev

```bash
npm run dev
```

Then open:
- `http://localhost:3000`
