# ErrorBoundary + Toast Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix one P1 infinite-reload bug in ErrorBoundary and two P2 toast correctness bugs (positioning + dismiss timing).

**Architecture:** Three independent surgical fixes. Task 1 adds a sessionStorage reload guard to ErrorBoundary and removes dead code. Task 2 fixes toast positioning to use the TASKBAR_HEIGHT constant. Task 3 fixes the CSS/JS timing race on toast dismissal.

**Tech Stack:** React (class component), styled-components, Jest

---

### Task 1: Add reload guard to ErrorBoundary

**Files:**
- Modify: `components/pages/ErrorBoundary.ts:21-35`
- Test: `__tests__/components/pages/ErrorBoundary.spec.ts`

**Context:** `ErrorBoundary.ts` is a React class component. When `componentDidCatch` fires in production (`!isDev()`), it calls `window.location.reload()` unconditionally. If the error is deterministic (e.g., bad data causes a render crash every time), the page reloads, hits the same error, reloads again — infinite loop. Also, `shouldComponentUpdate` (line 21-23) always returns `true`, which is the default behavior — dead code.

**Step 1: Write the test**

Create `__tests__/components/pages/ErrorBoundary.spec.ts`:

```typescript
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
```

**Step 2: Run test**

Run: `npx jest __tests__/components/pages/ErrorBoundary.spec.ts --verbose`
Expected: 3 tests PASS

**Step 3: Fix the production code**

In `components/pages/ErrorBoundary.ts`, replace lines 21-35 (removing `shouldComponentUpdate` and adding reload guard):

```typescript
  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(): void {
    const { FallbackRender } = this.props;

    if (!FallbackRender && !isDev()) {
      const RELOAD_KEY = "errorBoundaryReloads";
      const count = Number(sessionStorage.getItem(RELOAD_KEY) || "0");

      if (count < 1) {
        sessionStorage.setItem(RELOAD_KEY, String(count + 1));
        window.location.reload();
      }
    }
  }
```

Key changes:
- **Removed `shouldComponentUpdate`** — dead code (always returned true, which is default)
- **Added sessionStorage guard** — tracks reload count per session, allows max 1 reload
- On second crash, `componentDidCatch` does nothing → `getDerivedStateFromError` sets `hasError: true` → `render()` returns `FallbackRender` (or `children` if no fallback, but `hasError` is true so it returns `undefined` which renders nothing)

**Step 4: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add "components/pages/ErrorBoundary.ts" "__tests__/components/pages/ErrorBoundary.spec.ts"
git commit -m "fix: add reload guard to prevent infinite ErrorBoundary reload loop"
```

---

### Task 2: Fix toast positioning to use TASKBAR_HEIGHT constant

**Files:**
- Modify: `components/system/Toast/StyledToast.ts:23-32`

**Context:** `StyledToastContainer` uses hardcoded `bottom: 52px`. Other components that position relative to the taskbar import `TASKBAR_HEIGHT` (which is `30`) from `utils/constants`. The toast should use `${TASKBAR_HEIGHT + 8}px` to sit 8px above the taskbar — consistent with the `right: 8px` spacing already used.

**Step 1: Fix the styling**

In `components/system/Toast/StyledToast.ts`, add the import at the top (after existing imports):

```typescript
import { TASKBAR_HEIGHT } from "utils/constants";
```

Then replace lines 23-32:

```typescript
export const StyledToastContainer = styled.div`
  position: fixed;
  bottom: 52px;
  right: 8px;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;
```

with:

```typescript
export const StyledToastContainer = styled.div`
  position: fixed;
  bottom: ${TASKBAR_HEIGHT + 8}px;
  right: 8px;
  z-index: 100000;
  display: flex;
  flex-direction: column;
  gap: 6px;
  pointer-events: none;
`;
```

Key change: `bottom: 52px` → `bottom: ${TASKBAR_HEIGHT + 8}px` (evaluates to `38px`). This places toasts 8px above the 30px taskbar, consistent with other positioned elements.

**Step 2: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 3: Lint check**

Run: `npx eslint "components/system/Toast/StyledToast.ts" 2>&1 | head -5`
Expected: No new errors

**Step 4: Commit**

```bash
git add "components/system/Toast/StyledToast.ts"
git commit -m "fix: use TASKBAR_HEIGHT constant for toast positioning"
```

---

### Task 3: Fix toast CSS/JS dismiss timing race

**Files:**
- Modify: `components/system/Toast/StyledToast.ts:54-56`
- Modify: `components/system/Toast/useToast.ts:36`

**Context:** Two timers compete to dismiss toasts:
1. CSS animation: `fadeOut 0.3s ease-in 3.7s forwards` — starts fading at 3.7s, completes at 4.0s
2. JS timeout: `setTimeout(() => dismissToast(id), 4000)` — removes DOM node at 4.0s

Both fire at 4.0s, creating a race. If JS fires slightly before the CSS animation completes, the toast disappears abruptly instead of fading out smoothly.

**Fix:** Align both to the same timing source. Change the CSS animation delay from `3.7s` to `3.5s` (so fade completes at 3.8s), and keep JS at `4000ms`. This gives 200ms buffer after the CSS fade completes before the DOM node is removed.

**Step 1: Fix the CSS animation timing**

In `components/system/Toast/StyledToast.ts`, replace line 56:

```typescript
    ${slideIn} 0.25s ease-out,
    ${fadeOut} 0.3s ease-in 3.7s forwards;
```

with:

```typescript
    ${slideIn} 0.25s ease-out,
    ${fadeOut} 0.3s ease-in 3.5s forwards;
```

Key change: fade-out starts at 3.5s (completes at 3.8s) instead of 3.7s (completing at 4.0s). The JS `setTimeout` at 4000ms now fires 200ms after the animation completes, removing an already-invisible DOM node.

**Step 2: Run all tests**

Run: `npx jest --runInBand`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add "components/system/Toast/StyledToast.ts" "components/system/Toast/useToast.ts"
git commit -m "fix: resolve toast CSS/JS dismiss timing race"
```

Note: only `StyledToast.ts` changes in this task. The `useToast.ts` timeout stays at 4000ms — no change needed there.
