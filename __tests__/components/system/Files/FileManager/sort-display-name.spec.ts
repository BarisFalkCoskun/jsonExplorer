import {
  matchesFileFilter,
  sortFiles,
} from "components/system/Files/FileManager/functions";

const createFileStat = (displayName?: string) =>
  ({
    displayName,
    isDirectory: () => false,
    size: 1,
  }) as unknown as Parameters<typeof sortFiles>[1][string];

describe("Mongo-style display name sorting", () => {
  it("sorts by displayName before falling back to the internal file key", () => {
    const files = {
      "z-id.json": createFileStat("Apple"),
      "a-id.json": createFileStat("Banana"),
      "b-id.json": createFileStat("Apple"),
    };

    expect(Object.keys(sortFiles("/test", files, "name", true))).toEqual([
      "b-id.json",
      "z-id.json",
      "a-id.json",
    ]);
  });

  it("matches folder filters against displayName before falling back to the file key", () => {
    expect(
      matchesFileFilter("internal-honey.json", createFileStat("Wildflower Honey"), "flower")
    ).toBe(true);
    expect(
      matchesFileFilter("internal-honey.json", createFileStat("Wildflower Honey"), "internal")
    ).toBe(true);
    expect(
      matchesFileFilter("internal-honey.json", createFileStat("Wildflower Honey"), "maple")
    ).toBe(false);
  });
});
