# Princípios Comuns — Estratégia Paperclip Unificada

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Autoridade:** Este documento sobrepõe qualquer spec de fase ou workflow que entre em conflito com estes princípios.
**Escopo:** TODOS os documentos, ondas, fases e workflows deste programa.

> **SSOT para princípios.** Os 4 axiomas originais de `PAPERCLIP-AXIOMS.md` continuam vigentes. Este documento os reafirma, os estende e adiciona 5 novos princípios específicos desta spec unificada. Em caso de conflito, este documento vence.

---

## Os 9 Princípios Inquebrável

### Princípio 1 — Zero Autonomia Decisória

**Regra:** Nenhum agente (cargo) toma decisão crítica sem approval explícito do Board. Decisão crítica é qualquer ação que: modifica estado de execução, encerra uma fase, bloqueia uma tarefa, ou diverge de uma spec de workflow ativa.

**Como verificar:** Se a ação poderia impactar o resultado da tarefa de forma que o Board não antecipou, é crítica. Em caso de dúvida, é crítica.

**Mecanismo de enforcement:**
- Fase A: INVARIANTS block no AGENTS.md + approval issue obrigatória
- Fase B: capacidade declarativa no manifesto do plugin com gate de aprovação assíncrono

**Herdado de:** Axioma 1 do `PAPERCLIP-AXIOMS.md` + Iron Law 2 do canonical ("ask-first em ambiguidade")

---

### Princípio 2 — Adversarial Review Sempre Roda

**Regra:** Em todo batch implementado, o trio adversarial (segurança, arquitetura, qualidade) roda sem exceção. Custo de tokens não é fator de decisão. Opt-out por conveniência é proibido.

**Como verificar:** Todo fechamento de onda ou batch crítico deve ter registro de adversarial review com findings explícitos (mesmo que sejam "nenhum achado").

**Mecanismo de enforcement:**
- Fase A: sub-tarefas adversariais obrigatórias no workflow spec
- Fase B: adversarial-review-coordinator despachado automaticamente após cada batch

**Herdado de:** Axioma 2 do `PAPERCLIP-AXIOMS.md`

---

### Princípio 3 — TDD/ATDD/BDD/DDD Obrigatórios

**Regra:** Para qualquer código de produção, o ciclo RED → GREEN → REFACTOR é obrigatório. Critérios de aceitação em formato Given/When/Then precedem a implementação. Para documentação (ondas doc-only), os critérios de aceitação de cada documento são declarados antes da escrita.

**Como verificar:** Não existe sprint encerrado sem evidência de RED phase (teste falhou primeiro). Não existe batch encerrado sem critério de aceitação registrado.

**Mecanismo de enforcement:**
- Fase A: critérios de aceitação no topo de cada documento desta onda
- Fase B: quality-gate-router gera cenários em linguagem natural para aprovação antes de qualquer código

**Herdado de:** Axioma 3 do `PAPERCLIP-AXIOMS.md` + contratos de entrega de `01-requirements.md` (B1)

---

### Princípio 4 — Iron Law de Não-Interferência

**Regra:** O plugin Claude Code canônico (`D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/`) é somente-leitura para todos os fins deste programa. Nenhuma onda, nenhum agente, nenhuma decisão de design modifica qualquer arquivo nessa pasta.

**Extensão para Fase B:** A Fase B deve ter histórico git completamente independente. Zero arquivos, zero dependências de runtime, zero acoplamento de build com o plugin Claude Code.

**Como verificar:** `git status` em `D:/Pipeline Orchestrator Claude/Pipeline-Orchestrator/` deve mostrar zero modificações ao final de cada onda.

**Consequência de violação:** Falha crítica imediata. Rollback obrigatório. Escalation para Board.

**Herdado de:** Iron Law original do programa + HC1 e HC6 de `01-requirements.md` (B1)

---

### Princípio 5 — Loops Adversariais Antes de Commitar

**Regra:** Nenhum artefato crítico (A2-design, A3-tasks, qualquer design de Fase B) é finalizado sem ao menos um loop adversarial completo. O loop adversarial tem máximo 3 tentativas por finding. Finding não resolvido em 3 tentativas é escalado para o Board.

**Artefatos críticos nesta spec:** A2-design.md e A3-tasks.md (por design decision density e impacto nas Ondas A2/A3).

**Como verificar:** Cada artefato crítico tem seção "Resultado do Adversarial Review" com data, findings levantados, resolução ou escalação de cada finding.

---

### Princípio 6 — Decision Log Embutido

**Regra:** Toda escolha de design que poderia ter sido feita de outra forma deve ser registrada com: (a) contexto da decisão, (b) alternativas consideradas, (c) justificativa da escolha feita, (d) consequências esperadas.

**Formato mínimo:**

