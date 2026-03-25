import { getPreferredMongoDocumentLabel } from "utils/mongoDocument";

describe("getPreferredMongoDocumentLabel", () => {
  it("prefers name over title and _id", () => {
    expect(
      getPreferredMongoDocumentLabel({
        _id: "doc-1",
        name: "Apple",
        title: "Fallback title",
      })
    ).toBe("Apple");
  });

  it("falls back to title when name is missing", () => {
    expect(
      getPreferredMongoDocumentLabel({
        _id: "doc-2",
        title: "Only Title",
      })
    ).toBe("Only Title");
  });

  it("falls back to _id when both name and title are blank", () => {
    expect(
      getPreferredMongoDocumentLabel({
        _id: "doc-3",
        name: "   ",
        title: "",
      })
    ).toBe("doc-3");
  });
});
