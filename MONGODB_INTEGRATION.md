# MongoDB Desktop Integration

This feature adds MongoDB database visualization to the codexOS desktop. When a MongoDB database connection is detected, it creates a visual folder structure on the desktop representing the database hierarchy.

## How It Works

### 1. Connection Detection
- The `mongoService` automatically checks for local MongoDB connections every 5 seconds
- Currently supports local MongoDB instances at `mongodb://localhost:27017`
- Mock data is provided for demonstration purposes

### 2. Folder Structure
When a MongoDB connection is established, the following folder structure appears on the desktop:

```
Desktop/
└── local/                    # Connection name (e.g., "local")
    ├── mystore/              # Database name
    │   ├── products/         # Collection name
    │   │   ├── iPhone 15.json      # Document (named by 'name' field or ObjectID)
    │   │   ├── MacBook Pro.json
    │   │   └── Vintage Camera.json
    │   └── users/
    │       ├── John Doe.json
    │       └── Jane Smith.json
    └── blogdb/
        └── posts/
            └── Getting Started with MongoDB.json
```

### 3. Document Display Features

#### Dynamic Icons
- Documents with `images` array display image thumbnails as file icons
- Falls back to `oldImages` array when `images` is empty
- Shows default icon with initials when no images are available

#### Image Navigation
- **Multiple Images**: Hover over files with multiple images to see navigation arrows
- **Forward/Back**: Click arrows to cycle through available images
- **Seamless Transition**: Automatically moves from `images` to `oldImages` array
- **Visual Indicators**: Shows current image position (e.g., "2/5")

#### Image Fallback Logic
1. First, try images from `images` array
2. If `images` is empty or fails, use `oldImages` array
3. If no images available, show default icon with document name initials

## File Structure

### Core Components
- `services/mongoService.ts` - MongoDB connection detection and data management
- `hooks/useMongoDB.ts` - React hook for integrating with file system
- `components/system/Files/FileEntry/MongoDocumentHandler.tsx` - Custom icon display for MongoDB documents

### Integration Points
- `components/system/Desktop/index.tsx` - Initializes MongoDB integration
- `components/system/Files/FileEntry/index.tsx` - Enhanced to support MongoDB document icons

## Mock Data

For demonstration, the system includes sample databases:

**mystore** database:
- `products` collection with electronics items (iPhone, MacBook, Camera)
- `users` collection with user profiles

**blogdb** database:
- `posts` collection with blog entries

## Document Schema

Expected MongoDB document structure:
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "iPhone 15",                    // Used for file name (falls back to _id)
  "images": [                             // Primary image URLs
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ],
  "oldImages": [                          // Fallback image URLs
    "https://example.com/old1.jpg"
  ],
  // ... other document fields
}
```

## Future Enhancements

- Real MongoDB connection via backend API
- Support for remote MongoDB instances
- Real-time updates when database changes
- Document editing capabilities
- Collection statistics and metadata
- Custom connection configuration UI

## Usage

### Getting Started
1. Start the application: `npm run dev`
2. Look for the MongoDB button (database icon) in the taskbar next to the clock
3. Click the MongoDB button to open the Connection Manager

### Connection Manager Features
- **View Saved Connections**: See all configured MongoDB connections with their status
- **Add New Connection**: Configure custom host, port, username, password, and database
- **Test Connections**: Verify connectivity before saving
- **Delete Connections**: Remove unwanted connections
- **Connection Status**: Real-time status display (connected/disconnected/error)

### Connection Configuration
- **Connection Name**: Give your connection a memorable name (e.g., "Production DB", "Local Test")
- **Host**: MongoDB server address (default: localhost)
- **Port**: MongoDB server port (default: 27017)
- **Username/Password**: Optional authentication credentials
- **Database**: Optional specific database name

### Desktop Integration
1. When a connection is successfully established, folders appear on desktop
2. Folder structure: `Desktop/[Connection_Name]/[Database]/[Collection]/[Documents]`
3. Navigate through database → collection → documents like a normal file system
4. Documents appear as JSON files with dynamic icons

### Document Interaction
- **Image Icons**: Documents with `images` field show image thumbnails
- **Multiple Images**: Hover over files to see navigation arrows
- **Image Navigation**: Click forward/back arrows to cycle through images
- **Fallback Logic**: Uses `images` → `oldImages` → default icon with initials
- **Image Counter**: Shows current position (e.g., "2/5") for multi-image files

### Current Mock Data
The system includes demonstration data:
- **Local MongoDB** connection with sample databases
- **mystore** database: products (with image URLs), users
- **blogdb** database: blog posts
- Only localhost:27017 connections show as "connected" for demo purposes

### Real-Time Features
- Automatic connection polling every 5 seconds
- Live status updates in Connection Manager
- Desktop folders appear/disappear based on connection status
- Console logging for debugging connection changes