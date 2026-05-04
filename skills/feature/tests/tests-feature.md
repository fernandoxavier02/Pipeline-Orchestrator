# Diretrizes de testes para tradução de user story (Feature Skill)

> **Fonte:** Pulsar `TESTS_USER_STORY_HEAVY.md` + `TESTS_USER_STORY_LIGHT.md` (absorvidos como referência única). Cada seção marca quando aplica Heavy ou Light.

## Visão geral

Tradução técnica de user stories complexas exige decomposição estruturada, critérios de aceitação completos e testes que sirvam de base para TDD. Este doc apresenta boas práticas usadas pelos steps 03 (User Flow + UX), 04 (Domain Rules), 06 (Data Model + Persistence) e 10 (TDD Pre-Impl) da skill feature.

## Mode-aware sections

### 1. Diagnóstico da história

**Heavy:**
- Mapeamento do contexto: atores, sistemas externos, variáveis de contexto.
- Identificação de requisitos implícitos: políticas tácitas, restrições legais, limites de performance.
- Análise de impacto: regressão risk, refatoração needs.

**Light:**
- Diagnóstico mínimo: ator + sistema afetado + 1 contexto.
- Identificação de regras óbvias.
- Impacto local apenas.

### 2. Critérios de aceitação + matriz de cenários

**Heavy:**
- Decompor em sub-funcionalidades.
- Matriz de cenários: variações de entradas (válidas, inválidas, limites) × estados.
- Priorizar: obrigatórios na primeira entrega + avançados pra depois.

**Light:**
- 1-3 critérios principais.
- Matriz mínima: 1-2 cenários happy + 1 erro.

### 3. Especificação técnica focada em testes

**Heavy:**
- Contratos formais: OpenAPI, GraphQL com exemplos req/res/erro.
- Modelagem de dados: schemas + validações + constraints + relacionamentos.
- Critérios não-funcionais: performance, segurança, conformidade, usabilidade.

**Light:**
- Contratos básicos sem formalização.
- Schema simples se houver persistência.
- Foco em sucesso happy path.

### 4. Planejamento de testes automatizados

**Heavy:**
- BDD scenarios em Gherkin para cada linha da matriz.
- Fixtures versionadas para cenários complexos.
- Níveis: unit + integration + contract + E2E + property-based.

**Light:**
- 1 main + 1 regression + 1 edge case (cap §10.1 do consolidated).
- Fixtures inline.
- Níveis: unit + 1 integration.

### 5. Validação + refinamento

**Heavy:**
- Reuniões de refinamento com PO/stakeholders.
- Cross-review por arquiteto.
- Traçado de dependências completo.

**Light:**
- Auto-validação rápida.
- Sem cross-review formal.
- Dependências mapeadas inline.

### 6. Artefatos de apoio

**Heavy:**
- Specs versionadas em `specs/<feature>.md`.
- Backlog de tasks técnicas.
- Plano de testes executivo.

**Light:**
- Specs inline no PR.
- Tasks no commit message.

## Resultado esperado

Independente do mode:
- Decomposição da história em sub-features + critérios.
- Especificações técnicas (contratos, modelos, restrições).
- Conjunto de testes BDD/pseudo-código para automação.
- Backlog organizado focado em TDD.
