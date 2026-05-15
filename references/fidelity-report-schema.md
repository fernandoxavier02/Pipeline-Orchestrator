# Fidelity Report Schema

> **SSOT** for the per-run `fidelity-report.md` + `fidelity-report.json` artifacts produced by `lib/fidelity-reporter.cjs`. Both files live inside the run's pipeline-doc folder (`{PIPELINE_DOC_PATH}/`), alongside `gate-decisions.jsonl` and the phase docs. The reporter is invoked by `agents/core/pipeline-controller.md` Step 3b-fidelity (after the closeout gate, before PIPELINE COMPLETE) and by `agents/core/final-validator.md` (the Pa de Cal block surfaces the resulting numbers).
>
> The companion table `references/gates.md → ## Mandatory Gates by Complexity` defines the denominator (which gates count as "expected"). The companion log `references/audit-trail.md → ## Cross-Run Accumulated Log (run-log.jsonl)` consumes the same numbers at the cross-run level.

---

## 1. Markdown Layout (`fidelity-report.md`)

The Markdown report is human-readable and intended to be linked from the run's `00-task-orchestrator.md` and the final Pa de Cal block. It MUST contain the following sections, in this order:

```markdown
# Fidelity Report — <run_id>

> Per-run fidelity snapshot. Higher is better. `null` means "no gate data was found, so the score is not defined" (NOT zero).

## Summary

- **Run ID:** <run_id>
- **Pipeline doc:** <pipelineDocPath>
- **Type / Complexity / Variant:** <type> / <complexity> / <variant>
- **Mandatory gates triggered:** <mandatoryTriggered> / <mandatoryExpected>
- **Fidelity score:** <fidelityScore in [0,1] OR "n/a (no gate data)">
- **Global fidelity (cross-run, last 30 days):** <globalFidelityPct>% — sourced from `.pipeline/run-log.jsonl`

## Mandatory Gates Coverage

| Gate | Hardness | Expected? | Triggered? | Decision |
|------|----------|-----------|------------|----------|
| <gate-name> | <hardness> | yes | yes | <decision> |
| <gate-name> | <hardness> | yes | NO | — |
...

## Non-Mandatory Gates Observed

| Gate | Hardness | Decision | Detail (truncated) |
|------|----------|----------|--------------------|

## Warnings

- <free-form list of parse warnings or null-score reasons; empty bullet list when none>

## See Also

- `gate-decisions.jsonl` — raw per-run gate log
- `.pipeline/run-log.jsonl` — cross-run accumulated log
- `references/gates.md` — gates registry + mandatory-by-complexity table
```

Notes on rendering:
- The "Fidelity score" line MUST print the literal string `n/a (no gate data)` when the score is `null`. Numeric scores render with 4 decimal places (e.g., `0.8182`).
- The "Mandatory Gates Coverage" table MUST list every gate from the mandatory set for the run's complexity (plus the Spec (+) rows when `type=Spec`). Gates that were not triggered show `NO` in the "Triggered?" column with a `—` in "Decision".
- Empty sections render with a single `- (none)` bullet so the layout stays stable.

---

## 2. JSON Schema (`fidelity-report.json`)

Machine-readable view of the same data. Downstream tooling (trend dashboards, CI checks) should consume this file rather than parsing the Markdown.

```json
{
  "schema_version": "1.0.0",
  "run_id": "string",
  "pipeline_doc_path": "string (repo-relative)",
  "type": "Bug Fix | Feature | Spec | Audit | UX Simulation | Adversarial Review",
  "complexity": "SIMPLES | MEDIA | COMPLEXA",
  "variant": "string",
  "mandatory_triggered": 0,
  "mandatory_expected": 0,
  "fidelity_score": 0.0,
  "global_fidelity_pct": 0.0,
  "mandatory_gates": [
    {
      "gate": "string",
      "hardness": "MANDATORY | HARD | CIRCUIT_BREAKER | SOFT",
      "expected": true,
      "triggered": true,
      "decision": "RESOLVED | APPROVED | BLOCKED | SKIPPED | STOPPED | FAILED | PASS | FAIL | null"
    }
  ],
  "other_gates": [
    {
      "gate": "string",
      "hardness": "string",
      "decision": "string",
      "detail": "string (already sanitized via sanitizeDetail)"
    }
  ],
  "warnings": ["string"],
  "generated_at": "ISO 8601 string"
}
```

