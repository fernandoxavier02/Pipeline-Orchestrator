# Plan — Dispatch-Pending Preventive Lock (Fase 1 da rearquitetura "parent-orquestra")

- **Data:** 2026-06-17
- **Status:** DESIGN (aprovado o rumo pelo usuário; testes RED a seguir)
- **Motivador:** run furado em `D:\Clínica Companion` (`2026-06-17-refatoracoes-templates-horizontalizacao-pwa`), fidelity 0.0435, 1/23 mandatory gates. Causa raiz = Achado #7: o parent não atendeu o `DISPATCH_REQUEST` do STEP 1.7 (brainstorm), fez fallback inline ("conduzo a spec direto") e justificou com "SendMessage" (inexistente no plugin).
- **Escopo desta fase:** SÓ a trava preventiva. As fases 2 (estado avança por hook) e 3 (parent vira orquestrador, aposenta o sistema de bilhetes) vêm depois, em planos próprios.

## 1. Problema

O enforcement do lado do parent é hoje 100% prompt + um vigia reativo (`cleanup-orphan-sentinel-state-hook`, SessionStart, janela 30 min) que só carimba `PROTOCOL_HANDSHAKE_TIMEOUT` na sessão SEGUINTE — 12h depois, no caso real. Nada impede, em tempo real, o parent de pular o protocolo e escrever código.

## 2. Descoberta: já existe meia-trava (`edit-guard-hook.cjs`)

`edit-guard-hook.cjs::shouldBlock` JÁ nega `Edit/Write/NotebookEdit/MultiEdit` fora de `.pipeline/`+`pipeline-runs/` quando há um **lock de sessão ativo** sem exec-window. Mas tem 3 furos que deixaram o run da Clínica Companion passar:

1. **Heartbeat de 10 min.** `getActiveLock` exige `expires_at > now` e (se presente) `last_seen_at` < `STALE_HEARTBEAT_THRESHOLD_MS` (10 min). Em trabalho longo o lock fica stale → `getActiveLock` retorna null → o guard libera tudo.
2. **Não cobre o modo de falha real.** O guard checa "tem lock?". O caso da Clínica Companion era "controller já spawnado + DISPATCH pendente não atendido". A mensagem do guard ("spawn o pipeline-controller") nem se aplica — o controller já existia.
3. **Escape via `pipeline_active=false`.** O parent escreveu `pipeline_active:false` + `closed_reason` ANTES de escrever a spec. Qualquer guard ingênuo que respeite essa flag libera o desvio.

## 3. Objetivo

Bloquear, em tempo real, escrita de código de produção quando o sentinel-state tem um `DISPATCH_REQUEST`/`GATE_REQUEST`/`PLAN_MODE_REQUEST` **pendente e não-resolvido** — forçando o parent a atender o protocolo (despachar o agente pedido) antes de tocar em código. Independente do lock-heartbeat e à prova do escape `pipeline_active=false`.

## 4. Design

### 4.1 Onde mora
Estende `edit-guard-hook.cjs` com uma função nova e isolada `shouldBlockOnPendingDispatch(payload)` (SRP por função, DRY na infra: reusa descoberta de run-dir, formato `permissionDecision: deny`, registro no manifesto). `handlePreToolUse` consulta as DUAS travas: lock (existente) **OU** pending-dispatch (nova) → bloqueia se qualquer uma disparar.

### 4.2 Descoberta do estado
Reusa a precedência canônica `PIPELINE_DOC_PATH > PIPELINE_RUN_ID > mais-recente-por-mtime` (mesma de `sentinel-hook`/`stop-hook`) para achar o `sentinel-state.json` do run corrente sob `<cwd>/.pipeline/`.

