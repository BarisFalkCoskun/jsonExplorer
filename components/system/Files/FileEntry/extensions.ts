import { EDITABLE_IMAGE_FILE_EXTENSIONS } from "utils/constants";

type Extension = {
  command?: string;
  icon?: string;
  process: string[];
  type?: string;
};

const types = {
  GraphicsEditor: {
    process: ["Photos"],
    type: "Picture File",
  },
  MediaPlaylist: {
    process: ["VideoPlayer"],
    type: "Media Playlist File",
  },
  MountableDiscImage: {
    icon: "image",
    process: ["FileExplorer"],
    type: "Disc Image File",
  },
  Music: {
    icon: "audio",
    process: ["VideoPlayer"],
  },
  ScreenSaver: {
    process: ["ScreenSaver"],
    type: "Screen Saver",
  },
  SvgFile: {
    process: ["Photos"],
    type: "Scalable Vector Graphics File",
  },
  ZipFile: {
    icon: "compressed",
    process: ["FileExplorer"],
    type: "Compressed (zipped) Folder",
  },
};

const extensions: Record<string, Extension> = {
  ".json": {
    process: ["MonacoEditor"],
    type: "JSON File",
  },
  ".iso": types.MountableDiscImage,
  ".m3u8": types.MediaPlaylist,
  ".mp3": types.Music,
  ".svg": types.SvgFile,
  ".xscr": types.ScreenSaver,
  ".zip": types.ZipFile,
};

const addType =
  (type: Extension) =>
  (extension: string): void => {
    if (type.process) {
      if (extensions[extension]) {
        extensions[extension].process.push(...type.process);
      } else {
        extensions[extension] = type;
      }
    }
  };

EDITABLE_IMAGE_FILE_EXTENSIONS.forEach(addType(types.GraphicsEditor));

export default extensions;
