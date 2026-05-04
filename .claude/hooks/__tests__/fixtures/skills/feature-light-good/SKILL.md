---
name: feature-light
description: Test fixture with full contract.
disable-model-invocation: true
allowed-tools: [Task, Read, Grep, Glob, AskUserQuestion]
sequence: [1, 2, 3, 4]
sequence_lock: true
gates_at: [3]
sentinel_checkpoints: [pre_3]
stop_rule_max_failures: 2
---

# Test fixture body
