# ADR-004 — Knowledge Graph do PARA Memory Deferred pra Fase B

**Status:** ACCEPTED
**Data:** 2026-05-24
**Decisores:** Spec authors (esta sessão); Board aprova ao aceitar Spec Paperclip Fase A v1.1
**Resolve:** Inconsistência I5 documentada em A2-design.md §9

---

## Contexto

A KB canônica do Paperclip (`references/paperclip/paperclip-kb.md` §5) descreve PARA memory system com três camadas:

1. **Daily notes** — `$AGENT_HOME/memory/daily-notes/YYYY-MM-DD.md` (append-only por heartbeat)
2. **Knowledge graph estruturado** — `$AGENT_HOME/memory/knowledge-graph.jsonl` (entries tipadas com relacionamentos)
3. **Tacit memory** — embeddings + recall via `qmd` tools

A Fase A reforjo do Paperclip (atual Spec) usa daily notes (já existem em todos os cargos) e qmd recall (skill `para-memory-files` já carregada). Mas o **knowledge graph estruturado** não está sendo usado por nenhum cargo na configuração atual da empresa "FX Studio AI" — está vazio.

A inconsistência I5 da auditoria KB+skills perguntou: a Fase A deve adotar o knowledge graph estruturado ou deixar pra Fase B?

## Decisão

**Knowledge graph estruturado fica DEFERRED pra Fase B.** A Fase A NÃO modifica nem adota `knowledge-graph.jsonl` em nenhum dos 48 cargos.

## Alternativas consideradas

### Opção A — Adotar KG estruturado na Fase A
- **Pros:** Aproveita capacidade nativa do Paperclip; permite queries semânticas mais ricas que daily notes; cargos podem rastrear relacionamentos (ex: "esta issue resolveu aquela", "este finding originou aquela mitigação")
- **Cons:** Requer definir schema do KG (entities, relations, properties); requer ferramentas de query além do qmd básico; cargos precisam aprender a popular KG durante heartbeat (passo 8); risco de inconsistência entre daily notes e KG se ambos forem mantidos
- **Escopo adicional:** ~3-5 documentos novos (schema KG, instruções de povoamento, queries esperadas), ~200 LOC de tooling em Onda A2/A3

### Opção B — Deferir pra Fase B (ESCOLHIDA)
- **Pros:** Mantém Fase A doc-only conforme HC1; daily notes + qmd recall já cobrem 80% dos casos de uso de memória; Fase B (plugin nativo via SDK oficial) pode desenhar KG idiomaticamente sem amarras da Fase A; evita risco de double-source-of-truth (daily notes + KG)
- **Cons:** Cargos da Fase A não têm visão estruturada de relacionamentos entre issues/findings; queries cross-cargo ficam limitadas ao que qmd consegue extrair de daily notes
- **Mitigação:** Daily notes seguem template padronizado em Onda A3 com seções consistentes (## Plan, ## Done, ## Findings, ## Decisions) que qmd indexa eficientemente — cobre 80% do valor do KG sem custo adicional

### Opção C — Adotar KG mínimo apenas em cargos críticos
- **Pros:** Custo intermediário; permite validar conceito em escopo controlado
- **Cons:** Cria assimetria entre cargos; complicado pro sentinel-agent monitorar quem deve ter KG vs quem não; risco de skew se subset cresce

## Consequências

### Imediatas
- Onda A1 (esta) NÃO adiciona schema KG nem documentos relacionados — confirmado
- Onda A2 PoC NÃO inclui KG nos cargos piloto — confirma decisão
- Onda A3 rollout NÃO modifica memory structure dos 48 cargos — apenas adiciona INVARIANTS blocks + adapterConfig timeouts (T-A3-00)
- Daily notes pattern padronizado em Onda A3 (template `~/.paperclip/instances/default/templates/daily-note.md`) — cobre 80% do valor de KG

### Pra Fase B
- Plugin nativo (B-spec) pode desenhar KG schema do zero usando SDK oficial
- KG vira feature de "tier superior" — vendido como diferencial do plugin nativo
- Migração de daily notes → KG fica como utility opcional em Fase B (não bloqueia adoção)
- Schema KG (quando definido em Fase B) pode importar entities históricas das daily notes via parser

### Reversão (se necessário)
- Decisão pode ser reverida em ADR-005 futura se PoC da Onda A2 mostrar que daily notes + qmd não cobrem caso de uso crítico
- Reversão exige bump pra v2.0 da Spec Paperclip Fase A (breaking change conforme Princípio 5 do PRINCIPIOS-COMUNS.md)

## Referências

- A2-design.md §3.4 (PARA Memory documentation)
- A2-design.md §9 (Inconsistência I5 original)
- paperclip-kb.md §5 (PARA System spec canônica)
- skill `para-memory-files` (qmd query/search/vsearch tools)
- B2-design.md (Fase B nativo — KG seria proposto lá)
