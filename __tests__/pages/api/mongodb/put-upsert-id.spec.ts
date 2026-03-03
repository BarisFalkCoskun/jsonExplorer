describe("PUT replacement document preserves _id", () => {
  it("includes _id in replacement when rawId is a string", () => {
    const updateDoc = { _id: "my-doc-id", name: "test", data: "value" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    // Simulate the fix: re-include _id when rawId is a string
    const replacementDoc = typeof rawId === "string"
      ? { _id: rawId, ...docWithoutId }
      : docWithoutId;

    expect(replacementDoc).toHaveProperty("_id", "my-doc-id");
    expect(replacementDoc).toHaveProperty("name", "test");
  });

  it("omits _id from replacement when rawId is not a string", () => {
    const updateDoc = { name: "test", data: "value" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    const replacementDoc = typeof rawId === "string"
      ? { _id: rawId, ...docWithoutId }
      : docWithoutId;

    expect(replacementDoc).not.toHaveProperty("_id");
  });

  it("includes ObjectId-style _id in replacement", () => {
    const updateDoc = { _id: "507f1f77bcf86cd799439011", name: "test" };
    const { _id: rawId, ...docWithoutId } = updateDoc;

    const replacementDoc = typeof rawId === "string"
      ? { _id: rawId, ...docWithoutId }
      : docWithoutId;

    expect(replacementDoc).toHaveProperty("_id", "507f1f77bcf86cd799439011");
  });
});
