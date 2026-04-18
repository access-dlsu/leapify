---
description: generate a commit message based on the current git diff
---

1. Run `git diff --cached > change.diff; git status --short` in one shell call
2. Read change.diff, identify primary change type (feat/fix/refactor/etc.), and apply rules from `.agents\rules\conventional-commits-agent-rule.md` — all in a single analysis step
3. Generate and propose commit message: `<type>[!scope]: <imperative summary>` with optional body/BREAKING CHANGE footer
4. Delete change.diff
