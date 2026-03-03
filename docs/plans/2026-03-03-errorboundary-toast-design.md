# ErrorBoundary + Toast Fixes — Design

## Problem

One P1 reliability bug and two P2 toast correctness bugs.

## Fixes

### Fix 1 (P1): ErrorBoundary infinite reload guard
`ErrorBoundary.ts:29-34` — `componentDidCatch` calls `window.location.reload()` with no guard. Deterministic errors cause infinite reload loops. Fix: track reload count in sessionStorage, allow max 1 reload. Remove dead `shouldComponentUpdate`.

### Fix 2 (P2): Toast hardcoded bottom positioning
`StyledToast.ts:25` — `bottom: 52px` hardcoded. Fix: use TASKBAR_HEIGHT constant.

### Fix 3 (P2): Toast CSS/JS dismiss timing race
CSS fade-out completes at 4.0s, JS removes DOM at 4.0s — race condition. Fix: change JS timeout to 4100ms so CSS animation always completes before DOM removal.
