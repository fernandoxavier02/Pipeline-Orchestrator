<div align="center">
  <img src="assets/diagrams/hero-banner.svg" alt="Pipeline Orchestrator v5.0.0" width="100%"/>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/versão-5.0.0-7C3AED?style=for-the-badge&logo=git&logoColor=white" alt="Versão" />
  <img src="https://img.shields.io/badge/agentes-19-0EA5E9?style=for-the-badge" alt="Agentes" />
  <img src="https://img.shields.io/badge/pipelines-12-22C55E?style=for-the-badge" alt="Pipelines" />
  <img src="https://img.shields.io/badge/testes-166%2F0-F59E0B?style=for-the-badge" alt="Testes" />
  <img src="https://img.shields.io/badge/platform-Claude_Code-000?style=for-the-badge" alt="Plataforma" />
  <img src="https://img.shields.io/badge/licença-MIT-65a30d?style=for-the-badge" alt="Licença" />
</p>

<p align="center">
  <a href="#o-que-ha-de-novo">O que há de novo</a> &bull;
  <a href="#comecar-agora">Começar agora</a> &bull;
  <a href="#como-funciona">Como funciona</a> &bull;
  <a href="#tipos-de-pipeline">Pipelines</a> &bull;
  <a href="#arquitetura">Arquitetura</a> &bull;
  <a href="#sistema-de-portoes">Portões</a>
</p>

---

