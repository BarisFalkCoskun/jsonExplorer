// Import or redefine the sanitizeFilter function for testing
const SAFE_FILTER_OPERATORS = new Set([
  '$all', '$and', '$elemMatch', '$eq', '$exists',
  '$gt', '$gte', '$in', '$lt', '$lte',
  '$ne', '$nin', '$nor', '$not', '$options',
  '$or', '$regex', '$size', '$type',
]);

const sanitizeFilter = (obj: unknown): void => {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key.startsWith('$') && !SAFE_FILTER_OPERATORS.has(key)) {
      throw new Error(`Disallowed filter operator: ${key}`);
    }
    if (Array.isArray(value)) {
      for (const item of value) sanitizeFilter(item);
    } else if (value && typeof value === 'object') {
      sanitizeFilter(value);
    }
  }
};

describe("sanitizeFilter", () => {
  it("allows safe operators", () => {
    expect(() => sanitizeFilter({ category: { $exists: true } })).not.toThrow();
    expect(() => sanitizeFilter({ $and: [{ a: 1 }, { b: 2 }] })).not.toThrow();
    expect(() => sanitizeFilter({ name: { $regex: "test", $options: "i" } })).not.toThrow();
    expect(() => sanitizeFilter({ count: { $gt: 5, $lt: 100 } })).not.toThrow();
  });

  it("rejects $where operator", () => {
    expect(() => sanitizeFilter({ $where: "this.a > 1" })).toThrow("Disallowed filter operator: $where");
  });

  it("rejects $expr operator", () => {
    expect(() => sanitizeFilter({ $expr: { $gt: ["$a", "$b"] } })).toThrow("Disallowed filter operator: $expr");
  });

  it("rejects $function operator", () => {
    expect(() => sanitizeFilter({ $function: { body: "return true" } })).toThrow("Disallowed filter operator: $function");
  });

  it("rejects nested dangerous operators", () => {
    expect(() => sanitizeFilter({ $and: [{ $where: "true" }] })).toThrow("Disallowed filter operator: $where");
  });

  it("allows plain field filters", () => {
    expect(() => sanitizeFilter({ name: "test", category: "fruit" })).not.toThrow();
  });

  it("handles null and primitives gracefully", () => {
    expect(() => sanitizeFilter(null)).not.toThrow();
    expect(() => sanitizeFilter("string")).not.toThrow();
    expect(() => sanitizeFilter(42)).not.toThrow();
  });
});
