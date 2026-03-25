# jsonExplorer — User Guide

## What is this?

jsonExplorer is a **MongoDB data curation tool** that looks and feels like a desktop file explorer (think Windows Explorer or macOS Finder). It is designed to speed up **manual labeling of product data for ML training**.

Instead of writing database queries or clicking through MongoDB Compass, you browse your data visually — databases are folders, collections are subfolders, and documents are files with product image thumbnails.

---

## Getting Started

### 1. Launch the app

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser. You'll see a desktop environment.

### 2. Connect to MongoDB

- A MongoDB connection dialog will appear (or you can find it on the desktop)
- Enter your MongoDB connection string (e.g., `mongodb://localhost:27017`)
- Click connect

### 3. Open your data

Once connected, a folder icon appears on the desktop representing your MongoDB instance.

- **Double-click** the folder to open it — you'll see your databases listed as subfolders
- **Double-click** a database (e.g., `bilkatogo`) — you'll see collections as subfolders
- **Double-click** a collection (e.g., `final`) — you'll see all documents as `.json` files

Each document shows a **product image thumbnail** if the document contains image data.

---

## Navigating Around

| Where you are | What you see |
|---------------|-------------|
| Root folder | All your databases |
| Inside a database | All collections in that database |
| Inside a collection | All documents as `.json` files with thumbnails |

**Toolbar buttons:**
- **Back / Forward** — navigate through your browsing history
- **Up** — go to the parent folder
- **Address bar** — shows your current location (you can type in it)
- **Refresh (F5)** — reload the current folder

---

## Viewing and Inspecting Products

### Thumbnails

Documents with product images display them as thumbnails. The app automatically finds images from these document fields (in priority order):

1. `productImages` — local image server paths
2. `images` — external image URLs
3. `oldImages` — legacy image URLs

If none of these fields exist, a default file icon is shown.

### Adjusting the view

- **Icon size slider** (bottom-right corner) — drag to make thumbnails larger or smaller
- **Icon view button** (bottom-right) — grid of thumbnails
- **Details view button** (bottom-right) — list with columns
- **Ctrl+Scroll wheel** — zoom icon size up/down

### Browsing multiple images

Some products have multiple images. When you hover over such a product:

- **Left/right arrow buttons** appear on the thumbnail
- Click them to cycle through the product's images without opening anything
- A small counter (e.g., "2/5") shows which image you're viewing

### Quick Look (full preview)

Select a document and press **Space** to open a large preview overlay (similar to macOS Quick Look):

- The product image is displayed at full size, fit to the window
- **Arrow Left / Right** — switch to the previous/next document
- **Arrow Up / Down** — cycle through this product's images
- **Scroll wheel** — zoom in/out
- **Space** or **Escape** — close the preview

---

## Selecting Products

- **Click** a product to select it
- **Ctrl+Click** (or Cmd+Click on Mac) — add/remove from selection
- **Click and drag** — draw a selection rectangle to select multiple products
- **Ctrl+A** — select all visible products

---

## Labeling Products (Categories)

This is the core workflow the tool is built for — quickly sorting products into categories for ML training data.

### Setting a category

1. Select one or more products
2. **Right-click** > **"Set Category"** (or press **Ctrl+L**)
3. Type a category name (e.g., `fruit`, `dairy`, `cleaning`)
   - You can enter multiple categories separated by commas: `fruit, organic`
   - If all selected items already share a category, it will be pre-filled
4. Press Enter

The category is saved directly to the MongoDB document as a `category` field.

### Removing a category

- **Right-click** > **"Remove Category"** — removes the category from selected products

### Hiding categorized products

Once you've labeled some products, you want to focus on the unlabeled ones:

- Press **Ctrl+H** to **hide all categorized products** — only unlabeled ones remain visible
- Press **Ctrl+H** again to **show everything** again
- You can also click the **"Hide Labeled" / "Show All"** button in the bottom status bar

This toggle is **instant** — it doesn't re-query the database. You can toggle back and forth freely while working through a large collection.

---

## Dismissing Products (Skip)

Some products you don't want to label right now (duplicates, irrelevant items, etc.):

### Dismissing

- Select items and press **Ctrl+D** to dismiss them
- Or **right-click** > **"Dismiss"**

### Hiding dismissed products

- Press **Ctrl+Shift+D** to toggle visibility of dismissed products
- Or click **"Hide Dismissed" / "Show Dismissed"** in the status bar

### Undismissing

- **Right-click** a dismissed item > **"Undismiss"** to bring it back

---

## Substitute Group Labeling

