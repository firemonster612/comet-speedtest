/** The base that relative config URLs resolve against when the caller passes none. */
export function defaultBaseUrl(): string {
  return typeof location === "undefined" ? "http://localhost/" : location.href;
}

export function isResolvableUrl(value: string, baseUrl: string): boolean {
  try {
    new URL(value, baseUrl);
    return true;
  } catch {
    return false;
  }
}
