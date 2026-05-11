// Validate that a redirect target is same-origin before navigating.
// Prevents open redirect attacks where an attacker-controlled value
// (e.g., from localStorage or postMessage) could redirect to an external URL.
export function safeRedirect(target, fallback = '/') {
  if (!target) {
    window.location.href = fallback;
    return;
  }
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) {
      console.warn('[safeRedirect] Blocked cross-origin redirect to:', url.origin);
      window.location.href = fallback;
      return;
    }
    window.location.href = url.pathname + url.search + url.hash;
  } catch {
    window.location.href = fallback;
  }
}