This feature lets you tag products that can substitute for each other (e.g., honey and maple syrup are both sweeteners). This data is used to train ML models for product substitution recommendations.

### Setting a substitute group

1. Select one or more products that can substitute for each other
2. **Right-click** > **"Set Substitute Group"**
3. Type a group name (e.g., `sweetener`, `thickener`, `butter alternative`)
4. Press Enter

All products sharing the same group name are considered interchangeable.

### Removing a substitute group

- **Right-click** > **"Remove Substitute Group"**

### Hiding grouped products

- Press **Ctrl+G** to hide all products that have a substitute group assigned
- Press **Ctrl+G** again to show them
- Or click **"Hide Grouped" / "Show Grouped"** in the status bar

### Typical workflow

1. Open a collection
2. Look for products that are substitutes for each other
3. Select them all, right-click > "Set Substitute Group" > type a group name
4. Press **Ctrl+G** to hide grouped products and focus on ungrouped ones
5. Repeat until done

---

## Keyboard Shortcuts Reference

### General

| Shortcut | Action |
|----------|--------|
| **Double-click** | Open folder / file |
| **Ctrl+A** | Select all items |
| **Ctrl+C** | Copy selected items |
| **Ctrl+X** | Cut selected items |
| **Ctrl+V** | Paste items |
| **F5** or **Ctrl+R** | Refresh current folder |
| **Delete** | Delete selected items |
| **F2** | Rename selected item |
| **Ctrl+Click** | Multi-select (macOS compatible) |

### Labeling

| Shortcut | Action |
|----------|--------|
| **Ctrl+L** | Set category on selected items |
| **Ctrl+H** | Toggle hide/show categorized items |
| **Ctrl+D** | Dismiss selected items |
| **Ctrl+Shift+D** | Toggle hide/show dismissed items |
| **Ctrl+G** | Toggle hide/show substitute group items |

### Quick Look

| Shortcut | Action |
|----------|--------|
| **Space** | Open / close Quick Look preview |
| **Escape** | Close Quick Look |
| **Arrow Left / Right** | Previous / next document |
| **Arrow Up / Down** | Previous / next image of current document |
| **Scroll wheel** | Zoom in / out |

### View

| Shortcut | Action |
|----------|--------|
| **Ctrl+Shift+3** | Icon view |
| **Ctrl+Shift+6** | Details view |
| **Ctrl+Scroll wheel** | Adjust icon zoom level |

---

## Status Bar

The bar at the bottom of each window shows:

- **Item count** — how many documents are currently visible (e.g., "200 items")
- **Selected count** — how many items are selected and their total size
- **"Hide Labeled"** — toggle button for hiding categorized items (same as Ctrl+H)
- **"Hide Dismissed"** — toggle button for hiding dismissed items (same as Ctrl+Shift+D)
- **"Hide Grouped"** — toggle button for hiding substitute group items (same as Ctrl+G)
- **View buttons** — switch between icon and details view
- **Zoom slider** — adjust icon/thumbnail size

Active toggle buttons appear highlighted to show which filters are on.

---

## Right-Click Context Menu

When you right-click on a product document, you get these options (in addition to standard file operations):

| Menu Item | What it does |
|-----------|-------------|
| **Set Category** | Assign a category label to selected products |
| **Remove Category** | Remove the category from selected products |
| **Set Substitute Group** | Assign a substitute group to selected products |
| **Remove Substitute Group** | Remove the substitute group from selected products |
| **Dismiss** | Mark selected products as skipped |
| **Undismiss** | Unmark previously dismissed products |

---

## Tips for Efficient Labeling

1. **Use Quick Look** — press Space to quickly preview a product, then Escape to close and move on
2. **Multi-select with Ctrl+Click** — select several similar products, then label them all at once
3. **Use Ctrl+H aggressively** — hide labeled items as you go so you only see what's left to do
4. **Dismiss junk early** — use Ctrl+D on duplicates, irrelevant items, or things you'll deal with later
5. **Combine filters** — you can have Ctrl+H, Ctrl+Shift+D, and Ctrl+G all active at once to see only unlabeled, non-dismissed, ungrouped items
6. **Use the zoom slider** — make thumbnails bigger when you need to see product details, smaller when scanning through many items quickly

---

## Technical Notes

- All data is stored directly in MongoDB — categories, substitute groups, and dismiss flags are fields on the documents themselves
- Toggle filters (Ctrl+H, Ctrl+Shift+D, Ctrl+G) are **instant** with zero network requests — they filter client-side cached data
- Filter states persist across page reloads
- The app connects to MongoDB through a local API proxy — your connection string stays in your browser's localStorage
