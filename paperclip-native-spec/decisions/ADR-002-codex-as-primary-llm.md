# ADR-002 — Codex como Modelo Primário para os Cargos Paperclip

**Data:** 2026-05-24
**Status:** ACCEPTED
**Decidido por:** Fernando Costa Xavier
**Contexto da sessão:** Sessão de 2026-05-24 — configuração do ambiente Paperclip

---

## Contexto

Os 48 cargos da empresa "Pipeline Orchestrator" no Paperclip precisam de um modelo de linguagem (LLM) configurado para execução. O Paperclip suporta múltiplos adapters de modelo: modelos OpenAI (GPT), Claude via adapter `claude_local`, Codex CLI, e outros.

A escolha do modelo impacta:
- Capacidade de seguir instruções longas e complexas (AGENTS.md + workflow specs)
- Custo operacional por tarefa
- Disponibilidade e latência
- Compatibilidade com o harness do Paperclip (tool calling, multimodal, etc.)

---

## Alternativas Consideradas

**Opção A: GPT-4o como modelo primário**
- Modelo familiar, bem documentado, alta disponibilidade
- Custo: ~$5-15 por execução de pipeline completo (estimativa)
- Limitação: sem conhecimento implícito do ecossistema Claude Code/Pipeline Orchestrator
- Limitação: tool calling robusto mas diferente da semântica do Claude

**Opção B: Claude Sonnet 4.6 via adapter `claude_local`**
- Modelo nativo do ecossistema — conhece o Pipeline Orchestrator canonicamente
- Custo: similar ao GPT-4o
- Limitação: o adapter `claude_local` no Paperclip tem fricção conhecida (Opus 4.7 1M não reconhecido, warning de 8s no SessionStart:resume)
- Vantagem: paridade semântica com o canonical Claude Code

**Opção C: Codex CLI (gpt-5.5 ou equivalente) como modelo primário (ESCOLHIDA)**
- Otimizado para tasks de execução autônoma em terminal
- Custo: mais baixo que GPT-4o para tasks de código
- Disponibilidade: integrado ao harness nativo do Paperclip (adapter `codex_local`)
- Limitação: sem tool calling rico do Claude — compensado pelo protocolo de approval issues

**Opção D: Modelo híbrido (Codex para execução, Claude para review)**
- Maximiza qualidade de review com Claude e eficiência de execução com Codex
- Complexidade operacional: configurar dois adapters
- Custo: potencialmente mais alto

---

## Decisão

**Opção C — Codex CLI (gpt-5.5) como modelo primário para todos os 48 cargos.**

O fallback é Claude Sonnet 4.6 via `claude_local` para cargos que precisam de capacidade de reasoning mais sofisticada (ex: design-interrogator, plan-architect, adversarial reviewers).

Esta decisão foi tomada durante a sessão de 2026-05-24 e já está em vigor no ambiente Paperclip desta máquina — a ADR documenta retroativamente a decisão já operacional.

---

## Justificativa

1. **Integração nativa:** O Codex CLI é o adapter mais bem integrado com o harness do Paperclip nesta configuração. Menos fricção = menos bugs de integração.

2. **Custo:** Codex tem custo mais baixo para tasks de execução sequencial (bugfix, feature, audit). A diferença de custo entre Codex e Claude Sonnet é relevante quando multiplicada por 48 cargos × múltiplos workflows por semana.

3. **Adequação ao protocolo:** O protocolo de não-autonomia da Fase A (INVARIANTS block + approval issues) é projetado para modelos que seguem instruções, não para explorar capacidades específicas de Claude (como AskUserQuestion). Codex segue INVARIANTS blocks com fidelidade adequada.

4. **Paridade suficiente para Fase A:** O objetivo da Fase A é governance de processo (portões, approvals, audit trail), não raciocínio sofisticado. Codex é adequado para esse objetivo.

---

## Consequências

**Positivas:**
- Ambiente operacional mais estável (menos fricção de adapter)
- Custo operacional previsível
- Simplicidade: 1 modelo para todos os cargos (com fallback declarado)

**Negativas / riscos:**
- gpt-5.5 não é um modelo publicamente disponível — se a disponibilidade mudar, o fallback para Sonnet 4.6 precisa ser ativado para todos os cargos. Mitigação: o AGENTS.md de cada cargo deve declarar o modelo e o fallback explicitamente.
- Alguns cargos de review adversarial podem ter qualidade de análise inferior ao Claude Opus/Sonnet. Aceitável para Fase A — o protocolo de não-autonomia compensa com múltiplas camadas de review.

---

## Revisão

Esta ADR pode ser revisitada se: (a) gpt-5.5 ficar indisponível, (b) a qualidade de review adversarial com Codex provar ser insuficiente para atingir parity_score ≥ 0.95, ou (c) a Fase B for iniciada e o SDK plugin tiver requisitos de modelo diferentes.
