# AGENT_NOTES — loop/next-action-contract

Notas operacionais entre voltas do loop. Lições, comandos que funcionam, pegadinhas.

## Volta 1 — 2026-07-08 — T1.1 (lib/next-action.cjs)

**Feito:** criado `lib/next-action.cjs` (SSOT puro) exportando `resolveNextAction({invariantId, ctx})`.
Confirmado por grep que `.claude/hooks/dispatch-guard.cjs` NÃO tem `module.exports` (comando
`grep -n "module\.exports\|exports\." .claude/hooks/dispatch-guard.cjs` → vazio) — logo, conforme
o item previa, dupliquei a tabela `AGENT_LEAF_TO_FQN` (47 agentes) como constante local, com
comentário apontando `dispatch-guard.cjs:47-107` como origem. `parent_action` resolve o FQN exato
via `lib/contracts/workflow-manifest.cjs::WORKFLOWS[workflowKey].agents_by_step[expectedStep]`
para workflows com espinha (`FULL`, `Spec.seal`); cai no fallback genérico
`pipeline-orchestrator:core:pipeline-controller` para workflows com `agents_by_step: null`
(DIAGNOSTIC/REVIEW-ONLY/HOTFIX/PAPERCLIP/brainstorm) ou workflow desconhecido/ausente.
`subagent_fallback_action` é SEMPRE preenchido (nunca tenta diferenciar parent de subagente —
proibição explícita do loop) e sempre cita o bloco `DISPATCH_REQUEST`.

**Evidência (comandos + saída resumida):**

```
node -e "require('./lib/next-action.cjs')"
→ saída vazia, exit 0 (smoke test do próprio item)

node tests/regression/v8.23.0/F1_next_action_ssot.cjs
→ Summary: 5 pass / 0 fail / 5 total

# RED->GREEN provado ao vivo: `mv lib/next-action.cjs lib/next-action.cjs.bak` + rodar o
# teste → MODULE_NOT_FOUND (exit 1, RED real, não vácuo) → `mv` de volta → GREEN de novo.

node scripts/run-tests.cjs
→ "Running 272 test suite(s)" (271 baseline + 1 novo arquivo)
→ Summary: 264 passed / 8 failed / 272 total
→ as 8 falhas são EXATAMENTE o baseline documentado no LOOP_PLAN.md:
  v7.3.0/F8,F9,F10 (langfuse), v7.6.0/F2 (score-writer), v8.21.0/F1,F2,F3 (RED
  congelados da spec S2), v8.8.0/F4 (dispatch-pending-gate). Zero falhas NOVAS.
```

**Auditoria extra (`docs/audits/2026-07-08-agent-lockup-audit/AUDIT-REPORT.md`):** é um
documento de referência (relatório de auditoria em markdown), não um script/hook executável —
confirmado por `grep -rl "2026-07-08-agent-lockup-audit" --include="*.cjs" --include="*.js" .`
(só retornou os 2 arquivos que eu mesmo criei, citando o relatório em comentário). Não existe
categoria "audit" em `scripts/run-tests.cjs` nem watchdog associado a esta auditoria específica.
Interpretação adotada: "precisa passar" = o conteúdo implementado tem que ser coerente com o que
o relatório descreve (P1, Next-Action Contract) — não há comando para "rodar" o documento em si.
Nenhuma contradição encontrada entre a implementação e o relatório.

**Pendência anotada (não é bloqueio deste item):** T1.2 pede que `lib/run-step-guard.cjs`
adicione a chave `corrective` usando `resolveNextAction`, com sub-chaves
`what_failed/fix_instruction/resume_instruction` — esse é um formato de objeto DIFERENTE do que
`resolveNextAction` retorna hoje (`{message, parent_action, subagent_fallback_action}`). A
próxima volta (T1.2) precisa decidir como mapear um formato no outro (ex.: `fix_instruction` ←
`parent_action`, `resume_instruction` derivado, `what_failed` ← `message`) — meramente uma nota
para não reinventar na hora, T1.1 não mexeu nisso (fora de escopo do item).

**Commit desta volta:** seletivo — `lib/next-action.cjs`,
`tests/regression/v8.23.0/F1_next_action_ssot.cjs`, `loops/next-action-contract/AGENT_NOTES.md`,
`loops/next-action-contract/LOOP_PLAN.md` (T1.1 marcado `[x]`). Não toquei
`PROMPT.md`/`RODAR.md`/`loop_spec.json` (pré-existentes, não fazem parte deste item).

## Intervenção do supervisor humano (fora de volta) — 2026-07-08

3 voltas seguidas tentando T1.2 foram desfeitas (VIOLACAO_DESFEITA) por deriva de conteúdo no
lid=2 — cada uma encontrou o MESMO achado de segurança real (charset de `sanitizeText` em
`lib/next-action.cjs` ainda permite aspas, abrindo brecha de manipulação de instrução via
`taskHint` em `buildPromptText`) e tentou anotar isso dentro do próprio texto de T1.2 em vez de
criar um item novo — violando a regra 8 (achado fora do item vira item novo, nunca edita o
item atual). Para destravar, o supervisor inseriu **T1.1b** como item novo (lid:12) ANTES de
T1.2, cobrindo exatamente esse achado, sem tocar no texto de T1.2 (lid:2, intocado desde a
autoria original). Próxima volta: pegue T1.1b primeiro (é o primeiro item aberto agora); se
encontrar QUALQUER outra coisa fora do escopo de T1.1b, crie um item novo na seção
"Descobertas do loop" — não edite o texto de T1.1b nem de T1.2.

