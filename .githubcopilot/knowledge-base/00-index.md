---
title: Índice da base VS Code Copilot
area: index
tags:
  - index
  - vscode
  - copilot
globs:
  - "**"
updated: 2026-03-24
---

## Índice

## Arquivos principais

- `01-platform-overview.md` — visão geral da plataforma, superfícies de chat, agentes e customizações.
- `02-models-and-agent-selection.md` — modelos, seleção de agente e critérios de escolha.
- `03-context-memory-and-instructions.md` — contexto, memória persistente, prioridades e arquivos de instrução.
- `04-custom-agents-and-subagent-orchestration.md` — custom agents, handoffs, subagentes e padrões de orquestração.
- `05-mcp-tools-hooks-and-security.md` — MCP, tools, hooks, segurança e confiança.
- `06-prompts-skills-plugins-and-extensibility.md` — prompt files, skills, plugins e extensibilidade.
- `07-local-background-cloud-sessions.md` — tipos de sessão, limites e quando usar local/background/cloud.
- `08-settings-diagnostics-and-ops.md` — settings críticos, diagnósticos e troubleshooting.
- `09-clean-code-architecture-guidance.md` — heurísticas para maximizar qualidade, arquitetura e clareza.
- `10-superpowers-canonical-baseline.md` — baseline canônica do sistema `superpowers` a ser espelhado no Copilot.
- `11-superpowers-copilot-compatibility-matrix.md` — matriz capability-by-capability de compatibilidade Claude/Windsurf -> Copilot.
- `12-superpowers-mirror-batches.md` — batches de execução, gates adversariais e critérios de pronto do espelho Copilot.
- `13-superpowers-ssot-and-mirror-boundaries.md` — fronteiras de autoridade, promoção e drift entre Claude, Copilot e mirror global.
- `14-superpowers-packaging-and-discovery.md` — mapa de artifacts, entry points e regras de discovery para o espelho Copilot.
- `15-superpowers-routing-and-handoffs.md` — contratos de entrada, saída e escalonamento entre as etapas do workflow.
- `16-superpowers-gate-emulation.md` — mapeamento de gates nativos e guiados, com ledger de claims versus enforcement.
- `17-superpowers-workspace-global-sync.md` — política de promoção e layout do espelho para `~/.githubcopilot-global/`.
- `18-superpowers-validation-harness.md` — checks estruturais e de fidelidade para workspace e mirror global.
- `19-superpowers-global-profile-activation.md` — ativação do mirror global no perfil do usuário, snippet de settings e preflight operacional.
- `20-pipeline-orchestrator-canonical-baseline.md` — baseline canonica do `pipeline-orchestrator`, com cadeia, contratos e limites observados.
- `21-pipeline-orchestrator-copilot-compatibility-matrix.md` — matriz capability-by-capability de compatibilidade Claude/Windsurf -> Copilot para o pipeline.
- `22-pipeline-orchestrator-mirror-batches.md` — batches do espelhamento com revisao adversarial e ledger de gaps.
- `23-pipeline-orchestrator-ssot-and-mirror-boundaries.md` — fronteiras de autoridade, conflitos resolvidos e regras de promocao do mirror.
- `24-pipeline-orchestrator-packaging-and-discovery.md` — mapa de artifacts, entry points e discovery do espelho do pipeline-orchestrator.
- `25-pipeline-orchestrator-routing-and-handoffs.md` — contratos de roteamento, ownership e handoff entre prompts, agente e validacao.
- `26-pipeline-orchestrator-gate-emulation.md` — ledger de gates, enforcement original e emulacao honesta no Copilot.
- `27-pipeline-orchestrator-workspace-global-sync.md` — policy de promocao e approved set do espelho pipeline-orchestrator.
- `28-pipeline-orchestrator-validation-harness.md` — checks estruturais, snippets criticos e auditoria opcional de user settings.
- `29-pipeline-orchestrator-global-profile-activation.md` — ativacao do mirror global no perfil do usuario e snippet recomendado de settings.
- `30-superpowers-pipeline-integration-contract.md` — contrato formal de integracao entre superpowers e pipeline-orchestrator: ownership, routing, paridade e manutencao.
- `20-ui-ux-pro-max-baseline.md` — baseline do espelho lite da skill `ui-ux-pro-max`: missão, decomposição em camadas, o que entrou e o que ficou fora do mirror e por quê.
- `21-ui-ux-pro-max-compatibility-matrix.md` — matriz de compatibilidade capability-by-capability entre o `ui-ux-pro-max` original (Claude) e o `ui-ux-pro-max-lite` (Copilot), com paridade e gaps residuais.

## Regra prática

- **Assunto curto e universal** → `instructions/`
- **Assunto profundo ou investigativo** → `knowledge-base/`
- **Fluxo recorrente especializado** → `agents/`
