# Pipeline-Orchestrator — Claude Code launcher with Langfuse tracing
#
# Loads .env from the project root, then starts the `claude` CLI from inside
# the project directory (required for sentinel-hook auto-discovery).
#
# Usage (from any directory):
#   pwsh -File "D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator\scripts\start-with-tracing.ps1"

$ErrorActionPreference = "Stop"

$ProjectRoot = "D:\Pipeline Orchestrator Claude\Pipeline-Orchestrator"
Set-Location $ProjectRoot

if (-not (Test-Path ".env")) {
    Write-Host ".env nao encontrado em $ProjectRoot." -ForegroundColor Red
    Write-Host "Copie .env.example para .env e preencha LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY." -ForegroundColor Yellow
    exit 1
}

Write-Host "[load] Carregando .env..." -ForegroundColor Cyan

$loaded = 0
Get-Content ".env" | ForEach-Object {
    $line = $_.Trim()
    if ($line.StartsWith("#") -or $line.Length -eq 0) { return }
    if ($line -match '^([A-Z_][A-Z0-9_]*)=(.*)$') {
        $name = $Matches[1]
        $value = $Matches[2].Trim()
        # Strip surrounding quotes if present
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        } elseif ($value.StartsWith("'") -and $value.EndsWith("'")) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        $loaded++
    }
}

Write-Host "[load] $loaded variaveis carregadas." -ForegroundColor Green

$enabled = [Environment]::GetEnvironmentVariable('LANGFUSE_ENABLED', 'Process')
$host_url = [Environment]::GetEnvironmentVariable('LANGFUSE_HOST', 'Process')
$has_pk = -not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('LANGFUSE_PUBLIC_KEY', 'Process'))
$has_sk = -not [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable('LANGFUSE_SECRET_KEY', 'Process'))

Write-Host ""
Write-Host "Langfuse tracing config:" -ForegroundColor Cyan
Write-Host "  LANGFUSE_ENABLED   = $enabled" -ForegroundColor $(if ($enabled -eq 'true') { 'Green' } else { 'Yellow' })
Write-Host "  LANGFUSE_HOST      = $host_url" -ForegroundColor Gray
Write-Host "  PUBLIC_KEY presente = $has_pk" -ForegroundColor $(if ($has_pk) { 'Green' } else { 'Red' })
Write-Host "  SECRET_KEY presente = $has_sk" -ForegroundColor $(if ($has_sk) { 'Green' } else { 'Red' })
Write-Host ""

if ($enabled -ne 'true') {
    Write-Host "AVISO: LANGFUSE_ENABLED nao esta como 'true'. Tracing ficara desativado nesta sessao." -ForegroundColor Yellow
}

Write-Host "[launch] Iniciando claude em $ProjectRoot..." -ForegroundColor Cyan
Write-Host ""

# Launch claude — inheriting env vars we just set on the process
& claude
