# RODAR — Next-Action Contract + liveness + retomada S2 (Pipeline-Orchestrator enforcement) — 2026-07-08

Loop de 10 tarefa(s) (+ fechamento) em `loops/next-action-contract/`.
Runner: claude. Regra: sempre a permissão mínima que completa o
plano — flags que pulam todas as permissões são proibidas neste arquivo.

## Disparo recomendado — runner vigiado (Claude Code)

O vigia roda uma volta por vez e, após cada volta, VERIFICA mecanicamente:
exatamente 1 caixinha nova (ou 1 BLOQUEADO novo), testes sem falha nova e
working tree limpo. Volta desobediente é DESFEITA (reset ao commit anterior)
e o loop para com relatório.

```bash
python "C:\Users\win\.claude\skills\loopify\scripts\loop_guard.py" --dir "loops/next-action-contract" --runner claude \
  --test-cmd "node scripts/run-tests.cjs" \
  --allowed-tools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
```

## Disparo manual (sem vigia — só para depurar as 2-3 primeiras voltas)

Claude Code (`claude -p`):

```powershell
# PowerShell (Windows)
cd .
while (-not (Test-Path loops/next-action-contract\LOOP_DONE.md)) {
  claude -p (Get-Content loops/next-action-contract\PROMPT.md -Raw) --permission-mode acceptEdits `
    --allowedTools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
}
```

```bash
# bash (Linux/macOS)
cd .
while [ ! -f loops/next-action-contract/LOOP_DONE.md ]; do
  claude -p "$(cat loops/next-action-contract/PROMPT.md)" --permission-mode acceptEdits \
    --allowedTools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
done
```

## Acompanhar

```powershell
# PowerShell (Windows)
(Select-String -Path loops/next-action-contract\LOOP_PLAN.md -Pattern '\[x\]').Count   # progresso
Get-Content loops/next-action-contract\AGENT_NOTES.md -Tail 30                          # lições/evidências
git log --oneline loop/next-action-contract | Select-Object -First 10
```

```bash
# bash (Linux/macOS)
grep -c "\[x\]" loops/next-action-contract/LOOP_PLAN.md      # progresso
tail -30 loops/next-action-contract/AGENT_NOTES.md            # lições/evidências
git log --oneline loop/next-action-contract | head -10
```

## Parar

- Natural: o loop cria `loops/next-action-contract/LOOP_DONE.md` e o disparador encerra.
- Manual: crie o arquivo à mão (`touch loops/next-action-contract/LOOP_DONE.md`, ou `ni
  loops/next-action-contract\LOOP_DONE.md` no PowerShell) — encerra na próxima volta; Ctrl+C
  mata a volta atual (estado consistente: cada volta termina em commit).

## Aviso

Loop rodando sozinho também erra sozinho: 'concluído' é afirmação, não
prova. Revise os commits da branch e o LOOP_DONE.md antes de mesclar.
