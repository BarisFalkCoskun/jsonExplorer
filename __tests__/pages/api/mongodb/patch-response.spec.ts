import { getDocumentFilters } from "utils/mongoApi";

describe("PATCH $set/$unset split logic", () => {
  it("puts non-null values in $set", () => {
    const updates: Record<string, unknown> = {
      category: "fruit",
      name: "apple",
    };
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [field, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        unsetFields[field] = "";
      } else {
        setFields[field] = value;
      }
    }

    expect(setFields).toEqual({ category: "fruit", name: "apple" });
    expect(Object.keys(unsetFields)).toHaveLength(0);
  });

  it("puts null values in $unset", () => {
    const updates: Record<string, unknown> = {
      // eslint-disable-next-line unicorn/no-null -- testing MongoDB $unset split logic requires null
      category: null,
      // eslint-disable-next-line unicorn/no-null -- testing MongoDB $unset split logic requires null
      dismissed: null,
    };
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [field, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        unsetFields[field] = "";
      } else {
        setFields[field] = value;
      }
    }

    expect(Object.keys(setFields)).toHaveLength(0);
    expect(unsetFields).toEqual({ category: "", dismissed: "" });
  });

  it("splits mixed updates correctly", () => {
    const updates: Record<string, unknown> = {
      category: "fruit",
      // eslint-disable-next-line unicorn/no-null -- testing MongoDB $unset split logic requires null
      dismissed: null,
      name: "apple",
    };
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [field, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        unsetFields[field] = "";
      } else {
        setFields[field] = value;
      }
    }

    expect(setFields).toEqual({ category: "fruit", name: "apple" });
    expect(unsetFields).toEqual({ dismissed: "" });
  });

  it("builds updateOps with both $set and $unset when present", () => {
    const setFields = { category: "fruit" };
    const unsetFields = { dismissed: "" };
    const updateOps: Record<string, unknown> = {};

    if (Object.keys(setFields).length > 0) updateOps.$set = setFields;
    if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;

    expect(updateOps).toEqual({
      $set: { category: "fruit" },
      $unset: { dismissed: "" },
    });
  });

  it("omits $set when only $unset is needed", () => {
    const setFields: Record<string, unknown> = {};
    const unsetFields = { category: "" };
    const updateOps: Record<string, unknown> = {};

    if (Object.keys(setFields).length > 0) updateOps.$set = setFields;
    if (Object.keys(unsetFields).length > 0) updateOps.$unset = unsetFields;

    expect(updateOps).toEqual({ $unset: { category: "" } });
    expect(updateOps).not.toHaveProperty("$set");
  });
});

describe("document patch filters", () => {
  it("matches canonical numeric MongoDB _id values", () => {
    expect(getDocumentFilters("123")).toContainEqual({ _id: 123 });
    expect(getDocumentFilters("-42")).toContainEqual({ _id: -42 });
  });

  it("does not coerce padded string ids into numbers", () => {
    expect(getDocumentFilters("00123")).not.toContainEqual({ _id: 123 });
  });
});

describe("PATCH field validation", () => {
  it("rejects empty update object", () => {
    const updates: Record<string, unknown> = {};
    const setFields: Record<string, unknown> = {};
    const unsetFields: Record<string, string> = {};

    for (const [field, value] of Object.entries(updates)) {
      if (value === null || value === undefined) {
        unsetFields[field] = "";
      } else {
        setFields[field] = value;
      }
    }

    const hasUpdates =
      Object.keys(setFields).length > 0 || Object.keys(unsetFields).length > 0;
    expect(hasUpdates).toBe(false);
  });

  it("rejects $-prefixed field names", () => {
    const ILLEGAL_FIELD_PATTERN = /^\$|\./;

    expect(ILLEGAL_FIELD_PATTERN.test("$set")).toBe(true);
    expect(ILLEGAL_FIELD_PATTERN.test("$where")).toBe(true);
    expect(ILLEGAL_FIELD_PATTERN.test("dotted.path")).toBe(true);
    expect(ILLEGAL_FIELD_PATTERN.test("category")).toBe(false);
    expect(ILLEGAL_FIELD_PATTERN.test("dismissed")).toBe(false);
  });
});
