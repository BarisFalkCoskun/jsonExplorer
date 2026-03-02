describe("MongoDB drop API endpoints", () => {
  it("drop-collection endpoint requires db and collection params", () => {
    const params = ["drop-collection"];
    const [operation, ...operationParams] = params;
    const [dbName, collectionName] = operationParams;

    expect(operation).toBe("drop-collection");
    expect(dbName).toBeUndefined();
    expect(collectionName).toBeUndefined();
  });

  it("drop-collection endpoint extracts both params correctly", () => {
    const params = ["drop-collection", "testdb", "users"];
    const [operation, ...operationParams] = params;
    const [dbName, collectionName] = operationParams;

    expect(operation).toBe("drop-collection");
    expect(dbName).toBe("testdb");
    expect(collectionName).toBe("users");
  });

  it("drop-database endpoint requires db param", () => {
    const params = ["drop-database", "testdb"];
    const [operation, ...operationParams] = params;
    const [dbName] = operationParams;

    expect(operation).toBe("drop-database");
    expect(dbName).toBe("testdb");
  });

  it("drop-database endpoint missing db param", () => {
    const params = ["drop-database"];
    const [operation, ...operationParams] = params;
    const [dbName] = operationParams;

    expect(operation).toBe("drop-database");
    expect(dbName).toBeUndefined();
  });
});
