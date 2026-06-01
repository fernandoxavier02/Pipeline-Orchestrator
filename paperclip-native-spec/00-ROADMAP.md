# Roadmap — Estratégia Paperclip Unificada

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Escopo:** Sequência completa do programa — Fase A ondas A1/A2/A3 + gate de decisão + Fase B fases B1-B5

---

## Visão Geral da Linha do Tempo

```
Semana 1     Semana 2-3   Semana 4-6   Semana 6-8   Semana 9+       Meses 3-9
    │            │             │            │            │               │
  Onda A1      Onda A2      Onda A3     Gate A→B     (aguardar)     Fase B
  (esta)      (PoC 1 cargo) (48 agentes) (decisão)   ou continuar    (SDK)
    │            │             │            │            │               │
  Doc pura    Primeiro JS   JS + rollout  GO / NO-GO  Fase A como     Plugin
  zero código  + 1 cargo    + sentinel    explícito   fallback ativo  nativo
```

---

## Fase A — Reforjo (Semanas 1-6)

### Onda A1 — Spec Documental (Semana 1)

**Objetivo:** Documentar completamente o programa antes de tocar em código ou configuração.

**Entregáveis:**
- Umbrella: 00-VISION, 00-GLOSSARIO, 00-PRINCIPIOS-COMUNS, este ROADMAP
- Fase A completa: A1-requirements, A2-design, A3-tasks, A4-validation
- 4 tabelas de mapping: gates, hooks, agentes, variants
- 3 ADRs: merge-strategy, codex-as-primary-llm, reforjar-antes-de-nativo
- Fase B reorganizada: B0-relationship + B1/B2/B3 movidos

**Iron Law:** Zero código JavaScript. Zero mudança em `~/.paperclip/instances/`. Zero mudança no plugin canônico.

**Definition of Done:**
- [ ] Todos os 15 documentos criados com conteúdo completo
- [ ] 3 docs existentes movidos para fase-B-nativo/ sem perda de conteúdo
- [ ] Adversarial review rodado em A2 e A3
- [ ] `git status` em Pipeline-Orchestrator/ mostra zero modificações

---

### Onda A2 — Proof of Concept (Semanas 2-3)

**Objetivo:** Validar que a arquitetura da Fase A funciona na prática com um cargo real antes do rollout completo.

**Cargo piloto selecionado:** `information-gate` (papel de Business Analyst / Requirements Clarifier). Escolhido por: frequência de uso, criticidade dos portões que dispara, presença em todos os 6 workflows.

**Entregáveis:**
- 1 biblioteca JavaScript (`lib/paperclip-execution-state.cjs`) — CRUD do executionState JSON
- 10 approval types no formato `pip:*` implementados para os portões do information-gate
- INVARIANTS block atualizado no AGENTS.md do information-gate
- Smoke test: rodar um bugfix-light real end-to-end com information-gate reforçado
- Resultado de paridade: parity_score medido para o cargo piloto

**Iron Law relaxada apenas para:** nova lib em `references/paperclip/spec/lib/` (subdir aditivo autorizado pela ADR-003). Nenhum outro arquivo canônico é tocado.

**Gate de entrada:** Onda A1 com DoD 100% aprovado e adversarial review sem findings abertos.

**Definition of Done:**
- [ ] Smoke test end-to-end passa (6 portões do information-gate disparados e registrados)
- [ ] parity_score para information-gate ≥ 0.90
- [ ] Approval issues criadas e resolvidas para cada portão disparado no smoke test
- [ ] Regressão: behavior do information-gate sem o reforço inalterado

---

### Onda A3 — Rollout Completo (Semanas 3-6)

**Objetivo:** Aplicar o padrão validado na Onda A2 para todos os 48 agentes (47 Claude Code + 1 Board equivalente) e adicionar drift detection automático.

**Entregáveis:**
- INVARIANTS block atualizado nos 48 AGENTS.md
- 35 approval types (`pip:*` e `pip-spec:*`) implementados e testados
- 3 bibliotecas JavaScript adicionais:
  - `lib/paperclip-gate-registry.cjs` — registry de portões e lookup
  - `lib/paperclip-sentinel.cjs` — agente sentinel de drift detection
  - `lib/paperclip-audit-trail.cjs` — gravação de trilha de auditoria no executionState
- Drift detection: sentinel-agent rodando em cron verificando desvios
- Cenários de teste E2E para os 6 variants × 2-3 cenários cada

**Gate de entrada:** Onda A2 com parity_score ≥ 0.90 no cargo piloto.

