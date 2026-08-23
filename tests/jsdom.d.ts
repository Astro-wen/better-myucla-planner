// Minimal local typing so tests can build a second same-origin document realm
// without pulling in another dependency.
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string, options?: Record<string, unknown>);
    readonly window: Window & typeof globalThis;
  }
}
