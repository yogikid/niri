// Tiny native assertions shared by the browser mini-runner and Node; no libraries.
const printable = (value) => { try { return JSON.stringify(value); } catch { return String(value); } };
const fail = (message = 'Assertion failed') => { const error = new Error(message); error.name = 'AssertionError'; throw error; };
function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}
export default {
  fail,
  ok(value, message) { if (!value) fail(message); },
  equal(actual, expected, message) { if (!Object.is(actual, expected)) fail(message ?? `Expected ${printable(expected)}, got ${printable(actual)}`); },
  deepEqual(actual, expected, message) { if (!deepEqual(actual, expected)) fail(message ?? `Expected ${printable(expected)}, got ${printable(actual)}`); },
  match(value, expression, message) { if (typeof value !== 'string' || !expression.test(value)) fail(message ?? `Expected text matching ${expression}`); },
  throws(fn, expected) { try { fn(); } catch (error) { if (expected && !Object.entries(expected).every(([key, value]) => error[key] === value)) fail(`Unexpected error ${error.name}: ${error.message}`); return error; } fail('Expected function to throw'); },
};
export async function readText(url) {
  if (typeof process !== 'undefined' && process.versions?.node) { const { readFile } = await import('node:fs/promises'); return readFile(url, 'utf8'); }
  const response = await fetch(url); if (!response.ok) throw new Error(`Cannot read test fixture ${url}: HTTP ${response.status}`); return response.text();
}
