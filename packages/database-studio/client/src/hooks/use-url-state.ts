import { useCallback, useSyncExternalStore } from "react";

function getSearch() {
  return window.location.search;
}

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => window.removeEventListener("popstate", callback);
}

/** Read a single URL search param reactively. */
export function useUrlParam(key: string): string | null {
  const search = useSyncExternalStore(subscribe, getSearch);
  return new URLSearchParams(search).get(key);
}

/** Update URL search params without a page reload. */
export function setUrlParams(updates: Record<string, string | null>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }
  const search = params.toString();
  const url = search ? `?${search}` : window.location.pathname;
  window.history.replaceState(null, "", url);
  // Notify subscribers
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/** Hook that returns a setter for URL params. */
export function useSetUrlParams() {
  return useCallback(setUrlParams, []);
}
