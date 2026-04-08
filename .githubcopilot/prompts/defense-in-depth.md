# Defense in Depth

Supporting technique for `/superpowers-debugging` Phase 4.

## When to use

Use after finding and fixing the root cause. Defense in depth adds validation layers so the same class of bug cannot silently recur.

## Principle

A single fix at the root cause is necessary but not sufficient for critical paths. Add lightweight checks at key boundaries so that if the root cause regresses or a similar defect appears nearby, the system fails fast and visibly instead of propagating silently.

## Technique

### Step 1 — Identify the propagation chain

From the root cause tracing, you already have the chain of hops from source to symptom. List every boundary the value crosses.

### Step 2 — Classify each boundary

| Boundary type | Example | Validation approach |
|---------------|---------|---------------------|
| Function contract | Input arguments | Type check, assert, schema validation |
| Module boundary | Service call | Input validation at the receiving side |
| Process boundary | API endpoint, subprocess | Request validation, response schema check |
| Storage boundary | Database write/read | Constraint at write time, sanity check at read time |
| Environment boundary | Env var, config file | Fail-fast on missing or malformed values at startup |

### Step 3 — Add minimal checks

For each boundary in the chain, add ONE validation that would catch the specific class of defect:

- **Prefer assertions that fail loudly** over silent fallbacks
- **Prefer compile-time or startup-time checks** over runtime checks when possible
- **Prefer existing framework validators** (e.g., Pydantic, Zod, SQLAlchemy constraints) over ad-hoc if-checks

### Step 4 — Verify defense layers

After adding checks, intentionally introduce the original defect again (in a test) and verify that at least one defense layer catches it before it reaches the symptom.

## Anti-patterns

| Anti-pattern | Why it fails |
|--------------|-------------|
| Adding try/except everywhere | Masks failures instead of detecting them |
| Defensive copies at every boundary | Performance cost without targeted protection |
| Logging without alerting | Nobody reads logs proactively |
| Fallback to default values | Hides the defect, propagates silently |

## Integration with debugging workflow

This technique is applied AFTER the fix in Phase 4. It does not replace the fix. It protects against regression and similar defects in the same propagation chain.

The defense layers added here can also feed into `/superpowers-tdd` as candidates for new test cases.
