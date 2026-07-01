if (typeof self !== 'undefined') {
  if (typeof (self as any).global === 'undefined') {
    (self as any).global = self;
  }
  if (typeof (self as any).exports === 'undefined') {
    (self as any).exports = {};
  }
  if (typeof (self as any).process === 'undefined') {
    (self as any).process = { env: {} };
  }
}
