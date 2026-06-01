---
name: measure-paperclip-fidelity
description: >
  Mede a fidelidade dos agentes do Paperclip em relação ao pipeline canônico do Pipeline-Orchestrator.
  Usa SEMPRE quando o usuário pedir: "medir fidelidade do Paperclip", "nota de paridade dos agentes",
  "fidelity baseline", "quão fiel os agentes do Paperclip seguem o pipeline", "rodar o medidor de
  fidelidade", "ver quanto os agentes respeitam o pipeline", "checar adesão dos cargos ao pipeline".
  Lê execuções reais do Paperclip via SSH loopback, traduz os blocos que os cargos emitem para portões
  canônicos usando o dicionário bloco→portão, calcula a nota de fidelidade por execução e de forma
  agregada, e gera um relatório markdown com os portões mais ausentes. NUNCA escreve nada no Paperclip —
  operação 100% read-only. Invoque também quando o usuário quiser comparar o estado atual do Paperclip
  com o baseline de 2026-06-01 ou entender onde a fidelidade mais "vaza".
allowed-tools: ["Read", "Bash", "Grep", "Glob"]
argument-hint: "[companyId — default Pipeline Orchestrator 019c6f31-41ed-497a-93ba-cb4eff651a7c]"
report_only: true
---

# measure-paperclip-fidelity

## Objetivo

Esta skill mede o quanto os 47 cargos da empresa Paperclip estão seguindo o pipeline canônico do Plugin.
Ela lê as execuções reais, traduz o que os cargos emitiram para portões esperados pela spec, e calcula uma
nota de fidelidade. A nota é a fração dos portões esperados (por complexidade) que de fato apareceram nos
comentários da execução.

Referência de design: `paperclip-native-spec/fase-A-reforjo/A5-skill-espelho-design.md` (Peça 1, §3 e §8).

---

## Pré-condições

- Acesso SSH à VPS configurado como `hostinger-vps` (testar com `ssh hostinger-vps echo ok` antes de rodar).
- Paperclip rodando na VPS na porta loopback `3100` (API interna, não exposta).
- Node.js 18+ disponível localmente.
- Skill `operating-paperclip` disponível como fonte de verdade da API — consultar antes de qualquer
  chamada não listada aqui.

---

## Passo 1 — Confirmar a empresa-alvo

Perguntar (ou inferir do argumento passado) qual `companyId` usar.

**Default:** Pipeline Orchestrator — `019c6f31-41ed-497a-93ba-cb4eff651a7c`

Se o usuário mencionou outra empresa (ex.: Career Ops, CyberVibeGuard), usar o ID correspondente.
Quando houver dúvida, usar AskUserQuestion com a opção default primeiro.

---

## Passo 2 — Rodar o medidor (READ-ONLY)

Execute o CLI orquestrador apontando para a empresa-alvo:

```bash
node references/paperclip/spec/lib/measure-fidelity.cjs <companyId>
```

O CLI encadeia automaticamente:
1. **Coletor** (`mirror-fidelity-collector.cjs`) — lê issues + comentários da empresa via SSH→curl loopback
   (GET apenas, sem nenhuma escrita).
2. **Parser** (`mirror-fidelity-parser.cjs`) — extrai nomes de bloco (`### NOME vN`) e a complexidade
   declarada no bloco `ORCHESTRATOR_DECISION`.
3. **Calculadora** (`mirror-fidelity-score.cjs`) — traduz blocos detectados → portões via dicionário
   bloco→portão; infere portões esperados pela complexidade; calcula
   `nota = |emitidos ∩ esperados| / |esperados|`.
4. **Relatório** (`mirror-fidelity-report.cjs`) — formata nota média, ranking dos portões mais ausentes,
   e detalhe por execução.

> **NUNCA usar POST, PATCH ou DELETE.** Toda a operação é leitura pura sobre dados já existentes.
> O campo `executionState` do Paperclip é declarado mas não-gravável (descoberto no spike T-A2-01,
> documentado em `paperclip-native-spec/fase-A-reforjo/A2-design.md`). Ignorar esse campo; a fonte de
> verdade são os **comentários** das issues.

