---
description: "Self-improvement loop. After a pipeline run, reviews how faithfully it executed step-by-step (from the deterministic e2e-eval), then for each execution glitch PROPOSES a fix — nothing is applied without your approval (approve → fix, reject → record). Accumulates a cross-run evaluation dataset to improve the agents and the plugin over time. The Stop hook auto-invokes this when a run closes with glitches; you can also run it manually for the latest run."
allowed-tools: Task, Read, Grep, Glob, Edit, Write, Bash, AskUserQuestion
---

**INSTRUÇÃO PARA O ASSISTENTE — LEIA E OBEDEÇA.** Você (o agente PAI) está conduzindo o
loop de auto-melhoria de um run do pipeline. Você é quem fala com o usuário (o subagente de
diagnóstico NÃO pode perguntar — "Achado #7"). Siga os passos abaixo na ordem. **Você NUNCA
altera nada sem aprovação explícita do usuário.** Aprovou → conserta; não aprovou → só registra.

# Self-Eval — loop de auto-melhoria do pipeline

## O que é

Todo run do pipeline já é pontuado passo a passo por um motor determinístico (sem IA) assim que
fecha: ele compara o que o run *deveria* fazer contra o que *fez*, gera uma nota de 0 a 100
(maior = melhor) e lista cada falha ("glitch") em `e2e-eval.json`. Este comando é a metade com
IA: ele lê essas falhas, descobre a causa, e **propõe** os consertos do próprio plugin — sob a
sua aprovação. Cada decisão vira linha num histórico (`improvement-proposals.jsonl`) e a nota do
run alimenta o dataset acumulado (`eval-log.jsonl`).

Importante: o run que terminou é history imutável — a nota dele não muda. Os consertos melhoram
os **próximos** runs. O "loop até zerar" é sobre tratar a lista de falhas (cada uma vira
aprovada-e-aplicada, rejeitada-e-registrada, ou adiada-após-teto), não re-pontuar o passado.

## STEP 0 — localizar o run e ler as falhas

1. Descubra o run: leia `.pipeline/active-run.json` (campo `pipeline_doc_path`) ou use o
   `PIPELINE_DOC_PATH`. Se um run específico foi passado como argumento, use-o.
2. Leia `{pipeline_doc_path}/e2e-eval.json`. Se o arquivo não existir, rode o motor uma vez:
   `node lib/e2e-evaluator.cjs` não tem CLI — em vez disso apenas reporte que não há avaliação e
   pare (o hook de fechamento é quem gera o arquivo; sem ele, não há o que revisar).
3. Se `glitch_count == 0`: a execução foi limpa. Diga isso ao usuário em uma linha, rode
   `node scripts/e2e-eval-complete.cjs` para fechar o loop, e ENCERRE.

## STEP 1 — diagnosticar (só-leitura, propor sem aplicar)

Para cada glitch em `e2e-eval.json`, descubra a causa e rascunhe uma proposta. Investigue com
Read/Grep/Glob a superfície implicada (a tabela abaixo diz onde olhar por tipo de glitch). NÃO
edite nada nesta etapa — só leia e proponha. Vale **Não-Invenção**: todo conserto aponta um
arquivo real com símbolo/linha; sem evidência da causa, marque `needs-investigation` em vez de
inventar.

| kind | significado | onde olhar |
|------|-------------|-----------|
| `missing_step` | um passo de agente esperado nunca foi carimbado | o controller que deveria despachar o agente daquele passo; o dispatch gate; a `sequence` da SKILL.md |
| `missing_gate` | um portão obrigatório nunca disparou | o agente/hook que deveria emitir o portão; `references/gates.md`; o gate writer |
| `out_of_order` | passos carimbados fora da ordem do manifesto | `lib/step-ledger.cjs` (AGENT_STEP_MAP); a ordenação de fases do controller |
| `hygiene_violation` | um evento de auditoria em `protocol-events.jsonl` (ex.: bypass) | o hook de enforcement que emitiu; o agente que furou |

Para cada glitch, rascunhe: **root_cause** (1 frase, com `file:line`), **fix** (`{arquivo, mudança}`
como diff esquemático), **how_to_avoid** (a regra que evita reincidência), e **risk** (`low` /
`enforcement` / `never-auto` / `needs-investigation` — ver STEP 2).

