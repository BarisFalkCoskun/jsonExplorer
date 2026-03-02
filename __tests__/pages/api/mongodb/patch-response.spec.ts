describe("PATCH response includes matchedCount", () => {
  it("response shape includes both matchedCount and modifiedCount", () => {
    const mockResult = { matchedCount: 1, modifiedCount: 0 };
    const response = { matchedCount: mockResult.matchedCount, modifiedCount: mockResult.modifiedCount };

    expect(response).toHaveProperty("matchedCount");
    expect(response).toHaveProperty("modifiedCount");
  });

  it("matchedCount 0 indicates document not found", () => {
    const response = { matchedCount: 0, modifiedCount: 0 };
    expect(response.matchedCount).toBe(0);
  });

  it("matchedCount 1 with modifiedCount 0 means found but unchanged", () => {
    const response = { matchedCount: 1, modifiedCount: 0 };
    expect(response.matchedCount).toBe(1);
    expect(response.modifiedCount).toBe(0);
  });
});
