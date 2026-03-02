# jsonExplorer

## Purpose

`jsonExplorer` is a file-explorer-style interface for MongoDB JSON documents.

The practical goal is to speed up manual data curation for ML datasets:
- browse databases as folders
- browse collections as subfolders
- browse documents as `.json` files
- quickly label/sort/filter large sets of product documents

This project is built on top of a daedalOS-style browser desktop UI and adapted for JSON/MongoDB-heavy workflows.

## What This Project Is Optimized For

- Fast navigation through large MongoDB collections
- File-manager interaction patterns (sorting, selection, context menus)
- Human-in-the-loop labeling (for example product categorization)
- Low-friction iteration during data-cleaning sessions

## Core Workflow

1. Connect to MongoDB from the in-app MongoDB dialog.
2. Open the mounted MongoDB folder on desktop (`/Users/Public/Desktop/<alias>`).
3. Open a database folder, then a collection folder.
4. Work with documents as `.json` files (sort, inspect, label, hide filtered subsets).

## Tech Stack

- Next.js (Pages Router)
- React + styled-components
- BrowserFS virtual filesystem abstraction
- MongoDB via Next.js API routes (`/api/mongodb/[...params]`)
- TypeScript

## Run Locally

```bash
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Important Project Context Files

- `goal.md`: detailed product objective, workflow, and feature notes
- `todo.md`: near-term follow-ups
- `AGENTS.md`: concise onboarding context for AI coding agents
- `CLAUDE.md`: Claude Code specific onboarding pointer
- `HANDOFF_PROMPT.md`: copy/paste prompt for fresh agent sessions
