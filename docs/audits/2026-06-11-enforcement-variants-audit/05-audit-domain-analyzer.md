# DOMAIN_ANALYSIS — Enforcement Variants Audit

**Run date:** 2026-06-11
**Auditor:** audit-domain-analyzer (T2 — audit-heavy COMPLEXA)
**Input consumed:** `04-audit-intake.md` (AuditIntake, treated as terrain map)
**Scope:** Architecture & SSOT analysis over the 6 enforcement layers — enforcement-mechanism classification, gate-count drift formalization, cwd-coupling cascade, and Plan Mode contract-vs-runtime compliance.
**Discipline:** every claim carries `file:line` + `[VERIFIED]`/`[HYPOTHESIS]`/`[DESIGN]`. READ-ONLY. No fixes proposed (T4's job).

---

```yaml
DOMAIN_ANALYSIS:

  # =================================================================
  # 1) ENFORCEMENT ARCHITECTURE
  #    Classify each invariant/gate/contract by its ACTUAL enforcement
  #    mechanism: hook (deterministic JS) | prompt (persuasion) | test (pin).
  # =================================================================
  enforcement_architecture:
    mechanism_layers:
      - name: "Hook layer (deterministic JS — the only programmatic enforcement)"
        directories: [".claude/hooks/"]
        members:
          - "sentinel-hook.cjs (PreToolUse:Agent — expected_next match → allow/deny)"
          - "stop-hook.cjs (Stop — run-log append, fidelity-report, Langfuse ship)"
          - "dispatch-guard.cjs (PreToolUse:Skill|Agent — agent_type per SKILL.md step)"
          - "force-pipeline-agents.cjs (UserPromptSubmit — routing)"
          - "cleanup-orphan-sentinel-state-hook.cjs (SessionStart — PROTOCOL_HANDSHAKE_TIMEOUT)"
        tag: "[VERIFIED]"
        evidence: "04-audit-intake.md:78-79; agents/core/pipeline-controller.md:282"
      - name: "Prompt layer (persuasion only — LLM-judgment dependent)"
        directories: ["agents/", "commands/", "references/"]
        members:
          - "pipeline-controller.md Inline Invariants + PLAN_MODE_BYPASS text"
          - "per-agent Step-0 PLAN_MODE_REQUEST clauses"
          - "Iron Law / anti-injection prose"
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:259-263,518-533"
      - name: "Test layer (regression pins — catches drift at CI, not at runtime)"
        directories: ["tests/regression/"]
        members:
          - "F1_gates_mandatory_section.cjs (pins Mandatory-by-Complexity table)"
          - "F18 (fence-aware PLAN_MODE_REQUEST presence) + F19 (PLAN_MODE_BYPASS text)"
          - "F20 (10 mandatory agents pinned) + F21 (controller bypass text pinned)"
        tag: "[VERIFIED]"
        evidence: "references/gates.md:88; PLAN_MODE_RESULTS F18/F19/F20/F21 findings"

    # ---- Per-mechanism classification of each enforcement claim ----
    invariant_classification:
      - invariant: "Sentinel expected_next sequencing"
        mechanism: "HOOK (deterministic)"
        detail: "target===expected → allow; divergence → permissionDecision deny"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/sentinel-hook.cjs:342-377"
      - invariant: "STATE_FILE_INIT_FAIL (CIRCUIT_BREAKER)"
        mechanism: "PROMPT (controller emits PASS/BLOCKED in prose) — NOT hook-enforced"
        detail: "Gate registered HARD/CIRCUIT_BREAKER but firing depends on controller honoring the precondition text"
        tag: "[VERIFIED]"
        evidence: "references/gates.md:41; agents/core/pipeline-controller.md (Phase 0 init prose)"
      - invariant: "PROTOCOL_HANDSHAKE_TIMEOUT (HARD)"
        mechanism: "HOOK (primary, out-of-band) + PROMPT (secondary, controller re-entry)"
        detail: "Dual-layer: cleanup-orphan hook fires on SessionStart unconditionally; controller re-entry check is defense-in-depth. This is the ONLY gate with real hook backing beyond sentinel sequencing."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:280-296"
      - invariant: "PLAN_MODE_BYPASS (AUDIT hardness)"
        mechanism: "PROMPT-ONLY (zero hook code)"
        detail: "grep PLAN_MODE_BYPASS|PLAN_MODE_REQUEST across .claude/hooks/ → 0 matches. Entire enforcement is controller prose at line 533. No deterministic detector exists."
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/ grep=0; agents/core/pipeline-controller.md:533"
      - invariant: "Fidelity-report freeze (idempotent-never-overwrite)"
        mechanism: "HOOK (deterministic — but the freeze IS the bug, not the guard)"
        detail: "existsSync→return at stop-hook:242 makes first write permanent. Deterministic, but locks in undercounts from premature teardown."
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/stop-hook.cjs:239-245"
      - invariant: "Mandatory-Gates-by-Complexity (fidelity denominator)"
        mechanism: "TEST-pinned + lib-consumed (fidelity-reporter.cjs reads table)"
        detail: "Table is the SSOT for fidelity = mandatory_triggered / mandatory_expected; F1 breaks on row/col edit by design."
        tag: "[VERIFIED]"
        evidence: "references/gates.md:88,92-124"
      - invariant: "Skill-contract checkpoint (expected_next set at checkpoint steps)"
        mechanism: "HOOK (deterministic, but conditional — only fires when current_skill+step set)"
        detail: "enforceSkillContract returns null (skips) unless a skill is in flight AND step is a declared checkpoint — so inline-routed variants (audit-*) never trip it."
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/sentinel-hook.cjs:45-62"

    # ---- The headline finding: prompt-only enforcement surface ----
    prompt_only_layers_flagged:
      - layer: "Layer 1 (Plan Mode contract)"
        why: "Per-agent Step-0 obligation + controller PLAN_MODE_BYPASS are 100% prose. No hook inspects whether a PLAN_MODE_REQUEST block was emitted before research."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/ grep PLAN_MODE*=0; agents/core/pipeline-controller.md:533"
      - layer: "Layer 6 (controller bypass gap)"
        why: "AUDIT hardness by explicit design (line 533: 'NOT a new registered gate'); second bypass is ACCEPTED to avoid legacy deadlock. No HARD block exists anywhere."
        severity: "high"
        tag: "[VERIFIED — design intent; DESIGN tag applies to the anti-deadlock accept]"
        evidence: "agents/core/pipeline-controller.md:533"
      - layer: "Layer 4 (dispatch-table lookup)"
        why: "Table membership is read textually by the controller LLM, not by code. A misread (Signal G) cannot be caught by any deterministic check."
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:518-533"

  # =================================================================
  # 2) SSOT VERIFICATION — gate-count drift + PLAN_MODE table consistency
  # =================================================================
  ssot_verification:
    - concept: "gate_count (THE central SSOT drift)"
      authoritative_source: "references/gates.md (header line 3 declares '35-gate registry')"
      actual_registry_rows: 35
      row_breakdown:
        core_table: "lines 25-42 = 18 rows (incl. PROTOCOL_HANDSHAKE_TIMEOUT at line 42)"
        spec_table: "lines 48-53 = 6 rows"
        routing_table: "lines 61-64 = 4 rows"
        brainstorm_table: "lines 70-76 = 7 rows"
        total: "18 + 6 + 4 + 7 = 35 [VERIFIED by direct row count]"
      divergent_sources:
        - source: "commands/pipeline.md:387 Inline Invariants"
          claims: "'Gate names that must exist (22 total)' — lists 22 names; INCLUDES COMPLEXITY_GATE; OMITS all 5 v7.2.0 gates (STATE_FILE_INIT_FAIL, PROTOCOL_HANDSHAKE_TIMEOUT, STEP_1_7_ROUTING, STOP_BEFORE_PA_DE_CAL, STEP_1_7_RECURSION_GUARD) and all 7 brainstorm gates"
          divergent: true
          severity: "high"
          note: "This is the AUTHORITATIVE anti-tampering list per its own header ('override Grep results if they disagree') — yet it is itself 13 gates stale. A correct gates.md would be branded 'tampered' by this stale invariant."
          tag: "[VERIFIED]"
          evidence: "commands/pipeline.md:387"
        - source: "commands/pipeline.md:1020 Gate Registry section"
          claims: "'Full 22-gate table ... lives in references/gates.md'"
          divergent: true
          severity: "high"
          note: "Points reader to a '22-gate table' that actually has 35 rows."
          tag: "[VERIFIED]"
          evidence: "commands/pipeline.md:1020"
        - source: "agents/core/pipeline-controller.md:261 Inline Invariants"
          claims: "27 named gates (3 MANDATORY + 14 HARD-listed + 4 CIRCUIT_BREAKER + ~6 SOFT incl. ADVERSARIAL_LOOP_CHECKPOINT); INCLUDES the v7.2.0 gates but OMITS COMPLEXITY_GATE and the 7 brainstorm gates"
          divergent: true
          severity: "high"
          note: "Newer than pipeline.md:387 (has STATE_FILE_INIT_FAIL + PROTOCOL_HANDSHAKE_TIMEOUT) but still not 35. Two controller-side invariant lists disagree with each other (27 vs 22)."
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:261"
        - source: "pipeline-controller.md:298 protocol audit-trail note"
          claims: "'The 22-gate registry is unchanged'"
          divergent: true
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:298"
        - source: "Mandatory-Gates-by-Complexity table (gates.md:92-124)"
          claims: "23 UNIQUE gate names across SIMPLES/MEDIA/COMPLEXA/Spec columns (counts 6/11/17/+6)"
          divergent: "PARTIAL — this is a different denominator (mandatory subset), not the registry total, so 23 != 35 is expected. But CLAUDE.md and changelog conflate them."
          severity: "medium"
          tag: "[VERIFIED]"
          evidence: "references/gates.md:92-124; counts at 118-122"
        - source: "CLAUDE.md canonical-version row"
          claims: "'35-gate Registry' AND 'Mandatory table 22→23' in different changelog rows"
          divergent: "self-consistent on 35 but documents the drift history"
          severity: "low"
          tag: "[VERIFIED]"
          evidence: "Pipeline-Orchestrator/CLAUDE.md (Gates SSOT row + v3.0 changelog row)"
      drift_summary: |
        FIVE sources, FOUR distinct numbers for the SAME concept:
          22  → commands/pipeline.md:387 (Inline Invariants, the self-declared authority) + :1020 + controller:298
          23  → gates.md Mandatory-by-Complexity unique names (different denominator, legitimately != 35)
          27  → pipeline-controller.md:261 Inline Invariants
          35  → references/gates.md registry (header:3 + 35 rows verified)
        ROOT SSOT VIOLATION: the registry total has THREE declared authorities
        (gates.md registry, pipeline.md:387 inline, controller:261 inline) and the
        two that explicitly claim override-precedence (pipeline.md:387, controller:261)
        are BOTH stale. The anti-tampering invariant would mislabel the correct file
        as tampered. This is a textbook DRY violation: one rule (the gate roster)
        has three divergent representations.
      tag: "[VERIFIED]"

    - concept: "PLAN_MODE_MANDATORY_AGENTS table"
      authoritative_source: "agents/core/pipeline-controller.md:518-531 (10-agent table)"
      members: ["plan-architect", "bugfix-diagnostic-agent", "bugfix-root-cause-analyzer", "audit-intake", "audit-domain-analyzer", "design-interrogator", "feature-vertical-slice-planner", "step-01-explore", "executor-implementer-task", "feature-implementer"]
      consistency_check:
        - claim: "All 10 table members have a matching per-agent Step-0 PLAN_MODE_REQUEST clause"
          status: "CONSISTENT (10/10 confirmed)"
          tag: "[VERIFIED]"
          evidence: "PLAN_MODE_RESULTS F20 pins exactly these 10; per-agent Step-0: plan-architect.md:105-108, bugfix-diagnostic-agent.md:87-109, design-interrogator.md:80-108, audit-domain-analyzer.md (this agent's own Step 0)"
        - claim: "design-interrogator IS in the table at line 527"
          status: "CONSISTENT in TEXT — but runtime controller misread it as absent (Signal G)"
          tag: "[VERIFIED]"
          evidence: "agents/core/pipeline-controller.md:527; 04-audit-intake.md:174-178"
        - claim: "No user-story specialist appears in the table despite user-story-* variants existing"
          status: "GAP — feature-implementer IS listed and user-story delegates to it, so coverage MAY be transitive"
          tag: "[HYPOTHESIS — user-story routes inline and reuses feature-implementer; not independently evidenced]"
          evidence: "agents/core/pipeline-controller.md:518-531; 04-audit-intake.md:222-226"
      tag: "[VERIFIED]"

    - concept: "registry-row count internal to gates.md"
      authoritative_source: "references/gates.md:3 ('35-gate registry')"
      duplicates: []
      divergent: false
      note: "gates.md is INTERNALLY consistent at 35. The AuditIntake research-finding of '34' was an undercount — it missed the omitted core-table row at line 42 (PROTOCOL_HANDSHAKE_TIMEOUT). Corrected here: 35."
      tag: "[VERIFIED — direct row enumeration lines 25-42/48-53/61-64/70-76]"

  # =================================================================
  # 3) COUPLING / CASCADE RISKS — cwd-coupled discovery (Signal F)
  # =================================================================
  architecture_findings:
    high_coupling_nodes:
      - file: "agents/core/pipeline-controller.md"
        role: "Single N1 enforcement point — owns Inline Invariants, PLAN_MODE table, PLAN_MODE_BYPASS, inline-routing rule, handshake timeout"
        coupling: "Every enforcement decision that is not hook-backed routes through this one prose file. Single point of failure for Layers 1,2,4,6."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:192,259-263,518-533"
      - file: ".claude/hooks/sentinel-hook.cjs (discoverStatePath)"
        role: "cwd-coupled state discovery shared with stop-hook"
        coupling: "Discovery precedence PIPELINE_DOC_PATH(env) > PIPELINE_RUN_ID(env) > mtime-newest under process.cwd()/.pipeline/docs. When env is unset, falls back to cwd-relative scan."
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/sentinel-hook.cjs:150-195 (cwd at 160)"
      - file: ".claude/hooks/stop-hook.cjs (findActiveRunFolder)"
        role: "cwd-coupled run-folder discovery — same precedence as sentinel"
        coupling: "Takes cwd param; PIPELINE_RUN_ID match → else mtime. Feeds run-log append, fidelity-report, Langfuse ship — ALL three degrade together on discovery miss."
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/stop-hook.cjs:118-170,458"

    cascade_risk_paths:
      - id: "Signal-F cwd-discovery cascade"
        path: "cwd mismatch / env unset  →  discoverStatePath + findActiveRunFolder pick wrong-or-null folder  →  {sentinel deny-on-missing} + {stop-hook run-log misattribution} + {fidelity-report against wrong run} + {Langfuse trace to wrong/empty doc-path}"
        mechanism: "Both hooks key on process.cwd() when PIPELINE_DOC_PATH/PIPELINE_RUN_ID are absent. A subagent runtime whose cwd != repo root (or a dual-location .pipeline/docs split) silently routes telemetry + sequencing to the wrong run."
        live_proof: "This very run (evt-002 per PLAN_MODE_RESULTS): sentinel denied plan-architect with 'No sentinel-state.json found' while the file existed repo-side — dual-location sync workaround was active. Earlier agents passed; the discovery is order/location sensitive."
        degraded_layers: ["sentinel sequencing (deny / fail-open)", "run-log coherence (Layer 5)", "fidelity freeze (Layer 3)", "Langfuse carrier fragmentation"]
        severity: "critical"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/sentinel-hook.cjs:150-195; .claude/hooks/stop-hook.cjs:118-170; PLAN_MODE_RESULTS Signal F live evt-002"
      - id: "Fidelity-freeze + run-log staleness cascade"
        path: "premature sub-session teardown  →  ensureFidelityReport writes undercount OR (gate-decisions.jsonl absent) skips forever  →  fidelity-report.json frozen  →  buildRunLogEntry stamps stale/null fidelity on every later entry"
        mechanism: "stop-hook:242 existsSync→return makes first write permanent; :245 absent-gate-data→return-nothing means a too-early first teardown can lock in null forever."
        live_proof: "2026-06-09 run-log entry: fidelity null, final_decision UNKNOWN, 0/11 gates, timestamp_end BEFORE timestamp_start."
        degraded_layers: ["Layer 3 fidelity", "Layer 5 run-log"]
        severity: "high"
        tag: "[VERIFIED]"
        evidence: ".claude/hooks/stop-hook.cjs:239-245; .pipeline/run-log.jsonl (2026-06-09); 04-audit-intake.md:203-212"
      - id: "Clock-skew aborted-run cascade"
        path: "aborted run + null timestamp_start (no derive from sentinel created_at)  →  run-log entry with end-before-start + UNKNOWN decision + 0/N gates"
        mechanism: "stop-hook reads timestamp_start from session context with null fallback; does not derive from sentinel-state.created_at."
        severity: "high"
        tag: "[VERIFIED]"
        evidence: "04-audit-intake.md:236-240; .pipeline/run-log.jsonl 2026-06-09"

    ordering_assumptions:
      - assumption: "Controller appends to pending_blocks IMMEDIATELY on receiving a REQUEST block, before any other work"
        risk: "Out-of-band — depends on controller honoring write-timing contract (prose). A crash-mid-ask before the append loses the audit trail; only the SessionStart hook recovers it."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:292"
      - assumption: "PLAN_MODE_BYPASS detection fires on RETURN with substantive output"
        risk: "Order-of-evaluation: if controller mis-classifies table membership at dispatch time, the return-time check is never reached (Signal G). The bypass detector and the table-lookup share the same fallible textual read."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:533; 04-audit-intake.md:217-221"

    responsibility_leaks:
      - description: "skills/audit/, audit-light/, audit-heavy/ folders exist but Phase 2 routes audit-* INLINE — skill folders imply a dispatch path that does not exist"
        file: "agents/core/pipeline-controller.md"
        line: 192
        tag: "[VERIFIED — inline routing; DESIGN — intentional but undocumented at skill-folder level]"
      - description: "feature-*, ux-sim-*, user-story-* skill folders likewise exist without controller dispatch wiring (only bugfix-* and spec-* dispatch via Skill)"
        file: "agents/core/pipeline-controller.md"
        line: 192
        tag: "[VERIFIED for the dispatch list; HYPOTHESIS that feature-* is unrouted — folder existence != dispatch]"

    safe_extension_points:
      - location: ".claude/hooks/ (new PreToolUse or Stop hook)"
        reason: "The ONLY layer with deterministic enforcement. A PLAN_MODE_REQUEST-presence check belongs here, not in controller prose — would close Signal G deterministically."
        tag: "[DESIGN]"
      - location: "protocol-events.jsonl (event:, never gate:)"
        reason: "AUDIT events already land here without touching the 35-gate registry; new observability is additive and registry-safe."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:533 ('event:' field rationale)"

    refactor_boundaries:
      - location: "references/gates.md registry rows + Mandatory-by-Complexity table"
        reason: "gate_registry_modification is a forbidden change type; F1 pins the table. Do NOT add/remove rows during an audit. Drift must be fixed by reconciling the STALE INLINE COPIES to match gates.md=35, not by editing gates.md."
        tag: "[VERIFIED]"
        evidence: "references/gates.md:88; 04-audit-intake.md:158-161"
      - location: "agents/core/pipeline-controller.md PLAN_MODE_MANDATORY_AGENTS table"
        reason: "10-agent roster is the live contract; changing membership cascades to F20 test + 10 per-agent Step-0 clauses."
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:518-531"

  # =================================================================
  # 4) CONTRACT_COMPLIANCE — Plan Mode 3-way (table ↔ per-agent ↔ test)
  #    + why Signal G slipped (no mechanism caught it)
  # =================================================================
  contract_compliance:
    plan_mode_three_way:
      - agent: "design-interrogator"
        in_controller_table: "YES (line 527)"
        per_agent_step0_clause: "YES (Step 0, ~line 80, PLAN_MODE_REQUEST MANDATORY with PLAN_MODE_BYPASS threat)"
        test_pin: "YES (F20 pins it among the 10)"
        runtime_behavior_this_run: "VIOLATED — 94 inline tool uses, no PLAN_MODE_REQUEST; controller cleared it as 'not in the table' (factually wrong)"
        compliant: false
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:527; agents/quality/design-interrogator.md:80-108; 04-audit-intake.md:150-153,174-178"
      - agent: "plan-architect"
        in_controller_table: "YES (line 522)"
        per_agent_step0_clause: "YES (Step 0 line ~107 defers to Achado #7; emits PLAN_MODE_REQUEST and stops)"
        test_pin: "YES (F18 fence-aware + F20)"
        runtime_behavior_this_run: "Step-1 residual ambiguity flagged (imperative research text without an in-Step-1 guard), but Step-0 emit clause present"
        compliant: "PARTIAL (text correct; Step-1 prose could be misread)"
        tag: "[VERIFIED]"
        evidence: "agents/quality/plan-architect.md:107-127; 04-audit-intake.md:179-183"
      - agent: "audit-domain-analyzer (self)"
        in_controller_table: "YES (line 526)"
        per_agent_step0_clause: "YES (own Step 0 + Achado #7 section)"
        test_pin: "YES (F20)"
        runtime_behavior_this_run: "COMPLIANT-by-substitution — parent pre-ran research and supplied PLAN_MODE_RESULTS; contract says proceed without re-emitting REQUEST when RESULTS are present"
        compliant: true
        tag: "[VERIFIED]"
        evidence: "agents/core/pipeline-controller.md:526; PLAN_MODE_RESULTS payload (status COMPLETED)"

    why_signal_G_slipped:
      summary: |
        Signal G (design-interrogator did 94 inline tool uses with zero PLAN_MODE_REQUEST,
        and the controller ACCEPTED the output and even cleared the agent with the
        factually wrong claim 'not in the table') slipped because EVERY layer that
        SHOULD have caught it is either prompt-only or pins TEXT rather than RUNTIME.
      mechanism_that_should_have_caught_it: "Controller PLAN_MODE_BYPASS detector (pipeline-controller.md:533) — it is the designated enforcement point and design-interrogator IS in scope (line 527)."
      why_none_did:
        - reason_1: "PROMPT-ONLY enforcement. The bypass detector is controller prose, not hook code. grep PLAN_MODE_BYPASS across .claude/hooks/ returns ZERO — there is no deterministic backstop. Whether it fires depends entirely on the controller LLM's judgment in-context."
          tag: "[VERIFIED]"
          evidence: ".claude/hooks/ grep=0; agents/core/pipeline-controller.md:533"
        - reason_2: "SENTINEL FACTUAL ERROR. The same controller that owns the bypass detector also owns the table lookup — both are textual reads of the same prose. The controller misread membership ('not in the table') and the sentinel cleared it; one fallible read, no independent cross-check (evt-005 per AuditIntake)."
          tag: "[VERIFIED]"
          evidence: "04-audit-intake.md:217-221 (Signal D lookup gap); PLAN_MODE_RESULTS evt-005"
        - reason_3: "TESTS PIN TEXT, NOT BEHAVIOR. F20/F21 pin that the table contains 10 agents and that the bypass paragraph exists verbatim — they assert the CONTRACT TEXT is present, not that the runtime EMITS or DETECTS anything. A run can violate the contract while every test stays green."
          tag: "[VERIFIED]"
          evidence: "PLAN_MODE_RESULTS F20 (pins 10 agents) + F21 (pins controller bypass text 518-533)"
        - reason_4: "ANTI-DEADLOCK ACCEPT BY DESIGN. Even when the detector DOES fire, line 533 mandates: first bypass → 1 re-dispatch; second bypass → ACCEPT and proceed (no hard block). So a determined-or-buggy inline researcher is always eventually accepted. The gap is intentional to protect legacy sessions, but it means Layer 1 has no terminal enforcement."
          tag: "[VERIFIED — DESIGN]"
          evidence: "agents/core/pipeline-controller.md:533"
      net_assessment: |
        Signal G is not a single bug — it is the convergence of a prompt-only detector,
        a shared fallible textual lookup, text-pinning tests, and a by-design accept path.
        The contract is fully present in TEXT (table + per-agent + tests all consistent),
        yet RUNTIME compliance is unenforceable by any deterministic mechanism in the repo.
      tag: "[VERIFIED]"

  # =================================================================
  # DOMAIN MAP — enforcement entities & relationships
  # =================================================================
  domain_map:
    entities:
      - name: "Gate Registry (SSOT)"
        file: "references/gates.md"
        relationships: ["consumed-by fidelity-reporter.cjs", "pinned-by F1", "shadowed-by 2 stale inline copies (pipeline.md:387, controller:261)"]
        tag: "[VERIFIED]"
      - name: "PLAN_MODE_MANDATORY_AGENTS table"
        file: "agents/core/pipeline-controller.md:518-531"
        relationships: ["enforced-by PLAN_MODE_BYPASS prose (same file:533)", "mirrored-by 10 per-agent Step-0 clauses", "pinned-by F20"]
        tag: "[VERIFIED]"
      - name: "sentinel-state.json (runtime state)"
        file: ".pipeline/docs/**/sentinel-state.json"
        relationships: ["discovered-by sentinel-hook (cwd-coupled)", "discovered-by stop-hook (cwd-coupled)", "carries expected_next + pending_blocks + run_id"]
        tag: "[VERIFIED]"
      - name: "fidelity-report.json (frozen artifact)"
        file: ".pipeline/docs/**/fidelity-report.json"
        relationships: ["written-once by stop-hook:242", "read-by buildRunLogEntry", "denominator from gates.md Mandatory table"]
        tag: "[VERIFIED]"
    leaked_business_rules:
      - rule: "Gate roster (a single rule) duplicated into 3 places with 2 stale copies"
        file: "commands/pipeline.md"
        line: 387
        tag: "[VERIFIED]"
      - rule: "Table-membership lookup performed by LLM prose-reading instead of code"
        file: "agents/core/pipeline-controller.md"
        line: 533
        tag: "[VERIFIED]"

  # =================================================================
  # CONSOLIDATED SEVERITY (this agent's additive findings)
  # =================================================================
  severity_rollup:
    critical:
      - "Layer 1 + Layer 4: Plan Mode contract is prompt-only; table lookup is fallible textual read (Signal G root)"
      - "Signal-F cwd-discovery cascade degrades sentinel + run-log + fidelity + Langfuse together"
    high:
      - "Gate-count SSOT drift: 22/23/27/35 across 5 sources; the 2 self-declared authorities (pipeline.md:387, controller:261) are BOTH stale"
      - "Fidelity-freeze + run-log staleness cascade (stop-hook:242/245)"
      - "Layer 6 PLAN_MODE_BYPASS AUDIT-only, second bypass accepted — no terminal enforcement"
    medium:
      - "Tests pin TEXT not RUNTIME (F18/F19/F20/F21) — green suite coexists with contract violation"
      - "audit-*/feature-*/ux-sim-*/user-story-* skill folders exist without dispatch wiring (Signal B/B2/S2)"
    low:
      - "AuditIntake '34 rows' corrected to 35 (line-42 omission); gates.md internally consistent"
```

---

## DOMAIN_ANALYZER_RESULT

```yaml
DOMAIN_ANALYZER_RESULT:
  status: "COMPLETE"
  output: "DOMAIN_ANALYSIS"
  next_agent: "audit-compliance-checker"
  summary: |
    6 enforcement layers analyzed for mechanism, SSOT integrity, coupling, and Plan Mode compliance.
    KEY FINDINGS:
    (1) ENFORCEMENT MECHANISM — Layers 1, 4, and 6 are PROMPT-ONLY (zero hook code): grep PLAN_MODE_BYPASS/PLAN_MODE_REQUEST across .claude/hooks/ returns 0. Only sentinel-sequencing and PROTOCOL_HANDSHAKE_TIMEOUT have real deterministic backing.
    (2) SSOT DRIFT FORMALIZED — gate count has 4 distinct numbers across 5 sources: 22 (pipeline.md:387 Inline Invariants + :1020 + controller:298), 27 (controller:261), 23 (Mandatory-by-Complexity unique names, a different denominator), 35 (gates.md registry, header:3 + 35 rows verified). The two lists that claim override-authority (pipeline.md:387, controller:261) are BOTH stale by 8-13 gates — a correct gates.md would be branded 'tampered'. AuditIntake's '34' corrected to 35.
    (3) COUPLING/CASCADE — Signal-F cwd-coupled discovery (sentinel-hook:150-195, stop-hook:118-170) is a single cascade: env-unset/cwd-mismatch silently degrades sentinel sequencing + run-log + fidelity + Langfuse together. Proven live this run (evt-002 dual-location workaround).
    (4) CONTRACT COMPLIANCE — Plan Mode contract is 3-way CONSISTENT in TEXT (10-agent table = 10 per-agent Step-0 clauses = F20 pin) yet RUNTIME-unenforceable. Signal G slipped because: detector is prompt-only, table lookup is a shared fallible textual read (sentinel cleared with wrong claim), tests pin TEXT not BEHAVIOR, and the anti-deadlock design ACCEPTS the second bypass.
    PLAN_MODE_BYPASS protocol honored: parent supplied PLAN_MODE_RESULTS; this agent proceeded without re-emitting REQUEST per contract. No production files modified. Wrote only 05-audit-domain-analyzer.md.
  blocked_reason: null
```
