import { getBackspaceShortcutAction } from "components/system/Files/FileManager/useFileKeyboardShortcuts";

describe("getBackspaceShortcutAction", () => {
  it("deletes selected entries before navigating up", () => {
    expect(
      getBackspaceShortcutAction(["first.json"], "FileExplorer/Docs")
    ).toBe("delete");
  });

  it("navigates up when no entries are selected in a file explorer window", () => {
    expect(getBackspaceShortcutAction([], "FileExplorer/Docs")).toBe(
      "navigateUp"
    );
  });

  it("does nothing when there is no selection or file explorer window id", () => {
    expect(getBackspaceShortcutAction([])).toBe("none");
  });
});
