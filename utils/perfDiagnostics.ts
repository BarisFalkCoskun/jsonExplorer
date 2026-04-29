const PERF_DIAGNOSTICS_STORAGE_KEY = "jsonExplorerPerfDiagnostics";

declare global {
  interface Window {
    __JSON_EXPLORER_PERF__?: boolean;
  }
}

let browserDiagnosticsEnabled: boolean | undefined;

export const isPerfDiagnosticsEnabled = (): boolean => {
  if (typeof window === "undefined") return false;

  if (browserDiagnosticsEnabled !== undefined) {
    return browserDiagnosticsEnabled;
  }

  try {
    browserDiagnosticsEnabled =
      window.__JSON_EXPLORER_PERF__ === true ||
      window.localStorage?.getItem(PERF_DIAGNOSTICS_STORAGE_KEY) === "1";
  } catch {
    browserDiagnosticsEnabled = false;
  }

  return browserDiagnosticsEnabled;
};

export const isServerPerfDiagnosticsEnabled = (): boolean =>
  process.env.JSON_EXPLORER_PERF === "1";

export const getPerfNow = (): number =>
  typeof performance === "undefined" ? Date.now() : performance.now();

export const getPerfDuration = (startedAt: number): number =>
  Number((getPerfNow() - startedAt).toFixed(1));

export const logPerf = (
  eventName: string,
  details: Record<string, unknown>
): void => {
  if (!isPerfDiagnosticsEnabled()) return;

  console.info(`[jsonExplorer:perf] ${eventName}`, details);
};

export const logServerPerf = (
  eventName: string,
  details: Record<string, unknown>
): void => {
  if (!isServerPerfDiagnosticsEnabled()) return;

  console.info(`[jsonExplorer:perf] ${eventName}`, details);
};