**Definition of Done:**
- [ ] parity_score geral ≥ 0.95 (todos os 6 variants testados)
- [ ] Zero regressão em workflows ativos durante rollout
- [ ] Drift detection ativa e testada (simula desvio → sentinel detecta em ≤ 1 ciclo)
- [ ] Trilha de auditoria verificável para 100% das decisões de portão nos smoke tests

---

## Gate de Decisão A → B (Semanas 6-8)

**Pergunta central:** A Fase A entregou paridade satisfatória para o investimento da Fase B?

**Critérios para GO na Fase B:**

| Critério | Threshold | Peso |
|---|---|---|
| parity_score Fase A | ≥ 0.95 | Mandatório |
| Lacunas estruturais identificadas | ≥ 3 categorias sem cobertura | Alto |
| Demanda de UI rica (React) | Casos reais identificados | Médio |
| Requisito multi-empresa | ≥ 1 cliente adicional | Médio |
| Custo de manutenção da Fase A | Estimado > 2h/semana | Baixo |

**Resultado GO:** Fase B inicia como projeto separado. Fase A continua como fallback operacional.

**Resultado NO-GO:** Fase A é suficiente. Fase B fica em backlog indefinido. Nenhuma ação adicional necessária.

**Resultado CONDICIONAL:** Fases podem coexistir por cargo — cargos críticos migram para Fase B, cargos simples ficam em Fase A.

---

## Fase B — Plugin Nativo (Meses 3-9 após gate GO)

### B1 — Spike de SDK (2 semanas)

**Objetivo:** Validar que o `@paperclipai/plugin-sdk` suporta os primitivos necessários antes de commitar com a Fase B.

**Entregáveis:**
- Plugin minimal instalável com 1 capacidade (classificação de tarefa)
- 1 approval gate funcional via SDK
- 1 sub-tarefa criada e resolvida via SDK
- Relatório: o que o SDK suporta, o que é contorno, o que está faltando

**Gate de saída:** Board decide continuar / pivotar / abortar baseado no Spike.

---

### B2 — Fundação (4 semanas)

**Objetivo:** Construir a infraestrutura que os bounded contexts vão compartilhar.

**Entregáveis:**
- Manifesto declarativo com as 8 capacidades (C1-C8)
- Banco de dados do plugin com esquema para gate decisions e estado de execução
- Barramento de eventos básico (classificação → pipeline)
- Primeiro bounded context: Workspace + Classification

---

### B3 — Kernel de Governança (6 semanas)

**Objetivo:** Implementar o núcleo do pipeline — batching, gates, adversarial, fix loop.

**Entregáveis:**
- Bounded contexts: Execution + Adversarial Review + Fix Loop + Validation
- 35 portões implementados nativamente via SDK
- Adversarial Review com 3 reviewers paralelos
- Fix loop com máximo 3 tentativas

---

### B4 — Casca UI (4 semanas)

**Objetivo:** UI React para visualização de estado em tempo real.

**Entregáveis:**
- Painel de status do pipeline com gates ativos
- Log de decisões navegável
- Visualização do verdict final (GO/CONDITIONAL/NO-GO)

---

### B5 — Ship (2 semanas)

**Objetivo:** Publicar no marketplace Paperclip e documentar.

**Entregáveis:**
- Plugin publicado no marketplace com versão 1.0.0
- Documentação de instalação (< 5 minutos do zero)
- Guia de migração da Fase A para a Fase B
- parity_score ≥ 0.95 confirmado por auditor independente

---

## Critérios para Parar em Qualquer Ponto

**Parar a Fase A se:**
- Primitivos Paperclip nativos são insuficientes para enforcement (detectado no Onda A2)
- Custo de manutenção projetado ultrapassa benefício de paridade
- Paperclip muda de arquitetura incompativelmente

**Parar a Fase B se:**
- SDK não suporta os primitivos necessários após Spike B1
- Paridade da Fase A for suficiente e não houver demanda de UI ou multi-empresa
- Custo de desenvolvimento projetado ultrapassa ROI esperado

**Em qualquer parada:** Fase A (quando concluída) serve como fallback permanente. O plugin Claude Code canônico continua operacional independentemente.

---

## Dependências Externas

| Dependência | Risco | Mitigação |
|---|---|---|
| `@paperclipai/plugin-sdk` versão estável | Médio — SDK em evolução | Spike B1 valida antes de commitar com Fase B |
| Primitivo `approval` do Paperclip se mantém | Baixo — documentado e em uso ativo | Iron Law isola: Fase A não depende do SDK |
| Modelo Codex 5.5 disponível nos 48 cargos | Baixo — já em uso | Fallback para Sonnet 4.6 documentado |
| Paperclip HTTP API loopback sem auth | Baixo — documentado | Todas as operações Fase A passam por esta API |

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — roadmap completo do programa |
