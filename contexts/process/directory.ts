import dynamic from "next/dynamic";
import { type Processes } from "contexts/process/types";
import { FOLDER_ICON, TASKBAR_HEIGHT } from "utils/constants";

const directory: Processes = {
  FileExplorer: {
    Component: dynamic(() => import("components/apps/FileExplorer")),
    backgroundColor: "#202020",
    defaultSize: {
      height: 325,
      width: 447,
    },
    icon: FOLDER_ICON,
    title: "File Explorer",
  },
  OpenWith: {
    Component: dynamic(() => import("components/system/Dialogs/OpenWith")),
    allowResizing: false,
    backgroundColor: "#FFF",
    defaultSize: {
      height: 492,
      width: 392,
    },
    dialogProcess: true,
    hideTaskbarEntry: true,
    hideTitlebar: true,
    icon: "/System/Icons/unknown.webp",
    title: "Open With",
  },
  MongoDB: {
    Component: dynamic(() => import("components/system/Dialogs/MongoDB")),
    allowResizing: false,
    backgroundColor: "#FFF",
    defaultSize: {
      height: 500,
      width: 500,
    },
    dialogProcess: true,
    hideMaximizeButton: true,
    hideMinimizeButton: true,
    icon: "/System/Icons/unknown.webp",
    title: "MongoDB Connection",
  },
  Photos: {
    Component: dynamic(() => import("components/apps/Photos")),
    backgroundColor: "#222",
    defaultSize: {
      height: 432,
      width: 576,
    },
    hideTitlebarIcon: true,
    icon: "/System/Icons/photos.webp",
    title: "Photos",
  },
  Properties: {
    Component: dynamic(() => import("components/system/Dialogs/Properties")),
    allowResizing: false,
    backgroundColor: "rgb(240, 240, 240)",
    defaultSize: {
      height: 412,
      width: 361,
    },
    dialogProcess: true,
    hideMaximizeButton: true,
    hideMinimizeButton: true,
    icon: "",
    title: "Properties",
  },
  Run: {
    Component: dynamic(() => import("components/system/Dialogs/Run")),
    allowResizing: false,
    defaultSize: {
      height: 174,
      width: 397,
    },
    dialogProcess: true,
    hideMaximizeButton: true,
    hideMinimizeButton: true,
    icon: "/System/Icons/run.webp",
    initialRelativePosition: {
      bottom: TASKBAR_HEIGHT + 11,
      left: 15,
    },
    singleton: true,
    title: "Run",
  },
  ScreenSaver: {
    Component: dynamic(() => import("components/system/Dialogs/ScreenSaver")),
    allowResizing: false,
    dialogProcess: true,
    hasWindow: false,
    hideTaskbarEntry: true,
    icon: "/System/Icons/screensaver.webp",
    singleton: true,
    title: "Screen Saver",
  },
  Transfer: {
    Component: dynamic(() => import("components/system/Dialogs/Transfer")),
    allowResizing: false,
    backgroundColor: "#FFF",
    defaultSize: {
      height: 163,
      width: 400,
    },
    dialogProcess: true,
    icon: "/System/Icons/copying.webp",
    title: "",
  },
  VideoPlayer: {
    Component: dynamic(() => import("components/apps/VideoPlayer")),
    autoSizing: true,
    backgroundColor: "#000",
    defaultSize: {
      height: 390,
      width: 640,
    },
    icon: "/System/Icons/vlc.webp",
    libs: [
      "/Program Files/Video.js/video-js.min.css",
      "/Program Files/Video.js/video.min.js",
      "/Program Files/Video.js/Youtube.min.js",
    ],
    title: "Video Player",
  },
};

export default directory;
