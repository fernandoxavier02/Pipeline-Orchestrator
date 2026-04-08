# Root Cause Tracing

Supporting technique for `/superpowers-debugging` Phase 1.

## When to use

Use when the symptom is visible but the origin is unclear. Tracing works backwards from the observed failure to the first point where the data or state became incorrect.

## Technique

### Step 1 — Anchor on the symptom

Identify the exact point where the wrong value or behavior manifests. Record file, line, variable, and observed value.

### Step 2 — Trace backwards one hop

Find the immediate caller or data source that produced the wrong value. Check:

- function arguments at the call site
- return values from the previous step
- environment variables or config reads
- database queries or API responses

### Step 3 — Repeat until the source

At each hop, ask: **"Was the value already wrong when it arrived here?"**

- If **yes** -> move one hop further back.
- If **no** -> the current hop introduced the defect. This is the root cause location.

### Step 4 — Verify the chain

Once you believe you found the source, verify by logging or asserting the correct value at each hop from source to symptom. If any hop still shows the wrong value, the chain is incomplete.

## Practical checklist

```
[ ] Symptom anchored: file:line + observed value
[ ] Hop 1: caller/source identified
[ ] Hop N: repeated until value is correct at entry
[ ] Root cause location: file:line + explanation
[ ] Chain verified: correct value propagates end-to-end after fix
```

## Common traps

| Trap | Avoidance |
|------|-----------|
| Stopping at the first suspicious layer | Keep tracing until the value is provably correct at entry |
| Assuming the database is always right | Verify the write path, not just the read path |
| Skipping environment boundaries | Log at both sides of every boundary (container, lambda, subprocess) |
| Confusing correlation with causation | The first change that looks related may not be the actual cause |

## Integration with debugging workflow

This technique feeds directly into Phase 3 (Hypothesis). The root cause location becomes the hypothesis: "The defect originates at `file:line` because `[explanation]`."

If tracing reveals multiple candidate sources, test each one independently (one variable at a time per Phase 3 rules).
