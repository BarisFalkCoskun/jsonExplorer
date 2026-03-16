/* eslint-disable react/function-component-definition -- function declarations are used here to stay compatible with jest.mock hoisting */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ThemeProvider } from "styled-components";
import defaultTheme from "styles/defaultTheme";
import FileManager from "components/system/Files/FileManager";
import { type FileStat } from "components/system/Files/FileManager/functions";
import useFolder from "components/system/Files/FileManager/useFolder";
import useFocusableEntries from "components/system/Files/FileManager/useFocusableEntries";
import useSelection from "components/system/Files/FileManager/Selection/useSelection";
import useDraggableEntries from "components/system/Files/FileManager/useDraggableEntries";
import useFileDrop from "components/system/Files/FileManager/useFileDrop";
import useFileKeyboardShortcuts from "components/system/Files/FileManager/useFileKeyboardShortcuts";
import useFolderContextMenu from "components/system/Files/FileManager/useFolderContextMenu";
import { useFileSystem } from "contexts/fileSystem";
import { useSession } from "contexts/session";
import { useToast } from "components/system/Toast/useToast";

function DynamicComponentMock(): React.JSX.Element {
  return <span data-testid="dynamic-component" />;
}

function nextDynamicMock(): typeof DynamicComponentMock {
  return DynamicComponentMock;
}

function FileEntryMock({ name }: Readonly<{ name: string }>): React.JSX.Element {
  return (
  <div data-testid="entry-name">{name}</div>
  );
}

jest.mock("next/dynamic", () => nextDynamicMock);
jest.mock("components/system/Files/FileEntry", () => ({
  __esModule: true,
  default: FileEntryMock,
}));
jest.mock("components/system/Files/FileManager/useFolder");
jest.mock("components/system/Files/FileManager/useFocusableEntries");
jest.mock("components/system/Files/FileManager/Selection/useSelection");
jest.mock("components/system/Files/FileManager/useDraggableEntries");
jest.mock("components/system/Files/FileManager/useFileDrop");
jest.mock("components/system/Files/FileManager/useFileKeyboardShortcuts");
jest.mock("components/system/Files/FileManager/useFolderContextMenu");
jest.mock("contexts/fileSystem");
jest.mock("contexts/session");
jest.mock("components/system/Toast/useToast");

const mockedUseFolder = jest.mocked(useFolder);
const mockedUseFocusableEntries = jest.mocked(useFocusableEntries);
const mockedUseSelection = jest.mocked(useSelection);
const mockedUseDraggableEntries = jest.mocked(useDraggableEntries);
const mockedUseFileDrop = jest.mocked(useFileDrop);
const mockedUseFileKeyboardShortcuts = jest.mocked(useFileKeyboardShortcuts);
const mockedUseFolderContextMenu = jest.mocked(useFolderContextMenu);
const mockedUseFileSystem = jest.mocked(useFileSystem);
const mockedUseSession = jest.mocked(useSession);
const mockedUseToast = jest.mocked(useToast);

const createFileStat = (): FileStat =>
  ({
    atime: new Date(0),
    atimeMs: 0,
    birthtime: new Date(0),
    birthtimeMs: 0,
    ctime: new Date(0),
    ctimeMs: 0,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => false,
    isFIFO: () => false,
    isFile: () => true,
    isSocket: () => false,
    isSymbolicLink: () => false,
    mode: 33188,
    mtime: new Date(0),
    mtimeMs: 0,
    size: -1,
  }) as FileStat;

const makeFiles = (count: number): Record<string, FileStat> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `file-${index}.json`,
      createFileStat(),
    ])
  );

let currentClientHeight = 220;
let currentClientWidth = 240;

