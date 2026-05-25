'use strict';

const SECRET_PATTERN = /\b(password|api[_-]?key|secret|token)\s*[:=]\s*[^\s,;]+/gi;
const WINDOWS_PATH_PATTERN = /[A-Za-z]:\\[^\s]+/g;
const UNIX_PATH_PATTERN = /\/(?:Users|home|var|etc)\/[^\s]+/g;
const ENV_VAR_PATTERN = /%[A-Za-z_][A-Za-z0-9_]*%|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g;
const OUT_OF_SCOPE_PATTERN = /OUT_OF_SCOPE:[^\r\n]*/g;

function redactString(value) {
  return value
    .replace(SECRET_PATTERN, '$1=[REDACTED_SECRET]')
    .replace(WINDOWS_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(UNIX_PATH_PATTERN, '[REDACTED_PATH]')
    .replace(ENV_VAR_PATTERN, '[REDACTED_ENV]')
    .replace(OUT_OF_SCOPE_PATTERN, '[REDACTED_OUT_OF_SCOPE]');
}

function isPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactValue(value) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item)]));
  }
  throw new Error('SANITIZATION_UNVERIFIABLE');
}

function sanitizePayload({ payload }) {
  try {
    return { ok: true, redacted: redactValue(payload) };
  } catch (error) {
    if (error.message === 'SANITIZATION_UNVERIFIABLE') {
      return { ok: false, code: 'SANITIZATION_UNVERIFIABLE' };
    }
    throw error;
  }
}

module.exports = { sanitizePayload, redactString };
