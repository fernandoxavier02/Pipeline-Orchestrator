# ADR-001 — Estratégia de Fusão: Unificar PIP + Spec Paperclip

**Data:** 2026-05-24
**Status:** ACCEPTED
**Decidido por:** Fernando Costa Xavier
**Contexto da sessão:** Sessão de 2026-05-24 — planejamento estratégico Paperclip

---

## Contexto

Dois esforços paralelos foram iniciados para fazer o Pipeline Orchestrator funcionar bem no Paperclip:

1. **PIP (paperclip-native-spec/)** — spec criada em 2026-05-23 para construir plugin novo do zero usando o SDK oficial `@paperclipai/plugin-sdk`. Três documentos prontos: `01-requirements.md` (v0.1), `02-design.md` (v0.2, pós-adversarial review de 20 findings), `03-tasks.md` (v0.2, pós-adversarial review de 22 findings). Estimativa: 18-20 semanas de desenvolvimento solo. Ainda não implementado em código.

2. **Spec Paperclip (planejada em 2026-05-24)** — proposta nascida em sessão de pesquisa profunda para reforjar o Paperclip que já existe nesta máquina (48 agentes em codex_local + gpt-5.5). Foco em gates explícitos + protocolo de não-autonomia + máxima paridade com Claude Code canônico. Estimativa: 1-6 semanas dependendo do escopo.

Ambos atacam o mesmo problema — falta de governance/enforcement no Paperclip — por caminhos diferentes e timelines diferentes.

---

## Alternativas Consideradas

**Opção A: Manter os dois projetos separados**
- Dois repositórios/pastas separados
- Roadmaps independentes
- Risco: duplicação de esforço, inconsistência de visão, competição por atenção

**Opção B: Substituir PIP pela Spec Paperclip (abandonar o plugin nativo)**
- Focar apenas no reforjo do existente
- Risco: perder o investimento do design v0.2 do PIP (adversarial review de 42 findings no total)
- Risco: limitar o teto de paridade ao que os primitivos nativos conseguem (sem SDK)

**Opção C: Unificar em programa sequencial sob umbrella compartilhado (ESCOLHIDA)**
- Fase A = Reforjo (1-6 semanas, curto prazo)
- Fase B = Plugin Nativo (4-6 meses, longo prazo)
- Pasta: `paperclip-native-spec/` (já existente, aproveita os 3 docs do PIP como fase B)
- Gate de decisão entre fases permite validar se Fase B é necessária antes de commitar o investimento

---

## Decisão

**Opção C — Unificação em programa sequencial com gate de decisão entre fases.**

A unificação acontece em `paperclip-native-spec/` com esta estrutura:
- Docs umbrella (`00-*.md`) compartilhados entre fases
- `fase-A-reforjo/` para o reforjo do existente (nova, criada nesta onda)
- `fase-B-nativo/` para o plugin SDK (= docs PIP existentes movidos e prefixados B1/B2/B3)
- `decisions/` para ADRs cross-fase (nova)

Os três documentos do PIP (`01-requirements.md`, `02-design.md`, `03-tasks.md`) são movidos para `fase-B-nativo/B1/B2/B3.md` sem modificação de conteúdo — preservando o trabalho de adversarial review já realizado.

---

## Justificativa

A fusão faz sentido estratégico por três razões:

1. **As duas fases convergem para o mesmo objetivo** (paridade plena com Claude Code canônico) por caminhos complementares. Não há contradição — são horizontes temporais diferentes.

2. **A Fase A valida premissas da Fase B.** O que os primitivos nativos conseguem (Fase A) determina o argumento real para construir o SDK (Fase B). Sem Fase A, a Fase B pode estar sobre-engineerada.

3. **O investimento da Fase B é preservado.** Os 3 documentos do PIP (com 42 findings de adversarial review aplicados) se tornam a base da Fase B — não são descartados nem reescritos. A fusão é aditiva.

---

## Consequências

**Positivas:**
- Uma única fonte de visão e princípios para ambas as fases (00-VISION, 00-PRINCIPIOS-COMUNS)
- Decision gate explícito entre fases (00-ROADMAP §Gate de Decisão A → B) — evita commitar 18-20 semanas de desenvolvimento se Fase A for suficiente
- Iron Law preservada: o plugin Claude Code canônico não é tocado em nenhuma das duas fases

**Negativas / riscos:**
- O B2-design.md (02-design.md original) foi escrito com premissa de "separação total" (HC1 original). A fusão cria uma relação entre fases que não estava no design original. Mitigação: B0-relationship-with-fase-A.md documenta explicitamente o que muda.
- Pasta `paperclip-native-spec/` é agora um umbrella para um programa de 4-9 meses, não um projeto de 18-20 semanas. O nome pode ser confuso. Mitigação: 00-VISION.md esclarece o escopo completo.

---

## Revisão

Esta ADR é considerada estável. Pode ser revisitada se: (a) o gate de decisão A→B resultar em NO-GO e a Fase B for abandonada (nesse caso, a fusão é retroativamente desnecessária mas inofensiva), ou (b) a Fase B for iniciada com premissas radicalmente diferentes do B2-design.md atual.