```
DECISION LOG — [ID único]
Contexto: [o que levou a essa decisão]
Alternativas: [opção A] / [opção B] / [opção C]
Escolha: [opção X]
Justificativa: [por que X, com evidência ou argumento]
Consequências: [o que isso implica para ondas futuras]
```

**Como verificar:** A2-design.md deve ter ao menos 5 decision log entries. Qualquer choice de arquitetura sem log é violação deste princípio.

---

### Princípio 7 — Paridade Mensurável como Métrica de Sucesso

**Regra:** "Paridade com o Claude Code canônico" não é declaração — é métrica. O `parity_score` (portões emitidos vs esperados) deve ser calculável e calculado em cada milestone. Paridade declarada sem evidência quantitativa é violação deste princípio.

**Thresholds:** PASS ≥0.95 | PASS_WITH_NOTES ≥0.80 | FAIL <0.80

**Como verificar:** A4-validation.md define os cenários de teste. Cada milestone de onda tem seu parity_score calculado ou estimado com evidência.

---

### Princípio 8 — Brainstorming Exaustivo com 14 Lentes

**Regra:** Antes de fechar qualquer bloco crítico de design, aplicar as 14 lentes de gap inventory do brainstorming exaustivo e declarar explicitamente as lacunas encontradas em cada lente (incluindo "nenhuma lacuna" quando for o caso).

**As 14 lentes:**
1. Functional Scope (o que o sistema deve fazer)
2. Non-Functional Requirements (performance, segurança, confiabilidade)
3. Error Handling & Edge Cases (o que acontece quando falha)
4. Data Model & State (o que persiste, o que é efêmero)
5. Integration Contracts (interfaces com sistemas externos)
6. Auth & Authorization (quem pode fazer o quê)
7. Migration & Backward Compatibility (o que muda para quem já usa)
8. Observability & Auditability (como saber que está funcionando)
9. Deployment & Operations (como vai para produção e é mantido)
10. Testing Strategy (como é testado em cada nível)
11. Documentation & Discoverability (como alguém novo aprende)
12. Regulatory & Compliance (restrições externas)
13. Scalability & Future Growth (o que muda quando cresce)
14. Failure Modes & Recovery (o que acontece com dados/estado quando algo falha)

**Como verificar:** A2-design.md tem seção "Gap Inventory (14 lentes)" com resultado de cada lente.

> **Nota de enriquecimento v1.1 (2026-05-24):** Auditoria KB+skills aplicada após draft inicial revelou que algumas lacunas detectadas pelas 14 lentes precisam virar decision points adicionais ou estender DP-53 a DP-62 (meta-guards do sentinel). Decisões resultantes da auditoria estão registradas em A2-design.md §9 "Cross-Reference KB Canonical + Skills" com 5 inconsistências documentadas (I1-I5) e 10 enriquecimentos aplicados. Sempre que houver auditoria similar futura (KB upgrade, novos skills custom, mudança de variant), seguir o mesmo padrão: enriquecer + documentar inconsistências + bump v1.x do doc afetado.

---

### Princípio 9 — Escopo Explícito e Declarado

**Regra:** Cada artefato (doc, onda, fase) tem escopo declarado explicitamente — o que está dentro e o que está fora. Qualquer trabalho que não esteja no escopo declarado de uma onda não pode ser iniciado naquela onda, mesmo que seja óbvio ou tentador.

**Rationale:** Escopo creep é a maior ameaça de uma onda doc-only. Escrever código (mesmo "só para exemplificar") em Onda A1 viola este princípio e o Princípio 4.

**Como verificar:** Cada documento começa com seção "Escopo deste documento" ou "Fora de escopo" quando aplicável.

---

## Hierarquia de Fontes de Decisão (herdada)

Quando um cargo precisa decidir o que fazer, consulta nesta ordem (herdado de PAPERCLIP-AXIOMS.md, reafirmado aqui):

1. Spec do workflow ativo (A2-design, PAPERCLIP-*-WORKFLOW.md)
2. Arquivos canônicos do projeto cliente (CLAUDE.md, README)
3. Skill `engineering-principles` (SOLID, KISS, DRY, YAGNI, Clean Architecture)
4. Escalation — criar approval issue, pegar próxima task

Nunca pular para 4 sem consultar 1-2-3. Nunca improvisar sem fonte citável.

---

## Verificação de Compliance

Para verificar que este documento está sendo respeitado, o adversarial review de qualquer artefato crítico deve checar:

- [ ] Adversarial review foi rodado? (P2)
- [ ] Critérios de aceitação foram declarados antes da escrita? (P3)
- [ ] `git status` em Pipeline-Orchestrator/ está limpo? (P4)
- [ ] Decision log presente em A2-design.md com ≥5 entries? (P6)
- [ ] Parity score calculado ou estimado com evidência? (P7)
- [ ] 14 lentes de gap inventory aplicadas e declaradas? (P8)
- [ ] Escopo declarado e respeitado? (P9)

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — 4 axiomas originais + 5 novos princípios unificados |
