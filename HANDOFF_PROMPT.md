# Handoff Prompt Template

Use this at the start of a brand new Codex or Claude Code session:

```text
You are working in the `jsonExplorer` repository.

Before making changes, read these files in order:
1) README.md
2) AGENTS.md
3) goal.md
4) todo.md

Project purpose:
- This is a MongoDB JSON explorer/data-curation tool with a file-explorer UX.
- Main workflow: connect MongoDB, browse databases/collections/documents as folders/files, and rapidly sort/label/filter JSON docs for ML data preparation.

Implementation landmarks:
- MongoDB virtual FS: contexts/fileSystem/MongoDBFS.ts
- MongoDB API proxy: pages/api/mongodb/[...params].ts
- Mongo connection + mount flow: hooks/useMongoDBIntegration.ts
- Explorer interactions: components/system/Files/*

Please summarize your understanding of the current architecture first, then propose the smallest safe set of changes for the task I give you.
```