> **Nota:** Este repositório é ao mesmo tempo o plugin Pipeline Orchestrator **e** o marketplace **FX-Studio-AI** que hospeda cinco plugins. Instale o marketplace uma vez para acessar todos. Veja [a seção da suite](#suite-fx-studio-ai) no final.

---

## O que há de novo no v5.0

A versão 5.0 é o primeiro release major do Pipeline Orchestrator. Três anos de iteração convergiram nesta arquitetura:

| Recurso | O que muda |
|---------|-----------|
| **TRACE.md** | Todo pipeline gera um rastro de auditoria completo em `.pipeline-orchestrator/runs/<id>/TRACE.md` — anexável em PR via validador standalone |
| **Plan-mode automático** | Tarefas MEDIA e COMPLEXA disparam planejamento automático sem precisar de flag `--plan` |
| **Spec Pipeline** | Ciclo de vida completo para especificações: Format Gate → Content Review → ATDD → Post-Impl Validation → Closure |
| **Suite 166/0/1** | 166 testes passando, 0 falhando, 1 skipped — zero regressões desde a baseline v4.16.0 |

Para migração de versões anteriores, veja [MIGRATION-v4-to-v5](docs/MIGRATION-v4-to-v5.md).

---

## O Problema

Você entrega código. Testes passam. Linter está verde. O PR parece limpo.

**Aí a produção quebra.**

Um bypass de autenticação silencioso. Uma condição de corrida sob carga. Um conflito de SSOT entre dois serviços que ninguém notou. O tipo de bug que revisão de código *deveria* pegar — mas não pega, porque revisores compartilham o mesmo contexto do autor.

**O Pipeline Orchestrator resolve isso com independência adversarial.** Cada batch de trabalho é revisado por agentes que têm *zero conhecimento* de como o código foi escrito. Eles veem apenas o resultado. Atacam por segurança, arquitetura e qualidade — simultaneamente, em paralelo, sem contexto compartilhado.

> *"A revisão adversarial no Batch 3 pegou um caminho de escalada de privilégios que três revisores humanos deixaram passar."*

---

## Começar agora

```bash
# Adiciona o marketplace FX Studio AI
claude plugin add-marketplace https://github.com/fernandoxavier02/FX-Studio-AI

# Instala o plugin
claude plugin add pipeline-orchestrator

# Executa seu primeiro pipeline
/pipeline corrigir o bug de timeout no login
```

Pronto. O orquestrador classifica sua tarefa, seleciona o pipeline certo e executa — com TDD, revisão adversarial e validação Go/No-Go.

---

## Como funciona

Cada tarefa flui por 4 fases. A profundidade de cada fase escala automaticamente com a complexidade.

<div align="center">
  <img src="assets/diagrams/pipeline-flow-animated.svg" alt="Fluxo de Execução do Pipeline" width="100%"/>
</div>

### Complexidade Adaptativa

O pipeline ajusta seu rigor sozinho. Zero configuração necessária.

| Complexidade | Arquivos | Batch | Plan | Adversarial | Sentinel |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **SIMPLES** | 1-2 | Todos de uma vez | Ignorado | 3 checklists | 1 checkpoint |
| **MEDIA** | 3-5 | 2-3 tarefas | Automático | 5 checklists | 2 checkpoints |
| **COMPLEXA** | 6+ | 1 tarefa | Automático | 7 checklists + deep review | 5 checkpoints |

---

## Tipos de Pipeline

Seis famílias especializadas — cada uma com variantes **light** e **heavy** — cobrem todo cenário de desenvolvimento.

> **Heavy** = time completo (COMPLEXA/MEDIA). **Light** = time reduzido com degradação elegante (SIMPLES).

| Pipeline | Quando usar | O que acontece |
|----------|-------------|---------------|
| **Bug Fix** | Bugs em produção, regressões | Diagnóstico → Análise de Causa Raiz → Correção TDD → Suite de Regressão |
| **Feature** | Novas capacidades, melhorias | Planejamento de Fatia Vertical → Implementação → Validação de Integração |
| **User Story** | Histórias orientadas ao usuário | Mesmo time de Feature, escopado por critérios de aceitação |
| **Audit** | Saúde do código, conformidade | Intake → Análise de Domínio → Check de Conformidade → Matriz de Risco |
| **UX Simulation** | Análise de experiência do usuário | Simulação de Persona ‖ Auditoria Acessibilidade → Validação QA |
| **Adversarial** | Revisão de segurança e arquitetura | Scanner de Segurança ‖ Crítico de Arquitetura → Relatório Consolidado |
| **Spec** (v5.0) | Especificações e documentação | Format Gate → Content Review → ATDD → Post-Impl Validator → Closure |

---

## Arquitetura

### 19 Agentes em 4 Camadas

O Pipeline Orchestrator implanta agentes em quatro camadas — cada uma com papel distinto e **zero vazamento de contexto** entre camadas.

<div align="center">
  <img src="assets/diagrams/architecture-animated.svg" alt="Arquitetura de 19 Agentes" width="100%"/>
</div>

### Times Específicos por Pipeline

| Pipeline | Agentes | Fluxo de Execução |
|----------|---------|-------------------|
| **Bug Fix Heavy** | 4 | `diagnostic` → `root-cause` → `implementer` → `regression-tester` |
| **Bug Fix Light** | 3 | `diagnostic` → `implementer` → `regression-tester` |
| **Feature Heavy** | 3 | `slice-planner` → `implementer` → `integration-validator` |
| **Feature Light** | 2 | `slice-planner` → `implementer` |
| **Audit Heavy** | 4 | `intake` → `domain-analyzer` → `compliance-checker` → `risk-matrix` |
| **Audit Light** | 3 | `intake` → `compliance-checker` → `risk-matrix` |
| **UX Heavy** | 3 | `simulator` ‖ `a11y-auditor` → `qa-validator` |
| **UX Light** | 2 | `simulator` → `qa-validator` |
| **Adversarial Heavy** | 3 | `coordinator` → `security-scanner` ‖ `architecture-critic` |
| **Adversarial Light** | 2 | `coordinator` → `security-scanner` |
| **Spec Heavy** | 4 | `format-gate` → `content-reviewer` → `post-impl-validator` → `spec-closer` |
| **Spec Light** | 3 | `format-gate` → `content-reviewer` → `spec-closer` |

> **‖** = execução paralela com zero contexto compartilhado

---

## Sistema de Portões

### Defesa em Profundidade

Cada camada do pipeline tem mecanismos de segurança independentes. Nenhum ponto único de falha.

<div align="center">
  <img src="assets/diagrams/gate-system-animated.svg" alt="Sistema de Portões Defense-in-Depth" width="100%"/>
</div>

| Tipo de Portão | Pode pular? | Override do usuário? | Exemplo |
|-----------|:---------:|:--------------------:|---------|
| **OBRIGATÓRIO** | Nunca | Não | Conflito SSOT, revisão auth/crypto |
| **DURO** | Não | Só resolução | Info faltando, aprovação de testes |
| **CIRCUIT BREAKER** | Não | Só reset | 2 falhas consecutivas, 3 tentativas esgotadas |
| **FLEXÍVEL** | Sim (logado) | Sim | Revisão adversarial, revisão final |

### Sentinel — Guardião do Pipeline

O agente Sentinel valida cada transição de fase e cada spawn de agente. Opera independentemente do fluxo de execução e não pode ser contornado.

- **5 checkpoints obrigatórios** ao longo do ciclo de vida do pipeline
- **Hook PreToolUse** valida todo spawn de `Agent` contra a sequência esperada
- **Validação de coerência** em toda fronteira de fase
- **Auto-correção** para desvios menores, bloqueio rígido para anomalias

### Scoring de Confiança

O pipeline acumula um score de confiança em todas as fases — um sinal objetivo de qualidade que alimenta a decisão final Go/No-Go.

```
Confiança = média(
  clareza_classificação,    # Fase 0 — o tipo da tarefa ficou claro?
  info_completude,          # Fase 0 — todos os gaps foram resolvidos?
  alinhamento_design,       # Fase 0 — decisões de design resolvidas?
  cobertura_plano,          # Fase 1.5 — o plano cobre tudo?
  cobertura_tdd,            # Fase 2 — testes são adequados?
  qualidade_implementação   # Fase 2 — qualidade da revisão?
) + penalidade_portão       # Acumulada de portões FLEXÍVEIS pulados

GO:          >= 0.80
CONDICIONAL: >= 0.60
NO-GO:       <  0.60
```

---

## TRACE.md — Rastro de Auditoria

A cada execução, o pipeline emite um arquivo TRACE.md auditável:

| Seção | Conteúdo |
|-------|----------|
| **1. Classificação** | task_type, complexity, confidence, pipeline_variant, flags |
| **2. Definição do Pipeline** | phase_sequence, gates_expected, agents_planned, checkpoints |
| **3. Log de Execução** | batches_executed, agents_invoked, gates_triggered, findings_count, fix_attempts |
| **4. Veredicto Final** | verdict, confidence_score, gate_penalty, skipped_gates, trace_schema_version: 1 |

- Path padrão: `.pipeline-orchestrator/runs/<run-id>/TRACE.md`
- Validador standalone: `scripts/validate-trace.cjs` (puro Node.js, exit 0/1)
- Schema version: 1 (ordem canônica de campos garantida)

---

## Comandos

| Comando | Descrição |
|---------|-----------|
| `/pipeline [tarefa]` | Pipeline completo — triagem, plano, execução, fechamento |
| `/pipeline --hotfix [tarefa]` | Modo emergência — cerimônia reduzida, foco em produção |
| `/pipeline --plan [tarefa]` | Força planejamento para qualquer complexidade |
| `/pipeline --grill [tarefa]` | Força interrogação de design para qualquer complexidade |
| `/pipeline --no-plan [tarefa]` | Pula plano em MEDIA (logado); COMPLEXA ignora |
| `/pipeline review-only` | Revisão adversarial das mudanças atuais (sem execução) |
| `/pipeline diagnostic [tarefa]` | Apenas classificação + proposta (dry run) |
| `/pipeline continue` | Retoma uma sessão de pipeline interrompida |
| `/bugfix [tarefa]` | Atalho direto para pipeline de bug fix |
| `/feature [tarefa]` | Atalho direto para pipeline de feature |
| `/audit [tarefa]` | Atalho direto para pipeline de audit |
| `/spec [tarefa]` | Atalho direto para pipeline de spec (v5.0) |

### Overrides de Complexidade

| Flag | Efeito |
|------|--------|
| `--simples` | Força SIMPLES — todas as tarefas em um batch, cerimônia light |
| `--media` | Força MEDIA — 2-3 tarefas por batch, cerimônia moderada |
| `--complexa` | Força COMPLEXA — 1 tarefa por batch, cerimônia completa |

---

## Por que Pipeline Orchestrator?

<table>
<tr>
<td width="50%">

### Sem Pipeline Orchestrator

- Decomposição manual de tarefas
- Profundidade de revisão inconsistente
- Viés de contexto compartilhado em revisões
- Sem teste adversarial estruturado
- Deploy "manda e reza"

</td>
<td width="50%">

### Com Pipeline Orchestrator

- Auto-classificação e batching adaptativo
- Profundidade de revisão proporcional à complexidade
- **Revisões adversariais com zero contexto**
- Portões de Segurança + Arquitetura + Qualidade
- Decisões Go/No-Go com score de confiança

</td>
</tr>
</table>

### Diferenciadores

**Isolamento de Contexto** — Agentes revisores nunca veem o raciocínio da implementação. Atacam o código às cegas, como um atacante real faria.

**Rigor Proporcional** — Um erro de digitação de uma linha não recebe a mesma cerimônia que uma reescrita de sistema de pagamento. O pipeline escala sozinho.

**Portões à Prova de Falha** — Portões OBRIGATÓRIOS não podem ser contornados, nem por `--hotfix`. CIRCUIT BREAKERs param o pipeline antes que danos se acumulem. Todo skip é logado e penaliza o score de confiança.

**TDD por Padrão** — Testes são escritos ANTES da implementação (fase VERMELHA), aprovados pelo usuário, e validados após cada batch. Não é opcional para pipelines que mudam código.

**Caixa de Vidro** — TRACE.md gera rastro completo de cada execução. Auditável, anexável em PR, validável.

---

## Destaques de Qualidade

| Sinal | Detalhe |
|---|---|
| **166 testes passando** | 149 unitários + 17 integração — pure Node.js built-in test runner, zero dependências externas de teste |
| **5 compat mock + 8 hooks** | Suite completa de regressão com zero regressões desde baseline v4.16.0 |
| **Segurança defense-in-depth** | Escritas atômicas `tmp+rename`, caminhos de erro fail-closed, rejeição de timestamp futuro (5s skew), stale-OPEN reuse rejection, case-folding de path Windows, regex-validação de session IDs |
| **Anti-prompt-injection por design** | Inline Invariants no prompt do controlador **sobrepõem** qualquer conteúdo contraditório de `references/*.md` — resultados de Grep adversarial são tratados como dados, não instruções |
| **Revisão adversarial independente** | Três scanners independentes (segurança + arquitetura + qualidade) revisam cada batch com **zero contexto de implementação** |
| **Revisores competem em paralelo** | Time adversarial final spawnado simultaneamente (mensagem única, três chamadas de Agent) para preservar independência e amortizar tempo de parede |
| **Apenas alegações verificáveis** | Toda asserção de sanity requer `comando + saída real`; nenhuma asserção baseada em confiança |

---

## Estrutura do Projeto

```
pipeline-orchestrator/
├── agents/
│   ├── core/                    # 8 agentes de orquestração
│   │   ├── task-orchestrator    # Ponto de entrada — classifica tarefas
│   │   ├── information-gate     # Detecta contexto faltando
│   │   ├── sentinel             # Guardião do pipeline
│   │   ├── checkpoint-validator # Verificação de build + testes
│   │   ├── sanity-checker       # Verificação final de sanity
│   │   ├── adversarial-batch    # Revisão de checklist por batch
│   │   ├── final-validator      # Decisão Go/No-Go (Pé de Cal)
│   │   └── finishing-branch     # Opções de fechamento
│   ├── executor/                # 5 agentes executor + específicos
│   │   ├── executor-controller  # Orquestração de batch
│   │   ├── executor-implementer # Implementação por tarefa
│   │   ├── executor-fix         # Correções direcionadas
│   │   ├── executor-spec-reviewer
│   │   ├── executor-quality-reviewer
│   │   └── type-specific/       # 17 agentes especialistas de domínio
│   └── quality/                 # 7 agentes de revisão
├── commands/
│   ├── pipeline.md              # Comando /pipeline (classificador completo)
│   ├── bugfix.md                # Atalho /bugfix
│   ├── feature.md               # Atalho /feature
│   ├── audit.md                 # Atalho /audit
│   └── spec.md                  # Atalho /spec (v5.0)
├── references/
│   ├── checklists/              # 7 checklists de segurança
│   ├── pipelines/               # 15 definições de variantes de pipeline
│   ├── gates.md                 # Taxonomia de dureza + Registry de 22 portões
│   ├── team-registry.md         # Mapeamento agente-time SSOT
│   ├── complexity-matrix.md     # Regras de classificação
│   ├── trace-schema/v1.md       # Schema TRACE.md (v5.0)
│   └── glossary.md              # Definições de termos
├── skills/                      # 14 definições de skills
│   ├── pipeline/                # Skill principal
│   ├── bugfix-light/            # 8 passos prescritivos
│   ├── bugfix-heavy/            # 11 passos prescritivos
│   ├── feature-light/           # 13 passos
│   ├── feature-heavy/           # 13 passos
│   ├── audit-light/             # 9 passos
│   ├── audit-heavy/             # 9 passos
│   ├── spec-light/              # 6 passos (v5.0)
│   ├── spec-heavy/              # 9 passos (v5.0)
│   └── spec-audit-only/         # 5 passos (v5.0)
├── hooks/
│   └── hooks.json               # Hook PreToolUse do Sentinel
├── scripts/
│   └── validate-trace.cjs       # Validador standalone TRACE.md (v5.0)
└── tests/
    ├── unit/                    # 19 suites de teste unitário
    ├── integration/             # 3 suites de teste de integração
    ├── compat/                  # Runner de regressão de compatibilidade
    └── fixtures/                # Fixtures de teste
```

---

## Requisitos

- [Claude Code](https://claude.com/claude-code) CLI ou Desktop App
- Zero dependências externas — agentes em markdown puro

---

## Suite FX Studio AI

O Pipeline Orchestrator é um de cinco plugins no marketplace **FX-Studio-AI**. Eles formam um workflow coeso:

1. **[cc-toolkit](https://github.com/fernandoxavier02/cc-mastery)** — Onboarding e diagnósticos. Coloque seu Claude Code em ordem.
2. **[skill-advisor](https://github.com/fernandoxavier02/skill-advisor)** — Descoberta e roteamento. Use as ferramentas que você já tem, efetivamente.
3. **Pipeline Orchestrator** (este repo) — Revisão adversarial. Entregue código de produção com segurança.
4. **[engineering-context](https://github.com/fernandoxavier02/engineering-context)** — Regras de engenharia, mineração de anti-padrões, detecção de stack.
5. **[tts-minimax](https://github.com/fernandoxavier02/tts-minimax)** — TTS bring-your-own-key para respostas faladas.

Instale o marketplace uma vez, use qualquer combinação.

---

## Licença

MIT License — veja [LICENSE](LICENSE) para detalhes.

---

<div align="center">
  <br/>
  <strong>Construído por <a href="https://github.com/fernandoxavier02">Fernando Xavier</a></strong>
  <br/>
  <a href="https://fxstudioai.com">FX Studio AI</a> — Automação de Negócios com IA
  <br/><br/>
  <sub>19 agentes trabalhando juntos para você não ter que trabalhar sozinho.</sub>
</div>
