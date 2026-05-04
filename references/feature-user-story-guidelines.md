---
source: "Pulsar/{Ligth,Heavy}/TESTS_USER_STORY_{LIGHT,HEAVY}.md (merged 2026-05-03 v4.7.0)"
related_skills: [feature-light, feature-heavy]
---

# User Story Translation Guidelines (Light + Heavy merged)

These guidelines orient how to transform a natural-language narrative provided by an end-user (non-technical) into clear, verifiable technical criteria. The objective is to ensure that the interpretation of a user story for software requirements is correct and complete, using tests as the validation mechanism.

This document merges two Pulsar sources originally intended for the `feature-light` and `feature-heavy` test files (`TESTS_USER_STORY_LIGHT.md` + `TESTS_USER_STORY_HEAVY.md`). They are reference material consumed by the user (or whoever writes the user story before invoking the skill). The skill itself does NOT execute these guidelines as steps — its tests live in `skills/feature-{light,heavy}/tests/`.

---

## Part 1 — Light: small-to-medium stories

### 1. Initial understanding and validation

1. **Read and summarize the story**: read the original user story and write a summary in simple technical language. Identify actors, intentions, and implicit constraints.
2. **Identify gaps**: note any ambiguities or missing details (e.g., data formats, limits, error messages). Ask the requester objective questions or use the *diagnostic* pipeline for clarity.
3. **Confirm understanding**: present the summary to the requester (or represent the user) and validate that the interpretation matches the original intent.

### 2. Define acceptance criteria in business language

1. **Write acceptance scenarios**: use the *Given/When/Then* format for each expected behavior. For example:
   - *Given* the user has not checked in today,
   - *When* they check in indicating "sad" emotion,
   - *Then* the system must record the event and increase today's check-in counter.
2. **Cover alternative cases**: include scenarios for invalid input, insufficient permissions, or unavailable dependencies. Each scenario must have a predictable outcome.
3. **Prioritize criteria**: mark essential criteria (must be implemented first) and desirable ones (can be incremental).

### 3. Translate criteria into automated tests

1. **Choose the appropriate level**: for simple stories, acceptance tests can be implemented as API or application-layer tests; for flows that include UI, plan interface tests.
2. **Create test sketch**: for each acceptance criterion, describe in pseudo-code or Gherkin notation the step-by-step test. Use self-explanatory names (e.g., `Scenario: register check-in successfully`).
3. **Reuse components**: identify functions, pages, or endpoints that can be used to implement the criterion. If no component exists, log the need for creation in the backlog.

### 4. Validate translation comprehensiveness

1. **Functional coverage**: verify that all explicit and implicit story requirements are represented in the acceptance criteria. Use checklists or diagrams to ensure no part is forgotten.
2. **Ensure no scope creep**: ensure criteria do not extrapolate beyond the original request. If a criterion introduces unrequested functionality, question its relevance or remove it.
3. **Cross-review**: ask another team member to review the translation and criteria, validating clarity and completeness.

### 5. Record artifacts and plan implementation

1. **Document criteria**: store scenarios in spec files (`*.feature` for Gherkin or Markdown) in the repo. This serves as a contract between product and development teams.
2. **Create technical tasks**: for each criterion, open technical stories or *tickets* in the management system, detailing implementation, automated tests required, and dependencies.
3. **Plan tests before coding**: before starting implementation, prepare the corresponding automated tests (even if they fail initially). This ensures the translation aligns with TDD practice.

### 6. Light expected output

- A clear set of acceptance criteria derived from the user story.
- Clarification questions answered or documented for future consultation.
- Acceptance tests in pseudo-code or Gherkin ready for automation.
- Technical tasks created for each criterion, aligned with the project backlog.

---

## Part 2 — Heavy: complex stories with rich domain rules

User stories that are complex, with multiple requirements, intricate business rules, or significant external dependencies require a structured approach for technical translation and validation. This section presents best practices to decompose those stories, write complete acceptance criteria, and prepare tests that serve as the foundation for test-driven development (TDD).

### 1. Detailed story diagnosis