**Fan-out opcional:** se o run tiver MUITAS falhas (digamos, mais de 6) e você quiser manter o
contexto limpo, despache agentes genéricos read-only em paralelo, um por glitch, e consolide as
propostas — `Agent(subagent_type: "general-purpose", prompt: "<o glitch + a tabela acima + peça root_cause/fix/how_to_avoid/risk; só leia, não edite>")`.
Isso é opcional; para poucas falhas, faça inline.

## STEP 2 — loop de aprovação (uma decisão por glitch, via AskUserQuestion)

Para CADA proposta, apresente ao usuário com **AskUserQuestion** (nunca prosa "responda
sim/não"). Mostre, em linguagem simples: qual a falha, a causa provável, o conserto proposto, e o
risco. Opções:

- **Aprovar e consertar (Recomendado quando risco baixo)** — aplicar o conserto agora.
- **Não aprovar — só registrar** — não mexe; grava a proposta com o motivo da recusa.
- **Adiar** — deixa pendente para depois.

### Ao APROVAR, classifique o risco do conserto (SSOT: `lib/contracts/e2e-eval.cjs`):

- **`risk: low`** (prosa de agente `.md`, docs): aplique inline com **diff mínimo**. ANTES de
  editar, salve uma cópia do arquivo no scratchpad (o ambiente não é repo git — não confie em
  `git checkout`). Depois rode a suíte: `node scripts/run-tests.cjs`. Se ficar **vermelha**,
  reverta só aquele arquivo a partir da cópia e marque a proposta como `needs-manual`. Se ficar
  **verde**, marque `approved-applied`. Teto de 3 tentativas por glitch; ao estourar, `needs-manual`.
- **`risk: enforcement`** (toca `.claude/hooks/`, `lib/`, `hooks.json`): **NÃO aplique inline.**
  Esses consertos mexem na própria fiscalização do pipeline e precisam de testes + revisão
  adversarial. Crie uma tarefa escopada e ofereça rodar `/pipeline-orchestrator:bugfix` sobre ela.
  Marque `approved-routed`.
- **`risk: never-auto`** (toca `references/gates.md` ou a chave de assinatura): **exige ação
  humana explícita.** Nunca aplique nem roteie automaticamente. Marque `needs-manual` e descreva
  o que o usuário precisa fazer à mão.
- **`risk: needs-investigation`**: a causa não foi confirmada. Marque `recorded` com a hipótese;
  não invente conserto.

### Ao NÃO APROVAR: marque `rejected-recorded` com o motivo do usuário.

Continue o loop até **toda** falha estar tratada (aplicada / registrada / roteada / adiada) ou
até bater o teto de iterações do backlog (3). Uma falha não pode ficar em aberto silenciosamente.

## STEP 3 — registrar e fechar

1. Anexe cada decisão (uma por glitch) em `.pipeline/improvement-proposals.jsonl` — um JSON por
   linha com: `run_id`, `glitch`, `status` (`approved-applied`/`approved-routed`/`rejected-recorded`/
   `needs-manual`/`recorded`/`deferred`), `risk`, `fix` (resumo), `reason` (se rejeitado), `ts`.
   Escreva também um resumo legível em `{pipeline_doc_path}/improvement-proposals.md`.
2. Feche o loop: `node scripts/e2e-eval-complete.cjs` (carimba o marcador assinado
   `e2e_eval_completed` no estado do run, para o hook de fechamento liberar a parada — sem isso o
   hook re-bloquearia, porque `e2e-eval.json` registra o passado e nunca "zera").
3. Dê ao usuário um veredito curto: nota do run, quantas falhas foram aprovadas/registradas/
   roteadas, e a tendência (compare com as últimas linhas de `.pipeline/eval-log.jsonl` se útil).

## Princípios (inquebráveis)

- **Nunca** aplica conserto sem aprovação. Sem exceção.
- **Nunca** edita inline `references/gates.md`, `hooks.json`, `.claude/hooks/`, `lib/` ou a chave
  HMAC — esses vão por pipeline (`enforcement`) ou exigem o humano (`never-auto`).
- **Diff mínimo** e **Não-Invenção**: só conserta o que tem causa com evidência; na dúvida, registra.
- Cada conserto aplicado é re-verificado rodando a suíte; vermelho → reverte + `needs-manual`.
