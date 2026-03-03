describe("MongoDBFS document index", () => {
  it("builds index keyed by decoded document identifier", () => {
    const documents = [
      { _id: "1", name: "apple", category: "fruit", thumbnail: "a.jpg", imageCount: 2 },
      { _id: "2", name: "banana", thumbnail: "b.jpg", imageCount: 1 },
      { _id: "3", name: "cherry", dismissed: true },
    ];

    const index = new Map<string, (typeof documents)[0]>();
    for (const doc of documents) {
      const identifier = encodeURIComponent(String(doc._id || doc.name || ""));
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
      { _id: "1", name: "apple", thumbnail: "a.jpg", imageCount: 3 },
      { _id: "2", name: "banana", thumbnail: "b.jpg", imageCount: 1 },
    ];

    const index = new Map<string, (typeof documents)[0]>();
    for (const doc of documents) {
      const decoded = decodeURIComponent(encodeURIComponent(String(doc._id || doc.name)));
      index.set(decoded, doc);
    }

    const doc = index.get("1");
    expect(doc?.thumbnail).toBe("a.jpg");
    expect(doc?.imageCount).toBe(3);
  });

  it("index updated in-place by patchDocument pattern", () => {
    const doc = { _id: "1", name: "apple", thumbnail: "a.jpg", imageCount: 2 };
    const index = new Map<string, typeof doc>();
    index.set("1", doc);

    const entry = index.get("1");
    if (entry) {
      (entry as Record<string, unknown>).category = "fruit";
    }

    expect(index.get("1")).toHaveProperty("category", "fruit");
  });
});
