const ALLOWED_METHODS: Record<string, string[]> = {
  'collections': ['GET'],
  'databases': ['GET'],
  'document': ['DELETE', 'GET', 'PATCH', 'PUT'],
  'documents': ['GET'],
  'drop-collection': ['DELETE'],
  'drop-database': ['DELETE'],
  'images': ['GET'],
  'mkdir': ['POST'],
  'test': ['GET'],
};

const isMethodAllowed = (operation: string, method: string): boolean => {
  const allowed = ALLOWED_METHODS[operation];
  return allowed ? allowed.includes(method) : false;
};

describe("API method guards", () => {
  it("rejects GET for mkdir", () => {
    expect(isMethodAllowed("mkdir", "GET")).toBe(false);
  });

  it("allows POST for mkdir", () => {
    expect(isMethodAllowed("mkdir", "POST")).toBe(true);
  });

  it("rejects GET for drop-collection", () => {
    expect(isMethodAllowed("drop-collection", "GET")).toBe(false);
  });

  it("allows DELETE for drop-collection", () => {
    expect(isMethodAllowed("drop-collection", "DELETE")).toBe(true);
  });

  it("rejects POST for drop-database", () => {
    expect(isMethodAllowed("drop-database", "POST")).toBe(false);
  });

  it("allows DELETE for drop-database", () => {
    expect(isMethodAllowed("drop-database", "DELETE")).toBe(true);
  });

  it("allows GET for read-only operations", () => {
    for (const op of ["databases", "collections", "documents", "images", "test"]) {
      expect(isMethodAllowed(op, "GET")).toBe(true);
    }
  });

  it("rejects POST for read-only operations", () => {
    for (const op of ["databases", "collections", "documents", "images", "test"]) {
      expect(isMethodAllowed(op, "POST")).toBe(false);
    }
  });

  it("allows all CRUD methods for document", () => {
    expect(isMethodAllowed("document", "GET")).toBe(true);
    expect(isMethodAllowed("document", "PATCH")).toBe(true);
    expect(isMethodAllowed("document", "PUT")).toBe(true);
    expect(isMethodAllowed("document", "DELETE")).toBe(true);
  });

  it("rejects unknown operations", () => {
    expect(isMethodAllowed("unknown", "GET")).toBe(false);
  });
});
