---
step_number: 11
step_name: "execution-minimal-diff"
source: "Pulsar/LIGHT_11_10_EXECUTION_MINIMAL_DIFF.md"
---

---
description: "Light 11: Execucao disciplinada (mudanca minima)"
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# Feature Pipeline (Light) - Execucao disciplinada (mudanca minima / preservar estilo)

## ⛔ GATE: Não executar sem LIGHT_10 (TDD)

**Verificar antes de prosseguir:**
- [ ] Existe artefato de LIGHT_10 (testes criados)?
- [ ] Testes de feature FALHAM (RED) antes da implementação?

**Se não houver artefato de LIGHT_10 → PARAR e executar LIGHT_10_TEST_PRE_IMPL primeiro.**

---

## Quando usar
Use quando a feature/melhoria e pequena a media, com risco controlado, e voce quer velocidade com disciplina.

## Regra
Nao implemente codigo nesta etapa (a menos que eu peça explicitamente). Se durante a analise surgirem persistencia sensivel,
regras de negocio complexas, integracao critica, concorrencia ou grande impacto em UX/contratos, sinalize e recomende migrar para o Heavy.

## ⛔ REGRA DE NÃO-INVENÇÃO (OBRIGATÓRIA)

> **Referência:** `.claude/rules/41-no-invention.md`

**PARAR e perguntar** se faltar informação sobre valores, caminhos ou regras de negócio.
**NUNCA assumir valores "por padrão"** - especialmente para cobrança, créditos, security rules.

---

## Prompt

Contexto da feature:
- Feature/melhoria: [descreva em 2-5 linhas]
- Valor para o usuario/negocio: [1-2 linhas]
- Onde imagino que entra: [tela/rota/service/job]
- Restricoes: mudancas minimas; preservar padroes; evitar refatoracao ampla; manter estilo/UI.

Tarefa:
1) Entregue uma analise objetiva para "Execucao disciplinada (mudanca minima / preservar estilo)".
2) Diga se itens como regras de negocio, fonte da verdade, persistencia, idempotencia e atomicidade se aplicam ou nao aqui, e por que.
3) Liste o proximo passo mais eficiente e barato para reduzir incerteza.

Formato da resposta:
- Achados principais
- Aplica / Nao aplica (dominio/dados/repeticao)
- Proximo passo recomendado

---

**Próximo step:** 12
