---
description: generate a commit message based on the current git diff
---

1. Check current git status for staged changes
   // turbo
2. Get the staged diff using `git diff --cached`
3. Identify the primary change (feat, fix, refactor, etc.) by analyzing the diff
4. Refer to the rules in `.agent\rules\conventional-commits-agent-rule.md`
5. Generate a commit message following the <type>[optional scope]: <description> structure:
   - Use an imperative-mood summary
   - Do NOT end the description with a period
   - Provide a body if the change is complex
   - Mark breaking changes with `!` or `BREAKING CHANGE:` footer
6. Propose the commit message to the user
