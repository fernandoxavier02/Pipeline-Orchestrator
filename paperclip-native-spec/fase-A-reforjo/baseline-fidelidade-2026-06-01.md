# Baseline de Fidelidade — medido 2026-06-01

Gerado por `references/paperclip/spec/lib/measure-fidelity.cjs` (read-only) sobre a empresa Pipeline Orchestrator (`019c6f31`), 54 execuções, com agregação por árvore (raiz que declara complexidade + descendentes via parentId) e dicionário refinado (21 blocos mapeados).

---

## Relatório gerado (pós-refino do dicionário)

```
Nota média: 0.19 (sobre 8 execuções; 0 indeterminadas; 15 órfãs)

Portões mais ausentes (onde a fidelidade vaza):
  SEMPRE ausentes (8/8): INFO_GATE_BLOCKED, CHECKPOINT_FAIL, PLAN_REJECTED,
    MICRO_GATE_GAP, ADVERSARIAL_BLOCK, STOP_RULE, STATE_FILE_INIT_FAIL,
    FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED, ADVERSARIAL_GATE_MANDATORY, SSOT_CONFLICT
  Parciais: FINAL_ADVERSARIAL_GATE (falta em 7), CLOSEOUT_CONFIRM (5), ADVERSARIAL_GATE (3), TDD_APPROVAL (1)

Por execução (8 árvores COMPLEXA, fatias S0–S7 do CyberVibeGuard):
  PIP-2: 0.19  PIP-3: 0.25  PIP-4: 0.19  PIP-5: 0.19  PIP-6: 0.13  PIP-7: 0.19  PIP-8: 0.19  PIP-9: 0.06
```

---

## Análise

**Nota medida ≈ 0.19** nas 8 execuções avaliáveis — contra a estimativa de ~0.70 da spec (A4 §3). A fidelidade efetiva dos agentes ao pipeline canônico é **baixa**, e pior que a estimativa.

**8 avaliáveis + 31 descendentes (agregados) + 15 órfãs = 54.** As 8 árvores avaliáveis são as fatias S0–S7 do CyberVibeGuard (PIP-2..9), únicas que declaram complexidade via `### ORCHESTRATOR_DECISION` com `complexity:`. As 15 órfãs são o pipeline do chat de pré-venda (PIP-41..54) + as raízes-de-feature PIP-1 e PIP-41.

**Causa das órfãs (verificada):** PIP-1 e PIP-41 NÃO têm bloco `ORCHESTRATOR_DECISION` nem a palavra `complexity` em nenhum comentário — em nó algum da árvore do chat há declaração de complexidade. É **gap de formato genuíno**: execuções diferentes foram conduzidas em formatos diferentes (o CyberVibeGuard declara complexidade por fatia; o chat nunca declara). Exatamente o que a padronização dos blocos (Peças 2-3 do A5) elimina.

**Achado importante:** os blocos de portão mais ricos descobertos no inventário (REGRESSION_RESULT→CHECKPOINT_FAIL, FIX_*→ADVERSARIAL_BLOCK, ADVERSARIAL_FINAL_VERDICT, *_FINDINGS) concentram-se nas execuções do chat — que são órfãs. Indício de que o pipeline do chat tem MAIS atividade de portão que as fatias do CyberVibeGuard, mas é **não-mensurável** por falta de declaração de complexidade. A nota 0.19 das fatias pode não representar o melhor caso real.

**Portões que seguem SEM bloco-fonte (gap real — agentes não emitem nenhum sinal):** INFO_GATE_BLOCKED, PLAN_REJECTED, MICRO_GATE_GAP, STOP_RULE, STATE_FILE_INIT_FAIL, FINAL_ADVERSARIAL_REWORK, FIX_LOOP_EXHAUSTED, ADVERSARIAL_GATE_MANDATORY, SSOT_CONFLICT — os de ENTRADA, CIRCUIT-BREAKER e adversarial-mandatório. Alinhado com `approvals=0` (A0 §2).

## Refino do dicionário aplicado

Inventário real revelou 30 tipos de bloco (antes só 7 mapeados). Dicionário expandido para 21 mapeamentos; 10 blocos informacionais (despacho, recuperação, fallback) deixados fora por design e travados por teste. Efeito nas 8 avaliáveis foi pequeno (0.17→0.19) porque os blocos novos estão nas órfãs.

## Revisão adversarial final (PASS com ressalvas)

A nota 0.19 é **defensável como PISO de decisão**. As inferências frouxas (TRIAGE_RESULT→COMPLEXITY_GATE, FIX_*→ADVERSARIAL_BLOCK) tendem a INFLAR levemente — sem elas a nota seria ainda menor, o que reforça a conclusão. Nenhum finding CRITICAL/HIGH. Ressalvas a comunicar:
- **Teto realista ≈ 0.5, não 1.0:** vários portões (info-gate, plan, micro-gate, stop-rule, state-file-init, adversarial-mandatory, etc.) não têm bloco-fonte; mesmo uma execução exemplar com os blocos atuais não passa de ~0.5. Ler 0.19 como "0.19 de um teto observável de ~0.5".
- TRIAGE_RESULT→COMPLEXITY_GATE e FIX_*→ADVERSARIAL_BLOCK são inferências de 2ª ordem (suposição: fix implica bloqueio prévio). Mantidas pois o inventário real as confirma; documentar.
- `parentId` da API é confiado sem validação de consistência (ponto cego de baixo risco).
- Follow-up opcional (eleva confiabilidade, não muda cálculo): expor o teto no relatório; documentar as inferências de 2ª ordem; avisar em parentId inválido.

## Veredicto

Método validado (árvore + dicionário refinado), nota defensável (revisão adversarial final PASS). **Gap duplo confirmado quantitativamente:** (1) fidelidade baixa (~0.19) onde mensurável — faltam os portões de entrada, aprovação e circuit-breaker; (2) formato inconsistente tão severo que impede medir parte das execuções (15 órfãs). A padronização dos blocos (Peças 2-3) ataca os dois: dá formato único (elimina órfãs) e introduz os portões hoje ausentes. Refino futuro opcional: inferir complexidade para árvores órfãs com atividade de pipeline, para medir o chat.
