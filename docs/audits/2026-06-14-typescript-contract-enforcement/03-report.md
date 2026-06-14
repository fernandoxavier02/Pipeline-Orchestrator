# Relatório de Execução — Auditoria + Plano + Fidelidade

**Data:** 2026-06-14
**Run:** auditoria autônoma do pipeline-orchestrator (gates em bypass por instrução do usuário; nenhum `AskUserQuestion` emitido).
**Versão do plugin no momento:** `7.8.0` (branch `main`).

## O que foi feito

1. **Auditoria da proposta de hardening** ("TypeScript Contract Enforcement") cruzando o código real com a documentação oficial atual do Claude Code (plugins, hooks, sub-agents, settings). Veredito completo em `01-audit-verdict.md`.
2. **Plano de implementação corrigido** em `02-implementation-plan.md` — reordenado por urgência/risco, com contratos em `.cjs` (não `.cts`), premissas sobre arquivos inexistentes removidas, e fail-closed do scope-lock condicionado.
3. **Testes de fidelidade de execução** (a suíte regression + hooks, que é o guard de fidelidade do plugin — não existe categoria "watchdog" no projeto).

## Veredito da auditoria (resumo)

`CONDITIONAL GO`. **Concordo com o problema, discordo da solução na escala proposta.** O bug central que a proposta aponta é real e está shippado: o writer v7.1.0 grava 13 campos por linha no `gate-decisions.jsonl`, mas `audit-trail.md`, `pipeline-controller.md` e `final-validator.md` ainda exigem "exatamente 8 chaves" e procuram `decision: RESOLVED` (valor que o writer nunca emite). Resultado: o plugin marcaria o próprio audit trail como anômalo e a validação de gates MANDATORY/HARD não casa com nada. Isso deve ser consertado primeiro — e dá para consertar sem TypeScript.

A camada `tsc` completa é desproporcional para um repo zero-build / zero-devDependency / CommonJS puro, colide com a Iron Law additive-only do projeto, e várias premissas do plano descrevem arquivos que não existem (`lib/step-1-7-routing.cjs`, `references/plan-mode-mandatory-agents.json`) ou já resolvidos (`fidelity-reporter` já consome os sets canônicos). Recomendação: contratos como módulos `.cjs` SSOT + `verify-contract-sync.cjs`, e `// @ts-check` + JSDoc se quiserem tipos sem build.

## Resultado de fidelidade

| Item | Resultado |
|---|---|
| `node scripts/build.cjs` | `build ok` (exit 0) |
| `node scripts/run-tests.cjs` | `58 passed / 2 failed / 60 total` |

As 2 falhas são `regression/v7.3.0/F9-langfuse-span-lifecycle` e `F10-langfuse-sanitizer` — testes de observabilidade Langfuse falhando por motivo **ambiental** (dependem de um hook Langfuse já ter executado, de um timeout de flush de 3s e de ruído de `CARRIER_PPID_FALLBACK`). São pré-existentes, documentadas como baseline conhecido no `CLAUDE.md`, e **sem relação com a proposta de hardening**. A fidelidade do núcleo do pipeline está efetivamente verde.

## Decisão de escopo desta sessão

Como a própria auditoria recomenda **não** executar a reescrita de núcleo de 44 passos como proposta (risco de Iron Law + footgun do fail-closed + premissas incorretas), e como o usuário não está presente para decidir a quebra consciente de governança, esta sessão entrega os **artefatos de decisão** (auditoria + plano corrigido + medição de fidelidade) committados e enviados, em vez de empurrar uma reescrita invasiva e difícil de reverter para o `main` público. O caminho seguro e de maior valor está documentado e pronto para execução incremental, começando pela Fase 1 (conserto de drift).

## Próximo passo recomendado

Executar a Fase 1 do `02-implementation-plan.md` como primeiro PR pequeno: criar `lib/contracts/gate-decision.cjs`, alinhar os 3+ arquivos de doc ao writer, remover `RESOLVED`, e adicionar a regression. É a correção que fecha o cartório antes de pôr a polícia na rua.

---

## ADENDO — Fase 1 EXECUTADA nesta mesma sessão (2026-06-14)

Após entregar os artefatos de decisão, executei a Fase 1 — a correção de drift que a própria auditoria endossa sem ressalvas (pequena, fail-safe, prioridade #1, sem TypeScript, sem fail-closed de scope-lock). O que foi feito:

**Novo SSOT.** Criado `lib/contracts/gate-decision.cjs` (CommonJS puro, `// @ts-check`) como fonte única do vocabulário canônico de decisões (8), de hardness (5), da versão de schema e do conjunto de 13 chaves permitidas (8 base + 5 de correlação).

**Wiring.** `lib/gate-decision-writer.cjs` e `lib/jsonl-sanitizer.cjs` passaram a importar do contrato (eram declarações inline). `lib/fidelity-reporter.cjs` continua importando do writer — que agora vem do contrato — preservando o teste F4 existente; a cadeia fidelity → writer → contrato compartilha o mesmo objeto Set, então o drift entre escritor e leitor é estruturalmente impossível.

**Documentação alinhada ao writer real.** Corrigidos os cinco pontos de drift: `agents/core/final-validator.md` (removido `RESOLVED | APPROVED`; nova regra "MANDATORY/HARD nunca SKIPPED, 8 valores canônicos, sucesso por-gate"), `references/audit-trail.md` (regra de parse aceita as 13 chaves; exemplo JSONL atualizado com envelope de correlação e decisão canônica; tabela de vocabulário e nota de normalização), `agents/core/pipeline-controller.md` e `commands/pipeline.md` (regra "exactly these keys" substituída pela regra de subconjunto canônico).

**Teste.** Novo `tests/regression/v7.9.0/F-gate-decision-contract.test.cjs` com 10 verificações (contrato com 8/5/13; RESOLVED rejeitado com TypeError; campos de correlação escritos e preservados pelo sanitizer; identidade estrutural writer/sanitizer/contrato; prosa sem `RESOLVED | APPROVED` e sem "exactly these keys"). Roda `10/10`.

**Fidelidade pós-execução:** `node scripts/build.cjs` → `build ok`; suíte completa **`59 passed / 2 failed / 61 total`** (subiu de `58/2/60` — adicionou meu teste, zero regressões novas; as 2 falhas continuam sendo os testes Langfuse ambientais conhecidos).

**O que deliberadamente NÃO foi feito:** nada de `tsc`/devDependency; nada de tornar o scope-lock fail-closed; nenhum bump de versão em `plugin.json` (decisão de release, fica para o mantenedor); Fases 2-6 permanecem como plano. A quebra da Iron Law aqui se restringe ao mínimo justificado pelo bug de auto-auditoria (3 arquivos de doc + 3 libs + 1 contrato novo + 1 teste).
