# RODAR — Destravar os hooks do pipeline (deadlock de despacho pendente + contabilidade) — 2026-07-07

Loop de 6 tarefa(s) (+ fechamento) em `loops/hook-unblock/`.
Runner: claude. Regra: sempre a permissão mínima que completa o
plano — flags que pulam todas as permissões são proibidas neste arquivo.

## Disparo recomendado — runner vigiado (Claude Code)

O vigia roda uma volta por vez e, após cada volta, VERIFICA mecanicamente:
exatamente 1 caixinha nova (ou 1 BLOQUEADO novo), testes sem falha nova e
working tree limpo. Volta desobediente é DESFEITA (reset ao commit anterior)
e o loop para com relatório.

```bash
python "C:\Users\win\.claude\skills\loopify\scripts\loop_guard.py" --dir "loops/hook-unblock" --runner claude \
  --test-cmd "node loops/hook-unblock/check_no_new_failures.cjs" \
  --allowed-tools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
```

## Disparo manual (sem vigia — só para depurar as 2-3 primeiras voltas)

Claude Code (`claude -p`):

```powershell
# PowerShell (Windows)
cd .
while (-not (Test-Path loops/hook-unblock\LOOP_DONE.md)) {
  claude -p (Get-Content loops/hook-unblock\PROMPT.md -Raw) --permission-mode acceptEdits `
    --allowedTools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
}
```

```bash
# bash (Linux/macOS)
cd .
while [ ! -f loops/hook-unblock/LOOP_DONE.md ]; do
  claude -p "$(cat loops/hook-unblock/PROMPT.md)" --permission-mode acceptEdits \
    --allowedTools "Bash(python *),Bash(git add:*),Bash(git commit:*),Bash(git status:*),Bash(git diff:*),Bash(git rev-parse:*),Bash(git checkout -b:*),Bash(git log:*)"
done
```

## Acompanhar

```powershell
# PowerShell (Windows)
(Select-String -Path loops/hook-unblock\LOOP_PLAN.md -Pattern '\[x\]').Count   # progresso
Get-Content loops/hook-unblock\AGENT_NOTES.md -Tail 30                          # lições/evidências
git log --oneline loop/hook-unblock | Select-Object -First 10
```

```bash
# bash (Linux/macOS)
grep -c "\[x\]" loops/hook-unblock/LOOP_PLAN.md      # progresso
tail -30 loops/hook-unblock/AGENT_NOTES.md            # lições/evidências
git log --oneline loop/hook-unblock | head -10
```

## Parar

- Natural: o loop cria `loops/hook-unblock/LOOP_DONE.md` e o disparador encerra.
- Manual: crie o arquivo à mão (`touch loops/hook-unblock/LOOP_DONE.md`, ou `ni
  loops/hook-unblock\LOOP_DONE.md` no PowerShell) — encerra na próxima volta; Ctrl+C
  mata a volta atual (estado consistente: cada volta termina em commit).

## Aviso

Loop rodando sozinho também erra sozinho: 'concluído' é afirmação, não
prova. Revise os commits da branch e o LOOP_DONE.md antes de mesclar.