describe("FileManager virtualization integration", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => currentClientHeight,
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get: () => currentClientWidth,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 4000,
    });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: class {
        public disconnect(): void { /* noop */ }

        public observe(): void { /* noop */ }

        public unobserve(): void { /* noop */ }
      },
      writable: true,
    });
  });

  beforeEach(() => {
    currentClientHeight = 220;
    currentClientWidth = 240;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    mockedUseSession.mockReturnValue({
      hideCategorized: false,
      hideDismissed: false,
      iconZoomLevel: 2,
      setHideCategorized: jest.fn(),
      setHideDismissed: jest.fn(),
      setIconZoomLevel: jest.fn(),
      setViews: jest.fn(),
      views: {},
    } as unknown as ReturnType<typeof useSession>);
    mockedUseToast.mockReturnValue({
      showToast: jest.fn(),
    });
    mockedUseFileSystem.mockReturnValue({
      lstat: jest.fn(() => Promise.resolve({ isDirectory: () => false })),
      mountFs: jest.fn(),
      rootFs: undefined,
    } as unknown as ReturnType<typeof useFileSystem>);
    mockedUseFocusableEntries.mockReturnValue({
      blurEntry: jest.fn(),
      focusEntry: jest.fn(),
      focusableEntry: () => ({
        $labelHeightOffset: 0,
        onBlurCapture: jest.fn(),
        onFocusCapture: jest.fn(),
        onMouseDown: jest.fn(),
        onMouseUp: jest.fn(),
      }),
      focusedEntries: [],
    });
    mockedUseSelection.mockReturnValue({
      isSelecting: false,
      selectionEvents: { onMouseDown: jest.fn() },
      selectionRect: undefined,
      selectionStyling: {},
    });
    mockedUseDraggableEntries.mockReturnValue(
      (() => ({
        draggable: false,
        onDragEnd: jest.fn(),
        onDragStart: jest.fn(),
      })) as never
    );
    mockedUseFileDrop.mockReturnValue({
      onDragOver: jest.fn(),
      onDrop: jest.fn(),
    } as never);
    mockedUseFileKeyboardShortcuts.mockReturnValue(jest.fn());
    mockedUseFolderContextMenu.mockReturnValue({
      onContextMenuCapture: jest.fn(),
    } as never);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  const renderManager = (options: {
    files: Record<string, FileStat>;
    url?: string;
    view?: "icon" | "list";
  }): void => {
    const { files, url = "/test", view = "icon" } = options;

    mockedUseSession.mockReturnValue({
      hideCategorized: false,
      hideDismissed: false,
      iconZoomLevel: 2,
      setHideCategorized: jest.fn(),
      setHideDismissed: jest.fn(),
      setIconZoomLevel: jest.fn(),
      setViews: jest.fn(),
      views: view === "icon" ? {} : { [url]: view },
    } as unknown as ReturnType<typeof useSession>);

    mockedUseFolder.mockReturnValue({
      fileActions: {} as never,
      files,
      folderActions: {
        addToFolder: jest.fn(),
        newPath: jest.fn(),
        pasteToFolder: jest.fn(),
        resetFiles: jest.fn(),
        sortByOrder: [["name", true], jest.fn()],
      },
      hasMore: false,
      isLoading: false,
      loadMore: jest.fn(),
      setFiles: jest.fn(),
      updateFiles: jest.fn(),
    });

    act(() => {
      root.render(
        <ThemeProvider theme={defaultTheme}>
          <FileManager showStatusBar={false} url={url} hideLoading />
        </ThemeProvider>
      );
    });
  };

  it("renders only a windowed slice for large list folders", () => {
    renderManager({ files: makeFiles(400), view: "list" });

    const renderedEntries = container.querySelectorAll("li[data-virtual-entry='true']");

    expect(renderedEntries).toHaveLength(14);
    expect(container.textContent).toContain("file-0.json");
    expect(container.textContent).not.toContain("file-40.json");
  });

  it("updates the rendered slice when a large list folder scrolls", () => {
    renderManager({ files: makeFiles(400), view: "list" });

    const listElement = container.querySelector("ol");
    expect(listElement).toBeTruthy();

    act(() => {
      Object.defineProperty(listElement as Element, "scrollTop", {
        configurable: true,
        value: 400,
      });
      listElement?.dispatchEvent(new Event("scroll"));
    });

    expect(container.textContent).toContain("file-18.json");
    expect(container.textContent).not.toContain("file-0.json");
  });

  it("renders only a windowed slice for large icon folders", () => {
    currentClientWidth = 240;
    currentClientHeight = 220;

    renderManager({ files: makeFiles(120), view: "icon" });

    const renderedEntries = container.querySelectorAll("li[data-virtual-entry='true']");

    expect(renderedEntries).toHaveLength(15);
    expect(container.textContent).toContain("file-0.json");
    expect(container.textContent).not.toContain("file-50.json");
  });

  it("renders all entries when the folder stays below the icon virtualization threshold", () => {
    renderManager({ files: makeFiles(40), view: "icon" });

    const renderedEntries = container.querySelectorAll("li[data-virtual-entry='true']");

    expect(renderedEntries).toHaveLength(40);
  });
});
