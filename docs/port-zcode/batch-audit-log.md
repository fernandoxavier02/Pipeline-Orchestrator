# Trilha de Auditoria dos 5 Batches

> Registro linear da execução da auditoria do Pipeline Orchestrator para portabilidade Z-Code. Cada batch passou pelo ciclo RED (checklist TDD — Test-Driven Development, "desenvolvimento guiado por testes": critérios verificáveis escritos antes do conteúdo) → GREEN (escrita) → ADVERSARIAL (revisor zero-contexto) → FIX-LOOP até CLEAN. Este log é o "gate-decisions.jsonl" da própria documentação.

## Termos do domínio usados neste arquivo

Complementam o glossário do arquivo de visão geral.

- **TDD** (Test-Driven Development, "desenvolvimento guiado por testes") — escrever os critérios verificáveis antes do conteúdo; o conteúdo só está pronto quando todos os critérios passam.
- **ATDD** (Acceptance Test-Driven Development) — derivado dos critérios de aceite do usuário.
- **BDD** (Behavior-Driven Development) — cenários dado/quando/então.
- **DDD** (Domain-Driven Design) — Linguagem Ubíqua: um glossário fixo usado de forma idêntica em todos os documentos.
- **TTS** (Text-to-Speech, "conversão de texto em fala") — o painel que lê as respostas em voz alta; a regra mestra TTS proíbe paths e acrônimos não-expandidos na prosa narrativa, porque o TTS os lê letra por letra e quebra o fluxo.
- **SSOT** (Single Source of Truth, "fonte única de verdade") — arquivo que é a referência autoritativa para algum dado.
- **HMAC** (Hash-based Message Authentication Code) — assinatura criptográfica contra adulteração.
- **CRITICAL/HIGH/MEDIUM/LOW** — níveis de severidade dos achados do revisor adversarial, do mais grave ao menos grave.
- **CLEAN** — estado final sem achados CRITICAL ou HIGH em aberto.
- **FIX-LOOP** — loop de correção com cap de três tentativas por achado HIGH/CRITICAL.

---

## Resumo executivo

| Batch | Arquivos | Ciclos de fix | Estado final | Achados críticos resolvidos |
|---|---|---|---|---|
| 1 — Fundação | 00-overview + 05-lib-inventory | 2 | CLEAN | 4 CRITICAL + 6 HIGH por arquivo |
| 2 — Inventários estruturais | 01-hooks + 02-agents | 2 (01) / 3 (02) | CLEAN | 4 CRITICAL (01), 4 CRITICAL (02) |
| 3 — Workflows e gates | 03-workflows + 04-gates | 5 (03) / 3 (04) | CLEAN | Contagem de entry points, dureza AUDIT vs HARD |
| 4 — Plano de portabilidade | 06-portability-plan | 2 | CLEAN | 7 CRITICAL incluindo deps hard de Langfuse |
| 5 — Verificação cruzada | (todos os 7) | 3 | CLEAN | 2 CRITICAL + 2 HIGH cross-doc |
| **Total** | **7 + este log** | **15 ciclos** | **CLEAN** | **Todos resolvidos** |

---

## Decisões confirmadas com o dono do repositório (todas implementadas)

1. **Migrar três eventos não suportados** (`SessionEnd`, `StopFailure`, `SubagentStop`) para `Stop` e `PostToolUse` com matcher `Agent`. Refletida nos arquivos: 00 (decisões), 01 (inventário de hooks), 06 (Passo C).

2. **Manifesto dual**: manter `.claude-plugin/plugin.json` intacto e adicionar `.zcode-plugin/plugin.json` espelho (não idêntico — o Z-Code usa campos extras explícitos). Refletida nos arquivos: 00 (decisões), 06 (Passo D).

3. **Remover Paperclip**: dez comandos paperclip-* e o comando setup-paperclip saem do port (onze arquivos no total). Refletida nos arquivos: 00 (decisões), 06 (Passo B1).

4. **Remover Langfuse**: um hook (langfuse-hook) e duas libs (langfuse-client e langfuse-carrier) saem do port. A terceira lib (langfuse-sanitizer) permanece porque tem função genérica usada por outra lib (score-writer). Refletida nos arquivos: 00 (decisões), 01 (REMOVE), 05 (REMOVE), 06 (Passos B2 + B5).

---

## Detalhamento por batch

### Batch 1 — Fundação (2 arquivos + glossário DDD)

**Arquivos**: `00-overview.md` (com glossário ubiquoso) e `05-lib-inventory.md`.

**Ciclo 1 — ADVERSARIAL**: 2 revisores em paralelo acharam:
- Em 00: 4 CRITICAL (contagem de paperclip 8 vs 10, Langfuse sizing 3 hooks/2 libs errado, fase inventada, fase contador interno) + 6 HIGH (acrônimos VPS/SSH/DDD/BDD sem expansão, paths na prosa, erro no trio adversarial).
- Em 05: 3 CRITICAL (lib inventada skill-frontmatter-parser, contagem KEEP errada, justificativa do sanitizer errada).

