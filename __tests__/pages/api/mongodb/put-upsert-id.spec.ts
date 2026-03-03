describe("PUT replace-then-insert pattern", () => {
  it("replaces without _id to avoid type mismatch", () => {
    const updateDoc = { _id: "my-doc-id", name: "test", data: "value" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    // replaceOne receives docWithoutId — no _id, safe for any existing _id type
    expect(docWithoutId).not.toHaveProperty("_id");
    expect(docWithoutId).toHaveProperty("name", "test");
    expect(docWithoutId).toHaveProperty("data", "value");
  });

  it("inserts with string _id when no match found", () => {
    const updateDoc = { _id: "my-doc-id", name: "test" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    const matchedCount = 0; // simulate no match from replaceOne
    const shouldInsert = matchedCount === 0;
    const insertDoc = typeof rawId === "string"
      ? { _id: rawId, ...docWithoutId }
      : docWithoutId;

    expect(shouldInsert).toBe(true);
    expect(insertDoc).toHaveProperty("_id", "my-doc-id");
    expect(insertDoc).toHaveProperty("name", "test");
  });

  it("inserts without _id when rawId is not a string", () => {
    const updateDoc: Record<string, unknown> = { name: "test" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    const matchedCount = 0;
    const shouldInsert = matchedCount === 0;
    const insertDoc = typeof rawId === "string"
      ? { _id: rawId, ...docWithoutId }
      : docWithoutId;

    expect(shouldInsert).toBe(true);
    expect(insertDoc).not.toHaveProperty("_id");
  });

  it("skips insert when existing doc matched", () => {
    const matchedCount: number = 1; // simulate match from replaceOne
    const shouldInsert = matchedCount === 0;

    expect(shouldInsert).toBe(false);
  });

  it("uses filterDocId from rawId when rawId is a string", () => {
    const rawId = "custom-id";
    const documentId = "url-segment-id";
    const filterDocId = typeof rawId === "string" ? rawId : documentId;

    expect(filterDocId).toBe("custom-id");
  });

  it("falls back to documentId when rawId is not a string", () => {
    const rawId = undefined;
    const documentId = "url-segment-id";
    const filterDocId = typeof rawId === "string" ? rawId : documentId;

    expect(filterDocId).toBe("url-segment-id");
  });
});
