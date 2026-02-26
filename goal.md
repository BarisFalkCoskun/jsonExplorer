# Project Goal

## What This Is

A file-explorer-style MongoDB browser built on top of [daedalOS](https://github.com/DustinBrett/daedalOS) (a web-based desktop environment). It lets you browse MongoDB databases, collections, and documents as if they were folders and files in Windows Explorer.

## What We're Doing

Building a **product categorization tool** for organizing grocery store product data for ML training. The data lives across multiple MongoDB databases (bilkatogo, netto, etc.), each containing collections of product documents.

### The Workflow

1. Open a database folder (e.g., `bilkatogo`) -> see collections as subfolders
2. Open a collection folder (e.g., `products`) -> see documents as `.json` files with thumbnail previews
3. Right-click a product -> "Set Category" -> type a category name (e.g., "Fruit")
4. Press **Ctrl+H** to hide already-categorized items -> see only unlabeled products
5. Continue labeling the remaining products
6. Press **Ctrl+H** again to show all items and review progress

### Key Requirement

The **Ctrl+H toggle must be instant** (zero network requests). Users label hundreds of products and need to quickly hide/show categorized items without interrupting their workflow. This is achieved by manipulating React state directly (`setFiles`) rather than re-fetching from the server (`updateFiles`).

## Architecture

### MongoDB Virtual Filesystem

- `contexts/fileSystem/MongoDBFS.ts` — BrowserFS-compatible filesystem that proxies MongoDB operations through Next.js API routes
- `pages/api/mongodb/[...params].ts` — API route handling `databases`, `collections`, `documents`, and individual `document` CRUD
- Documents are cached client-side (`documentsListCache`) to avoid repeated API calls

### Categorization Feature (implemented)

| File | Role |
|------|------|
| `pages/api/mongodb/[...params].ts` | PATCH endpoint for `$set`/`$unset` category; `filter` query param support |
| `contexts/fileSystem/MongoDBFS.ts` | `hideCategorized` flag, `patchDocument()`, `getCachedDocumentNames()`, client-side filtering in `readdir` |
| `contexts/session/types.ts` | `hideCategorized` in session state |
| `contexts/session/useSessionContextState.ts` | Persists `hideCategorized` across page reloads |
| `components/system/Files/FileEntry/useFileContextMenu.ts` | "Set Category" / "Remove Category" right-click menu items |
| `components/system/Files/FileManager/useFileKeyboardShortcuts.ts` | Ctrl+H shortcut (delegates to toggle callback) |
| `components/system/Files/FileManager/StatusBar.tsx` | "Hide Labeled" / "Show All" toggle button |
| `components/system/Files/FileManager/StyledStatusBar.ts` | CSS for `.hide-toggle` button (flex-based positioning) |
| `components/system/Files/FileManager/index.tsx` | Wires toggle logic: `handleToggleHideCategorized` with `allFilesRef` for instant save/restore |

### How Instant Toggle Works

- **Hide direction**: Save current `files` state to `allFilesRef`, then filter out categorized items using `getCachedDocumentNames()` and `setFiles()`
- **Show direction**: Restore from `allFilesRef` (or reconstruct from cache on session restore)
- **No `updateFiles()` call** — that triggers readdir + stat on every file + network requests
- `getCachedDocumentNames()` returns categorized doc names from the documents list cache (no TTL check, so it works even after cache expiration)

## Tech Stack

- **Next.js** (Pages Router)
- **React** with styled-components
- **BrowserFS** for virtual filesystem abstraction
- **MongoDB** accessed via API routes (not direct client connection)
- **TypeScript** throughout

## Running Locally

```bash
npm run dev    # starts Next.js dev server on localhost:3000
```

MongoDB connection is configured in the app. The API routes at `/api/mongodb/` proxy all database operations.

## Current State

The categorization feature is fully implemented and tested:
- Right-click context menu for setting/removing categories
- Ctrl+H instant toggle (0 network requests both directions, verified with Playwright)
- Status bar toggle button with proper positioning (no overlap with zoom slider)
- Session persistence of toggle state
- Lazy loading / infinite scroll for large collections
- Zoom capability for icon sizes
