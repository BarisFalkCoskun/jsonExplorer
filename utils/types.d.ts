type FC<T = Record<string, unknown>> = (
  props: React.PropsWithChildren<T>
) => React.JSX.Element | null;

type FCWithRef<R = HTMLElement, T = Record<string, unknown>> = (
  props: React.PropsWithChildren<T> & { ref?: React.RefObject<R | null> }
) => React.JSX.Element | null;

type TVMJSGlobalEnv = {
  [key: string]: unknown;
  logger?: (type: string, message: string) => void;
};

declare global {
  // eslint-disable-next-line vars-on-top, no-var
  var tvmjsGlobalEnv: TVMJSGlobalEnv | undefined;

  interface Window {
    tvmjsGlobalEnv?: TVMJSGlobalEnv;
  }
}

declare module "utif" {
  export const bufferToURI: (data: Buffer) => string;
}

declare module "browserfs" {
  export interface FileSystemConfiguration {
    fs: string;
    options?: Record<string, unknown>;
  }

  export type BFSCallback<T = unknown> = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error?: any,
    fs?: T
  ) => void;

  export const FileSystem: Record<
    string,
    {
      Create: (
        options: Record<string, unknown>,
        cb: (...args: unknown[]) => void
      ) => void;
    }
  >;

  export const BFSRequire: (name: string) => unknown;
  export const configure: (
    config: FileSystemConfiguration | Record<string, unknown>,
    cb: (error?: unknown) => void
  ) => void;
}

declare module "browserfs/dist/node/core/node_fs_stats" {
  export default interface Stats {
    atime: Date;
    atimeMs: number;
    birthtime: Date;
    birthtimeMs: number;
    blksize: number;
    blocks: number;
    ctime: Date;
    ctimeMs: number;
    dev: number;
    gid: number;
    ino: number;
    isBlockDevice: () => boolean;
    isCharacterDevice: () => boolean;
    isDirectory: () => boolean;
    isFIFO: () => boolean;
    isFile: () => boolean;
    isSocket: () => boolean;
    isSymbolicLink: () => boolean;
    mode: number;
    mtime: Date;
    mtimeMs: number;
    nlink: number;
    rdev: number;
    size: number;
    uid: number;
  }
}

declare module "browserfs/dist/node/core/FS" {
  type ErrorLike = {
    code?: string;
    errno?: number;
    message?: string;
    path?: string;
  };

  export type FSModule = {
    [key: string]: unknown;
    exists: (path: string, cb: (exists: boolean) => void) => void;
    getRootFS?: () => unknown;
    lstat: (
      path: string,
      cb: (
        error: ErrorLike | null | undefined,
        stats?: import("browserfs/dist/node/core/node_fs_stats").default // eslint-disable-line @typescript-eslint/consistent-type-imports
      ) => void
    ) => void;
    mkdir: (
      path: string,
      optionsOrCb?:
        | {
            flag?: string;
          }
        | ((error?: ErrorLike | null) => void),
      cb?: (error?: ErrorLike | null) => void
    ) => void;
    readFile: (
      path: string,
      optionsOrCb?:
        | {
            encoding?: string | null;
          }
        | ((error?: ErrorLike | null, data?: Buffer) => void),
      cb?: (error?: ErrorLike | null, data?: Buffer) => void
    ) => void;
    readdir: (
      path: string,
      cb: (error?: ErrorLike | null, data?: string[]) => void
    ) => void;
    rename: (
      oldPath: string,
      newPath: string,
      cb: (error?: ErrorLike | null) => void
    ) => void;
    rmdir: (path: string, cb: (error?: ErrorLike | null) => void) => void;
    stat: (
      path: string,
      cb: (
        error: ErrorLike | null | undefined,
        stats?: import("browserfs/dist/node/core/node_fs_stats").default // eslint-disable-line @typescript-eslint/consistent-type-imports
      ) => void
    ) => void;
    unlink: (path: string, cb?: (error?: ErrorLike | null) => void) => void;
    writeFile: (
      path: string,
      data: Buffer | string,
      optionsOrCb?:
        | {
            flag?: string;
          }
        | ((error?: ErrorLike | null) => void),
      cb?: (error?: ErrorLike | null) => void
    ) => void;
  };
}

declare module "browserfs/dist/node/core/api_error" {
  export interface ApiError extends Error {
    code: string;
    errno?: number;
    path?: string;
  }
}

declare module "browserfs/dist/node/core/file_system" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type BFSCallback<T> = (error?: any, data?: T) => void;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface FileSystem {}
}

declare module "browserfs/dist/node/backend/OverlayFS" {
  export default interface OverlayFS {
    getOverlayedFileSystems: () => {
      readable?: unknown;
      writable?: unknown;
    };
  }
}

declare module "browserfs/dist/node/backend/IndexedDB" {
  export default interface IndexedDBFileSystem {
    empty?: (cb: (error?: import("browserfs/dist/node/core/api_error").ApiError | null) => void) => void; // eslint-disable-line @typescript-eslint/consistent-type-imports
    getName: () => string;
  }
}

declare module "browserfs/dist/node/backend/HTTPRequest" {
  export default interface HTTPRequest {
    empty: () => void;
  }
}

declare module "browserfs/dist/node/backend/InMemory" {
  export default interface InMemoryFileSystem {
    empty?: (cb: (error?: import("browserfs/dist/node/core/api_error").ApiError | null) => void) => void; // eslint-disable-line @typescript-eslint/consistent-type-imports
    getName: () => string;
  }
}

declare module "browserfs/dist/node/backend/Emscripten" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export default interface EmscriptenFileSystem {}
}

declare module "browserfs/dist/node/backend/MountableFileSystem" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export default interface MountableFileSystem {}
}

declare module "browserfs/dist/node/backend/ZipFS" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export default interface ZipFS {}
}

declare module "browserfs/dist/node/backend/IsoFS" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export default interface IsoFS {}
}