Field rules:
- `schema_version` is the SemVer of THIS schema document, not of the plugin. Bump it whenever the JSON shape changes incompatibly (e.g., renaming a field, changing a type, removing an enum value).
- `fidelity_score` is a number in `[0, 1]` OR `null` (no gate data). Never `NaN`, never a string.
- `mandatory_gates[]` MUST include one entry per expected mandatory gate (so the array length equals `mandatory_expected`). Gates not triggered have `triggered: false` and `decision: null`.
- `other_gates[]` captures gates that fired but were NOT in the mandatory set (informational; not part of the score). Detail strings are already sanitized.
- `warnings[]` is empty `[]` when there were no parse anomalies. One entry per malformed JSONL line or missing input.
- `generated_at` reflects when the reporter ran (not when the pipeline ran). Use the run-log `timestamp_end` for "when the pipeline finished".

---

## 3. Computation Rules

How `lib/fidelity-reporter.cjs::generateFidelityReport(...)` derives each number.

1. **Input:** `{ pipelineDocPath, complexity, type, repoRoot }`. The reporter reads `{pipelineDocPath}/gate-decisions.jsonl` and `{repoRoot}/.pipeline/run-log.jsonl` (the latter for `global_fidelity_pct`).

2. **Mandatory set:** look up `MANDATORY_GATES_BY_COMPLEXITY[complexity]` from the reporter export. If `type === "Spec"`, additionally append `MANDATORY_GATES_BY_COMPLEXITY.SPEC` (the +6 spec-pipeline rows). Deduplicate.

3. **Parse loop:** read `gate-decisions.jsonl` line by line. For each line:
   - `JSON.parse` it. On `SyntaxError`, push a string into `warnings[]` describing the line index (1-based) and the reason. Skip the line.
   - Verify it is an object with at least a `gate` field. Otherwise push a warning and skip.
   - If `gate` is in the mandatory set AND the decision indicates the gate FIRED (any value other than the absent sentinel — `TRIGGERED`, `PASS`, `FAIL`, `RESOLVED`, `APPROVED`, `BLOCKED`, `SKIPPED`, `STOPPED`, `RESET` all count as "fired"), increment `mandatoryTriggered` and store the decision into the per-gate map.
   - If `gate` is NOT in the mandatory set, record it in `other_gates[]` (one entry per unique gate name; subsequent occurrences with the same gate name update `decision` to the most recent value).

4. **Empty-file case:** if the file does not exist or has zero non-blank lines, `mandatoryTriggered = 0`, `fidelityScore = null` (NOT zero — distinguishes "no data" from "everything missed"), `mandatoryExpected` still reflects the expected count for the complexity, `ok = true`, report files are still written.

5. **Score:** `fidelityScore = mandatoryTriggered / mandatoryExpected` when `mandatoryExpected > 0`. Round to 4 decimals when serialized. `null` when the file was empty or missing.

6. **Global fidelity:** read `<repoRoot>/.pipeline/run-log.jsonl` via `lib/run-log.cjs::readRunLog`. Filter entries with `fidelity_score !== null` AND `timestamp_end` within the last 30 days. If none, `globalFidelityPct = null`. Otherwise the mean of the scores * 100, rounded to 2 decimals.

7. **Outputs:** write both `fidelity-report.md` and `fidelity-report.json` to `{pipelineDocPath}/`. Return `{ ok, fidelityScore, mandatoryTriggered, mandatoryExpected, globalFidelityPct, mdPath, jsonPath, warnings }`.

8. **Error policy:** the reporter is SOFT-fail. Any unexpected exception during write returns `{ ok: false, error: '<message>' }` so the pipeline controller can surface a warning without aborting the run. Empty input is NOT an error — it returns `ok: true` with `fidelityScore: null`.
