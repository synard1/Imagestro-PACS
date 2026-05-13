// tests/setup.js - Global test setup for vitest
// Provides minimal browser-like globals for service tests

// Mock window.fetch if not available (node environment)
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = async () => new Response('{}', { status: 200 });
}

if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = class Headers {
    constructor(init = {}) {
      this._headers = {};
      if (init instanceof Headers) {
        init.forEach((value, key) => { this._headers[key.toLowerCase()] = value; });
      } else if (typeof init === 'object') {
        Object.entries(init).forEach(([key, value]) => { this._headers[key.toLowerCase()] = value; });
      }
    }
    set(key, value) { this._headers[key.toLowerCase()] = value; }
    get(key) { return this._headers[key.toLowerCase()] || null; }
    has(key) { return key.toLowerCase() in this._headers; }
    delete(key) { delete this._headers[key.toLowerCase()]; }
    forEach(cb) { Object.entries(this._headers).forEach(([k, v]) => cb(v, k)); }
    entries() { return Object.entries(this._headers); }
  };
}

if (typeof globalThis.Response === 'undefined') {
  globalThis.Response = class Response {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Headers(init.headers || {});
    }
    async text() { return this._body; }
    async json() { return JSON.parse(this._body); }
  };
}

if (typeof globalThis.AbortController === 'undefined') {
  globalThis.AbortController = class AbortController {
    constructor() {
      this.signal = { aborted: false, addEventListener: () => {} };
    }
    abort() { this.signal.aborted = true; }
  };
}

// Mock localStorage
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
}

// Mock crypto.randomUUID
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}
if (!globalThis.crypto.randomUUID) {
  globalThis.crypto.randomUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
}

// Mock import.meta.env
if (typeof globalThis.import === 'undefined') {
  // vitest handles import.meta.env automatically
}
