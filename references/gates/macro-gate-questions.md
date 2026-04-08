# Macro-Gate: Conditional Questions

The information-gate agent uses these conditional question sets to detect knowledge gaps BEFORE pipeline execution begins. Questions are selected based on task type and affected domain.

---

## By Task Type

### Bug Fix
- How to reproduce? (steps, environment, frequency)
- Expected vs actual behavior?
- When did it start? (recent change, deployment?)
- Error messages or logs available?
- Which users/environments are affected?

### Feature
- Does a spec or requirements document exist?
- UX flow defined? (wireframes, user journey, mockups)
- Data persistence strategy? (where to store, schema)
- Who is the target user? (persona, role)
- Are there acceptance criteria?

### User Story
- Who is the user? (persona, role, permissions)
- What triggers this story? (entry point, user action)
- Acceptance criteria defined? (Given/When/Then)
- Edge cases identified? (empty state, error, offline)
- How will success be measured?

### Audit
- Scope defined? (which modules, which axes of review)
- Baseline exists? (previous audit to compare against)
- Stakeholder for findings? (who receives the report)
- Severity threshold? (report all or only critical?)
- Time constraints? (full deep-dive or quick scan)

### UX Simulation
- Target user journey defined? (step-by-step flow)
- Devices and browsers to test?
- Accessibility requirements? (WCAG level)
- Performance budgets? (load time, interaction delay)
- Comparison baseline? (current vs proposed)

---

## By Affected Domain (Conditional)

These questions are asked ONLY when the classified task touches specific domains.

### If pipeline includes TDD (all except Audit, UX Simulation, and DIRETO)
- Test framework configured and installed? (e.g., pytest, jest, vitest)
- Tests currently passing? (baseline before changes)
- Build command available and working?

### If files touch auth/security
- Security rules or policies affected?
- Token/session management changes?
- Password/credential handling involved?
- Third-party auth provider changes?

### If files touch data/persistence
- Data paths defined? (DB collections, tables, keys)
- Schema documented or inferable from code?
- Migration needed? (breaking changes to existing data)
- Backup/rollback strategy?

### If files touch pricing/credits/billing
- Values approved by stakeholder?
- Single source of truth for pricing identified?
- Free tier / paid tier boundaries clear?
- Refund or reversal logic needed?

### If files touch external APIs/integrations
- API documentation available?
- Rate limits known?
- Error handling strategy? (retry, fallback, circuit breaker)
- Authentication method documented?

### If files touch UI/frontend
- Design mockups available?
- Responsive breakpoints defined?
- Loading/error/empty states specified?
- Accessibility requirements?

---

## Question Protocol

1. **ONE question at a time** — never present the full list
2. **Skip if answered** — if the answer is present in the user's request, in the code the information-gate read in Step 0, or is directly inferrable from observable project conventions, mark it resolved. The code is part of the context — but only skip if clearly answered, not if "probably fine".
3. **BLOCKER vs IMPORTANT** — classify each gap by severity
4. **Max 2 options** — if offering alternatives, present at most 2 with pros/cons
5. **Stop when clear** — once all relevant gaps are resolved, proceed immediately