1. **Context mapping**: identify all actors, external systems, and context variables involved. Create a use-case diagram or domain model to visualize interactions.
2. **Implicit requirements identification**: beyond the provided text, search for tacit rules (e.g., business policies, legal restrictions, performance limits). Consult stakeholders or process documentation.
3. **Impact analysis**: assess how the new functionality interacts with existing features, APIs, and database. Note regression risks or refactor needs.

### 2. Acceptance criteria + scenario matrix

1. **Decompose into sub-functionalities**: split the user story into smaller parts, each with its own objective and acceptance criterion. This facilitates testing and incremental implementation.
2. **Build scenario matrix**: for each sub-functionality, build a matrix listing input variations (valid, invalid, boundary data) and states (e.g., authenticated/unauthenticated, specific configurations). Define the expected outcome for each combination.
3. **Prioritize scenarios**: classify the matrix by criticality and risk. Highlight mandatory scenarios (must be in first delivery) and advanced ones (can come later).

### 3. Test-focused technical specification

1. **Formalize contracts**: if the user story involves exposing or consuming APIs, define formal contracts (OpenAPI, GraphQL) including request/response examples and error codes. These contracts will serve as the basis for generating automated tests.
2. **Data modeling**: produce models and persistence schemas needed. Define validations, constraints, and relationships. Plan tests for migrations and referential integrity.
3. **Non-functional criteria**: document performance, security, compliance, and usability requirements that must be validated by specific tests.

### 4. Automated test planning

1. **Write detailed BDD scenarios**: use Gherkin or equivalent format for each row of the scenario matrix, describing pre-conditions, actions, and expected results. Include clear titles and tags for filtering.
2. **Prepare data and fixtures**: for complex scenarios, prepare test data sets with different states (e.g., users with extensive history, suspended accounts). Store versioned fixtures.
3. **Determine test levels**:
   - **Unit**: validate isolated business rules (calculations, validations).
   - **Integration**: verify communication between modules, persistence, and data consistency.
   - **API contract**: ensure conformance between service producer and consumer.
   - **E2E**: simulate the complete user flow, including via GUI, when needed.
   - **Property**: apply property-based testing for rules with many input domains.

### 5. Translation validation and refinement

1. **Refinement meetings**: present criteria and scenarios to product and stakeholders for review. Adjust criteria based on feedback.
2. **Cross-review**: ask a developer or architect to review the spec and proposed tests, identifying inconsistencies or improvements.
3. **Dependency tracing**: ensure all dependencies (external services, libraries, data) are mapped and that mocking or sandboxing strategies exist for tests.

### 6. Supporting artifact production

1. **Specification documents**: compile all criteria, scenarios, data models, API contracts, and diagrams into a versioned document (`specs/<feature>.md` or equivalent).
2. **Technical task backlog**: create tasks or implementation stories for each sub-functionality and scenario, including automated tests. Estimate effort and dependencies.
3. **Test plan**: generate an execution plan describing which tests will be automated initially and which will come in later phases (e.g., performance or security).

### 7. Heavy expected output

When concluding a heavy user-story translation, you will have:

- A complete decomposition of the story into sub-functionalities, scenarios, and acceptance criteria.
- Detailed technical specifications (contracts, data models, restrictions) ready for consumption by the development team.
- A set of BDD or pseudo-code tests covering critical variations, ready for automation.
- An organized backlog of technical tasks with focus on TDD and test coverage.

These guidelines help ensure that complex stories are not misinterpreted and that subsequent implementation aligns with business requirements and quality.

---

## Usage with feature-{light,heavy} skills

These guidelines should be applied **before** invoking `/pipeline-orchestrator:feature-light` or `/pipeline-orchestrator:feature-heavy`. They produce the user-story + DoD that becomes the input to step 1 (Intent + Scope) of the skill. The skill steps 3 (User Flow + UX) and 10 (TDD Pre-Impl) consume the resulting acceptance criteria and expand them into the matrix + test files.

If your user story already comes with structured DoD (3–8 testable criteria), you can skip this preparation. Otherwise, apply Light (for small stories) or Heavy (for complex ones) before invoking the skill.
