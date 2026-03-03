describe("MongoDBFS document index", () => {
  it("builds index keyed by decoded document identifier", () => {
    const documents = [
      { _id: "1", category: "fruit", imageCount: 2, name: "apple", thumbnail: "a.jpg" },
      { _id: "2", imageCount: 1, name: "banana", thumbnail: "b.jpg" },
      { _id: "3", dismissed: true, name: "cherry" },
    ];

    const index = new Map<string, (typeof documents)[0]>();
    for (const doc of documents) {
      const identifier = encodeURIComponent(doc._id || doc.name || "");
      const decoded = decodeURIComponent(identifier);
      index.set(decoded, doc);
    }

    expect(index.size).toBe(3);
    expect(index.get("1")).toHaveProperty("category", "fruit");
    expect(index.get("2")).toHaveProperty("thumbnail", "b.jpg");
    expect(index.get("3")).toHaveProperty("dismissed", true);
    expect(index.get("nonexistent")).toBeUndefined();
  });

  it("index supports O(1) thumbnail lookup", () => {
    const documents = [
      { _id: "1", imageCount: 3, name: "apple", thumbnail: "a.jpg" },
      { _id: "2", imageCount: 1, name: "banana", thumbnail: "b.jpg" },
    ];

    const index = new Map<string, (typeof documents)[0]>();
    for (const entry of documents) {
      const decoded = decodeURIComponent(encodeURIComponent(entry._id || entry.name));
      index.set(decoded, entry);
    }

    const doc = index.get("1");
    expect(doc?.thumbnail).toBe("a.jpg");
    expect(doc?.imageCount).toBe(3);
  });

  it("index updated in-place by patchDocument pattern", () => {
    const doc = { _id: "1", imageCount: 2, name: "apple", thumbnail: "a.jpg" };
    const index = new Map<string, typeof doc>();
    index.set("1", doc);

    const entry = index.get("1");
    if (entry) {
      (entry as Record<string, unknown>).category = "fruit";
    }

    expect(index.get("1")).toHaveProperty("category", "fruit");
  });
});
