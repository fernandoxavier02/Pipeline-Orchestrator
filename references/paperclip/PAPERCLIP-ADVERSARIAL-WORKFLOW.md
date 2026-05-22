# PAPERCLIP-ADVERSARIAL-WORKFLOW
## Workflow inquebravel para Revisao Adversarial Standalone no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipo "Adversarial Review" (mode review-only ou fix-mode)
**Aplicar quando:** Board pede revisao independente de codigo ja escrito (sem ser parte de outro workflow), red team, due diligence de seguranca
**Precedencia:** PAPERCLIP-AXIOMS.md vence em conflito.

---

## 1. Quando este workflow se aplica

| Sinal | Peso |
|---|---|
| Issue contem: "tenta quebrar", "red team", "review independente", "ataque", "pen test" | forte |
| Issue eh sobre revisao de PR/branch ja implementado por outra pessoa/agente | forte |
| Sem pedido de novo codigo, so analise crítica | confirma |
| Issue tem label "security-review" ou "adversarial" | forte |

**Diferenca pro Axioma 2:** o Axioma 2 dispara adversarial review APOS cada batch dentro de outros workflows. Este workflow eh standalone — quando o trabalho TODO eh adversarial review.

---

## 2. Cargos envolvidos

```
1. task-orchestrator
2. information-gate                       (escopo da revisao definido?)
3. adversarial-review-coordinator         (dispatcher)
4. adversarial-security-scanner          ─┐
                                          │
   adversarial-architecture-critic       ─┼─ PARALELO, ZERO-CONTEXT
                                          │
   adversarial-quality-reviewer          ─┘
5. (executor-fix em "fix-mode" para findings critical, se Board autorizou)
6. final-validator                        (PA_DE_CAL adaptado)
7. spec-closer                            (consolidated report)
```

**TDD nao se aplica** — read-only review (excecao explicita ao Axioma 3 declarada aqui).

**Adversarial trio JA EH o foco** — Axioma 2 nao aplica (nao roda trio-de-trio).

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator
Classifica tipo=Adversarial Review. Mode: review-only OR fix-mode (Board decide na issue).

### 3.2 information-gate
BLOCKERS:
- [ ] Escopo de revisao definido (arquivos, commit range, branch)?
- [ ] Mode declarado (review-only / fix-mode)?
- [ ] Foco declarado (security / architecture / quality / all)?

### 3.3 adversarial-review-coordinator
Skill obrigatoria: `pipeline-orchestrator-adversarial`.

Acao:
1. Confirma escopo
2. Dispatch em paralelo (mesmo heartbeat ou subsequente, mas isolados):
   - `adversarial-security-scanner` (sub-issue 1)
   - `adversarial-architecture-critic` (sub-issue 2)
   - `adversarial-quality-reviewer` (sub-issue 3)

**Decisao pre-aprovada — selecao de checklists:**
- mode `security` → so security-scanner roda
- mode `architecture` → so architecture-critic
- mode `quality` → so quality-reviewer
- mode `all` (default) → trio completo

### 3.4 adversarial-security-scanner (paralelo)
Skill obrigatoria: secao 2.

Zero-context contract:
- NAO ler issue parent description
- NAO ler comments do reviewer-controller
- Ler APENAS diff/arquivos modificados
- Aplicar 6 categorias (assumption, malicious_input, race, data_exposure, auth_bypass, resource_exhaustion)

Saida: findings YAML com severity calibrado pela rubric (critical/high/medium/low).

### 3.5 adversarial-architecture-critic (paralelo)
Zero-context. 5 dimensions (coupling, abstraction leak, SOLID, scalability, testability).

### 3.6 adversarial-quality-reviewer (paralelo)
Zero-context. 5 perguntas (legibilidade, naming, dead code, comentarios desnecessarios, tests strength).

### 3.7 Consolidation (back to coordinator)

Apos os 3 retornarem, coordinator consolida:

```markdown
### ADVERSARIAL_CONSOLIDATED v1

```yaml
findings_total: N
findings_by_severity:
  critical: [...]
  high: [...]
  medium: [...]
  low: [...]
findings_by_reviewer:
  security: [...]
  architecture: [...]
  quality: [...]
deduplications: []  # IDs vistos por 2+ reviewers
verdict: {{NEEDS_FIX | NEEDS_DISCUSSION | PASS_WITH_WARN | PASS}}
```
```

### 3.8 executor-fix (fix-mode only)
Se mode=fix-mode E ha critical findings, dispatch executor-fix por finding.

Max 3 tentativas por finding (Iron Law 4). Se ultrapassa, ESCALATION_REQUEST.

### 3.9 final-validator (adaptado)
GO se:
- review-only mode: report consolidado completo, sem inventar finding sem evidence
- fix-mode: criticals fixados E re-revisados E PASS

### 3.10 spec-closer
Entrega `adversarial-review-report.md` no PIPELINE_DOC_PATH.

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Escopo nao delimitado | ESCALATION_REQUEST imediato |
| Mode nao declarado | default mode=all (trio completo) |
| Reviewer pediu acesso a issue parent description | NEGAR — zero-context |
| Same finding por 2 reviewers | deduplicar na consolidacao, manter merged evidence |
| Finding critical encontrado | mode=fix-mode → dispatch fix; mode=review-only → report only, prioridade=urgente no comment |
| Reviewer encontra "potencial issue" sem PoC | NAO incluir como finding — PoC eh obrigatorio (cada finding tem path de exploit ou evidence file:line) |
| Severity ambiguo | usar regra "escolha o maior" da rubric |
| Reviewer pediu "tempo extra pra investigar" | NEGAR — heartbeat eh curto, cada reviewer deve dar best-effort no escopo dado |
| Architecture critic detecta violacao SOLID | severity=medium minimo (high se a violacao gera bug observavel) |
| Quality reviewer detecta comment explaining bad code | severity=low (refactor recommendation) |

---

## 5. Definicao de Done (Adversarial Review)

- [ ] Coordinator confirmou escopo e mode?
- [ ] Os 3 reviewers (ou subset conforme mode) rodaram em paralelo zero-context?
- [ ] Cada finding tem severity + evidence + (se security) PoC ou exploit path?
- [ ] Deduplicacao aplicada na consolidacao?
- [ ] Verdict consolidado consistente com findings?
- [ ] Se fix-mode: criticals fixados e re-revisados?
- [ ] Report consolidado produzido?

---

## 6. Anti-padroes proibidos especificos de Adversarial Review

❌ Ler issue parent description ou commit message (zero-context).
❌ Pular um arquivo "porque parece OK" — eh exatamente onde estaria o exploit.
❌ Diminuir severity pra "nao exagerar" — calibracao falha vira mais bugs em prod.
❌ Inventar exploit sem PoC reproduzivel — cada finding precisa de PoC ou path de exploit citado.
❌ Reviewers conversando entre si durante a revisao — zero-context = silencio.
❌ Aceitar finding "vou investigar depois" — heartbeat curto exige finding finalizado.
❌ Inflate findings pra "demonstrar trabalho" — calibracao honesta vence quantidade.
❌ Apresentar findings sem severity ou priority (impossivel acionar).
