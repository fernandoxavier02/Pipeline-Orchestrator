# Micro-Gate: Per-Task Checklist

The executor-implementer checks this list BEFORE writing ANY code for a task. If any check fails, the task STOPS and the gap is reported upward.

---

## Pre-Implementation Checks

Before writing code, verify ALL of the following:

1. **Target file exists** — or creation is explicitly requested in the task description
2. **Expected behavior is explicit** — the task description states what should happen, not just "fix it"
3. **Numeric values are defined** — timeouts, retry counts, limits, thresholds are specified, not assumed
4. **Data paths are specified** — database collections, storage paths, API endpoints are named, not invented
5. **Security impact assessed** — if this task touches auth, permissions, or sensitive data, was it validated by the macro-gate?

---

## Decision Logic

```
ALL checks pass?
  YES → proceed with implementation
  NO  → STOP task immediately

Report to executor-controller:
  - Which check(s) failed
  - What specific information is missing
  - Suggested question to ask the user
```

---

## Examples

### PASS — All checks satisfied
```
Task: "Add 30-second timeout to the /api/generate endpoint"
1. [x] Target: src/api/generate.ts exists
2. [x] Behavior: add timeout, return 408 on expiry
3. [x] Numeric: 30 seconds (explicit)
4. [x] Data paths: /api/generate (explicit)
5. [x] Security: no auth changes
→ PROCEED
```

### FAIL — Missing numeric value
```
Task: "Add timeout to the API call"
1. [x] Target: src/api/client.ts exists
2. [x] Behavior: add timeout
3. [ ] Numeric: what timeout value? NOT SPECIFIED
4. [x] Data paths: API client (clear)
5. [x] Security: no auth changes
→ STOP — report: "Timeout value not specified. Need explicit value."
```

### FAIL — Invented data path
```
Task: "Store user preferences"
1. [x] Target: create new file
2. [x] Behavior: persist preferences
3. [x] Numeric: n/a
4. [ ] Data paths: WHERE to store? No collection/table specified
5. [x] Security: no auth changes
→ STOP — report: "Storage location not specified. Need DB collection or path."
```

---

## Key Rule

**If information is missing, STOP. Do NOT invent it.** The cost of asking is low. The cost of guessing wrong is high.
