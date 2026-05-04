---
step_number: 2
step_name: "terrain-recon"
execution_mode: inline
agent_type: ""
expected_inputs:
  - intent_doc: from_step_1
expected_outputs:
  - extension_points_map: { modules: [...], entry_points: [...] }
  - existing_patterns_to_follow: [...]
  - related_flows_summary: prosa curta
expected_next: 3
gate_required: false
allowed_tools: [Read, Grep, Glob]
---

# Step 02 — Terrain Recon

> **Posição no Pipeline:** Passo 2 — Após intent definido. Mapeia o terreno antes de tocar em qualquer arquivo.
> **Objetivo:** Identificar arquitetura em alto nível, módulos relevantes, padrões existentes e pontos prováveis de extensão.

## Heavy mode prompt

Você é meu arquiteto/engenheiro sênior. Faça uma análise profunda focada em "Reconhecimento do terreno do projeto", mantendo governança e impacto mínimo.

**Contexto da feature (do Step 01):**
- Intent doc: [carregado de `intent_doc`]
- Escopo (entra) e fora de escopo
- Restrições: preservar arquitetura; preservar estilo/UI; mudanças mínimas; evitar alterações desnecessárias.

**Tarefas obrigatórias:**
1. Mapear arquitetura em alto nível: camadas (UI, app, domain, infra), módulos relevantes para a feature.
2. Identificar pontos de extensão prováveis: onde a nova feature provavelmente "se encaixa" sem refatorar.
3. Listar padrões existentes a seguir: convenções de nomenclatura, error handling, logging, dependency injection.
4. Mapear fluxos relacionados que podem ser tocados (mesmo que indiretamente).
5. Avaliar se persistência/domain/SSOT/idempotência/atomicidade se aplicam — confirmar ou refutar conclusões do Step 01.
6. Entregar recomendações proporcionais ao risco (mínimo necessário, sem overengineering).

**Regras:**
- Não implemente código nesta etapa.
- Não proponha refatoração ampla como pré-requisito.
- Declare "EVIDÊNCIA" (do repo) vs "ASSUNÇÃO" (inferida).
- Se faltar informação, diga exatamente como confirmar.

**Formato da resposta (obrigatório):**
- Resumo executivo
- Mapa de extension points (com EVIDÊNCIA vs ASSUNÇÃO)
- Padrões existentes a seguir
- Fluxos relacionados (potencialmente tocados)
- Domínio/fonte da verdade/persistência (confirmar/refutar Step 01)
- Perguntas mínimas para fechar lacunas
- Próximo passo recomendado

## Light mode prompt

**Contexto da feature (do Step 01):**
- Intent doc: [carregado]
- Onde imagino que entra: [tela/rota/service/job]
- Restrições: mudanças mínimas; preservar padrões; evitar refatoração ampla; manter estilo/UI.

**Tarefa:**
1. Análise objetiva do terreno: módulo/serviço afetado + 1-2 padrões existentes a seguir.
2. Identificar 1-3 pontos de extensão.
3. Confirmar ou refutar aplicabilidade de domínio/dados/repetição (do Step 01).
4. Próximo passo mais eficiente para reduzir incerteza.

**Sinal de migração para Heavy:** se aparecer impacto multi-módulo, refatoração necessária, ou múltiplos fluxos tocados, sinalize migrar.

**Formato:**
- Achados principais
- Pontos de extensão (1-3)
- Aplica / Não aplica (confirmando Step 01)
- Próximo passo

## Expected outputs

Salvar em `PIPELINE_DOC_PATH/02-feature-terrain-recon.md` com:

- `extension_points_map`: lista de módulos/arquivos candidatos
- `existing_patterns_to_follow`: lista curta
- `related_flows_summary`: prosa de 2-5 linhas
- `next_step_recommendation`: ir para Step 03 (User Flow + UX gate)

**Próximo:** Step 03 — User Flow + UX (GATE: acceptance-matrix-approval).
