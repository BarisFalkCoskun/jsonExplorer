describe("patchDocument error handling", () => {
  it("collects errors from failed patch operations via Promise.allSettled", async () => {
    const mockPatch = jest.fn()
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce("ok");

    const entries = ["a.json", "b.json", "c.json"];

    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        await mockPatch(entry, { category: "fruit" });
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(1);
    expect((failures[0] as { reason: Error; status: string }).reason.message).toBe("Network error");

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes).toHaveLength(2);
  });

  it("all succeed when no errors", async () => {
    const mockPatch = jest.fn().mockResolvedValue("ok");

    const entries = ["a.json", "b.json"];

    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        await mockPatch(entry, { dismissed: true });
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(0);
  });

  it("all failures are collected when everything fails", async () => {
    const mockPatch = jest.fn().mockRejectedValue(new Error("Server down"));

    const entries = ["a.json", "b.json", "c.json"];

    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        await mockPatch(entry, { category: "fruit" });
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    expect(failures).toHaveLength(3);
  });
});
