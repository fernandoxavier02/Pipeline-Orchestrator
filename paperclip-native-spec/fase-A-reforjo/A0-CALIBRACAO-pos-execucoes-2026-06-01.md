# A0 — Calibração da Fase A pós-execuções reais (2026-06-01)

**Status:** Normativo — supersede pontos específicos de A1 e A4 (ver §5)
**Data:** 2026-06-01
**Origem:** Revisão crítica cruzando a spec da Fase A com 54 execuções reais já concluídas na VPS (empresa Pipeline Orchestrator, `019c6f31-41ed-497a-93ba-cb4eff651a7c`).
**Precede a leitura de:** A1-requirements.md, A2-design.md, A3-tasks.md, A4-validation.md.

---

## 1. Por que este documento existe

A spec da Fase A (Onda A1, 2026-05-24) foi escrita como documentação pura, antes de qualquer execução medida. Entre 2026-05-26 e 2026-06-01 o ambiente Paperclip rodou **dois pipelines completos reais** com os 47 cargos provisionados. Este documento calibra a spec contra essa evidência empírica, fechando três lacunas que a revisão crítica identificou: (1) referências a um substrato de estado morto, (2) inconsistência interna entre os documentos, (3) um ponto de partida estratégico desalinhado com o que já roda.

Este documento NÃO reescreve a spec. Ele registra a evidência, corrige formalmente os pontos afetados e reposiciona a estratégia. As correções pontuais foram aplicadas in-place em A1 e A4; os trechos ilustrativos restantes leem-se sob a convenção de §3.

---

## 2. Evidência coletada (verificada via API loopback do Paperclip)

| Observação | Valor verificado | Implicação |
|---|---|---|
| Issues na empresa PIP | 54, todas `done` | Dois pipelines reais: CyberVibeGuard Shannon-Parity (PIP-1..40, slices S0–S7) e FX Studio AI chat-de-pré-venda (PIP-41..54) |
| Approval issues criadas | **0** (`GET /companies/:id/approvals` → total=0) | O mecanismo central da spec (approval issues `pip:*`) NÃO foi usado organicamente em nenhuma execução |
| Campo `executionState` | `null` nas issues inspecionadas (ex.: PIP-43) | Confirma o veredicto do spike T-A2-01: campo declarado mas não-gravável (versão `2026.517.0`) |
| Blocos estruturados em comentários | Emitidos espontaneamente pelos cargos | A "forma" do pipeline já acontece — ver §4 |
| Issues de recuperação (`Recover…`) | 5 (PIP-42, 40, 38, 37, 16) | Handoff entre fases é frágil — ver §7 |
| Distribuição de carga | executor-fix 18, adversarial-review-coordinator 9, pipeline-controller 8 | Loop revisar→corrigir→revisar está ativo e pesado (comportamento canônico presente) |

---

## 3. Correção 1 — Substrato de estado (fecha lacunas 1 e 2)

**O campo `executionState` está MORTO** nesta versão do Paperclip: `PATCH` retorna 200 mas descarta o dado, sem write path no bundle `paperclipai/dist`. Toda referência a `executionState.pipeline.*` na spec é inválida como local de escrita.

**Substrato vivo = comentários estruturados da issue.** Estado e decisões de portão são gravados via `POST /api/issues/{id}/comments`, corpo prefixado `PIPELINE_STATE <json>`. Append-only (sem `PATCH` in-place). Leitura: a API devolve comentários **newest-first**, então a corrente é reconstruída seguindo `previous_hash` a partir de `"GENESIS"` — nunca confiar na ordem da API nem em timestamp. Hash chain SHA-256 sobre `JSON.stringify({gate_name,hardness,decision,evidence,timestamp,decided_by})` + hash anterior (chaves em ordem lexicográfica, sem whitespace). Validado end-to-end no spike T-A2-01 (round-trip íntegro ~386 bytes/entry).

**Convenção de leitura (aplica-se a todos os documentos da Fase A):** onde a spec disser `executionState.pipeline.gate_decisions[]`, `executionState.pipeline.hash_chain_head`, `executionState.pipeline.gate_registry_version` ou `executionState.pipeline.heartbeat_optimization`, leia o **comentário estruturado `PIPELINE_STATE` equivalente** descrito em A2-design §2.4. O esquema lógico de cada `gate_decision` permanece válido; muda apenas onde mora.

---

## 4. Correção 2 — Ponto de partida: a Fase A NÃO parte do zero (fecha lacuna 3)

A spec assume que o comportamento de pipeline precisa ser construído nos cargos via approval issues + INVARIANTS block. A evidência contradiz a premissa de partida: **os cargos já emitem o vocabulário do pipeline espontaneamente**, via as skills `references/paperclip/PAPERCLIP-*.md` já instaladas. Blocos observados nos comentários das execuções reais:

