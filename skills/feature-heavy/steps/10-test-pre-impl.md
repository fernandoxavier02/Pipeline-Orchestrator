---
step_number: 10
step_name: "test-pre-impl"
source: "Pulsar/HEAVY_10_TEST_PRE_IMPL.md"
---

---
description: "Feature Heavy: Criar testes completos ANTES de implementar"
allowed-tools: Read, Grep, Glob, Write, Bash
---

# HEAVY 10 — Testes Pre-Implementacao (Feature)

> **Posicao no Pipeline:** Passo 10 — Apos IMPLEMENTATION_PLAN (9), ANTES de EXECUTION (11)
> **Objetivo:** Definir contratos de comportamento via testes ANTES de escrever codigo

---

## ⚠️ Integração TDD v3.0 (VERIFICAR PRIMEIRO)

**ANTES de criar qualquer teste, verificar se o Pre-Tester (agente 2.6) já criou:**

```bash
# Verificar se existem testes do Pre-Tester para esta feature
ls -la functions/src/__tests__/*feature*.test.ts 2>/dev/null
ls -la features/*/__tests__/*.test.ts 2>/dev/null
grep -r "Pre-Tester\|PRE_TESTER_RESULT" functions/src/__tests__/ 2>/dev/null
```

### Se Pre-Tester JÁ criou testes:

1. **NÃO criar novos testes** - usar os existentes
2. **Verificar cobertura**:
   - Contratos de feature cobertos?
   - Contratos de integração cobertos?
   - Contratos de regressão cobertos?
   - Contratos de borda cobertos?
3. **Complementar APENAS se faltar** algo crítico não coberto
4. **Executar os testes**: `npm test -- [arquivos_existentes]`
5. **Confirmar que testes de feature FALHAM** (RED)
6. **Confirmar que testes de regressão PASSAM**

### Se Pre-Tester NÃO criou testes:

Seguir o fluxo completo abaixo.

---

## CONTEXTO FEATURE

- Esta e uma **NOVA FEATURE** - comportamento novo sendo adicionado
- Testes definem o **contrato esperado** antes de qualquer implementacao
- Codigo de producao NAO pode ser alterado nesta etapa
- Principio TDD: RED (teste falha) -> GREEN (implementa) -> REFACTOR

---

## ETAPA 1: ANALISE DE IMPACTO

Baseado no plano de implementacao (passo 9):

### 1.1 Novos Comportamentos

| Funcionalidade | Comportamento Esperado | Prioridade |
|----------------|------------------------|------------|
| [feature 1] | [o que deve fazer] | Alta/Media |
| [feature 2] | [o que deve fazer] | Alta/Media |

### 1.2 Integracoes Existentes

| Sistema Existente | Como Interage | Risco de Regressao |
|-------------------|---------------|--------------------|
| [sistema 1] | [tipo de integracao] | Alto/Medio/Baixo |

---

## ETAPA 2: CONTRATOS DE COMPORTAMENTO

### Contratos da FEATURE (comportamento novo)

```
DADO que [contexto inicial],
QUANDO [usuario realiza acao],
ENTAO [sistema responde com comportamento esperado].
```

### Contratos de INTEGRACAO (sistemas existentes)

```
DADO que [sistema existente em estado X],
QUANDO [nova feature interage],
ENTAO [integracao funciona corretamente].
```

### Contratos de REGRESSAO (nao pode quebrar)

```
DADO que [funcionalidade existente],
QUANDO [usada normalmente],
ENTAO [continua funcionando como antes].
```

### Contratos de BORDA (edge cases)

```
DADO que [condicao limite: sem dados, erro, offline],
QUANDO [acao],
ENTAO [comportamento gracioso/defensivo].
```

**Minimo obrigatorio:**
- 2+ contratos de feature
- 1+ contrato de integracao
- 2+ contratos de regressao
- 2+ contratos de borda

---

## ETAPA 3: CRIAR TESTES

### Estrutura por Layer (Feature-First)

```
features/{feature-name}/
└── __tests__/
    ├── {feature}.unit.test.ts      # Testes unitarios
    ├── {feature}.integration.test.ts # Testes de integracao
    └── {feature}.e2e.test.ts       # Testes end-to-end (se aplicavel)
```

### Template de Teste

```typescript
describe('[FeatureName]', () => {
  describe('Core Functionality', () => {
    /**
     * @garante Comportamento principal da feature
     * @evita Feature incompleta ou incorreta
     * @status DEVE_FALHAR_ANTES_DA_IMPL
     */
    it('should [comportamento principal]', () => {
      // Arrange
      // Act
      // Assert - FALHA ate implementar
    });

    it('should [outro comportamento]', () => {
      // FALHA ate implementar
    });
  });

  describe('Integration', () => {
    /**
     * @garante Integracao com sistema existente
     * @evita Quebrar fluxos existentes
     */
    it('should integrate with [sistema]', () => {
      // test
    });
  });

  describe('Regression', () => {
    /**
     * @garante Funcionalidade existente nao quebra
     * @status DEVE_PASSAR_SEMPRE
     */
    it('should maintain [funcionalidade existente]', () => {
      // PASSA antes e depois da impl
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty state', () => {});
    it('should handle error gracefully', () => {});
    it('should work offline', () => {}); // se aplicavel
  });
});
```

---

## ETAPA 4: VALIDACAO

### Checklist TDD

| Criterio | Resposta |
|----------|----------|
| Testes de feature FALHAM (nada implementado)? | SIM/NAO |
| Testes de regressao PASSAM (sistema atual ok)? | SIM/NAO |
| Contratos cobrem todos os casos do plano? | SIM/NAO |
| Um PO entenderia os testes sem ler codigo? | SIM/NAO |
| Testes sao isolados e determinísticos? | SIM/NAO |

---

## ETAPA 5: OUTPUT

```markdown
## Testes Pre-Implementacao (Feature Heavy)

### Arquivos Criados
- [ ] `features/{name}/__tests__/{name}.unit.test.ts`
- [ ] `features/{name}/__tests__/{name}.integration.test.ts`

### Contratos Protegidos

| Tipo | Contrato | Teste | Status Atual |
|------|----------|-------|--------------|
| FEATURE | DADO... ENTAO... | it('should...') | FALHA (esperado) |
| INTEGRACAO | DADO... ENTAO... | it('should integrate...') | FALHA (esperado) |
| REGRESSAO | DADO... ENTAO... | it('should maintain...') | PASSA |
| BORDA | DADO... ENTAO... | it('should handle...') | PASSA/FALHA |

### Metricas
- Testes de feature: X (RED - devem falhar)
- Testes de integracao: X
- Testes de regressao: X (devem passar)
- Testes de borda: X

### Proximo Passo
Executar HEAVY_11_10_EXECUTION_MINIMAL_DIFF.
Objetivo: fazer TODOS os testes passarem (GREEN).
```

---

**Somente apos aprovacao desta etapa, prosseguir para HEAVY_11_10_EXECUTION_MINIMAL_DIFF.**

---

**Próximo step:** 11
