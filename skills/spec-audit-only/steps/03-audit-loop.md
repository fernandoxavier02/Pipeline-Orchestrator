---
step_number: 03
step_name: "audit-loop"
description: "Spec Audit-Only: Adversarial audit iteration — findings + fix loop (no new implementation)"
execution_mode: inline
agent_type: ""
production_writes_allowed: false
expected_inputs:
  - content_review_report: from_step_02
  - spec_context: from_spec_context_yaml
expected_outputs:
  - audit_findings: list
  - fixes_applied: list
  - loop_result: object
  - gate_decision: "approved | checkpoint | abort"
expected_next: 4
gate_required: true
gate_name: "adversarial-loop-checkpoint"
allowed_tools: [Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion]
---

# Spec Lifecycle (Audit-Only) — Step 03: Audit Loop (adversarial parallel + fix-loop)

> **Position in pipeline:** Step 3 — coracao do audit-only. Substitui a fase de implementacao do Heavy.
> **Goal:** Despachar tres auditores em paralelo (architecture-critic + security-scanner + post-impl-validator), consolidar findings, e iterar correcoes de congruencia ate convergir. NAO se gera codigo novo aqui — apenas alinhamento entre artefatos da spec e o que o codigo ja entrega.

---

## Quando usar

Use apos o Content Review (step 02) ter retornado `GO` ou `GO-WARN`. Este step e onde o audit-only se diferencia operacionalmente de Heavy: ao inves de implementar tasks via TDD em Vertical Slices (step 04 do Heavy), aqui dispatchamos os tres auditores que no Heavy rodam em fase 4 (steps 05+06+07) — eles auditam o codigo ja entregue e produzem findings.

## Regras

- Step `execution_mode: inline` — orchestrator inline coordena, mas dispatcha tres SUBAGENTS em paralelo (uma unica mensagem com 3 Agent calls).
- NAO escrever feature nova. Findings que exigem codigo novo viram **escalation** (sair do audit-only e abrir spec-light/spec-heavy em ciclo separado).
- Correcoes permitidas: atualizar `spec.json`, `requirements.md`, `design.md`, `tasks.md`, `closure-report.md` (rascunho), arquivos de documentacao do projeto, marcar `[x]` em tasks que ja estao TRACED no codigo. Tudo o que nao for codigo de feature.
- Cada finding deve carregar tag de severidade: `BLOCKER | HIGH | MEDIUM | LOW` e tag de evidencia: `[VERIFICADO] | [HIPOTESE] | [DESIGN]`.
- Fix-loop: maximo NAO bounded por contrato, mas com escalation a cada 3 attempts (AskUserQuestion).
- Stop-rule: 2 consecutive failures (build/test/check) -> ABORT step com STOP_RULE.
- Same-findings detection: se a mesma lista de findings reaparece em 2 rodadas consecutivas, ABORT loop e dispara o gate `adversarial-loop-checkpoint` imediatamente.

---

## Inputs

- `content_review_report` (do step 02) — score consolidado + findings priorizados.
- `spec_context` — feature name, scope, paths, domains_touched.
- Acesso a `.kiro/specs/<feature>/` e ao working tree (read + targeted write para correcoes de congruencia).

---

## Etapa 1 — Dispatch paralelo dos 3 auditores

Em UMA UNICA MENSAGEM, dispatchar via Agent tool tres subagents simultaneos:

| Subagent FQDN | Foco |
|---|---|
| `pipeline-orchestrator:executor:type-specific:adversarial-architecture-critic` | SOLID/DRY/YAGNI/SSOT, code smells, acoplamento, cohesao — auditando o codigo entregue contra o design.md |
| `pipeline-orchestrator:executor:type-specific:adversarial-security-scanner` | 8 eixos red-team: authn, authz, input validation, secrets, injection, race, supply chain, observability gaps |
| `pipeline-orchestrator:executor:type-specific:spec-post-impl-validator` | 6 eixos de congruencia: req→codigo, AC→teste, design→codigo, tasks→codigo, invencoes detectadas, dividas |

