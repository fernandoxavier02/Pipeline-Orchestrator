---
step_number: 11
step_name: "execution-minimal-diff"
source: "Pulsar/HEAVY_11_10_EXECUTION_MINIMAL_DIFF.md"
---

---
description: "Heavy 11: Execucao disciplinada (mudanca minima)"
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Feature Pipeline (Heavy) - Execucao disciplinada (mudanca minima / preservar estilo)

## ⛔ GATE: Não executar sem HEAVY_10 (TDD)

**Verificar antes de prosseguir:**
- [ ] Existe artefato de HEAVY_10 (testes criados)?
- [ ] Testes de feature FALHAM (RED) antes da implementação?

**Se não houver artefato de HEAVY_10 → PARAR e executar HEAVY_10_TEST_PRE_IMPL primeiro.**

---

## Quando usar
Use quando a feature/melhoria tem impacto relevante (dominio, dados, integracoes, multiplos fluxos, contratos, jobs, mobile),
ou quando voce quer maxima previsibilidade antes de implementar.

## Regras
- Nao implemente codigo nesta etapa.
- Nao proponha refatoracao ampla como pre-requisito.
- Declare "EVIDENCIA" (do repo) vs "ASSUNCAO" (inferida).
- Se faltar informacao, diga exatamente como confirmar.

## ⛔ REGRA DE NÃO-INVENÇÃO (OBRIGATÓRIA)

> **Referência:** `.claude/rules/41-no-invention.md`

**PARAR E PERGUNTAR** se faltar:
- Valores numéricos (timeout, retry, limites)
- Caminhos de dados (Firestore)
- Regras de cobrança/crédito
- Security rules

**NUNCA assumir valores "por padrão".**

---

## Prompt

Voce e meu arquiteto/engenheiro senior. Faca uma analise profunda focada em "Execucao disciplinada (mudanca minima / preservar estilo)", mantendo governanca e impacto minimo.

Contexto da feature:
- Objetivo de negocio: [ ]
- User story principal: [ ]
- Criterios de aceite (DoD): [3-8 itens]
- Escopo (entra): [ ]
- Fora de escopo: [ ]
- Restricoes: preservar arquitetura; preservar estilo/UI; mudancas minimas; evitar alteracoes desnecessarias.

Tarefas obrigatorias:
1) Analise "Execucao disciplinada (mudanca minima / preservar estilo)" em detalhe, apontando decisoes tecnicas e riscos.
2) Declare explicitamente se regras de negocio se aplicam; se sim, liste-as e marque ambiguidades.
3) Defina a fonte da verdade do estado envolvido (se houver) e como evitar estados divergentes (UI vs backend vs cache).
4) Avalie persistencia (se houver): entidades, chaves, invariantes, e risco de registros orfaos/incompletos.
5) Avalie execucao repetida: double click, retries, jobs duplicados. Se relevante, exija idempotencia.
6) Avalie multi-etapas: se falhar no meio, ha estado intermediario? Se relevante, exija atomicidade (transacao/flags/compensacao).
7) Entregue recomendacoes proporcionais ao risco (minimo necessario, sem overengineering).

Formato da resposta (obrigatorio):
- Resumo executivo
- Achados tecnicos (com EVIDENCIA vs ASSUNCAO)
- Dominio/fonte da verdade/persistencia (se aplicavel)
- Idempotencia/atomicidade/concorrencia (se aplicavel)
- Perguntas minimas para fechar lacunas
- Proximo passo recomendado

---

**Próximo step:** 12