**Ciclo 1 — FIX**: Reescrevi as seções problemáticas com números verificados diretamente do canônico (`ls`, `grep`, contagem manual).

**Ciclo 2 — ADVERSARIAL**: ambos voltaram CLEAN. Um MEDIUM residual (palavra "challengeda" mal-formada) e um LOW (escopo do setup-paperclip implícito) foram corrigidos.

**Estado final**: CLEAN após 2 ciclos.

### Batch 2 — Inventários estruturais (2 arquivos)

**Arquivos**: `01-hooks-inventory.md` e `02-agents-inventory.md`.

**Ciclo 1 — ADVERSARIAL**: 2 revisores acharam:
- Em 01: 4 CRITICAL (contagem de hooks 37 vs 36 — skill-frontmatter-parser é lib não hook; PreToolUse count errado 17 vs 18; PostToolUse 6 vs 7; descrição do stop-hook errada).
- Em 02: 4 CRITICAL (N1=7 vs 6; opus=12 vs 14; sonnet=31 vs 33; sem-AskUserQuestion=38 vs 44).

**Ciclo 1 — FIX**: Recontagem direta via bash. Adicionei seção "Termos do domínio" em 01 (arm, ledger, dispatch, run-id, HMAC, matcher, manifesto). Em 02 corrigi o Resumo inteiro.

**Ciclo 2 — ADVERSARIAL**: 01 voltou CLEAN. 02 ainda tinha 1 CRITICAL (split N2 24/20 não batia com body 19/25) + 1 HIGH (SSOT sem expansão).

**Ciclo 2 — FIX em 02**: Mergi N2 numa única linha de quarenta e quatro (a split semântica não é estritamente derivável das ferramentas). Expandi SSOT.

**Ciclo 3 — ADVERSARIAL em 02**: CLEAN.

**Estado final**: CLEAN após 2 ciclos (01) / 3 ciclos (02).

### Batch 3 — Workflows e gates (2 arquivos)

**Arquivos**: `03-workflows-and-stages.md` (com cenários BDD) e `04-gates-and-enforcements.md`.

**Ciclo 1 — ADVERSARIAL**: 2 revisores acharam:
- Em 03: 1 CRITICAL (audit-heavy conflated com sub-route adversarial) + 3 HIGH (paths na prosa, PII sem expansão, --no-plan vs --no-prep).
- Em 04: 12 CRITICAL (gate count errado, IDEATION_SKIPPED colapsado, dureza HARD/SOFT errada para 8 gates spec-v8 que são AUDIT, category counts errados).

**Ciclo 1 — FIX**: Reescrevi a seção spec-authoring de 04 inteira com durezas AUDIT corretas (verificadas via grep no gates.md). Em 03 separei o sub-route adversarial do audit-heavy real.

**Ciclo 2 — ADVERSARIAL**: 04 voltou CLEAN. 03 ainda tinha 1 HIGH (audit-heavy MEDIA/COMPLEXA contradizia matrix) + 2 MEDIUM.

**Ciclo 2 — FIX em 03**: audit-heavy agora é COMPLEXA. Adicionei nota sobre atalho em Feature/Refactor/User Story.

**Ciclo 3 — ADVERSARIAL em 03**: Descobriu o count total de entry points estava errado (eu tinha 23, canônico tem 24). Audit tem 3 entry points (não 2), Spec tem 4 (não 3).

**Ciclo 3 — FIX**: Reescrevi contagem: 7 tipos × 3 entry points = 21 + spec-audit-only (4º do spec) + review + pipeline = 24.

**Ciclo 4 e 5 — ADVERSARIAL em 03**: Ajustes finais de header de Audit e Spec. CLEAN.

**Estado final**: CLEAN após 5 ciclos (03) / 3 ciclos (04).

### Batch 4 — Plano de portabilidade (1 arquivo)

**Arquivo**: `06-portability-plan.md`.

**Ciclo 1 — ADVERSARIAL**: 1 revisor rigoroso achou 7 CRITICAL + 3 HIGH:
- C1: `cp -R src/*` não copia dotfiles (`.claude/hooks/` ficaria de fora).
- C2 (o mais técnico): `langfuse-carrier.cjs` é hard-required (top-level, sem guarda) por `gate-decision-writer.cjs` linha 43 e `stop-hook.cjs` linha 45. Remover o carrier quebraria o carregamento desses dois arquivos mantidos.
- C3: LANGFUSE env vars estão no README.md, não no CLAUDE.md.
- C4: path do gate-decisions.jsonl está sob `.pipeline/docs/...`, não `.pipeline/` root.
- C5: bloco estrutural com contagem de hooks contraditória (32 vs 35).
- C6: "1 setup não-hook" fabricado.
- C7: manifesto espelho NÃO é idêntico (Z-Code usa campos extras).

