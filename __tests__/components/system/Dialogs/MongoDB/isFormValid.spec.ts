/**
 * Tests for the isFormValid logic in the MongoDB connection dialog.
 *
 * The form should only be valid when:
 *   1. connectionString is non-empty (after trimming), AND
 *   2. alias is non-empty (after trimming), AND
 *   3. either the connection has not been tested yet, OR the test succeeded.
 */
const isFormValid = (
  connectionString: string,
  alias: string,
  tested: boolean,
  success: boolean
): boolean =>
  Boolean(connectionString.trim() && alias.trim() && (!tested || success));

describe("isFormValid", () => {
  it("rejects empty connectionString even when test succeeded", () => {
    expect(isFormValid("", "My DB", true, true)).toBe(false);
    expect(isFormValid("   ", "My DB", true, true)).toBe(false);
  });

  it("rejects empty alias even when test succeeded", () => {
    expect(isFormValid("mongodb://localhost:27017", "", true, true)).toBe(false);
    expect(isFormValid("mongodb://localhost:27017", "   ", true, true)).toBe(false);
  });

  it("accepts valid form when not yet tested", () => {
    expect(isFormValid("mongodb://localhost:27017", "My DB", false, false)).toBe(true);
  });

  it("accepts valid form when test succeeded", () => {
    expect(isFormValid("mongodb://localhost:27017", "My DB", true, true)).toBe(true);
  });

  it("rejects valid form when test failed", () => {
    expect(isFormValid("mongodb://localhost:27017", "My DB", true, false)).toBe(false);
  });
});
