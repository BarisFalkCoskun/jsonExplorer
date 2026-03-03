import { sanitizeFilter } from "utils/mongoApi";

describe("sanitizeFilter", () => {
  it("allows safe operators", () => {
    expect(() => sanitizeFilter({ category: { $exists: true } })).not.toThrow();
    expect(() => sanitizeFilter({ $and: [{ a: 1 }, { b: 2 }] })).not.toThrow();
    expect(() => sanitizeFilter({ name: { $options: "i", $regex: "test" } })).not.toThrow();
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
    expect(() => sanitizeFilter({ category: "fruit", name: "test" })).not.toThrow();
  });

  it("handles null and primitives gracefully", () => {
    // eslint-disable-next-line unicorn/no-null -- testing null input handling
    expect(() => sanitizeFilter(null)).not.toThrow();
    expect(() => sanitizeFilter("string")).not.toThrow();
    expect(() => sanitizeFilter(42)).not.toThrow();
  });
});