**Ciclo 1 — FIX**: Reescrevi Passo A (usar `cp -a <src>/. <dst>/`), adicionei Passo B5 inteiro com instruções para fazer try-catch fail-open nos requires hard, corrigi paths, corrigi contagens, corrigi claim de "manifesto idêntico".

**Ciclo 2 — ADVERSARIAL**: CLEAN.

**Estado final**: CLEAN após 2 ciclos.

### Batch 5 — Verificação cruzada (todos os 7 documentos)

**Escopo**: auditoria holística da consistência entre os 7 documentos.

**Ciclo 1 — ADVERSARIAL**: 1 revisor cross-doc achou:
- 2 CRITICAL cross-doc (count de hooks 37 em 00 vs 36 em 01/06; Langfuse "3 libs" em 00 vs "2 removidas + sanitizer mantida" em 05/06).
- 2 HIGH cross-doc (01 referenciava "Passo E2" inexistente; 06 chamava task-orchestrator de N1, mas 02 diz N2).
- 5 MEDIUM (acrônimos YAML/W3C/HTTP/CommonJS sem expansão; paths na prosa do 06).

**Ciclo 1 — FIX**: Corrigi contagem em 00, corrigi Langfuse libs count em 00, mudei Passo E2→F6 em 01, mudei N1→N2 em 06 task-orchestrator, expandi todos os acrônimos, reescrevi paths na prosa.

**Ciclo 2 — ADVERSARIAL**: 2 MEDIUM residuais (1 instância residual "trinta e sete hooks" em 00:127, e "Passo F2" em 06:209 deveria ser F6).

**Ciclo 2 — FIX**: aplicados.

**Ciclo 3 — ADVERSARIAL**: CLEAN.

**Estado final**: CLEAN após 3 ciclos.

---

## Métrica final de contagens (todas verificadas via grep/ls no canônico)

| Métrica | Valor | Documentos que citam |
|---|---|---|
| Agentes | cinquenta | 00, 02, 06 |
| Hooks registrados no manifesto | trinta e seis | 00, 01, 06 |
| Arquivos na pasta de hooks | trinta e sete (1 é biblioteca compartilhada) | 00, 01, 06 |
| Libs no canônico | trinta e oito | 00, 05, 06 |
| Libs após port | trinta e seis (38 - 2 langfuse) | 05, 06 |
| Gates no registry | quarenta e nove | 00, 04 |
| Entry points | vinte e quatro | 00, 03 |
| Enforcements determinísticos | sete | 04 |
| Comandos após port | quatro | 00, 06 |
| N1 controladores | seis | 02 |
| Comandos paperclip removidos | onze (dez + setup) | 00, 06 |
| Hooks langfuse removidos | um | 00, 01, 06 |
| Libs langfuse removidas | duas (cliente + carrier; sanitizer mantida) | 00, 05, 06 |
| Variantes de pipeline | dezessete | 00, 03 |

---

## Tipos de defeito mais comuns encontrados (para aprendizado)

1. **Contagem errada por pressuposto** (8 vezes): eu assumi números sem verificar via grep. Os revisores pegaram todos. Lição: sempre `ls | wc -l` antes de citar contagem.

2. **Dureza de gate presumida** (8 gates em 04): eu presumi que gates spec-v8 eram HARD porque pareciam bloqueios. O canônico os declara AUDIT. Lição: sempre ler o gates.md antes de citar dureza.

3. **Acrônimo sem expansão** (10+ vezes): VPS, SSH, DDD, BDD, PII, HMAC, SSOT, YAML, W3C, HTTP, CommonJS. Lição: a regra mestra TTS é implacável — toda primeira ocorrência expande.

4. **Path na prosa narrativa** (5+ vezes): paths são lidos pelo TTS letra por letra e quebram o fluxo. Lição: paths só em blocos de código no fim.

5. **Dependência implícita não mapeada** (C2 em 06): remover uma lib sem checar quem a requere via require top-level quebra runtime silenciosamente. Lição: antes de remover arquivo, `grep -rn "require.*arquivo"` em todo o repo.

---

## Caminhos e comandos referenciados

```
# diretório da documentação de auditoria
Pipeline-Orchestrator/docs/port-zcode/

# arquivos produzidos (7 + este log)
Pipeline-Orchestrator/docs/port-zcode/00-overview.md
Pipeline-Orchestrator/docs/port-zcode/01-hooks-inventory.md
Pipeline-Orchestrator/docs/port-zcode/02-agents-inventory.md
Pipeline-Orchestrator/docs/port-zcode/03-workflows-and-stages.md
Pipeline-Orchestrator/docs/port-zcode/04-gates-and-enforcements.md
Pipeline-Orchestrator/docs/port-zcode/05-lib-inventory.md
Pipeline-Orchestrator/docs/port-zcode/06-portability-plan.md
Pipeline-Orchestrator/docs/port-zcode/batch-audit-log.md   ← este arquivo

# repositório canônico auditado
Pipeline-Orchestrator/   (versão 8.20.0)
```
