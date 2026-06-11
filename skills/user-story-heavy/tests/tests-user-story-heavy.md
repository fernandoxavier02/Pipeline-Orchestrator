# Test Strategy — User Story Heavy (10 prescriptive steps)

> **Note:** User Story pipelines are **code-changing**. The "tests" below combine golden-run / contract tests that validate the *workflow* with the original Pulsar translation guidelines (preserved verbatim) that govern how a complex narrative becomes a decomposed scenario matrix and verifiable acceptance criteria.

## Source ancestry

Ported 1:1 from `D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\Heavy\TESTS_USER_STORY_HEAVY.md`. The translation guidelines below are preserved verbatim; the contract-layer assertions are added for the imported skill.

## Worked example fixture

A real worked example of the step-1 `IntakeNLP` output (an audio/text mismatch story) lives at the ancestor path `D:\Projeto Pulsar\.claude\commands\Prompts\User_story_translated\Heavy\INTAKE_NLP_01_Audio_Mismatch.json`, with its formal spec at `SPEC_01_Audio_Mismatch.md`. Use it as the golden fixture for step-1 NLP extraction and as the input for a full end-to-end golden run.

## Contract layer — what gets tested

| Layer | What we test | How |
|-------|--------------|-----|
| Frontmatter contract | Each `steps/0X-*.md` declares all required fields incl. `execution_mode`, `agent_type`, `expected_inputs/outputs`, `expected_next`, `gate_required`. | Static parser walks all 10 step files. |
| Sequence lock | Steps execute strictly 1→2→3→4→5→6→7→8→9→10. | Golden run; audit log shows linear transitions. |
| TDD gate (step 6) | Acceptance-criteria + journey + regression tests are created; AC tests FAIL (RED), regression PASSES, before step 7. Step 7's GATE refuses to run without a step-6 artifact whose AC tests are RED. | Golden run; step-7 hard gate. |
| Adversarial gate (step 8) | AskUserQuestion invoked to approve the review; fix loop max 3; mandatory if auth/data/migrations touched. | Hook event capture. |
| Pa de Cal gate (step 10) | AskUserQuestion `GO/NO-GO` invoked; release notes generated. | Golden runs across fixture types. |
| AskUserQuestion gates | Steps 6, 8, 10 invoke AskUserQuestion (no prose substitute). | Hook event capture. |
| Sentinel checkpoints | Sentinel state validates before steps 6, 8, 10 (`pre_6`, `pre_8`, `pre_10`). | `sentinel-hook` events. |
| STOP RULE | 2 consecutive failures halt the pipeline. | Inject failure; expect halt. |
| Output schema | Each step's `expected_outputs` is well-typed and chains to the next step's `expected_inputs`. | Schema check on JSON deliverables. |
| 1:1 fidelity | Each step body preserves the Pulsar HEAVY_0N prompt text verbatim. | Diff against ancestor. |

## Per-step contract assertions (Heavy)

- **Step 1 — IntakeNLP + Spec** spec narrative covers history/scope/acceptance/severity + per-layer suspect inventory; `IntakeNLP` JSON has NLP entities, ambiguities, gaps.
- **Step 2 — ReproPlan + ObservabilityPlan** both JSONs present; observability explained in plain language.
- **Step 3 — RootCauseMatrix** per-layer hypotheses with prova/refutação/teste mínimo; endpoint/contract/coupling/cascade/frontend-lifecycle terms explained.
- **Step 4 — DomainSSOT + ContractAudit** both JSONs present; backward compatibility addressed.
- **Step 5 — ActionPlan + GovernancePlan** both JSONs present; strategy A/B, guardrails, test plan, rollback, governance.
- **Step 6 — Tests** each AC has a test; journey + regression + error/boundary contracts present; AC tests FAIL now; regression passes now; traceability matrix present; TDD AskUserQuestion invoked.
- **Step 7 — ImplementationReport** JSON present with atomic commits; minimal-diff + non-invention respected.
- **Step 8 — AdversarialReview** JSON present with `must_fix_before_merge`; sensitive-point checks; adversarial AskUserQuestion invoked.
- **Step 9 — SanityCheck** JSON present with lay + tech smoke, regression checklist, monitoring notes.
- **Step 10 — FinalSeal** JSON present with acceptance/regression/contract/rollback status + release notes; `go_no_go` ∈ `{GO, CONDITIONAL, NO-GO}`; Pa de Cal AskUserQuestion invoked.

## Anti-tests

- No implementation before step-6 RED tests (TDD gate).
- No skip / reorder (sequence_lock).
- No prose substitute for AskUserQuestion at steps 6, 8, 10.
- No assumed values (non-invention rule in step 7).
- No GO at step 10 when an acceptance criterion cannot be proven (must declare explicitly).

---

## Pulsar translation guidelines — Nível Heavy (preserved verbatim)

