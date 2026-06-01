---
name: pipeline-orchestrator-tdd
description: Implementacao de TDD (Test-Driven Development) com fase RED obrigatoria antes de GREEN. Usado por todos os cargos executor que escrevem codigo.
when_to_use: Antes de qualquer Write/Edit em codigo de producao. Carregado por executor-implementer-task, feature-implementer, executor-fix, bugfix-regression-tester (variante adapted).
---

# pipeline-orchestrator-tdd

Disciplina de TDD aplicada no modelo Paperclip+Codex. Mantem o ciclo RED-GREEN-REFACTOR do pipeline original, com adaptacao para heartbeats curtos.

## 1. Ciclo basico (RED-GREEN-REFACTOR)

### RED (escrever teste que falha)

1. Identifique o **comportamento observavel** que a issue exige
2. Escreva o teste mais simples possivel que captura esse comportamento
3. Rode o teste — DEVE FALHAR pela razao certa (assertion mismatch, NAO import error)
4. Postar comment com evidencia da falha:

```markdown
### TDD_RED v1

```yaml
test_added: tests/test_foo.py::test_X
behavior_captured: "Deve retornar Y quando entrada Z"
ran_command: "pytest tests/test_foo.py::test_X -v"
output: |
  {{output literal}}
failure_reason: AssertionError  # ou outro tipo verificavel
```
```

### GREEN (implementacao minima pra passar)

1. Escreva o MINIMO de codigo de producao pra fazer o teste passar
2. NAO adicione logica que o teste atual nao exige
3. Rode o teste — DEVE PASSAR
4. Rode TODA a suite — nada mais pode quebrar
5. Postar comment:

```markdown
### TDD_GREEN v1

```yaml
files_changed: [src/foo.py:12-18]
ran_command: "pytest tests/test_foo.py -v"
test_status: PASS
ran_full_suite: "pytest -q"
full_suite_status: {{N passed, 0 failed}}
```
```

### REFACTOR (opcional)

1. Se voce ve duplicacao ou nome obscuro no codigo NOVO que acabou de escrever, refactor
2. Rode testes apos refactor — devem continuar verdes
3. Diff minimo: refactor SO no que voce mexeu, nao em codigo adjacente (Iron Law 6)
4. Comment opcional `### TDD_REFACTOR v1` se aplicou

## 2. Adaptacao para heartbeats

Heartbeats sao curtos. Se um ciclo RED-GREEN-REFACTOR completo nao cabe num heartbeat, segmente:

| Heartbeat | Fase |
|---|---|
| 1 | RED + comment evidencia |
| 2 | GREEN + comment evidencia (acordado por @-mention ou checkpoint) |
| 3 | REFACTOR + final comment (se necessario) |

Salve estado entre heartbeats em `$AGENT_HOME/memory/YYYY-MM-DD.md` na secao "## TDD em andamento":

```markdown
## TDD em andamento
- Issue: {{id}}
- Fase atual: GREEN (RED ja completo, evidence em comment X)
- Test: tests/test_foo.py::test_X
- Proxima acao: implementar minimo em src/foo.py
```

## 3. Casos especiais

### 3.1 Bug fix (TDD via regressao)

Para bugfix-regression-tester e executor-fix:
1. RED = teste que reproduz o bug (deve falhar antes do fix)
2. GREEN = aplicar fix
3. Manter o teste apos — vira regression test permanente

### 3.2 Refatoracao puro (sem comportamento novo)

Se a issue eh "renomear funcao X pra Y, semantica identica":
1. Os testes existentes JA cobrem o comportamento
2. RED nao aplica (nao tem comportamento novo a capturar)
3. Aplicar refatoracao
4. Rodar suite — TODOS os testes devem continuar verdes
5. Postar `### TDD_REFACTOR_ONLY v1` justificando ausencia de RED

### 3.3 Feature com multipla logica

Use slicing vertical (ver skill `pipeline-orchestrator-vsa`):
- Slice 1: end-to-end happy path simples — RED-GREEN-REFACTOR completo
- Slice 2: edge case A — RED-GREEN-REFACTOR
- Slice N: edge case Z — RED-GREEN-REFACTOR

Cada slice eh um ciclo independente. Ate um slice estar verde, NAO comecar proximo.

## 4. Anti-padroes

❌ **"Vou escrever os 5 testes primeiro depois implementar tudo"** — Quebra o RED-GREEN-REFACTOR. Faca 1 teste por vez.

❌ **"Vou escrever o codigo e depois criar testes pra cobrir"** — Inverte RED-GREEN. Teste depois de codigo eh quase sempre fraco (cobre o que existe, nao o que deveria).

❌ **"O teste passou na primeira tentativa, eh sinal bom"** — RED-fase OBRIGATORIA. Se passou direto, voce nao captou comportamento novo OU teste eh tautologia.

❌ **"Falhou por import error, vou contar como RED"** — NAO. RED tem que ser AssertionError ou equivalente verificavel.

## 5. Auto-auditoria pre-commit

Antes de marcar a issue como `in_progress → in_review` ou similar:

1. ✓ Diff inclui pelo menos 1 teste novo OU modificado?
2. ✓ O teste falhou em algum momento (comment TDD_RED existe)?
3. ✓ O teste passa agora?
4. ✓ A suite completa passa (nao so o teste novo)?
5. ✓ Diff minimo (nao tem refactor extra fora do escopo)?

Se algum NAO, voltar antes de marcar pronto.

## 6. Stop rule especifico de TDD (extensao da IL4)

Se voce nao consegue fazer o teste passar apos 2 tentativas de GREEN:
- POST `### STOP_RULE_TDD v1` com analise das 2 tentativas
- Status=blocked
- Abrir approval request OU escalar pro spec-reviewer (talvez o requisito esta errado)
- Exit
