---
name: pipeline-orchestrator-vsa
description: Vertical Slice Architecture para Feature/User Story pipelines — quebrar feature em slices verticais end-to-end com BDD Gherkin. Usada pelos cargos feature-*.
when_to_use: Pipeline tipo Feature ou User Story. Carregada por feature-vertical-slice-planner, feature-implementer, feature-integration-validator.
---

# pipeline-orchestrator-vsa

Vertical Slice Architecture (VSA): quebrar uma feature grande em **slices verticais independentes**, cada slice atravessando todas as camadas (UI → API → service → data → DB) entregando valor end-to-end.

## 1. Por que VSA

| Abordagem horizontal (layered) | VSA |
|---|---|
| Implementa toda a UI primeiro, depois toda a API, etc. | Implementa 1 fluxo completo (1 UI + 1 endpoint + 1 query) |
| Risco alto: feature so funciona quando todas camadas prontas | Risco baixo: cada slice eh deployavel sozinho |
| Difficult to ship incremental | Cada slice eh ship-ready independente |
| TDD eh dificil (mock de 3 camadas) | TDD eh natural (1 happy path E2E por slice) |

## 2. Slice planning (`feature-vertical-slice-planner`)

### 2.1 Entrada

- Issue de Feature com criterios de aceitacao
- (Opcional) requirements.md se veio do spec lifecycle

### 2.2 Algoritmo de slicing

1. **Listar todos os criterios de aceitacao** explicitos na issue
2. **Agrupar por persona + jornada** — cada combinacao persona x jornada eh candidato a slice
3. **Identificar happy path simples** — o slice "menor que funciona" — sera o slice 1
4. **Identificar variantes/edge cases** — viram slices 2, 3, ...
5. **Order topologico** — slice N pode depender de slice M (M antes de N)

### 2.3 Slice template (BDD Gherkin)

Para cada slice:

```gherkin
Feature: {{nome da feature}}

  Scenario: Slice 1 - happy path simples
    Given {{state inicial}}
    When {{acao da persona}}
    Then {{resultado observavel}}
    And {{efeito colateral verificavel}}
```

### 2.4 Saida do planner

```markdown
### VSA_PLAN v1

```yaml
feature_summary: "..."
slices:
  - id: S1
    name: "Happy path - login com email/senha valido"
    persona: "Usuario com conta existente"
    journey: "Login pra acessar dashboard"
    gherkin: |
      Given um usuario com email "foo@bar.com" e senha valida
      When ele submete o formulario de login
      Then ele eh redirecionado para /dashboard
      And uma sessao ativa eh criada
    layers_touched: [ui_login_form, api_auth_endpoint, service_session, db_users]
    files_estimated: [src/web/login.tsx, src/api/auth.py, src/service/session.py]
    dependencies: []
  - id: S2
    name: "Edge - senha incorreta"
    dependencies: [S1]
  # ...
slicing_principle: "Cada slice eh ship-ready end-to-end. Order = S1, S2, S3"
deployable_per_slice: true
```
```

### 2.5 Dispatcho

Apos VSA_PLAN aprovado pelo Board (GATE_REQUEST), dispatcha 1 sub-issue por slice, assignee=feature-implementer.

## 3. Slice implementation (`feature-implementer`)

Para cada sub-issue de slice:

1. Carregar skill `pipeline-orchestrator-tdd`
2. RED: escrever 1 teste E2E (BDD-style) que captura o slice
3. GREEN: implementar o minimo nas N camadas pra fazer passar
4. REFACTOR: limpar duplicacao dentro do slice
5. Status=in_review → review-orchestrator pega

### 3.1 Constraint critico

**Cada slice fecha sozinho**. NAO comecar slice N+1 antes do slice N estar `done` (com green tests + review).

Se voce ve duplicacao entre slices na fase 3 (slice 2 copiando codigo do slice 1), refactor para extrair quando necessario, mas NAO pre-otimize.

## 4. Slice validation (`feature-integration-validator`)

Apos todos slices fechados, valida integracao cross-slice:

| Check | Pergunta |
|---|---|
| Cross-slice consistency | Slice 2 usa interface que slice 1 expoe? Bate? |
| End-to-end | Combine slices em 1 jornada full — funciona? |
| Acceptance criteria | Todos os criterios da issue original cumpridos? |
| Layer integration | UI → API → Service → DB esta consistente em payloads? |

Saida:

```markdown
### INTEGRATION_VALIDATION v1

```yaml
slices_validated: [S1, S2, S3]
cross_slice_consistency: PASS
e2e_journey_test: PASS
acceptance_criteria_covered: 7/7
layer_integration:
  ui_to_api: PASS
  api_to_service: PASS
  service_to_data: PASS
verdict: PASS  # PASS | NEEDS_RECONCILIATION
```
```

## 5. Quando slice fica "muito grande"

Se voce nota que um slice exige >200 linhas em >5 arquivos, eh sinal pra ressalsing:
- POST `### VSA_RESLICE_REQUEST v1` no ticket-mae
- Sugerir como dividir em 2-3 slices menores
- GATE_REQUEST pro Board aprovar re-slice antes de continuar

## 6. Anti-padroes

❌ Slices horizontais ("primeiro a UI inteira") — defeats VSA
❌ Slice 1 cobrindo edge cases — slice 1 eh happy path
❌ Implementar slice 2 enquanto slice 1 ainda esta em review — risco de retrabalho
❌ Mockar camadas em testes do slice — slice deve ser E2E real
❌ Compartilhar codigo entre slices ANTES de ver duplicacao real — premature abstraction
