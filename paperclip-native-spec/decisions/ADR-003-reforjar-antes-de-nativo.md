# ADR-003 — Reforjar o Existente Antes de Construir do Zero (Fase A antes de Fase B)

**Data:** 2026-05-24
**Status:** ACCEPTED
**Decidido por:** Fernando Costa Xavier
**Contexto da sessão:** Sessão de 2026-05-24 — decisão estratégica de sequenciamento

---

## Contexto

Dado que a fusão dos dois projetos foi decidida (ADR-001), a questão sequencial é: qual fase executar primeiro — reforjar o existente (Fase A) ou construir o plugin nativo do zero (Fase B)?

Esta não é uma decisão óbvia. A Fase B já tem design v0.2 com 42 findings de adversarial review aplicados — é um investimento substancial. A Fase A é uma proposta nova, sem design prévio naquele contexto.

---

## Alternativas Consideradas

**Opção A: Fase B primeiro (construir plugin nativo)**
- Aproveita o momentum do design existente (B2-design.md v0.2)
- Timeline mais previsível para fidelidade plena (SDK garante enforcement de runtime)
- Risco: 18-20 semanas sem valor entregue no ambiente atual
- Risco: SDK `@paperclipai/plugin-sdk` pode ter limitações não descobertas até o Spike B1
- Custo de opportunity: ambiente atual continua sem governance por 4-9 meses

**Opção B: Fase A primeiro, depois Fase B (ESCOLHIDA)**
- Valor imediato: governance reforçada no ambiente existente em 1-6 semanas
- Valida premissas: descobre o que os primitivos nativos conseguem ANTES de decidir se Fase B vale
- Gate de decisão: se Fase A entregar parity ≥ 0.95, a Fase B pode não ser necessária
- Desvantagem: trabalho de Fase A pode ser "descartado" se Fase B substituir tudo

**Opção C: Paralelo — Fase A e Fase B simultâneas**
- Maximiza velocidade de entrega de ambas
- Risco: sobrecarga cognitiva — manter dois contextos simultâneos
- Risco: decisões de Fase A influenciarem Fase B de forma não declarada (coupling implícito)
- Solo developer: contexto paralelo não é viável na prática

---

## Decisão

**Opção B — Fase A primeiro, com gate de decisão explícito antes de commitar com Fase B.**

A Fase A tem prioridade porque:
1. Entrega valor mais rápido no ambiente atual
2. Valida premissas que a Fase B vai assumir
3. O gate de decisão A→B (semanas 6-8) garante que a Fase B só começa se houver justificativa real

---

## Justificativa

**Argumento central:** o custo de manter os 48 agentes sem governance por 4-9 meses (timeline da Fase B) é maior que o custo de construir a Fase A e depois substituir se necessário.

**Descoberta-chave desta sessão:** o Paperclip tem primitivos nativos mais poderosos do que a camada-shim atual explorou. O campo `executionState` JSON extensível, o primitivo `approval` com state machine nativo, e o activity log automático formam uma base suficiente para governance robusta sem precisar do SDK. A Fase A existe para explorar esses primitivos.

**Validação de premissas:** o B2-design.md (Fase B) foi escrito antes de descobrir a riqueza dos primitivos nativos do Paperclip. Algumas decisões de design do B2 (ex: usar o SDK para approval gates bloqueantes) podem ser simplificáveis pela Fase A. Executar Fase A primeiro permite revisar o B2 com aprendizados reais antes de implementá-lo.

**Iron Law da Fase A:** o reforjo é puramente aditivo — não há rollback necessário se a Fase B substituir. Os INVARIANTS blocks podem ser simplesmente removidos dos AGENTS.md quando a Fase B estiver operacional. Zero destruição.

---

## Consequências

**Positivas:**
- Governance imediata no ambiente existente (1-6 semanas vs 4-9 meses)
- Gate de decisão A→B cria checkpoint explícito de ROI da Fase B
- Aprendizados da Fase A informam e potencialmente simplificam o B2-design.md
- Se Fase A entrega parity ≥ 0.95, a Fase B pode ser postergada indefinidamente

**Negativas / riscos:**
- O trabalho de Fase A pode ser "descartado" quando a Fase B for implementada. Risco aceito — o valor da Fase A está na governance durante o período de espera, não na longevidade dos artefatos.
- A equipe (solo developer) pode ter menor motivação para o trabalho de Fase A (menos "glamouroso" que construir um plugin novo). Mitigação: o gate de decisão A→B é um motivador — se Fase A for boa, Fase B pode não ser necessária, economizando meses de trabalho.
- O B2-design.md pode precisar de revisão parcial após a Fase A revelar aprendizados. Custo: < 1 semana de revisão de design.

---

## Revisão

Esta ADR é revisitada automaticamente no gate de decisão A→B (semanas 6-8). Se o resultado do gate for NO-GO (Fase A suficiente), a ADR é confirmada. Se for GO, a ADR permanece como registro histórico da decisão de sequenciamento.