Cada subagent recebe:
- `spec_path` + `spec_context` (do step 0a)
- `content_review_report` (do step 02)
- Permissao de leitura no working tree
- Instrucao explicita: "Audit-only — nao prescreva implementacao nova. Findings devem ser corrigiveis por edicao de spec/docs OU escalados para ciclo separado."

Os tres reports sao independentes. Coletar todos os tres antes de prosseguir para Etapa 2.

---

## Etapa 2 — Consolidar findings

Mesclar os tres reports em uma lista unica de findings. Para cada finding:

```yaml
finding:
  id: AUDIT-NNN
  severity: BLOCKER | HIGH | MEDIUM | LOW
  source: architecture | security | post-impl
  evidence_tag: VERIFICADO | HIPOTESE | DESIGN
  description: "texto curto"
  location: "arquivo:linha (se aplicavel)"
  proposed_fix: "edicao de spec/docs OU escalation"
  fix_kind: "spec-edit | docs-edit | task-mark | escalation"
```

Findings com `fix_kind: escalation` sao registrados mas NAO entram no fix-loop — viram itens do closure-report como "necessita ciclo separado".

---

## Etapa 3 — Fix-loop

Para cada finding com `fix_kind != escalation`, aplicar a correcao minima possivel:

### Etapa 3.0 — Target-path scope guard (MANDATORIO antes de cada Edit/Write)

Antes de invocar Edit ou Write, validar que `proposed_fix.target_path` esta dentro do escopo permitido. O `allowed_tools` da step inclui `Edit, Write` por necessidade do fix-loop, mas o escopo real de gravacao e restrito a:

- `.kiro/specs/<feature>/**` — qualquer arquivo dentro da pasta da spec sendo auditada (spec.json, requirements.md, design.md, tasks.md, closure-report.md draft, research.md). Este e o escopo de gravacao primario do guard — todos os fixes do audit-loop devem cair aqui salvo excecao explicita.
- `docs/**` (no working tree do projeto auditado) — apenas se a propria spec referenciar arquivos em docs/ como parte de seus artefatos de documentacao operacional. Mencoes a `docs/` em prosa de body nas paginas de spec (ex: links para documentacao externa, citacoes de design.md) NAO sao alvo de gravacao — sao apenas referencias de leitura. O prefixo `docs/` so e ativado quando `spec_context.uses_docs == true` (declarado explicitamente pela spec).

Algoritmo do guard:

```
allowed_prefixes = [
  spec_context.spec_path,            // ex: ".kiro/specs/payment-flow/" — sempre ativo
]
if (spec_context.uses_docs == true) {
  allowed_prefixes.push("docs/")     // adicionado apenas quando a spec declara uso explicito
}
target = proposed_fix.target_path    // path relativo ao repo root
normalized = normalize(target)       // resolve "..", remove "./" extras

REJECT se normalized contem ".." apos normalize (path traversal).
REJECT se normalized nao bate com nenhum allowed_prefix.
ACCEPT caso contrario.
```

Se REJECT: marcar finding como `fix_kind: escalation` (sai do fix-loop) e registrar no closure-report `out_of_scope_target_path: <path>`. Audit-only NAO modifica codigo de feature; tentativa de Edit/Write fora dos prefixos permitidos vira escalation automatica, NUNCA bypass.

Esta checagem e enforcement em codigo do que ja estava em prosa: audit-only e estruturalmente read-only-com-correcoes-de-spec, e o guard previne que o fix-loop derive para edicao de codigo de producao.

### Etapa 3.1 — Aplicar fix e re-validar

1. Aplicar `proposed_fix` via Edit/Write (apos passar pelo guard de Etapa 3.0; apenas em arquivos de spec/docs).
2. Re-validar: rodar o auditor da `source` correspondente novamente em modo verify (apenas para o finding corrigido, se o agent suportar; senao re-rodar full audit do source).
3. Se finding desapareceu -> marcar `resolved: true` e seguir.
4. Se finding persiste -> incrementar `attempt_count`.

