---
name: pipeline-orchestrator-adversarial
description: Protocolo de revisao adversarial (zero-context) com checklists de security, architecture e quality. Usado pelos cargos adversarial-* e final-adversarial-orchestrator.
when_to_use: Quando recebe ordem de "rever este codigo como se nao tivesse contexto da implementacao". Carregada por adversarial-review-coordinator, adversarial-security-scanner, adversarial-architecture-critic, adversarial-quality-reviewer, adversarial-batch, final-adversarial-orchestrator.
---

# pipeline-orchestrator-adversarial

Filosofia: o reviewer **NAO conhece a implementacao**, **NAO conhece a intencao do autor**, **NAO recebe contexto narrativo do PR**. Apenas le os arquivos modificados e busca o que pode dar errado.

## 1. Os 3 papeis adversariais

| Cargo | Foco | Pergunta-mestre |
|---|---|---|
| `adversarial-security-scanner` | Exploits, auth bypass, race conditions, leaks | "Como um atacante quebra isso?" |
| `adversarial-architecture-critic` | Coupling, abstraction leaks, SOLID violations, scalability | "Como isso falha em escala ou se desacopla mal?" |
| `adversarial-quality-reviewer` | Maintainability, clarity, dead code, naming | "O proximo eng que abrir isso vai sofrer?" |

## 2. Protocolo de execucao

### 2.1 Iniciacao (zero-context contract)

Voce eh `adversarial-*`. No inicio do heartbeat:
1. NAO leia issue parent description (poderia te enviesar)
2. Leia APENAS:
   - O diff (PATCH request entre git refs ou lista de arquivos modificados, fornecida no briefing)
   - Os arquivos modificados COMPLETOS (Read tool, sem filtro)
   - Eventualmente arquivos vizinhos pra entender contrato (Read sem expandir leitura)
3. NAO leia comments anteriores do reviewer-controller, NAO leia plano original

### 2.2 Adversarial pass (security scanner exemplo)

Para cada arquivo modificado:
1. **Assumption analysis** — Toda assumption nao verificada eh vulnerabilidade. Listar.
2. **Malicious input** — Que input (string vazia, unicode, payload muito grande, SQL injection, XSS, path traversal) quebra isso?
3. **Race conditions** — Concorrencia, TOCTOU, double-spend, replay attack
4. **Sensitive data exposure** — Logs com PII, error messages com stack trace pro user, secrets em env exposto
5. **Auth bypass** — Pode chegar nesse endpoint sem auth? Token expirado aceito? Permissao verificada server-side ou so client?
6. **Resource exhaustion** — DoS via input grande, recursion sem limite, memory leak

### 2.3 Findings (saida)

Cada finding vira entrada YAML:

```yaml
findings:
  - id: SEC-001
    severity: {{critical | high | medium | low}}
    category: {{auth | injection | race | data_exposure | dos | other}}
    file: src/api/checkout.py
    line: 42-58
    description: "Validacao de quantity acontece no client mas nao server. POST direto com quantity=-1 reduz total."
    proof_of_concept: |
      curl -X POST /checkout -d '{"qty":-1, "price":100}' -> total: -100, credita usuario
    recommendation: "Validar qty > 0 em src/api/checkout.py:42 antes de calculo"
    confidence: 0.0-1.0
```

## 3. Severity rubric (calibracao entre reviewers)

| Nivel | Definicao | Exemplos |
|---|---|---|
| **critical** | Compromete prod hoje sem intervencao do atacante (exploitable sem chain) | RCE, SQL injection, auth bypass, segredos expostos |
| **high** | Exploitable com chain pequena ou afeta multipas usuarios | XSS, CSRF, escalacao privilegio, data leak amplo |
| **medium** | Exploitable mas com pre-conditions ou impacto localizado | Race condition rara, error message vazando schema |
| **low** | Hardening; nao explotavel hoje mas sinaliza problema | Logs verbosos, dead code, depend versao antiga sem CVE |

Quando duvida, escolha o nivel **maior** — Iron Law: erros de seguranca sao caros.

## 4. Arquitetura critic (questions universais)

| Dimensao | Pergunta |
|---|---|
| Coupling | Esta classe sabe coisas demais sobre outra? |
| Abstraction leak | Implementacao detail vazando pra interface publica? |
| SOLID | SRP (1 razao pra mudar), OCP (extensivel), LSP (substituivel), ISP (focused), DIP (abstrair deps) — alguma quebra? |
| Scalability | Funciona com 10x dados? 100x usuarios? |
| Testability | Da pra testar essa classe sem stub de 5 colaboradores? |

## 5. Quality reviewer (5 perguntas)

| # | Pergunta |
|---|---|
| 1 | Eu, abrindo esse arquivo daqui a 6 meses, entendo o que faz em 30s? |
| 2 | Os nomes (variaveis, funcoes, classes) descrevem o **quê** e não o **como**? |
| 3 | Tem trecho que ninguem mais chama (dead code)? |
| 4 | Tem comentario explicando codigo confuso em vez de simplificar o codigo? |
| 5 | Algum teste falharia se eu inverter a logica? (testes fortes vs fracos) |

## 6. Parallel-capable

`adversarial-review-coordinator` dispatcha os 3 (security, architecture, quality) em paralelo em sub-issues independentes. Cada um trabalha cego do outro.

`final-adversarial-orchestrator` faz o mesmo no fim do pipeline (gate opt-in pre final-validator).

## 7. Consolidation (review-coordinator)

Apos receber as 3 sub-issues fechadas, consolidar em comment do ticket-mae:

```markdown
### ADVERSARIAL_CONSOLIDATED v1

```yaml
findings_total: N
findings_by_severity:
  critical: {{lista de IDs}}
  high: {...}
  medium: {...}
  low: {...}
findings_by_reviewer:
  security: [SEC-001, SEC-002]
  architecture: [ARCH-001]
  quality: [QA-001, QA-002, QA-003]
deduplications: []  # IDs que sao mesmo issue visto por 2 reviewers
verdict: {{NEEDS_FIX | NEEDS_DISCUSSION | PASS_WITH_WARN | PASS}}
```
```

## 8. Anti-padroes

❌ Ler issue description antes do diff (enviesa)
❌ Confiar em commit message ou PR title (enviesa)
❌ Pular um arquivo "porque parece OK" (era exatamente onde estava o exploit)
❌ Diminuir severidade pra nao "exagerar" (Iron Law: erro de calibracao = mais bug em prod)
❌ Inventar exploit sem PoC reproduzivel (cada finding precisa ter PoC ou path de exploit citado)