---

## Passo 3 — Salvar o relatório gerado

Redirecionar a saída para um arquivo markdown com a data de hoje:

```bash
node references/paperclip/spec/lib/measure-fidelity.cjs <companyId> \
  > "paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-$(date +%Y-%m-%d).md"
```

No Windows PowerShell:

```powershell
node references/paperclip/spec/lib/measure-fidelity.cjs <companyId> `
  | Out-File "paperclip-native-spec\fase-A-reforjo\baseline-fidelidade-$(Get-Date -Format yyyy-MM-dd).md" -Encoding utf8
```

O arquivo de baseline de referência é `paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-2026-06-01.md`
(medição inicial sobre 54 execuções da empresa Pipeline Orchestrator).

---

## Passo 4 — Interpretar o relatório

O relatório tem três seções principais:

**Nota média** — A fração de portões esperados que apareceu nas execuções com complexidade identificada.
Execuções onde o bloco `ORCHESTRATOR_DECISION` não declara complexidade ficam marcadas como
"indeterminadas" e não entram na média (são reportadas à parte, pois representam um gap de formato, não
necessariamente de adesão).

**Portões mais ausentes** — Ranking decrescente de quais portões canônicos estão faltando com mais
frequência. São esses os pontos onde a fidelidade mais "vaza". Exemplo típico baseado na hipótese do
design A5 §4:

| Portão ausente | O que significa |
|---|---|
| `INFO_GATE_BLOCKED` | Cargos não estão bloqueando por falta de informação antes de começar |
| `PLAN_REJECTED` | Plano nunca rejeitado — aprovação implícita, não explícita |
| `MICRO_GATE_GAP` | Micro-portões por task não emitidos |
| `CHECKPOINT_FAIL` | Falha de build/teste não reportada com bloco formal |

**Por execução** — Linha por linha mostrando a nota individual e os portões faltantes de cada issue,
permitindo identificar padrões por projeto ou por variant de complexidade.

**Execuções indeterminadas** — Issues cujos comentários não têm bloco `ORCHESTRATOR_DECISION` com campo
`complexity`. Isso indica que o cargo responsável não emitiu o bloco de classificação obrigatório.
Quantidade alta de indeterminadas é um sinal de gap de formato (Peça 2 / Peça 3 do design A5
precisam de atenção).

---

## Passo 5 — NUNCA escrever no Paperclip

Esta skill é estritamente read-only. Proibições absolutas:

- Não usar `POST`, `PATCH`, `PUT` ou `DELETE` contra a API do Paperclip.
- Não criar, editar ou atualizar issues, comentários, cargos ou skills via API loopback.
- Não invocar nenhuma skill de escrita do `operating-paperclip` (ex.: `save_issue`, `save_comment`).
- Não modificar o estado dos agentes na VPS.

Se o usuário pedir uma ação de escrita, explicar que isso pertence à Peça 2/3/4 do design A5 e está
fora do escopo desta skill.

---

## Referências

- Design completo da Peça 1: `paperclip-native-spec/fase-A-reforjo/A5-skill-espelho-design.md`
- Plano de implementação: `paperclip-native-spec/fase-A-reforjo/A5-PLAN-peca1-medidor.md`
- Baseline de referência: `paperclip-native-spec/fase-A-reforjo/baseline-fidelidade-2026-06-01.md`
- Dicionário bloco→portão (v0): `references/paperclip/spec/lib/mirror-fidelity-dictionary.cjs`
- Fonte de verdade da API Paperclip: skill `operating-paperclip`
- Calibração das execuções reais (54 execuções): `paperclip-native-spec/fase-A-reforjo/A0-CALIBRACAO-pos-execucoes-2026-06-01.md`
- Governança de skills: `references/skill-governance.md`