### 4.3 Condição de bloqueio (deny)
Bloqueia quando TODAS forem verdade:
- existe `sentinel-state.json` legível com `pending_blocks` não-vazio;
- pelo menos um pending block tem idade (`now - emitted_at`) **≤ timeout** (default 30 min, env `PIPELINE_HANDSHAKE_TIMEOUT_MS`, floor 60s — mesmo do timeout existente);
- esse block NÃO tem evidência de resolução (sem `*_RESULTS` correspondente registrado / ainda listado em `pending_blocks`);
- o alvo da ação é `Edit/Write/NotebookEdit/MultiEdit` de caminho FORA de `.pipeline/`+`pipeline-runs/`;
- não há exec-window válida (reusa `getActiveExecWindow`).

### 4.4 Robustez ao escape
`pipeline_active:false` **NÃO** libera quando há pending block recente sem `*_RESULTS`. "Fechar" o pipeline com um despacho pendente e sem resultado = abandono, tratado como pendente. Só libera se: block resolvido, OU block expirado (> timeout → deixa o `cleanup-orphan` recovery agir; evita deadlock permanente), OU fechamento legítimo (CLOSEOUT_CONFIRM/Pa de Cal registrado).

### 4.5 Mensagem corretiva
Em vez de "spawn o controller", a mensagem nomeia o bloco pendente e manda atendê-lo: ex. "Há um DISPATCH_REQUEST pendente (`step-1-7-brainstorm-controller`). Despache esse agente via Agent tool e re-invoque o controller com DISPATCH_RESULTS antes de escrever código. NÃO conduza inline." (sem citar "SendMessage").

### 4.6 Enforcement mode
Proteção crítica → **deny por default** (diferente do warn-first de v4.8.0). Override `PIPELINE_DISPATCH_LOCK=warn` audita sem bloquear. **Fail-OPEN em estado ausente OU ilegível**: a trava só dispara com evidência POSITIVA de um pending block vivo — sem isso, não bloqueia. Decisão revista vs. o rascunho inicial (que dizia fail-closed): travar todo o projeto por um `sentinel-state.json` corrompido seria um falso-positivo catastrófico, e é inconsistente com o edit-guard (que pula locks malformados). Endurecimento futuro possível: distinguir "arquivo existe mas ilegível" de "ausente" e exigir confirmação só no primeiro caso.

### 4.7 Escopo v1
Cobre Edit/Write/NotebookEdit/MultiEdit (igual ao edit-guard). Bash que escreve código fica para v1.1 (mais difícil de classificar sem falso-positivo). Documentar o gap explicitamente.

## 5. Critérios de aceite (cenários RED a escrever primeiro)
1. pending DISPATCH recente + Write fora de `.pipeline/` → **BLOCK**
2. pending DISPATCH recente + Write DENTRO de `.pipeline/` → ALLOW
3. sem pending_blocks → ALLOW (não interfere em projeto/pipeline normal)
4. pending block resolvido (tem `*_RESULTS`) → ALLOW
5. pending block expirado (idade > timeout) → ALLOW (recovery via cleanup-orphan)
6. **Reprodução Clínica Companion**: pending DISPATCH + `pipeline_active:false` + `closed_reason` de abandono + Write em `.kiro/specs/...` → **BLOCK** (prova do "nunca mais")
7. exec-window válida aberta → ALLOW (executor legítimo)
8. `PIPELINE_DISPATCH_LOCK=warn` → não bloqueia, audita evento
9. estado ilegível sob deny → fail-CLOSED (BLOCK); sob warn → fail-OPEN (ALLOW)

## 6. Portabilidade
Implementar Claude Code primeiro (este hook). Depois espelhar para Cursor (`.cursor-plugin`) e OpenCode (`opencode-adaptation`), que têm camada de hooks própria.

## 7. Relação com a rearquitetura
Esta é a Fase 1 ("a proteção"). Fase 2: hooks avançam o sentinel-state automaticamente no spawn correto (tira a atualização de estado da memória do modelo). Fase 3: skill `/pipeline` passa a conter o roteiro de orquestração rodado pelo próprio parent, aposentando DISPATCH_REQUEST/GATE_REQUEST. Cada fase com TDD + dogfood + adversarial.
