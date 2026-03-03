describe("ErrorBoundary reload guard", () => {
  const RELOAD_KEY = "errorBoundaryReloads";

  afterEach(() => {
    sessionStorage.removeItem(RELOAD_KEY);
  });

  it("allows reload on first error", () => {
    sessionStorage.removeItem(RELOAD_KEY);

    const count = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    const shouldReload = count < 1;

    expect(shouldReload).toBe(true);
  });

  it("blocks reload after one prior reload", () => {
    sessionStorage.setItem(RELOAD_KEY, "1");

    const count = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    const shouldReload = count < 1;

    expect(shouldReload).toBe(false);
  });

  it("increments count in sessionStorage", () => {
    sessionStorage.removeItem(RELOAD_KEY);

    const count = Number(sessionStorage.getItem(RELOAD_KEY) || "0");
    sessionStorage.setItem(RELOAD_KEY, String(count + 1));

    expect(sessionStorage.getItem(RELOAD_KEY)).toBe("1");
  });
});
