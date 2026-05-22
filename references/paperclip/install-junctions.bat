@echo off
REM Cria 11 junctions de C:\Users\win\.paperclip\instances\default\skills\ → D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\references\paperclip\skills\
REM Idempotente: remove junction existente antes de criar nova.
REM Source-of-truth (D:) preservado; C: vira apenas link transparente.

set "SRC=D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\references\paperclip\skills"
set "DST=C:\Users\win\.paperclip\instances\default\skills"

for %%S in (engineering-principles pipeline-orchestrator-adversarial pipeline-orchestrator-audit-method pipeline-orchestrator-bugfix-method pipeline-orchestrator-classification pipeline-orchestrator-contracts pipeline-orchestrator-iron-laws pipeline-orchestrator-spec-protocol pipeline-orchestrator-tdd pipeline-orchestrator-ux-method pipeline-orchestrator-vsa) do (
    if exist "%DST%\%%S" rmdir "%DST%\%%S" 2>nul
    mklink /J "%DST%\%%S" "%SRC%\%%S"
)

echo.
echo === Verificacao ===
dir "%DST%" /AL