User stories complexas, com múltiplos requisitos, regras de negócio intrincadas ou dependências externas relevantes exigem uma abordagem estruturada para tradução técnica e validação. Este documento apresenta boas práticas para decompor essas histórias, elaborar critérios de aceitação completos e preparar testes que sirvam de base para o desenvolvimento orientado a testes (TDD).

### 1. Diagnóstico detalhado da história

1. **Mapeamento do contexto**: identifique todos os atores, sistemas externos e variáveis de contexto envolvidos. Crie um diagrama de casos de uso ou modelo de domínio para visualizar interações.
2. **Identificação de requisitos implícitos**: além do texto fornecido, busque regras tácitas (por exemplo, políticas de negócio, restrições legais, limites de performance). Consulte stakeholders ou documentação de processo.
3. **Análise de impacto**: avalie como a nova funcionalidade interage com features existentes, APIs e base de dados. Anote riscos de regressão ou necessidade de refatoração.

### 2. Elaboração de critérios de aceitação e matriz de cenários

1. **Decompor em sub‑funcionalidades**: divida a user story em partes menores, cada uma com seu próprio objetivo e critério de aceitação. Isso facilita teste e implementação incremental.
2. **Criar matriz de cenários**: para cada sub‑funcionalidade, construa uma matriz listando variações de entradas (dados válidos, inválidos, limites) e estados (por exemplo, usuário autenticado/não autenticado, configurações específicas). Defina o resultado esperado de cada combinação.
3. **Priorizar cenários**: classifique a matriz por criticidade e risco. Destaque cenários obrigatórios (que precisam estar na primeira entrega) e cenários avançados (que podem ser implementados depois).

### 3. Especificação técnica com foco em testes

1. **Formalizar contratos**: se a user story implica expor ou consumir APIs, defina contratos formais (OpenAPI, GraphQL) incluindo exemplos de requisições, respostas e códigos de erro. Esses contratos servirão de base para geração de testes automatizados.
2. **Modelagem de dados**: elabore modelos e esquemas de persistência necessários. Defina validações, constraints e relacionamentos. Planeje testes para migrações e integridade referencial.
3. **Critérios não funcionais**: documente requisitos de performance, segurança, conformidade e usabilidade que devem ser validados por testes específicos.

### 4. Planejamento de testes automatizados

1. **Escrever cenários BDD em detalhe**: utilize Gherkin ou formato equivalente para cada linha da matriz de cenários, descrevendo pré‑condições, ações e resultados esperados. Inclua títulos claros e tags para facilitar filtragem.
2. **Preparar dados e *fixtures***: para cenários complexos, prepare conjuntos de dados de teste com diferentes estados (por exemplo, usuários com histórico extenso, contas suspensas). Armazene fixtures versionadas.
3. **Determinar níveis de teste**:
   - **Unitários**: validar regras de negócio isoladas (cálculos, validações).
   - **Integração**: verificar comunicação entre módulos, persistência e consistência de dados.
   - **Contratos de API**: assegurar conformidade entre produtor e consumidor de serviços.
   - **E2E**: simular o fluxo completo do usuário, inclusive via interface gráfica, quando necessário.
   - **Propriedade**: aplicar property-based testing para regras com muitos domínios de entrada.

### 5. Validação da tradução e refinamento

1. **Reuniões de refinamento**: apresente critérios e cenários à equipe de produto e a stakeholders para revisão. Ajuste critérios conforme feedback.
2. **Cross‑review**: peça a um desenvolvedor ou arquiteto para revisar a especificação e os testes propostos, identificando inconsistências ou melhorias.
3. **Traçado de dependências**: garanta que todas as dependências (serviços externos, bibliotecas, dados) estão mapeadas e que existem estratégias de *mocking* ou sandboxing para testes.

### 6. Produção de artefatos de apoio

1. **Documentos de especificação**: compile todos os critérios, cenários, modelos de dados, contratos de API e diagramas em um documento versionado (`specs/<feature>.md` ou equivalente).
2. **Backlog de tarefas técnicas**: crie tarefas ou histórias de implementação correspondentes a cada sub‑funcionalidade e cenário, incluindo testes automatizados. Estime esforço e dependências.
3. **Plano de testes**: gere um plano de execução descrevendo quais testes serão automatizados inicialmente e quais ficarão para etapas posteriores (por exemplo, performance ou segurança).

### 7. Resultado esperado

Ao concluir a tradução heavy de uma user story, você terá:

- Uma decomposição completa da história em sub‑funcionalidades, cenários e critérios de aceitação.
- Especificações técnicas detalhadas (contratos, modelos de dados, restrições) prontas para consumo pela equipe de desenvolvimento.
- Um conjunto de testes BDD ou pseudo‑código cobrindo variações críticas, pronto para automação.
- Um backlog organizado de tarefas técnicas com foco em TDD e cobertura de testes.

Essas diretrizes ajudam a garantir que histórias complexas não sejam mal interpretadas e que a implementação posterior esteja alinhada aos requisitos de negócio e qualidade.
