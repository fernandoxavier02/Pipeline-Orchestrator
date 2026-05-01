# Agent Spec Template (V5 — Apêndice A)

**SSOT:** Este arquivo. Todo agent novo a partir de V5.0 deve nascer copiando este template.
**Origem:** Slice 0 (Reality Check), entregável conforme `designs/pipeline-orchestrator-v5-consolidated.md` §7.1.4 e §12.3.2.
**Status:** Canonical.

---

## Como usar

1. Copie este template para `agents/<layer>/<agent-name>.md`.
2. Substitua todos os campos `<...>`.
3. Valide com o checklist no final.
4. Adicione `<agent-name>` ao registry (`AGENTS.md` raiz, criado no Slice 0.5 A2).

---

## Frontmatter (obrigatório)

```yaml
---
name: <kebab-case-agent-name>
description: <one-sentence-trigger-condition. Use when... Avoid ambiguity.>
model: <sonnet | opus | haiku>           # default: sonnet
tools: [Read, Write, Edit, Bash, Grep, Glob, Agent, Task, AskUserQuestion]
memory: <none | scoped | persistent>     # default: none
---
```

**Regras de campo:**

- **`name`** — único no plugin, kebab-case, sem prefixo `pipeline-orchestrator:` (o prefixo vem do path).
- **`description`** — começa com "Use when...", uma frase, sem markdown. É o que auto-discovery indexa.
- **`model`** — escolha por custo/latência:
  - `haiku`: classificação simples, sanity checks, parsing.
  - `sonnet`: maioria dos agents (controller, gates, reviews).
  - `opus`: implementação complexa, code review profundo, executor-controller.
- **`tools`** — princípio de menor privilégio. **Não** liste tools que o agent não usa.
  - 🔴 **CRÍTICO (§15 do consolidado):** se o agent invoca `Agent(...)` ou `Task(...)` no corpo, `Agent`/`Task` DEVEM estar listados aqui. Sem isso, harness retorna `InputValidationError`.
- **`memory`** — `none` é o default. `scoped` (apenas durante sessão) OK para agents que constroem estado dentro de um run. `persistent` é raro.

---

## Estrutura do corpo (obrigatória)

```markdown
# <Agent Title>

## Papel (Role)

<Uma frase. O que esse agent É na arquitetura.>

## Inputs

- **<input_name>** (`<type>`): <descrição. obrigatório|opcional. fonte typical>

## Outputs

O agent SEMPRE devolve um bloco estruturado (YAML, JSON, ou markdown delimitado):

```yaml
<OUTPUT_BLOCK_NAME>:
  field_1: <type>
  field_2: <type>
  ...
```

## Critérios PASS/FAIL

PASS:
- [ ] output schema válido (todos os campos required preenchidos)
- [ ] <constraint X respeitado>

FAIL (qualquer um → output inválido):
- [ ] output não parseável
- [ ] campo obrigatório ausente
- [ ] valor fora do enum permitido

## Composição emergente permitida (allow-list)

Se o agent pode dispatch outros via `Agent`/`Task`:

Permitidos:
- `pipeline-orchestrator:core:<name>` — <quando e por quê>
- `pipeline-orchestrator:executor:<name>` — <quando>
- (none) — <se o agent não dispatch ninguém, escreva isso>

Não permitidos: qualquer agent fora dessa lista.

## Exemplo de invocação

```
Task(
  subagent_type: "pipeline-orchestrator:<layer>:<name>",
  description: "<3-5 word description>",
  prompt: "<typical prompt>"
)
```
```

---

## Checklist de validação (antes de commit)

- [ ] Frontmatter tem todos os campos obrigatórios
- [ ] `name` é único (`grep "name: <X>" agents/**/*.md` retorna 1)
- [ ] `tools` lista é o mínimo necessário; **`Agent`/`Task` declarados se o agent dispatch outros (§15)**
- [ ] Seção "Papel" tem 1 frase clara
- [ ] Seção "Inputs" lista cada parâmetro com tipo e obrigatoriedade
- [ ] Seção "Outputs" tem schema YAML/JSON ou markdown delimitado
- [ ] Critérios PASS/FAIL são binários e verificáveis
- [ ] Composição emergente: allow-list explícita (mesmo que vazia)
- [ ] Adicionado a `AGENTS.md` raiz (Slice 0.5 A2)

---

## Anti-patterns (evitar)

| Anti-pattern | Por que ruim | Forma correta |
|---|---|---|
| `description: "An agent that does stuff"` | Auto-discovery não consegue ranquear | `description: "Use when classifying user requests into Bug Fix/Feature/Audit before pipeline execution"` |
| `tools: [*]` | Violação de menor privilégio | Listar apenas tools que aparecem no corpo do prompt |
| Output não estruturado ("retorne uma análise em prosa") | Controller não consegue parsear | Sempre bloco YAML/JSON delimitado |
| "Composição emergente: pode invocar qualquer agent" | Quebra allow-list de segurança | Lista explícita ou `(none)` |
| Critério PASS subjetivo ("output deve ser bom") | Não testável | Binário: schema válido OR não |
| **Esquecer `Agent`/`Task` em `tools:` quando o agent dispatch outros** | InputValidationError em runtime; bug §15 | Sempre auditar: se body contém `Agent(...)` ou `Task(...)`, frontmatter declara |

---

## Versionamento

V1.0 — 2026-04-30 — versão inicial (Slice 0).

Mudanças breaking (ex: campo obrigatório novo) requerem:
1. Bump de `agent_spec_version` em `AGENTS.md`
2. Migration script para reagentes existentes
3. Entry em `CHANGELOG.md`
