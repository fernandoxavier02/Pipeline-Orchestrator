# A5 — Design da Skill-Espelho (pacote pipeline-orchestrator ↔ Paperclip)

**Status:** Design aprovado (brainstorming 2026-06-01) — pré-plano
**Data:** 2026-06-01
**Depende de:** A0-CALIBRACAO-pos-execucoes-2026-06-01.md, A1-requirements.md, A2-design.md, A4-validation.md
**Fonte de evidência:** 54 execuções reais da empresa Pipeline Orchestrator (`019c6f31`), revisão crítica de 2026-06-01.

---

## 1. Objetivo

Construir um pacote que faça os 47 cargos já existentes no Paperclip agirem como se o plugin pipeline-orchestrator estivesse rodando no harness do Claude Code — dentro do **teto de fidelidade** identificado na calibração (A0 §6): o Paperclip não tem hooks de runtime, então o enforcement é cooperativo, não imposto.

**Não-objetivo:** atingir paridade 1.0 com o harness. O alvo realista é elevar a nota de fidelidade do baseline real (a medir) o mais perto possível de 0.95, aceitando que o último degrau depende de observação + ação humana/Board, não de bloqueio automático.

---

## 2. Decisões de design (brainstorming 2026-06-01)

| # | Decisão | Escolha | Razão |
|---|---|---|---|
| D1 | Onde a skill vive | **Pacote completo** (2 pontas: cargo-side + lado Claude Code) | Sem a ponta de fora (fiscal) o teto de fidelidade fica mais baixo — não há como conferir adesão |
| D2 | Comportamento do fiscal | **Observa e avisa** (read-only nos agentes) | Seguro e reversível; entrega a transparência ausente sem poder de parar trabalho |
| D3 | Escopo de partida | **Medir tudo primeiro** | Evidência antes de reforma; baseline real (hoje só há estimativa ~0.70) vira fundação |
| D4 | Método de medição | **Ler o histórico e traduzir** | Read-only sobre dados reais; valida o dicionário bloco→portão sem tocar nos agentes |

---

## 3. Arquitetura — cinco peças

### Peça 1 — Medidor de fidelidade (PRIMEIRO entregável · lado Claude Code · read-only)

O coração do pacote e o primeiro a ser construído. Subpeças:

- **(1a) Dicionário de tradução bloco→portão** — converte cada bloco que os cargos já emitem espontaneamente no portão canônico equivalente. Tabela inicial em §4.
- **(1b) Coletor** — lê via API loopback (read-only) as issues + comentários de uma empresa/execução. Reaproveita a skill `operating-paperclip` e os acessos SSH já validados.
- **(1c) Calculadora de nota** — por execução: infere a complexidade/variant (do bloco `ORCHESTRATOR_DECISION`), monta a lista de portões **esperados** (via complexity-matrix da spec) e a lista de **emitidos** (via dicionário 1a), calcula `parity_score = |emitidos ∩ esperados| / |esperados|`, lista os faltantes.
- **(1d) Relatório** — nota por execução + agregada + ranking dos portões mais ausentes (onde a fidelidade vaza) + comparação com o baseline estimado da spec. Saída em markdown ou HTML.

Não cria nem altera nada no Paperclip.

### Peça 2 — Molde de blocos padronizado (cargo-side · fase 2)

Formato único `PIPELINE_STATE` (definido na spec calibrada: prefixo + JSON + `previous_hash` para a corrente de integridade) que substitui os blocos ad-hoc. Inclui o bloco `NEXT_STEP` explícito para mitigar o handoff frágil (A0 §7). Padroniza o que os cargos já fazem de forma divergente.

### Peça 3 — Instruções-espelho / INVARIANTS block (cargo-side · fase 2)

O bloco de regras no topo de cada AGENTS.md (já desenhado em A2-design §3.1): o que o cargo nunca faz sem aprovação, quando para e escala, a hierarquia de decisão, a ordem das fases. É a tradução em prompt do que os hooks garantem no harness — limitada pelo teto de fidelidade.

### Peça 4 — Instalador / sincronizador (lado Claude Code · fase 2)

Ferramenta que coloca as peças 2 e 3 nos cargos certos e confirma a aplicação (cobre T-A3-00/01/03-09 da spec). Idempotente, com backup dos AGENTS.md originais antes de qualquer mudança.

### Peça 5 — Fiscal contínuo (lado Claude Code · fase 3)

A Peça 1 rodando periodicamente (cron/heartbeat), comparando a nota ao longo do tempo e alertando quando uma execução nova cai abaixo do limite. Apenas observa e avisa (D2).

---

## 4. Dicionário de tradução bloco→portão (v0 — a validar na Peça 1)

Baseado nos blocos **realmente observados** nas 54 execuções. A coluna "estado" indica o que a evidência mostra hoje.