- `### ORCHESTRATOR_DECISION v1` (classificação task_type/complexity/variant)
- `### PA_DE_CAL v1` (veredicto final GO/CONDITIONAL/NO-GO com fidelity_score)
- `### ADVERSARIAL_CONSOLIDATED v1` (consolidação de review adversarial)
- `### TDD_GREEN v1` (fase de teste no verde)
- `### SLICE_CLOSEOUT v1` / `### HANDOFF_STATUS v1` (fechamento e passagem de fatia)
- `### DISPATCH_REQUEST v1` (delegação a cargo/sub-issue)
- `### RECOVERY_RESUME_ACK v1` (reconhecimento de retomada)

**Reposicionamento estratégico:** a skill-espelho e a Onda A2/A3 devem **padronizar e completar** esses blocos já existentes — não criar do zero. Tarefas concretas que mudam de natureza:

1. **Unificar o vocabulário de blocos** num molde único e versionado (hoje cada cargo inventa o seu), com o prefixo `PIPELINE_STATE` carregando os campos auditáveis.
2. **Acoplar a corrente de integridade** (`previous_hash`) aos blocos que já são emitidos, em vez de introduzir um registro paralelo.
3. **Tornar o controlador o único escritor da trilha** de gate_decisions, como no canonical (`gate-decisions.jsonl` controller-only), eliminando superfície de injeção e a inconsistência atual de formatos.

---

## 5. Pontos da spec superseididos por este documento

| Documento | Trecho | Estado |
|---|---|---|
| A1-requirements | C3-A, C5-A, HC2-A, SC3-A (substrato `executionState`) | Corrigidos in-place para comentários `PIPELINE_STATE`; banner no topo aponta para cá |
| A4-validation | §1 definição de "portões emitidos"; §4 procedimento de medição | Corrigidos in-place; exemplos Gherkin leem-se sob a convenção de §3 |
| A2-design | §2.4 e DLs já reconciliados (banners pós-spike) | Sem mudança de conteúdo; header de status atualizado |
| A3-tasks | T-A2-02 (lib de estado) | Passa a ser lib de **comentários** estruturados, não de `executionState` |

---

## 6. Teto de fidelidade — o que NÃO é alcançável (achado mais importante)

No harness do Claude Code, o que garante obediência são **hooks de runtime** (PreToolUse): `sentinel-hook` nega um spawn fora de ordem, `edit-guard` bloqueia escrita fora de escopo, `scope-lock` e `dispatch-guard` impõem o CHANGE_CONTRACT no nível do JS. **O Paperclip não tem equivalente.** A Fase A depende inteiramente de prompt-enforcement (INVARIANTS block) + approval issues — e a evidência de `approvals=0` prova que, sem um mecanismo que force a criação, esse caminho não é seguido organicamente.

**Consequência para a missão "fazer idêntico ao Claude Code":** há um teto. O melhor alcançável é "muito perto", apoiado nos primitivos nativos do Paperclip como substitutos imperfeitos dos hooks:

- **`status: blocked` / `paused`** da issue ≈ gate que bloqueia (mas é cooperativo, não imposto).
- **`blockedByIssueIds`** (grafo de dependências) ≈ sequenciamento de fases (mas não garante `expected_next` determinístico — ver §7).
- **cargo `sentinel` em cron** ≈ detecção de drift do canonical (detecta depois, não previne).

A spec deve declarar esse teto explicitamente como restrição de produto, não tratá-lo como detalhe (o finding S3 de A2-design — "decisões proibidas só documentadas, não enforced" — é a manifestação deste teto e deve ser elevado de "trade-off aceito" a **restrição estrutural conhecida**).

---

## 7. Handoff frágil — risco operacional a mitigar

As 5 issues de recuperação revelam que a passagem automática entre fases quebra. Causas observadas nos comentários: *"Paperclip needs a disposition before this issue can continue"*, *"missing next step"*, e cota do modelo Codex esgotada. No canonical, o `expected_next` do sentinel-state garante a sequência; no Paperclip isso depende do grafo de dependências + heartbeat, que não é determinístico.

**Mitigação para a skill-espelho:** o cargo controlador deve sempre encerrar cada heartbeat declarando o **próximo passo explícito** num bloco fixo (ex.: `### NEXT_STEP v1` com `next_issue`, `assignee`, `blocked_by`), e criar a sub-issue + blocker correspondente no mesmo heartbeat — nunca deixar a "disposição" implícita para o motor resolver.

---

## 8. Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-06-01 | Criado — calibração da Fase A contra 54 execuções reais; corrige substrato, reposiciona ponto de partida, declara teto de fidelidade |
