# B0 — Relacionamento da Fase B com a Fase A

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Posição:** Prefácio da Fase B — leia antes de B1/B2/B3

---

## 1. Por que a Fase B existe se a Fase A já reforça o atual

A Fase A (Reforjo) usa os primitivos nativos do Paperclip para aplicar governance nos 48 agentes existentes — e faz isso bem. Mas ela tem limitações estruturais que a Fase B supera:

**Limitações da Fase A que a Fase B resolve:**

| Limitação da Fase A | Solução da Fase B |
|---|---|
| INVARIANTS block depende de leitura honesta do cargo — não há enforcement de runtime se o cargo ignorar o bloco | Capacidades declarativas no manifesto impedem o host Paperclip de executar ações não autorizadas |
| Approval issues são assíncronas com latência variável — um cargo pode prosseguir antes da resposta | SDK gate with blocking semantic — a execução para nativamente até a approval ser resolvida |
| UI de auditoria é o quadro nativo do Paperclip, não otimizado para visualizar pipeline state | Painel React dedicado com estado de gates em tempo real, log de decisões navegável, veredicto visual |
| Distribuição requer copiar arquivos AGENTS.md e skills manualmente | Plugin instalável via marketplace Paperclip com `npm install` ou UI de plugins |
| Testes de paridade são manuais (smoke tests com observação humana) | Suite de testes automatizada rodando contra o SDK com assertions de gate decisions |
| Multi-empresa: cada instância Paperclip precisa de cópia separada dos arquivos | Plugin por instância com configuração declarativa — zero arquivos manuais |

A Fase B não substitui a Fase A porque quer — substitui porque pode fazer melhor. A decisão de quando e se migrar cada cargo é do Board, não automática.

---

## 2. O que a Fase A ensina para a Fase B

A Fase A é o laboratório da Fase B. Cada onda da Fase A gera aprendizados concretos que informam decisões de design da Fase B:

### Da Onda A1 (esta spec) para B2-design.md:

- Os 35 portões do canonical foram mapeados para 35 approval types `pip:*` e `pip-spec:*`. Esse mapeamento 1:1 (ou 1:N quando um portão exige múltiplos approvals) é o blueprint da seção de gate kernel do B2-design.md.
- Os 14 decision points do protocolo de não-autonomia catalogados em A2-design.md revelam onde o enforcement é mais crítico — esses pontos têm prioridade de implementação na Fase B.
- A hierarquia de fontes de decisão (spec ativa → canônicos do projeto → engineering-principles → escalation) se torna o modelo de autorização de capabilities no manifesto.

### Da Onda A2 (PoC) para B2-design.md:

- O design do `executionState` JSON testado no PoC revela o esquema mínimo necessário para o banco de dados do plugin. Se o `executionState` funcionar bem, o esquema do plugin DB é basicamente o mesmo normalizado.
- A latência real das approval issues no Paperclip determina se o blocking semantic do SDK é necessário ou se async-with-polling é suficiente.
- Os approval types que geraram mais fricção no PoC têm prioridade de automação no B3 (Kernel de Governança).

### Da Onda A3 (Rollout) para B3-tasks.md:

- Os 48 INVARIANTS blocks revelam quais regras são universais (candidatas a capabilities no manifesto) e quais são específicas por cargo (candidatas a configurações por agent).
- O drift detection do sentinel-agent define os critérios de integridade que o SDK deve garantir nativamente.
- Os cenários de teste E2E (6 variants × 2-3 cenários) se tornam a suíte de acceptance tests automatizados da Fase B.

---

## 3. O que muda na Fase B vs o draft original de ontem

O `B1-requirements.md` (= `01-requirements.md` original, criado em 2026-05-23) foi escrito antes da fusão das duas iniciativas. Ele permanece como está — seus requisitos são válidos — mas algumas premissas mudaram:

### O que permanece igual:
- As 8 capacidades (C1-C8) continuam o objetivo central
- Os 6 critérios de aceitação por capacidade continuam o alvo de implementação
- As 6 restrições duras (HC1-HC6) continuam vigentes
- A estimativa de 18-20 semanas de desenvolvimento solo permanece válida

### O que mudou pela fusão:

**HC1 (Separação total)** foi endurecida pelo programa unificado: a separação não é apenas de código — é de planejamento, historico git, e ciclo de release. A Fase A não pode ser usada como argumento para "compartilhar" qualquer componente com a Fase B. Cada fase tem autonomia total.

**HC5 (Licença)** foi respondida: a Fase B deve ser Apache-2.0 ou MIT para compatibilidade com o ecossistema Paperclip. O plugin Claude Code canônico usa PolyForm Shield (source-available), mas a Fase B é projeto independente e pode escolher licença open-source plena.

**HC6 (Sem pressão de retro-porte)** ganhou uma nuance: aprendizados da Fase A PODEM ser portados para a Fase B voluntariamente (é justamente o ponto da fusão), mas isso é decisão explícita por item, não automática.

**Prioridade de bounded contexts** mudou com os aprendizados da Fase A: Classification e Gate Decision são os bounded contexts mais críticos (onde a Fase A revelou mais friction). Na Fase B, eles devem ser implementados primeiro (Slice 2 em vez de Slice 4).

---

## 4. Gate de Decisão — Quando a Fase B começa

A Fase B só inicia após o gate explícito entre as semanas 6-8 do programa. O gate avalia 5 critérios (documentados em `00-ROADMAP.md` seção "Gate de Decisão A → B"). Um resultado GO no gate dispara o B1-Spike do SDK; um NO-GO mantém a Fase A como solução definitiva.

Esta spec (B1/B2/B3) existe como planejamento antecipado — o Board pode decidir não prosseguir com a Fase B e esses documentos ficam como referência histórica.

---

## 5. Índice da Fase B

| Documento | Conteúdo | Status |
|---|---|---|
| B0-relationship-with-fase-A.md (este) | Como as fases se relacionam | v1.0 Draft |
| B1-requirements.md | 8 capacidades, 6 critérios de aceitação, 6 restrições duras | v0.1 Draft (criado 2026-05-23, pré-fusão) |
| B2-design.md | Arquitetura, bounded contexts, modelo de dados, workflows, decisões | v0.2 Draft (pós-adversarial review loop 1, 20 findings) |
| B3-tasks.md | 14 slices verticais em 5 fases, sprints, loops adversariais | v0.2 Draft (pós-adversarial review loop 1, 22 findings) |

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — relacionamento Fase A/B após fusão das iniciativas |
