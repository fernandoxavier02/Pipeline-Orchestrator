# PAPERCLIP-AUDIT-WORKFLOW
## Workflow inquebravel para Auditoria de Codebase no modelo Paperclip+Codex

**Versao:** 1.0 — 2026-05-22
**Espelha:** pipeline-orchestrator original tipo "Audit" (variant: audit-light, audit-heavy)
**Aplicar quando:** Board pede revisao de codigo legado, due diligence, mapeamento de risco
**Precedencia:** PAPERCLIP-AXIOMS.md vence em conflito.

---

## 1. Quando este workflow se aplica

Sinais detectados pelo task-orchestrator:

| Sinal | Peso |
|---|---|
| Issue contem: "audita", "auditoria", "revisar legado", "due diligence", "mapear riscos" | forte |
| Issue eh acompanhada de pasta/repo a auditar (escopo definido) | forte |
| Sem pedido de mudanca de codigo | confirma audit (read-only) |
| Issue tem label "audit" ou "review" | forte |

**Iron Law deste workflow:** READ-ONLY. NAO escreve codigo em nenhuma fase. Saida e relatorio em markdown.

---

## 2. Cargos envolvidos (ordem rigorosa)

```
1. task-orchestrator
2. information-gate            (escopo da auditoria delimitado?)
3. audit-intake                (inventario tecnico — stack, repo map, entry points, hotspots)
4. audit-domain-analyzer       (arquitetura + domain model + SSOT + business rules)
5. audit-compliance-checker    (data integrity + security + governance + test coverage)
6. audit-risk-matrix-generator (consolida + risk matrix + priority backlog + recommendations)
7. final-validator             (PA_DE_CAL adaptado pra audit)
8. spec-closer                 (entrega 2 relatorios: tecnico + executivo)
```

**Sem adversarial trio** — auditoria JA EH revisao adversarial por construcao. Axioma 2 nao se aplica neste workflow (excecao explicita declarada aqui).

**Sem TDD** — workflow read-only, nao implementa nada. Axioma 3 nao se aplica.

---

## 3. Fluxo passo-a-passo

### 3.1 task-orchestrator
- Classifica tipo=Audit, complexity baseada em tamanho do escopo (LOC, modulos)
- Dispatch para information-gate

### 3.2 information-gate
BLOCKERS:
- [ ] Escopo da auditoria delimitado (pastas/repos a cobrir)?
- [ ] Foco declarado (security? performance? compliance? geral?)?
- [ ] Nivel de profundidade (light vs heavy)?

Sem isso, ESCALATION_REQUEST com proposta concreta.

### 3.3 audit-intake
Skill obrigatoria: `pipeline-orchestrator-audit-method` secao 1.

Saida: `### AUDIT_INTAKE v1` com:
- stack identification (languages, frameworks, build tools)
- repo mapping (top_level_dirs, roles)
- entry points (CLI, HTTP server, workers)
- hotspots (size, churn, complexity heuristics)

**Iron Law:** READ-ONLY. NAO escreve codigo. So coleta.

### 3.4 audit-domain-analyzer
Skill obrigatoria: `pipeline-orchestrator-audit-method` secao 2.

Saida: `### DOMAIN_ANALYSIS v1` com:
- architecture pattern + layer violations
- domain entities + relationships
- SSOTs verification (engineering-principles secao 6)
- business rules extraction com evidence_tag (VERIFIED/HYPOTHESIS/DESIGN)

**Decisao pre-aprovada — quando rule eh inferida vs documentada:**
- Codigo + comentario + doc concordam → VERIFIED
- Codigo implementa, doc nao menciona → HYPOTHESIS (auditor inferiu, Board confirma)
- Doc declara, codigo nao implementa → DESIGN (gap entre intencao e realidade — finding critico)

### 3.5 audit-compliance-checker
Skill obrigatoria: secao 3.

Saida: `### COMPLIANCE_REPORT v1` com:
- data integrity issues
- security findings (auth, secret handling, SQL injection, path traversal)
- governance (code review, CI, changelog, semver)
- test coverage (overall, critical paths, test_strength)

**Decisao pre-aprovada — severity rubric:**

Usar rubric do `pipeline-orchestrator-adversarial` secao 3 (calibrada). Sem inventar criterios novos.

### 3.6 audit-risk-matrix-generator
Skill obrigatoria: secao 4.

Consolidar findings das 3 fases. Saida: `### AUDIT_REPORT v1` com:
- findings totais + by_severity + by_evidence_tag
- risk matrix (probabilidade x impacto)
- priority backlog ordenado por rank
- recommendations: immediate / next_quarter / strategic

### 3.7 final-validator (adaptado audit)

PA_DE_CAL adaptado:
- GO: relatorios produzidos, completos, com evidencia em todos findings
- CONDITIONAL: relatorios faltam coverage de alguma dimensao (ex: nao auditou test coverage por falta de tool)
- NO_GO: relatorios com gaps significativos OU sem evidence file:line

### 3.8 spec-closer
Entregar 2 relatorios no PIPELINE_DOC_PATH:
- `audit-technical-report.md` — para devs (detalhes file:line)
- `audit-executive-report.md` — para Board (1 pagina, decisoes)

---

## 4. Decisoes Pre-Aprovadas — Tabela Mestre

| Cenario | Decisao automatica |
|---|---|
| Escopo nao delimitado | ESCALATION_REQUEST imediato |
| Encontrou rule no codigo sem doc | tag=HYPOTHESIS, finding |
| Encontrou rule no doc mas nao no codigo | tag=DESIGN, severity=high, finding critico |
| Test coverage tool nao disponivel | reportar como gap, nao bloquear |
| SSOT drift detectado | severity=high, file:line de cada copia |
| Auth check em client-side | severity=critical |
| Secret hardcoded | severity=critical, alertar imediato (criar issue urgente) |
| Migration sem backfill | severity=high (data integrity) |
| Adicionar finding sem evidence file:line | PROIBIDO — voltar e citar fonte |
| Audit revela problema critical em prod | criar issue urgente paralela (incident workflow) |

---

## 5. Definicao de Done (audit)

- [ ] AUDIT_INTAKE completo (stack + repo map + hotspots)?
- [ ] DOMAIN_ANALYSIS completo (architecture + domain + SSOT + business rules)?
- [ ] COMPLIANCE_REPORT completo (data + security + governance + coverage)?
- [ ] AUDIT_REPORT consolidado (matrix + backlog + recommendations)?
- [ ] Cada finding tem `evidence_tag` (VERIFIED/HYPOTHESIS/DESIGN)?
- [ ] Cada finding tem `file:line` ou descrita como ausencia explicita?
- [ ] 2 relatorios produzidos (technical + executive)?

---

## 6. Anti-padroes proibidos especificos de Audit

❌ Escrever codigo (read-only — Iron Law deste workflow).
❌ Findings sem evidence_tag (impossivel saber confianca).
❌ Findings sem file:line (auditor cego = relatorio inutil).
❌ "Eu acho que..." sem citar regra de engineering-principles ou padroes do projeto.
❌ Inflar severity pra justificar atencao (calibracao falha).
❌ Mascarar critical pra "nao alarmar" — Iron Law: evidencia eh evidencia.
❌ Sumarizar sem dar acao concreta (relatorio sem priority backlog eh inutil).
