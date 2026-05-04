---
step_number: 11
step_name: "execution-minimal-diff"
execution_mode: subagent
agent_type: "feature-implementer"
expected_inputs:
  - implementation_plan: from_step_9
  - test_files: from_step_10
expected_outputs:
  - files_modified: [...]
  - files_created: [...]
  - green_status: bool
expected_next: 12
gate_required: false
allowed_tools: [Read, Grep, Glob, Edit, Write, Bash]
---

# Step 11 — Execution Minimal Diff (GREEN)

> **Posição no Pipeline:** Passo 11 — Implementação. SEM gate skill-level (executor-controller cobre via adversarial gate de Phase 2).
> **Objetivo:** Fazer os testes RED do Step 10 passarem com o menor diff possível, preservando arquitetura/estilo.

## ⛔ Pré-condições obrigatórias

- [ ] Step 10 concluído com testes RED criados e gate `tdd-tests-approval` aprovado.
- [ ] Testes de feature FALHAM antes de qualquer Edit (RED confirmado).
- [ ] `implementation_plan` (Step 09) carregado.

**Se algum item acima não for satisfeito → PARAR e voltar para o step pendente.**

## ⛔ Regra de Não-Invenção (obrigatória)

Referência: `~/.claude/rules` + `commands/pipeline.md` invariantes 3 e 4.

**PARAR E PERGUNTAR** se faltar:
- Valores numéricos (timeout, retry, limites, batch size)
- Caminhos de dados (paths, tabelas, coleções)
- Regras de cobrança/crédito ou políticas financeiras
- Security rules / permissões
- Strings de domínio (mensagens de erro user-facing, labels)

**NUNCA assumir valores "por padrão"** — sem evidência no repo ou direção do user, perguntar.

## Heavy mode prompt

Você é o agente `feature-implementer`. Implemente com mudança mínima e disciplinada para fazer todos os testes do Step 10 passarem (GREEN).

**Contexto:**
- `implementation_plan` (Step 09) — tasks ordenadas com DoD por task.
- `test_files` (Step 10) — lista de testes RED que devem passar e regression que continuam passando.
- `chosen_approach` (Step 07) — abordagem aprovada no gate architecture-choice.
- Restrições: preservar arquitetura; preservar estilo/UI; mudanças mínimas; evitar refatoração ampla.

**Tarefas obrigatórias (por task do plan):**
1. Implementar a task task-by-task na ordem do plan.
2. Após cada task, rodar suíte: feature tests devem caminhar de RED→GREEN; regression tests continuam passando.
3. Não introduzir abstração que não tenha consumidor imediato (YAGNI).
4. Não tocar arquivos fora do escopo da task — se descobrir necessidade, ABRIR no plan (não fazer silenciosamente).
5. Cada commit (lógico) corresponde a 1 task com DoD verde.
6. Documentar deltas inesperados (decisões tomadas durante exec) em commit message ou doc anexo.
7. Não implementar nada que não tenha teste correspondente — se faltar, voltar ao Step 10.

**Regras:**
- Declare "EVIDÊNCIA" (do plan/testes/repo) vs "ASSUNÇÃO".
- Quando ambíguo, perguntar (Não-Invenção acima).
- Sem refatoração ampla; melhorias estruturais grandes vão para parking lot.

**Formato da resposta:**
- Tabela `task_id | arquivos tocados | testes que passaram | observações`
- Status final: `green_status: true|false`
- Lista de deltas vs plan (se houver)
- Próximo passo (Step 12)

## Light mode prompt

**Contexto:**
- `implementation_plan` curto (Step 09) + `test_files` (Step 10).
- Restrições: mudanças mínimas; preservar UI/UX/estilo.

**Tarefa:**
1. Implementar 1 task por vez para fazer cada teste RED virar GREEN.
2. Não tocar fora do escopo — se descobrir necessidade, perguntar.
3. Não inventar valores (Não-Invenção acima).

**Sinal de migração para Heavy:** se aparecer refactor necessário, múltiplos arquivos cruzados, ou ambiguidade densa → migre.

**Formato:**
- Arquivos tocados (lista)
- Testes verdes (status)
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/11-feature-execution.md`:

- `files_modified`: lista
- `files_created`: lista
- `green_status`: bool
- `deltas_vs_plan`: prosa (se houver)

## Por que sem gate skill-level

Step 11 escreve código. Phase 2 do pipeline (`executor-controller`) já tem **adversarial gate** antes de qualquer Edit (per CRITICAL REMINDER #6 do `commands/pipeline.md`). Adicionar gate skill-level seria DOUBLE GATE — usuário aprovando 2x antes do mesmo Edit. Bugfix e Audit ports não fazem isso.

**Ver:** mapping spec §10 decisão 6 (MAJ 9 do adversarial review).

**Próximo:** Step 12 — Testing Validation.
