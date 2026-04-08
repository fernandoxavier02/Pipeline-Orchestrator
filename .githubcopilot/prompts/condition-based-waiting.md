# Condition-Based Waiting

Supporting technique for `/superpowers-debugging` environmental and timing issues.

## When to use

Use when the investigation reveals that a failure is caused by timing: a resource not yet ready, a process not yet started, a service not yet responding, or a file not yet written.

## Principle

Replace arbitrary `sleep` or fixed timeouts with condition polling. A condition-based wait checks for the actual ready state instead of guessing how long to wait.

## Technique

### Step 1 — Identify the readiness condition

What specific, observable state indicates that the dependency is ready?

| Dependency type | Readiness condition |
|-----------------|---------------------|
| HTTP service | Responds 200 to health endpoint |
| Database | Accepts connections and runs a trivial query |
| File | Exists on disk and is non-empty (or has expected content) |
| Process | PID exists and port is listening |
| Queue/stream | Consumer group is registered and caught up |
| Build artifact | File exists with expected hash or size |

### Step 2 — Implement the poll loop

```
poll_interval = short (e.g., 500ms - 2s)
max_attempts = timeout / poll_interval
attempt = 0

while attempt < max_attempts:
    if condition_met():
        proceed()
        break
    attempt += 1
    wait(poll_interval)
else:
    fail_with_clear_message("Timed out waiting for [condition] after [timeout]s")
```

### Step 3 — Choose appropriate timeouts

| Context | Suggested timeout | Poll interval |
|---------|-------------------|---------------|
| Unit test setup | 5-10s | 200ms |
| Integration test | 30-60s | 1s |
| CI/CD pipeline step | 60-120s | 2s |
| Production startup | 120-300s | 5s |

### Step 4 — Add diagnostic output on timeout

When the timeout expires, log:

- What condition was being checked
- How many attempts were made
- The last observed state (not just "timed out")
- Suggestions for investigation (e.g., "check if service X is running")

## Common replacements

| Before (fragile) | After (robust) |
|-------------------|----------------|
| `sleep 10 && curl http://...` | Poll `/health` every 1s, max 30s |
| `time.sleep(5)` before DB query | Retry connection with backoff, max 10s |
| `setTimeout(3000)` before DOM check | `waitFor(() => element.isVisible())` |
| `sleep 30` in CI before deploy check | Poll deployment status API every 5s |

## Anti-patterns

| Anti-pattern | Why it fails |
|--------------|-------------|
| Long sleep "just to be safe" | Wastes time on fast runs, still fails on slow ones |
| No timeout on poll loop | Hangs forever on broken environments |
| Polling too aggressively (< 100ms) | CPU waste, may trigger rate limits |
| Checking wrong condition | Ready to connect is not the same as ready to serve |

## Integration with debugging workflow

When Phase 1 reveals timing as the root cause, this technique provides the standard fix pattern for Phase 4. The condition-based wait replaces the fragile timing assumption that caused the original failure.

After implementing, add a test that verifies the condition check works both on the fast path (condition already met) and the slow path (condition met after a delay).
