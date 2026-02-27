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
5. Press **Ctrl+D** to dismiss selected items you don't want to deal with right now
6. Press **Ctrl+Shift+D** to toggle hiding dismissed items
7. Press **Space** on a selected item to Quick Look (preview) it
8. Continue labeling the remaining products
9. Press **Ctrl+H** / **Ctrl+Shift+D** again to show hidden items and review progress

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
| `components/system/Files/FileManager/StyledStatusBar.ts` | CSS for `.hide-toggle` / `.hide-toggles` container (flex-based positioning) |
| `components/system/Files/FileManager/index.tsx` | Wires toggle logic: `handleToggleHideCategorized` with `allFilesRef` for instant save/restore |

### Dismiss/Skip Feature (implemented)

Lets users temporarily hide products they don't want to deal with right now, separate from the categorization hide.

| File | Role |
|------|------|
| `contexts/fileSystem/MongoDBFS.ts` | `hideDismissed` flag, `getCachedDismissedNames()`, `isCachedDismissed()`, filtering in `readdir` |
| `contexts/session/types.ts` | `hideDismissed` in session state |
| `contexts/session/useSessionContextState.ts` | Persists `hideDismissed` across page reloads |
| `components/system/Files/FileEntry/useFileContextMenu.ts` | "Dismiss" / "Undismiss" right-click menu items |
| `components/system/Files/FileManager/useFileKeyboardShortcuts.ts` | Ctrl+D (dismiss selected), Ctrl+Shift+D (toggle visibility) |
| `components/system/Files/FileManager/StatusBar.tsx` | "Hide Dismissed" / "Show Dismissed" toggle button |
| `components/system/Files/FileManager/index.tsx` | `handleToggleHideDismissed`, `handleDismiss` with instant toggle pattern |

### Quick Look (implemented)

Press **Space** on a selected file to preview it in a modal overlay (like macOS Quick Look).

### macOS Ctrl+Click Fix

On macOS, Ctrl+click fires a `contextmenu` event. This is suppressed in `contexts/menu/useMenuContextState.ts` so that Ctrl+click can be used for multi-selection without triggering the context menu. Only real right-clicks (button 2 / two-finger tap) open the menu.

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

Core labeling workflow is fully implemented:
- Right-click context menu for setting/removing categories
- Ctrl+H instant toggle for hiding categorized items (0 network requests)
- Ctrl+D to dismiss selected items, Ctrl+Shift+D to toggle dismissed visibility
- Right-click Dismiss/Undismiss menu items
- Status bar with "Hide Labeled" and "Hide Dismissed" toggle buttons
- Quick Look preview (Space key)
- Ctrl+click multi-selection works on macOS (no false context menu)
- Session persistence of all toggle states
- Lazy loading / infinite scroll for large collections
- Zoom capability for icon sizes

See `todo.md` for future ideas (substitute group labeling for ML training).
