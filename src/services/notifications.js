// Lightweight notifier so services can signal UI without React import
const listeners = new Set()

export function onNotify(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function notify(payload) {
  for (const fn of listeners) {
    try {
      fn(payload)
    } catch (e) {
      console.error('Notification listener error:', e)
    }
  }
}
