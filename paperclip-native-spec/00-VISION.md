# Vision — Estratégia Paperclip Unificada

**Status:** Draft v1.0 (Onda A1)
**Data:** 2026-05-24
**Autores:** Fernando Costa Xavier + Claude Sonnet 4.6 (via Pipeline Orchestrator)
**Escopo:** Programa completo — Fase A (reforjo) + Fase B (plugin nativo)

---

## 1. Por que esse programa existe

O plugin Pipeline Orchestrator para Claude Code entrega governança de execução multi-agente — triagem, planejamento, batches com TDD, revisão adversarial, registro de portões e trilha de auditoria — desde a v1.0 e hoje está maduro (v7.6.1). O Paperclip é uma plataforma paralela de orquestração de agentes que já roda os mesmos 48 cargos (agentes), mas sem enforcement equivalente: os agentes podem improvisar decisões, pular revisões adversariais, deixar de registrar portões. A paridade medida está em torno de 70-75%.

O problema não é falta de funcionalidade no Paperclip — ao contrário. O Paperclip tem primitivos nativos poderosos: fluxo de aprovação assíncrono com estado tipado, hierarquia de sub-tarefas com dependências, activity log auditável automático, campo de estado de execução extensível por JSON, e personas de agente em arquivos de sistema. Tudo que precisamos para replicar governance está disponível — só não foi explorado.

Este programa existe para explorar esses primitivos de forma sistemática e disciplinada, em duas fases sequenciais que atacam o mesmo objetivo por caminhos complementares.

---

## 2. Visão em duas frases

**Curto prazo:** Reforjar o Paperclip que já existe — 48 agentes, plataforma operacional — adicionando enforcement explícito de portões, protocolo de não-autonomia e rastreabilidade de decisões usando apenas os primitivos nativos da plataforma.

**Longo prazo:** Construir um plugin Paperclip novo do zero com o SDK oficial, com UI React, integração marketplace e fidelidade plena ao canonical Claude Code, incorporando os aprendizados do reforjo.

---

## 3. Mapeamento das duas fases

### Fase A — Reforjo (1-6 semanas)

**Objetivo:** Enforcement imediato sem novo código JavaScript. Usar os primitivos Paperclip nativos (approval issues, executionState JSON, activity log) para aproximar o comportamento dos 48 agentes existentes do canonical Claude Code.

**Escopo:** Documentação completa (esta spec) + PoC em 1 cargo + rollout nos 48 agentes + detecção de desvio. Documentação é Onda A1 (esta semana). Código chega em Ondas A2 e A3.

**Output:** 48 agentes com portões explícitos, protocolo de não-autonomia aplicado via INVARIANTS block em cada AGENTS.md, e rastreabilidade de decisões via approval issues e activity log.

**Estimativa de entrega de valor:** parity score passa de ~70% para ≥95% após Onda A3 completa.

**Iron Law:** subdiretório aditivo no plugin canônico (`references/paperclip/spec/`). Zero mudança nos arquivos canônicos existentes. Zero código JavaScript novo nesta Onda A1.

### Fase B — Plugin Nativo (4-6 meses após gate de decisão)

**Objetivo:** Construir plugin separado usando `@paperclipai/plugin-sdk`, com capacidades declarativas, UI React, banco de dados do plugin, barramento de eventos, e distribuição via marketplace Paperclip.

**Escopo:** Spike de SDK → Fundação → Kernel de governança → Casca UI → Ship. Aproveita aprendizados da Fase A sobre quais primitivos funcionam bem e quais têm fricção.

**Output:** Plugin Paperclip autônomo com fidelidade plena ao canonical, distribuível como produto independente.

**Estimativa:** 18-20 semanas de desenvolvimento solo após gate de decisão (Semana 6-8 do programa).

**Iron Law reforçada:** zero código compartilhado com o plugin Claude Code. Projetos independentes com versionamento próprio.

---

## 4. Como as fases se relacionam

A Fase A e a Fase B não são competidoras — são sequenciais e complementares:

A Fase A revela o que os primitivos nativos do Paperclip conseguem e o que eles não conseguem. Portões que funcionam bem via approval issues ficam na Fase A. Portões que exigem UI rica, sincronização multi-agente em tempo real, ou distribuição via marketplace são o argumento para a Fase B.

Os aprendizados da Fase A informam diretamente as decisões da Fase B: quais bounded contexts são mais críticos, quais workflows têm mais drift, quais primitivos precisam ser encapsulados no SDK. O documento `B0-relationship-with-fase-A.md` na pasta Fase B rastreia essas conexões explicitamente.

As duas fases podem coexistir indefinidamente. A Fase B não substitui a Fase A automaticamente — o usuário decide quando (e se) migrar cada cargo para o plugin nativo. A Fase A funciona como fallback permanente se necessário.

---

## 5. Critérios de sucesso por fase

### Fase A — sucesso quando:

- `parity_score` ≥ 0.95 (portões emitidos vs esperados em cenários E2E) — ver A4-validation.md
- Zero decisões críticas tomadas por agente sem approval explícito em ≥48h de operação
- Rollout completo nos 48 agentes sem regressão nos workflows ativos (bugfix, feature, audit, UX, spec, adversarial)
- Derivação detectada e alertada automaticamente pelo sentinel-agent dentro de 1 ciclo de heartbeat

### Fase B — sucesso quando:

- Plugin instalável via marketplace Paperclip em instância nova em < 5 minutos
- 8 capacidades (C1-C8 do B1-requirements.md) funcionando end-to-end em smoke test
- `parity_score` ≥ 0.95 (mesma métrica, medida por auditor independente)
- Iron Law: plugin Claude Code original intocado durante todo desenvolvimento da Fase B

---

## 6. Princípios compartilhados

Os princípios que governam as duas fases estão declarados em `00-PRINCIPIOS-COMUNS.md`. Em resumo: zero autonomia decisória da IA, paridade com o canonical como métrica mensurável, loops adversariais antes de commitar, Iron Law de não-interferência, e decision log embutido em cada escolha de design.

---

## 7. O que não está no escopo deste programa

- Modificação do plugin Claude Code canônico (Iron Law permanente — ele evolui de forma independente)
- Migração automática de workflows existentes do Claude Code para o Paperclip
- Hospedagem SaaS multi-tenant (responsabilidade da infraestrutura Paperclip, não deste plugin)
- Suporte a runtimes de agente fora dos adapters nativos do Paperclip

---

## Histórico deste documento

| Versão | Data | Mudança |
|---|---|---|
| v1.0 | 2026-05-24 | Criado em Onda A1 — consolidação dos dois esforços paralelos em programa unificado |
