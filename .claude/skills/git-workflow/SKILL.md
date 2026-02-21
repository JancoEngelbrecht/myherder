---
name: git-workflow
description: Load when working with git — branching, commits, PRs, and merge strategy. Ensures consistent git hygiene across all projects.
---

# Git Workflow

## Branch Strategy

```
main (production-ready)
  └── feature/description    (new features)
  └── fix/description        (bug fixes)
  └── refactor/description   (refactoring)
  └── chore/description      (maintenance, deps, config)
```

- Branch from `main`, merge back to `main`
- Keep branches short-lived (< 1 week ideally)
- Delete branches after merge

## Branch Naming

```
feature/add-user-authentication
fix/null-pointer-in-order-service
refactor/extract-payment-module
chore/update-dependencies
```

- Lowercase, hyphens, no spaces
- Prefix with type
- Brief but descriptive

## Commit Messages

Conventional commits format:

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat` — New feature
- `fix` — Bug fix
- `refactor` — Code change that neither fixes a bug nor adds a feature
- `test` — Adding or fixing tests
- `docs` — Documentation only
- `chore` — Maintenance (deps, config, CI)
- `perf` — Performance improvement

**Rules:**
- Imperative mood: "add" not "added" or "adds"
- Lowercase first word after type
- No period at the end
- Max 72 characters for the subject line
- Body explains *why*, not *what*

**Examples:**
```
feat(auth): add JWT token refresh endpoint
fix(orders): handle null customer in order validation
refactor(api): extract middleware into separate modules
test(users): add edge cases for email validation
chore: update TypeScript to 5.4
```

## Pre-Commit Checklist

Before every commit:
1. Run tests — `npm test` / `pytest` / `dotnet test` (whatever applies)
2. Run linter — ensure no new warnings
3. Check for debug code — `console.log`, `debugger`, `print()` statements
4. Review the diff — `git diff --staged` to catch accidental inclusions
5. Check for secrets — no API keys, passwords, tokens in code

## Pull Request Conventions

- PR title follows commit message format
- Description includes: what changed, why, how to test
- Link to related issue if applicable
- Keep PRs focused — one feature/fix per PR
- Request review before merging