| Bloco emitido (observado) | Portão/fase canônico | Hardness | Estado observado |
|---|---|---|---|
| `ORCHESTRATOR_DECISION v1` | Classificação (fase 0a) + COMPLEXITY_GATE | SOFT | ✅ presente |
| — (nenhum) | INFO_GATE_BLOCKED (fase 0b) | HARD | ❌ ausente (approvals=0) |
| — (nenhum) | Plano aprovado / PLAN_REJECTED (fase 1.5) | HARD | ❌ ausente |
| `TDD_GREEN v1` | TDD_APPROVAL (fase 2) | HARD | ✅ presente |
| — (nenhum) | MICRO_GATE_GAP (fase 2, por task) | HARD | ❌ ausente |
| (checkpoint implícito) | CHECKPOINT_FAIL (build/test) | HARD | ⚠️ implícito |
| `ADVERSARIAL_CONSOLIDATED v1` · coordinator | ADVERSARIAL_GATE / ADVERSARIAL_BLOCK | SOFT/HARD | ✅ presente (forte) |
| issues `executor-fix` (18×) | fix loop (máx 3) | — | ✅ ativo |
| `PA_DE_CAL v1` | final-validator Go/No-Go + FINAL_ADVERSARIAL_GATE | SOFT | ✅ presente |
| `SLICE_CLOSEOUT v1` · `HANDOFF_STATUS v1` | handoff de fase / CLOSEOUT_CONFIRM | SOFT | ✅ presente |
| `DISPATCH_REQUEST v1` | dispatch (protocolo Achado 7) | — | ✅ presente |
| `RECOVERY_RESUME_ACK v1` | (recuperação — sinal de handoff frágil, não é portão) | — | ⚠️ 5 recoveries |
| — (nenhum) | approval issues / GATE_REQUEST | — | ❌ zero |

**Leitura preliminar da evidência:** os portões SOFT de classificação, revisão adversarial e fechamento já aparecem com força; os portões HARD de **entrada** (information-gate, plano, micro-gate) e **toda aprovação explícita** estão ausentes. A nota real provavelmente refletirá fidelidade alta na metade "adversarial/fechamento" e baixa na metade "gates de entrada + aprovação". A Peça 1 confirma ou refuta essa hipótese com número.

---

## 5. Sequência de construção

1. **Peça 1 (medidor)** → rodar sobre as 54 execuções existentes → **baseline real** + validação do dicionário §4. (Este é o primeiro passo concreto.)
2. **Peças 2 + 3** (molde + instruções) em uma fatia piloto (um cargo/variant) → reaplicar a Peça 1 → medir o ganho.
3. **Peça 4** (instalador) → rollout aos demais cargos por lote.
4. **Peça 5** (fiscal contínuo) → operação permanente.

A medição (Peça 1) é o gate de cada avanço: só padroniza/espalha o que a nota mostrar que vale.

---

## 6. Empacotamento

- **Ponta de fora (lado Claude Code):** uma skill que estende `operating-paperclip` + um script `.cjs` para o medidor (coletor + calculadora + relatório). Read-only.
- **Ponta de dentro (cargo-side):** arquivos instaláveis nos cargos via a API de skills do Paperclip (mesmo mecanismo dos `PAPERCLIP-*.md` já presentes), contendo o molde (Peça 2) e o INVARIANTS (Peça 3).

---

## 7. Teto de fidelidade (restrição estrutural, não trade-off)

Reafirmado de A0 §6: o fiscal **observa e avisa, não impõe**. A padronização (Peças 2-4) eleva a nota; o último degrau depende de alerta + ação (humana ou do Board). Nenhuma peça promete bloqueio automático equivalente aos hooks do harness. Os substitutos cooperativos são `status: blocked/paused`, o grafo `blockedByIssueIds` e o cargo sentinel.

---

## 8. Critério de sucesso da Peça 1 (primeiro entregável)

- Roda read-only sobre as 54 execuções sem criar nada no Paperclip.
- Produz uma nota de fidelidade por execução e agregada, com a lista de portões faltantes.
- O dicionário §4 é validado: cada bloco observado mapeia para um portão, e cada ausência é justificada.
- O relatório torna acionável "onde a fidelidade mais vaza" — substituindo a estimativa ~0.70 da spec por um número medido.

---

## 9. Riscos e decisões abertas

- **R1 — Inferência imperfeita:** um bloco pode mapear para mais de um portão, ou um portão pode disparar sem deixar bloco. Mitigação: a Peça 1 marca esses casos como "indeterminado" em vez de assumir, e o relatório os lista para revisão.
- **R2 — Variância entre execuções:** as 54 execuções são de 2 projetos só (CyberVibeGuard, chat-vendas). O baseline pode não generalizar. Mitigação: relatar a nota por projeto e por variant, não só agregada.
- **R3 — Nome do pacote:** provisório. A definir.
- **R4 — Onde a Peça 1 lê:** começa pela empresa Pipeline Orchestrator; decidir depois se inclui Career Ops.

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-06-01 | Criado — design da skill-espelho aprovado em brainstorming; 4 decisões, 5 peças, dicionário de tradução v0 |
