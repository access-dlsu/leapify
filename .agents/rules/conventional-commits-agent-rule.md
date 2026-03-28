---
trigger: always_on
---

# Conventional Commits

Reference: https://www.conventionalcommits.org/en/v1.0.0/#summary

## Commit Message Structure

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

---

## Rules

### Type (REQUIRED)

- MUST be a noun prefix followed by a colon and space.
- MUST be one of the following (or a team-defined extension):

| Type       | Purpose                                          | SemVer Impact |
| ---------- | ------------------------------------------------ | ------------- |
| `feat`     | Introduces a new feature                         | MINOR         |
| `fix`      | Patches a bug                                    | PATCH         |
| `build`    | Changes to build system or external dependencies | —             |
| `chore`    | Routine tasks, no production code change         | —             |
| `ci`       | CI/CD configuration changes                      | —             |
| `docs`     | Documentation only                               | —             |
| `style`    | Formatting, whitespace, no logic change          | —             |
| `refactor` | Code restructure, no feature/fix                 | —             |
| `perf`     | Performance improvement                          | —             |
| `test`     | Adding or correcting tests                       | —             |
| `revert`   | Reverting a previous commit                      | —             |

- Casing MAY be any case, but MUST be consistent across the project.
- Types other than `feat` and `fix` have no implicit SemVer effect unless they include a `BREAKING CHANGE`.

---

### Scope (OPTIONAL)

- MAY follow the type inside parentheses.
- MUST be a noun describing the section of the codebase affected.
- Examples: `feat(parser):`, `fix(api):`, `docs(readme):`

---

### Breaking Changes (MAJOR)

Breaking changes MUST be indicated using one or both of:

1. **`!` before the colon** in the type/scope prefix:

   ```
   feat!: drop support for Node 6
   feat(api)!: remove deprecated endpoint
   ```

2. **`BREAKING CHANGE:` footer** (MUST be uppercase):
   ```
   BREAKING CHANGE: environment variables now take precedence over config files
   ```

- `BREAKING CHANGE` and `BREAKING-CHANGE` are synonymous as footer tokens.
- When `!` is used, the `BREAKING CHANGE:` footer MAY be omitted; the description serves as the explanation.
- Both `!` and footer MAY be used together for extra clarity.

---

### Description (REQUIRED)

- MUST immediately follow the `type/scope: ` prefix.
- MUST be a short, imperative-mood summary of the change.
- MUST NOT end with a period.
- Example: `fix: prevent racing of requests`

---

### Body (OPTIONAL)

- MAY be provided for additional context.
- MUST begin one blank line after the description.
- Free-form; MAY consist of multiple newline-separated paragraphs.

---

### Footer(s) (OPTIONAL)

- MAY be provided one blank line after the body.
- Each footer MUST follow the format:
  ```
  Token: value
  Token #value
  ```
- Token MUST use `-` in place of whitespace (e.g., `Reviewed-by`, `Co-authored-by`).
- Exception: `BREAKING CHANGE` MAY include a space.
- Footer value MAY span multiple lines; parsing terminates at the next valid `token: ` or `token #` pair.
- Common footers:
  ```
  Reviewed-by: Z
  Co-authored-by: Name <email>
  Refs: #123
  Closes: #456
  BREAKING CHANGE: <description>
  ```

---

## Examples

### Minimal

```
docs: correct spelling of CHANGELOG
```

### With scope

```
feat(lang): add Polish language
```

### Breaking change via `!`

```
feat!: send an email to the customer when a product is shipped
```

### Breaking change via footer

```
feat: allow provided config object to extend other configs

BREAKING CHANGE: `extends` key in config file is now used for extending other config files
```

### Breaking change via both

```
feat!: drop support for Node 6

BREAKING CHANGE: use JavaScript features not available in Node 6.
```

### Full commit with body and multiple footers

```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.

Reviewed-by: Z
Refs: #123
```

### Revert

```
revert: let us never again speak of the noodle incident

Refs: 676104e, a215868
```

---

## SemVer Mapping

| Commit contains          | Version bump |
| ------------------------ | ------------ |
| `BREAKING CHANGE` or `!` | MAJOR        |
| `feat`                   | MINOR        |
| `fix`                    | PATCH        |
| All other types          | No bump      |

---

## Agent Enforcement Checklist

Before accepting or generating a commit message, verify:

- [ ] Type is present and valid
- [ ] Type is followed by `: ` (colon + space)
- [ ] Description is present, non-empty, and does not end with a period
- [ ] If scope is used, it is wrapped in `()` and is a single noun
- [ ] If body is present, there is exactly one blank line between description and body
- [ ] If footers are present, there is exactly one blank line between body (or description) and footers
- [ ] Footer tokens use `-` instead of spaces (except `BREAKING CHANGE`)
- [ ] Breaking changes are signaled via `!`, `BREAKING CHANGE:` footer, or both
- [ ] `BREAKING CHANGE` token is uppercase
- [ ] No unrecognized or misspelled types (e.g., `feet` instead of `feat`)

---

## Anti-Patterns to Reject

| Bad                           | Why                                           | Fix                           |
| ----------------------------- | --------------------------------------------- | ----------------------------- |
| `Fix bug`                     | Missing type prefix                           | `fix: fix bug`                |
| `feat: Add new feature.`      | Description ends with a period                | `feat: add new feature`       |
| `feat : add thing`            | Space before colon                            | `feat: add thing`             |
| `FEAT: add thing`             | Inconsistent casing (if lowercase used)       | `feat: add thing`             |
| `feet: add thing`             | Misspelled type                               | `feat: add thing`             |
| `fix(My Module): patch`       | Scope has spaces, should use `-` or camelCase | `fix(my-module): patch`       |
| `breaking change: remove api` | `BREAKING CHANGE` footer must be uppercase    | `BREAKING CHANGE: remove api` |

---

## Notes

- If a commit conforms to **multiple types**, split it into multiple commits.
- During **initial development**, apply the spec from day one.
- In **squash-merge workflows**, lead maintainers may rewrite commit messages at merge time — casual contributors do not need to follow the spec strictly.
- Tooling (changelog generators, version bumpers) is case-insensitive for types, with the sole exception of `BREAKING CHANGE` which MUST be uppercase.