### Escalation a cada 3 attempts (AskUserQuestion mandatorio)

Apos 3 tentativas falhas no MESMO finding, ABRIR AskUserQuestion com header `Loop` e opcoes:
- **Continuar tentando (Recomendado se finding e MEDIUM/LOW)** — voltar ao loop com nova estrategia.
- **Escalar para ciclo separado** — marcar finding como `escalation` e seguir.
- **Aceitar como warning** — registrar no closure-report e seguir sem corrigir (so para LOW/MEDIUM).
- **Abortar audit-only** — encerrar pipeline; usuario decide proximos passos manualmente.

### Stop-rule: 2 consecutive failures

Se DUAS rodadas consecutivas falharem (qualquer falha — fix nao aplicou, build/test quebrou, auditor retornou error), ABORTAR step inteiro com `STOP_RULE` e dispatch imediato do gate `adversarial-loop-checkpoint` para o usuario decidir.

### Same-findings detection

Se duas rodadas consecutivas produzirem EXATAMENTE a mesma lista de findings (sem progresso mensuravel), forcar checkpoint imediato — provavelmente o loop esta preso num ciclo improdutivo.

---

## Etapa 4 — Decisao final do loop

Apos o loop convergir (zero findings BLOCKER restantes OU todos os BLOCKERs viraram escalation com aprovacao do usuario), emitir `loop_result`:

```yaml
loop_result:
  total_rounds: N
  findings_total: N
  findings_resolved: N
  findings_escalated: N
  findings_accepted_as_warnings: N
  fixes_applied: list of file paths edited
  same_findings_triggered: boolean
  stop_rule_triggered: boolean
  gate_decision: "approved | checkpoint | abort"
```

---

## Etapa 5 — Commit policy (audit-only specifico)

Audit-only commita APENAS se houve correcoes aplicadas (`fixes_applied.length > 0`):
- Se `fixes_applied.length == 0` -> NAO criar commit. Spec permanece intocada no working tree. Closure (step 05) gerara reports mas nao alterara `spec.json` (status NAO flipa para closed).
- Se `fixes_applied.length > 0` -> commit dirigido pelo step 05 (closure), com mensagem padrao `chore(audit): congruence corrections — N findings resolved, M escalated`.

Esta regra vem do design doc §"Variantes resumidas": audit-only com zero fixes e read-only.

---

## Formato de resposta obrigatorio

```markdown
## AUDIT LOOP REPORT (AUDIT-ONLY) — [feature-name]

### Rodadas executadas: N

### Findings consolidados (3 sources)
- Architecture: N (B: N, H: N, M: N, L: N)
- Security: N (B: N, H: N, M: N, L: N)
- Post-Impl: N (B: N, H: N, M: N, L: N)
- TOTAL: N

### Resolucao
- Resolved by spec/docs edit: N
- Escalated to separate cycle: N
- Accepted as warnings: N
- Outstanding (BLOCKER): N

### Same-findings detection: [fired | not fired]
### Stop-rule: [fired | not fired]

### fixes_applied:
- .kiro/specs/<feature>/spec.json (3 edits)
- .kiro/specs/<feature>/design.md (1 edit)
- ...

### Decisao do loop: approved | checkpoint | abort
```

---

## Gate (AskUserQuestion mandatorio na decisao final)

Apos o loop convergir, abrir AskUserQuestion com header `Loop` e opcoes:
- **Aprovar e seguir (Recomendado se zero BLOCKER restantes)** — prosseguir para step 04 (confidence dashboard).
- **Continuar mais uma rodada** — re-dispatchar os 3 auditores (uso quando o usuario quer extra confidence).
- **Aceitar warnings restantes** — fechar loop com warnings registrados no closure.
- **Abortar pipeline** — encerrar sem prosseguir.

---

**Proximo step:** 04
