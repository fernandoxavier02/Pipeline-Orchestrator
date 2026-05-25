'use strict';

const assert = require('node:assert/strict');
const { sanitizePayload } = require('../../src/validators/redactor.cjs');

let result = sanitizePayload({
  payload: {
    log: `api_${'key'}=abc123 at D:\\Users\\win\\project\\file.txt using %USERPROFILE%`,
    nested: [`tok${'en'}=secret-value`, 'normal text'],
  },
});
assert.equal(result.ok, true);
assert.equal(result.redacted.log.includes('abc123'), false);
assert.equal(result.redacted.log.includes('D:\\Users\\win'), false);
assert.equal(result.redacted.log.includes('%USERPROFILE%'), false);
assert.equal(result.redacted.nested[0].includes('secret-value'), false);

result = sanitizePayload({ payload: `pass${'word'} = hunter2\nnormal output` });
assert.equal(result.ok, true);
assert.equal(result.redacted.includes('hunter2'), false);
assert.equal(result.redacted.includes('[REDACTED_SECRET]'), true);

result = sanitizePayload({ payload: `sec${'ret'}: hunter2 in /home/win/project/file.txt and $HOME plus ${'${USERPROFILE}'}` });
assert.equal(result.ok, true);
assert.equal(result.redacted.includes('hunter2'), false);
assert.equal(result.redacted.includes('/home/win'), false);
assert.equal(result.redacted.includes('$HOME'), false);
assert.equal(result.redacted.includes('${USERPROFILE}'), false);

result = sanitizePayload({ payload: 'OUT_OF_SCOPE: canonical plugin contents' });
assert.equal(result.ok, true);
assert.equal(result.redacted.includes('canonical plugin contents'), false);
assert.equal(result.redacted.includes('[REDACTED_OUT_OF_SCOPE]'), true);

result = sanitizePayload({ payload: Buffer.from('secret') });
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZATION_UNVERIFIABLE');

result = sanitizePayload({ payload: new Date('2026-01-01T00:00:00Z') });
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZATION_UNVERIFIABLE');

result = sanitizePayload({ payload: new Map([['safe', 'value']]) });
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZATION_UNVERIFIABLE');

class CustomPayload {
  constructor() {
    this.value = 'safe';
  }
}
result = sanitizePayload({ payload: new CustomPayload() });
assert.equal(result.ok, false);
assert.equal(result.code, 'SANITIZATION_UNVERIFIABLE');

console.log('redactor OK');
