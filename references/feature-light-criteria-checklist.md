# Feature-Light Acceptance Criteria Checklist (R-5)

**SSOT:** Este arquivo.
**Origem:** Slice 0 R-5 (`designs/pipeline-orchestrator-v5-consolidated.md` §12.3.3).
**Aplicável a:** `pipeline-controller` quando rodando pipeline `feature-light` em V5.0.
**Substituído por (futuro):** `feature-acceptance-criteria-author` agent em V5.1 (§7.1.2 do consolidado lista esse agent como diferido).

---

## Problema que esta doc resolve

V5.1 vai introduzir um agent dedicado. Em V5.0, derivação de critérios é responsabilidade procedimental do `pipeline-controller`. Sem checklist concreto, controller deriva critérios de forma inconsistente — vagos demais, longos demais, sem testabilidade.

Esta doc dá o passo a passo procedimental.

---

## Quando aplicar

Pipeline-controller invoca este checklist quando:
- `pipeline_type == feature` (entry via `/pipeline-orchestrator:feature` ou via classifier)
- `intensity == light`
- `version >= 5.0` e `< 5.1`

Não aplica para:
- `feature-heavy` (fases adicionais produzem critérios mais ricos)
- `bugfix`, `audit`, `ux` (têm critérios próprios)
- V5.1+ (delegar a agent dedicado)

---

## Procedimento (5 regras)

### Regra 1 — Derivação a partir do Intent

**Input:** `intent: string` (request original do usuário, fase 0).

**Ação:** Cada acceptance criterion DEVE derivar diretamente do intent, não de inferência sobre arquitetura ou code style.

**Verificável:** Cada critério tem trace de qual frase do intent o gerou.

**Exemplo:**
- ✓ Intent: "Quero exportar relatório em PDF"
  - Critério: "Dado relatório carregado, quando usuário clica 'Exportar PDF', então .pdf é baixado com conteúdo do relatório."
- ✗ Critério ANTI-pattern: "O sistema deve usar pdf-lib v3.x" — decisão de arquitetura, não critério.

### Regra 2 — Enumeração ≤ 5

**Limite duro:** No máximo **5** acceptance criteria para feature-light.

**Justificativa:** Light é para escopos pequenos (1-3 arquivos, ≤100 linhas). Mais de 5 = scope creep ou recorte ruim.

**O que fazer com excedentes:**
1. Agrupar irmãos em parent ("Dado..., quando..., então X, Y, Z").
2. Promover para `feature-heavy` (múltiplos slices).
3. Deferir não-MVP para issue de follow-up.

### Regra 3 — Formato Given-When-Then

**Sintaxe obrigatória:**

```gherkin
Dado <pré-condição mensurável>
Quando <ação concreta>
Então <resultado observável>
```

**Verificável (script):**
```javascript
const VALID = /^Dado .+\s+Quando .+\s+Então .+$/s;
```

**Anti-patterns rejeitados:**
- "O sistema deve ser rápido" (não testável)
- "Funciona conforme esperado" (sem definição)
- "Quando o usuário usar a feature, ela funciona" (tautológico)

### Regra 4 — Cada critério gera ≥1 teste

**Mapeamento 1:1+:** Cada acceptance criterion DEVE corresponder a ≥1 teste automatizado (RED phase TDD).

**Verificável:** Após Phase 2 (TDD), controller checa que `tests/` contém arquivo cujo nome ou descrição refere ao critério.

**Convenção:** `tests/feature-{slug}/criterion-{N}.test.{ts,js}` com `describe('Criterion N: <gherkin>', () => {...})`.

### Regra 5 — Versionamento com o spec

**Storage:** `{PIPELINE_DOC_PATH}/acceptance-criteria.md` no início da Phase 2.

**Imutabilidade dentro do run:** Após `TDD_APPROVAL`, critérios **não podem ser alterados** sem voltar a Phase 1.

**Cross-run:** Re-trabalho de feature cria novo `acceptance-criteria.md` em novo `PIPELINE_DOC_PATH`. Nunca sobrescrever runs anteriores.

---

## Procedimento step-by-step (controller)

```
Phase 1.5 → Phase 2 transition:

1. Load intent from {PIPELINE_DOC_PATH}/01-classification.md (campo `request`)
2. Generate draft criteria:
   - Para cada "main capability" do intent → 1 critério Given-When-Then
   - Stop em 5
   - Se >5 capabilities, warning: "feature-heavy may be more appropriate"
3. Validate cada draft:
   - Pattern match Given/When/Then
   - Confirma derivável do intent
4. Write to {PIPELINE_DOC_PATH}/acceptance-criteria.md
5. Show via AskUserQuestion (gate TDD_APPROVAL):
   - "Approve all (Recomendado)"
   - "Adjust — me diga quais revisar"
   - "Reject — voltar à Phase 1"
6. On approval: lock file (read-only marker no frontmatter)
7. Proceed to TDD generation (pre-tester usa critérios como test scenarios)
```

---

## Checklist de validação (auto-check antes de emitir)

- [ ] Total ≤ 5
- [ ] Cada critério passa em `VALID_PATTERN`
- [ ] Cada critério tem trace para frase do intent
- [ ] Nenhum critério referencia decisão de arquitetura (lib, pattern, file path)
- [ ] ≥1 critério cobre golden-path
- [ ] ≥1 critério cobre 1 edge case (input vazio, valor extremo, erro de rede)
- [ ] Arquivo escrito em `{PIPELINE_DOC_PATH}/acceptance-criteria.md`

Se algum check falhar, controller **não avança** para Phase 2 — pede esclarecimento.

---

## Exemplo completo

**Intent:** "Adicionar botão de exportar PDF na tela de relatórios"

**Critérios derivados (4 ≤ 5 ✓):**

```gherkin
Critério 1 (golden path):
  Dado um usuário autenticado em /reports/{id}
  Quando ele clica "Exportar PDF"
  Então um arquivo {report-name}.pdf é baixado com o conteúdo visível

Critério 2 (estado disabled):
  Dado um relatório ainda carregando
  Quando o usuário olha o botão
  Então está desabilitado com tooltip "Aguarde o relatório carregar"

Critério 3 (erro):
  Dado um relatório carregado
  Quando o usuário clica e o servidor retorna 500
  Então uma toast de erro aparece com "Falha ao gerar PDF. Tente novamente."
   E o botão volta a clicável

Critério 4 (telemetria):
  Dado clique bem-sucedido
  Quando o download começa
  Então evento "report.pdf.exported" é enviado com {reportId, userId}
```

Todos derivam do intent (1=golden, 2/3=edge, 4=norma do produto). Todos testáveis. ≤ 5.

---

## Migration para V5.1

Quando `feature-acceptance-criteria-author` for introduzido em V5.1:
1. Pipeline-controller delega esta lógica ao agent.
2. Esta doc permanece como **contrato de comportamento** que o agent implementa.
3. Agent pode fazer perguntas iterativas via `AskUserQuestion` durante a derivação.
4. Esta doc não é deletada — vira spec de teste do agent V5.1.

---

V1.0 — 2026-04-30 — versão inicial (R-5 do Slice 0).
