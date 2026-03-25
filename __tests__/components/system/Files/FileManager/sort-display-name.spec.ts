import { sortFiles } from "components/system/Files/FileManager/functions";

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
});
