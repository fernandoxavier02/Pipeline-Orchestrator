// .claude/hooks/__tests__/detect-shell-write-backport.test.cjs
//
// v8.2.2 back-port (audit finding A1, RED→GREEN). The OpenCode v0.2.0 hardening of
// detectShellWrite was not in the canonical edit-guard. These pin the parity fix:
// fd-numbered redirects to a file are writes; new write verbs caught; verbs run on the
// quote-stripped string (no false positive); fd-dups still excluded; no regression.

const test = require('node:test');
const assert = require('node:assert');
const { detectShellWrite } = require('../edit-guard-hook.cjs');

test('BP1: fd-numbered redirect to a file is a write (was a bypass)', () => {
  assert.strictEqual(detectShellWrite('echo x 2> src/f.cjs'), true);
  assert.strictEqual(detectShellWrite('printf y 1> out.cjs'), true);
});

test('BP2: new write verbs caught (touch/mkdir/rm/curl -o/tar -x/git checkout/python -m)', () => {
  for (const cmd of [
    'touch new.cjs', 'mkdir d', 'rm src/f.cjs',
    'curl -o f.cjs http://x', 'tar -xf p.tar -C src',
    'git checkout -- src/f.cjs', 'python3 -m py_compile x',
  ]) {
    assert.strictEqual(detectShellWrite(cmd), true, cmd);
  }
});

test('BP3: fd-dups are NOT writes (no false positive reopened)', () => {
  assert.strictEqual(detectShellWrite('run 2>&1'), false);
  assert.strictEqual(detectShellWrite('cmd >&2'), false);
});

test('BP4: verb inside QUOTES is not a false positive (verbs run on the stripped string)', () => {
  assert.strictEqual(detectShellWrite('echo "cp is a copy command"'), false);
  assert.strictEqual(detectShellWrite("printf 'mkdir later'"), false);
});

test('BP5: no regression — previously-detected writes still true; reads still false', () => {
  assert.strictEqual(detectShellWrite('echo x > f'), true);
  assert.strictEqual(detectShellWrite('node -e "x=1"'), true);
  assert.strictEqual(detectShellWrite('tee f'), true);
  assert.strictEqual(detectShellWrite("cat <<'EOF'"), true); // heredoc w/ quoted delimiter (raw)
  assert.strictEqual(detectShellWrite('ls -la'), false);
  assert.strictEqual(detectShellWrite("grep 'a>b' f"), false);
});
