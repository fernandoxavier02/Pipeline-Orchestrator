# AuditIntake — Enforcement Variants Audit
**Run date:** 2026-06-11
**Auditor:** audit-intake (v7.10.1 pipeline)
**Scope:** All 6 enforcement layers — Plan Mode contract, inline-routing gap, fidelity-report freeze, agent dispatch table completeness, run-log incoherence, and controller PLAN_MODE_BYPASS gap

---

```yaml
AuditIntake:
  stack:
    languages:
      - "JavaScript (Node.js CJS — all hooks, lib, tests)"
      - "Markdown (all agent/skill/command prose contracts)"
      - "YAML (gate-decisions.jsonl, sentinel-state.json, confidence-score.yaml)"
      - "JSON (plugin.json, marketplace.json, package.json, settings.json)"
    frameworks:
      - "Claude Code plugin harness (proprietary — hooks wired via hooks.json)"
      - "Node.js built-in (fs, path, crypto, http)"
      - "Jest (unit + regression test runner)"
    databases:
      - "JSONL flat files — gate-decisions.jsonl, run-log.jsonl, protocol-events.jsonl"
      - "JSON flat files — sentinel-state.json, fidelity-report.json, confidence-score.yaml"
    infra:
      - "Local filesystem (.pipeline/docs/ as runtime state store)"
      - "Langfuse (external observability — langfuse-carrier.cjs + langfuse-client.cjs)"
      - "GitHub + NPM (distribution channels)"
      - "Paperclip VPS (optional orchestrator — references/paperclip/)"
    evidence:
      - claim: "Version 7.10.1 — JavaScript CJS plugin"
        file: "Pipeline-Orchestrator/.claude-plugin/plugin.json"
        line: 3
      - claim: "Jest test runner"
        file: "Pipeline-Orchestrator/package.json"
        line: ~12
      - claim: "Stop hook registration — only hook in repo .claude/settings.json"
        file: "Pipeline-Orchestrator/.claude/settings.json"
        line: 1
      - claim: "Full 102-line hooks.json wires all 8 hook event types"
        file: "C:/.claude/plugins/cache/FX-studio-AI/pipeline-orchestrator/7.10.1/hooks/hooks.json"
        line: 1

  repo_map:
    - directory: "agents/"
      role: "All agent prose contracts — N1 orchestrators + N2 specialists"
      subdirectories:
        - name: "agents/core/"
          role: "Pipeline orchestration: pipeline-controller, task-orchestrator, sentinel, executor-controller, final-validator, spec-closer, finishing-branch"
        - name: "agents/executor/"
          role: "Per-task implementers and reviewers: executor-implementer-task, executor-spec-reviewer, executor-quality-reviewer, executor-fix, spec-closer"
        - name: "agents/executor/type-specific/"
          role: "Domain-typed specialists: bugfix-diagnostic-agent, bugfix-root-cause-analyzer, feature-implementer, audit-intake, audit-domain-analyzer, audit-compliance-checker, audit-risk-matrix-generator, ux-simulator, ux-accessibility-auditor, ux-qa-validator, spec-format-gate, spec-content-reviewer, spec-post-impl-validator, feature-vertical-slice-planner, feature-integration-validator"
        - name: "agents/quality/"
          role: "Quality gates: plan-architect, design-interrogator, quality-gate-router, pre-tester, diff-discipline-reviewer, review-orchestrator, architecture-reviewer, adversarial-review-coordinator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer, final-adversarial-orchestrator"
        - name: "agents/brainstorm/"
          role: "Brainstorm pipeline steps: brainstorm-controller, step-00-intake, step-01-explore, step-01b-alternatives, step-02-spec-init, step-03-spec-requirements, step-04-validate-gap, step-05-spec-design, step-06-validate-design, step-07-spec-tasks, step-08-handoff"
    - directory: "skills/"
      role: "23 skill folders — each contains SKILL.md manifest driving Phase 2 dispatch"
      subdirectories:
        - name: "skills/bugfix/, bugfix-light/, bugfix-heavy/"
          role: "Bugfix pipeline variants (skill-dispatch eligible)"
        - name: "skills/spec/, spec-light/, spec-heavy/, spec-audit-only/, spec-design/, spec-init/, spec-requirements/, spec-tasks/"
          role: "Spec pipeline variants (skill-dispatch eligible)"
        - name: "skills/feature/, feature-light/, feature-heavy/"
          role: "Feature pipeline variants (skill folders exist — dispatch eligibility unconfirmed)"
        - name: "skills/audit/, audit-light/, audit-heavy/"
          role: "Audit pipeline variants (skill folders exist but controller routes inline — see Signal B)"
        - name: "skills/review/, pipeline/, validate-design/, validate-gap/, verify-completion/, measure-paperclip-fidelity/"
          role: "Utility skills — review, validate, and measure"
    - directory: "commands/"
      role: "12 slash commands: brainstorm, pipeline (1112 lines) + 9 paperclip-* + setup-paperclip"
    - directory: "lib/"
      role: "17 CJS runtime modules — fidelity, telemetry, run-log, Langfuse, SSOT writers"
      subdirectories:
        - name: "lib/ (fidelity layer)"
          role: "fidelity-reporter.cjs, run-log.cjs, execution-summary.cjs, score-writer.cjs, codex-operational-runtime.cjs"
        - name: "lib/ (telemetry layer)"
          role: "gate-decision-writer.cjs, langfuse-carrier.cjs, langfuse-client.cjs, langfuse-sanitizer.cjs, jsonl-sanitizer.cjs"
    - directory: ".claude/hooks/"
      role: "4 runtime hooks wired via hooks.json: sentinel-hook.cjs, stop-hook.cjs, dispatch-guard.cjs, force-pipeline-agents.cjs"
    - directory: "tests/regression/"
      role: "15 version folders v6.0.0→v7.10.0 — 74+ scenarios in latest 4 files (F20-F23)"
    - directory: "references/"
      role: "Canonical reference docs: gates.md (35-gate registry), sentinel-integration.md, audit-trail.md, gate-request-protocol.md, complexity-matrix.md, implementation-discipline.md, team-registry.md, glossary.md"
    - directory: "designs/"
      role: "Design history — v5 consolidated (1796 lines) + legacy/ + slice-0/ SPIKEs"
    - directory: "docs/"
      role: "User-facing docs: diagrams/ (5 HTML), audits/, PAPERCLIP-INTEGRATION.md"
    - directory: "references/paperclip/"
      role: "Optional Paperclip adapter layer — 14 docs + 11 skills + provision scripts"
    - directory: ".pipeline/"
      role: "Runtime working-state (not committed): sentinel-state.json, gate-decisions.jsonl, fidelity-report.json, protocol-events.jsonl per run"

  entry_points:
    # === APPLICATION ENTRY POINTS ===
    - type: "application"
      file: "commands/pipeline.md"
      description: "Primary slash command /pipeline-orchestrator:pipeline — 1112 lines, full classifier + Inline Invariants; user entry for all pipeline variants"
    - type: "application"
      file: "commands/brainstorm.md"
      description: "Brainstorm pipeline entry /pipeline-orchestrator:brainstorm — dispatches brainstorm-controller"
    - type: "application"
      file: "commands/paperclip-bugfix.md"
      description: "Paperclip-variant entry /pipeline-orchestrator:paperclip-bugfix (one of 9 paperclip-* commands)"
    # === RUNTIME HOOK ENTRY POINTS ===
    - type: "hook_PreToolUse_Agent"
      file: ".claude/hooks/sentinel-hook.cjs"
      description: "Intercepts every Agent tool call — validates sentinel checkpoints, discovers cwd at lines 48 and 160"
    - type: "hook_PreToolUse_Skill_Agent"
      file: ".claude/hooks/dispatch-guard.cjs"
      description: "Validates agent_type per SKILL.md frontmatter step — cwd at line 124"
    - type: "hook_UserPromptSubmit"
      file: ".claude/hooks/force-pipeline-agents.cjs"
      description: "Forces pipeline routing on user prompts — cwd at line 199"
    - type: "hook_Stop"
      file: ".claude/hooks/stop-hook.cjs"
      description: "Session teardown: writes run-log entry, generates fidelity-report, ships Langfuse traces"
    # === PHASE/DATA FLOW ENTRY POINTS (PLAN_MODE_MANDATORY_AGENTS) ===
    - type: "phase_0c_COMPLEXA"
      file: "agents/quality/design-interrogator.md"
      description: "Design interrogation — PLAN_MODE_MANDATORY, Step 0 requires PLAN_MODE_REQUEST before any Read/Grep (line 80)"
    - type: "phase_1.5"
      file: "agents/quality/plan-architect.md"
      description: "Implementation planning — PLAN_MODE_MANDATORY, Step 0 defers to Achado #7 section (line 107); Step 1 opens research imperatives WITHOUT an explicit guard sentence within Step 1 itself (residual ambiguity, line 111)"
    - type: "phase_2c_audit"
      file: "agents/executor/type-specific/audit-intake.md"
      description: "Audit intake — PLAN_MODE_MANDATORY; routes inline per pipeline-controller line 192 (not via skill dispatch)"
    - type: "phase_2c_bugfix"
      file: "agents/executor/type-specific/bugfix-diagnostic-agent.md"
      description: "Bugfix diagnosis — PLAN_MODE_MANDATORY, phase 2c"
    - type: "phase_2c_feature"
      file: "agents/executor/type-specific/feature-vertical-slice-planner.md"
      description: "Feature VSA planning — PLAN_MODE_MANDATORY, phase 2c"
    - type: "phase_2_impl"
      file: "agents/executor/executor-implementer-task.md"
      description: "Per-task implementation — PLAN_MODE_MANDATORY, phase 2"

  hotspots:
    - file: "agents/core/pipeline-controller.md"
      reason: "Central N1 orchestrator — Inline Invariants list, PLAN_MODE_MANDATORY_AGENTS table (lines 518-531), PLAN_MODE_BYPASS enforcement (lines 533), inline-routing rule (line 192). Single point of failure for enforcement logic."
      severity: "critical"
      tag: "[VERIFIED]"
    - file: ".claude/hooks/stop-hook.cjs"
      reason: "Session teardown handler — ensureFidelityReport idempotent guard at line 242 ('if existsSync return — never overwrite') is the confirmed mechanism of Signal C (fidelity freeze). Also owns run-log append and Langfuse shipping."
      severity: "critical"
      tag: "[VERIFIED]"
    - file: "agents/quality/plan-architect.md"
      reason: "Step 0 (line 107) defers to Achado #7; Step 1 (lines 111-127) opens with imperative research instructions without an explicit guard clause inside Step 1 body. Residual ambiguity confirmed per research finding [14]."
      severity: "high"
      tag: "[VERIFIED]"
    - file: "agents/quality/design-interrogator.md"
      reason: "Step 0 (line 80) declares PLAN_MODE_REQUEST MANDATORY with threat of PLAN_MODE_BYPASS. Yet in the current run design-interrogator did 94 inline tool uses without emitting PLAN_MODE_REQUEST — controller cleared it with incorrect claim ('not in the table'). Contract vs runtime gap confirmed."
      severity: "critical"
      tag: "[VERIFIED]"
    - file: "lib/run-log.cjs"
      reason: "Run-log aggregator — buildRunLogEntry writes fidelity_score from fidelity-report.json. If report frozen early (Signal C), all subsequent entries carry stale fidelity. Pattern: 2026-06-09 run shows fidelity null + final_decision UNKNOWN + 0/11 gates."
      severity: "high"
      tag: "[VERIFIED]"
    - file: "references/gates.md"
      reason: "35-gate registry — authoritative but cannot be modified by enforcement fixes (gate_registry_modification is a forbidden change type per implementation-discipline.md). Creates tension: new enforcement checks must live in audit-trail or protocol-events, never gates.md."
      severity: "medium"
      tag: "[VERIFIED]"
    - file: ".pipeline/run-log.jsonl"
      reason: "Live telemetry log — 2026-06-09 entry has timestamp_end BEFORE timestamp_start (clock skew), final_decision UNKNOWN, 0/11 gates. Evidence of aborted-run recording gap."
      severity: "high"
      tag: "[VERIFIED]"

  # ===================================================================
  # ENFORCEMENT LAYER INVENTORY (6 layers, signals A-G + surprises S1-S2)
  # ===================================================================
  enforcement_layers:
    layer_1_plan_mode_contract:
      description: "Agents in PLAN_MODE_MANDATORY_AGENTS table must emit PLAN_MODE_REQUEST before any inline research"
      signals:
        - id: "Signal G (design-interrogator violation)"
          finding: "design-interrogator ran 94 inline tool uses without emitting PLAN_MODE_REQUEST; controller accepted result with claim it was 'not in the table' — factually wrong (it IS listed at pipeline-controller.md line 527)"
          severity: "critical"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:527; agents/quality/design-interrogator.md:80-108"
        - id: "Signal (plan-architect residual ambiguity)"
          finding: "plan-architect Step 0 correctly defers to Achado #7 (line 107) but Step 1 body (lines 111-127) opens imperative research instructions without an explicit 'only after PLAN_MODE_RESULTS' guard inside Step 1 — a reader could interpret Step 1 as immediately executable"
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "agents/quality/plan-architect.md:107-127"
      gap: "Controller PLAN_MODE_BYPASS enforcement (line 533) fires on RETURN with substantive output but cannot fire if controller INCORRECTLY classifies agent as not in table — no secondary check"

    layer_2_inline_routing:
      description: "Controller routes audit-*, ux-sim-*, user-story-* inline despite skill folders existing"
      signals:
        - id: "Signal B (audit inline despite skill folders)"
          finding: "pipeline-controller.md line 192: 'when pipeline_variant is anything other than bugfix-light/heavy or spec-light/heavy/spec-audit-only, Phase 2 runs inline'. audit-light, audit-heavy folders exist in skills/ but are never dispatched via skill-dispatch path."
          severity: "high"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:192"
        - id: "Signal B2 (feature dispatch status ambiguous)"
          finding: "feature-light, feature-heavy, feature skill folders exist; dispatch list explicitly covers only bugfix-* and spec-*. Whether feature-* routes via skill-dispatch is unconfirmed from prose alone."
          severity: "medium"
          tag: "[HYPOTHESIS — not evidenced in controller dispatch table; folder existence alone does not confirm dispatch]"
          evidence: "agents/core/pipeline-controller.md:192; skills/ directory inventory"

    layer_3_fidelity_freeze:
      description: "ensureFidelityReport is idempotent-never-overwrite — first write wins forever"
      signals:
        - id: "Signal C (fidelity freeze mechanism)"
          finding: "stop-hook.cjs line 242: 'if (fs.existsSync(reportPath)) return; // idempotent — never overwrite'. A sub-session teardown that fires before gate-decisions.jsonl is complete will write an undercount fidelity-report.json that can never be corrected."
          severity: "critical"
          tag: "[VERIFIED]"
          evidence: ".claude/hooks/stop-hook.cjs:239-245"
        - id: "Signal C2 (fidelity null pattern)"
          finding: "If gate-decisions.jsonl is absent at first teardown, ensureFidelityReport returns without creating the file (line 245). Later teardowns hit existsSync=false but then gdPath=false and return again. Report never created → run-log entry fidelity_score null forever."
          severity: "high"
          tag: "[VERIFIED]"
          evidence: ".claude/hooks/stop-hook.cjs:244-245; .pipeline/run-log.jsonl entries 2026-06-09"

    layer_4_dispatch_table:
      description: "PLAN_MODE_MANDATORY_AGENTS table accuracy — 10 agents listed vs runtime behavior"
      signals:
        - id: "Signal D (table correct but enforcement has lookup gap)"
          finding: "Table at pipeline-controller.md lines 518-531 lists 10 agents including design-interrogator (line 527). Enforcement logic at line 533 fires on return from 'any agent in the PLAN_MODE_MANDATORY_AGENTS list'. However, controller in current run incorrectly cleared design-interrogator as 'not in the table' — suggesting runtime lookup is textual/manual, not programmatic."
          severity: "critical"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:518-533"
        - id: "Signal D2 (user-story agents absent from table)"
          finding: "No user-story specialist agents appear in the PLAN_MODE_MANDATORY_AGENTS table despite user-story-light/heavy pipeline variants existing (per commands/paperclip-user-story.md). If user-story-* spawn research-heavy subagents, they are unenforced."
          severity: "medium"
          tag: "[HYPOTHESIS — user-story specialist agent files not inventoried in research corpus; table omission may be by design if user-story delegates to feature-implementer which IS listed]"
          evidence: "agents/core/pipeline-controller.md:518-531"

    layer_5_run_log_incoherence:
      description: "Run-log entries with structural incoherence — aborted runs, clock skew, UNKNOWN classification"
      signals:
        - id: "Signal A (run 2026-06-09 incoherence)"
          finding: "run-log.jsonl entry for run '2026-06-09-parallel-eligible-default': timestamp_end (14:17:47Z) is BEFORE timestamp_start (18:10:00Z); final_decision UNKNOWN; 0/11 gates. Likely aborted run with clock-skew or timezone error in timestamp assembly."
          severity: "high"
          tag: "[VERIFIED]"
          evidence: ".pipeline/run-log.jsonl (last 20 entries per research finding [12])"
        - id: "Signal A2 (timestamp_start null in multi-session runs)"
          finding: "stop-hook.cjs reads timestamp_start from session context with null fallback; does not derive from sentinel-state created_at. Multi-session runs remain null for timestamp_start until a session with context provides it."
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "stop-hook.cjs (finding [17] — no file:line pinned; code path confirmed in research)"

    layer_6_controller_bypass_gap:
      description: "PLAN_MODE_BYPASS enforcement is AUDIT-hardness only; second bypass is accepted; no gate blocks"
      signals:
        - id: "Signal E (AUDIT-only enforcement, no gate block)"
          finding: "pipeline-controller.md line 533: hardness is explicitly AUDIT — 'this is explicitly NOT a new registered gate'. First bypass triggers re-dispatch; second bypass is accepted with audit trail. There is no HARD gate that prevents inline research from producing accepted output."
          severity: "high"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:533"
        - id: "Signal F (sentinel hook — repo vs cache byte-identical)"
          finding: "sentinel-hook.cjs: cache version and repo version are byte-identical (17536 bytes). This confirms hooks deployed from cache match canonical source."
          severity: "low"
          tag: "[VERIFIED]"
          evidence: "Research finding [11] — byte-identity confirmed"

  surprises:
    - id: "S1 (clock-skew aborted run)"
      finding: "run-log.jsonl 2026-06-09 entry: timestamp_end precedes timestamp_start, final_decision UNKNOWN, 0/11 gates. Aborted pipeline run recorded incoherently with no sentinel cleanup visible in the entry. Unclear if cleanup-orphan-sentinel-state hook (SessionStart) archived the state."
      severity: "high"
      tag: "[VERIFIED]"
      evidence: ".pipeline/run-log.jsonl (research finding [12])"
    - id: "S2 (audit-* inline despite skill folders)"
      finding: "skills/audit/, skills/audit-light/, skills/audit-heavy/ folders exist but audit-* routes inline. This is a structural inconsistency: skill folders imply dispatch readiness but no dispatch wiring exists. Could mislead contributors expecting audit runs to behave like bugfix/spec runs."
      severity: "medium"
      tag: "[VERIFIED — inline routing confirmed in pipeline-controller.md:192; DESIGN — intentional per current controller architecture, but intent not documented at the skill-folder level]"
      evidence: "agents/core/pipeline-controller.md:192; skills/ directory (audit/, audit-light/, audit-heavy/)"

  evidence_classification:
    verified_count: 14
    hypothesis_count: 2
    design_count: 1
    framework: "VERIFIED/HYPOTHESIS/DESIGN tagging active — all claims carry file path; no claim declared without evidence or explicit HYPOTHESIS tag"

    summary_by_severity:
      critical: 4
        # Signal G — design-interrogator violated PLAN_MODE_REQUEST contract in current run; controller cleared with wrong claim
        # Signal C — fidelity freeze via idempotent-never-overwrite at stop-hook:242
        # Signal D — enforcement table lookup gap (controller text-reads, not programmatic)
        # Layer 2 Signal B — audit-* routes inline despite 3 audit skill folders existing
      high: 5
        # Signal B (audit inline routing)
        # Signal C2 (fidelity null — gate-decisions.jsonl absent at first teardown)
        # Signal A (run-log 2026-06-09 clock skew + UNKNOWN)
        # Signal E (PLAN_MODE_BYPASS AUDIT-only, no hard gate)
        # plan-architect Step 1 residual ambiguity (medium boundary)
      medium: 3
        # Signal D2 (user-story agents absent from mandatory table — hypothesis)
        # Signal B2 (feature dispatch status ambiguous — hypothesis)
        # Signal A2 (timestamp_start null in multi-session runs)
      low: 1
        # Signal F (sentinel hook byte-identical — informational, no action needed)
```

---

## AUDIT_INTAKE_RESULT

```yaml
AUDIT_INTAKE_RESULT:
  status: "COMPLETE"
  output: "AuditIntake"
  next_agent: "audit-domain-analyzer"
  summary: |
    6 enforcement layers inventoried across 45+ agent files, 17 lib modules, 4 hooks, 23 skill folders.
    14 VERIFIED findings, 2 HYPOTHESIS, 1 DESIGN.
    4 critical signals identified:
    (G) design-interrogator violated PLAN_MODE_REQUEST in this run — controller cleared with wrong claim about table membership;
    (C) fidelity freeze mechanism confirmed in stop-hook.cjs:242 — idempotent-never-overwrite;
    (D) enforcement table lookup is manual/textual in controller prose — not programmatic, creates false-clear risk;
    (B) audit-* routes inline despite 3 skill folders existing — structural inconsistency.
    2 surprises: S1 (2026-06-09 aborted run with clock-skew and 0/11 gates), S2 (audit skill folders imply dispatch readiness that does not exist).
    Sentinel hook confirmed byte-identical between repo and deployed cache.
  blocked_reason: null
```
