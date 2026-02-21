---
name: code-standards
description: Load when writing or reviewing code to follow consistent conventions across all projects. Covers naming, error handling, file structure, and common patterns.
---

# Code Standards

Universal conventions that apply across all projects regardless of language or framework.

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Variables, functions | camelCase | `getUserById`, `isValid` |
| Types, interfaces, classes | PascalCase | `UserProfile`, `HttpClient` |
| Constants | UPPER_SNAKE | `MAX_RETRIES`, `API_BASE_URL` |
| Files (components) | PascalCase | `UserProfile.tsx`, `ApiClient.cs` |
| Files (utilities) | kebab-case | `date-utils.ts`, `string-helpers.py` |
| Directories | kebab-case | `user-management/`, `api-clients/` |
| Database tables/columns | snake_case | `user_profiles`, `created_at` |
| Environment variables | UPPER_SNAKE | `DATABASE_URL`, `API_KEY` |

## Error Handling

- **Never** use empty catch blocks — at minimum log the error with context
- **Never** catch and re-throw without adding information
- Use custom error classes for domain errors (don't throw raw strings)
- Always include context in error messages: what operation, what input, why it failed

```
// BAD
catch (e) {}
catch (e) { throw e; }
throw "something went wrong";

// GOOD
catch (error) {
  logger.error("Failed to fetch user", { userId, error });
  throw new UserFetchError(userId, { cause: error });
}
```

## Functions

- Single responsibility — if you need "and" to describe it, split it
- Max 3 parameters — use an options object beyond that
- Return early for guard clauses instead of deep nesting
- Pure functions where possible — same input → same output, no side effects

## File Structure

- One primary export per file (component, class, or module)
- Keep files under 300 lines — if longer, look for extraction opportunities
- Group by feature, not by type (keep related files together)
- Index files only for public API re-exports, not for barrel files that re-export everything

## Comments

- Don't comment *what* — the code should be readable enough
- Comment *why* — explain non-obvious decisions, workarounds, business rules
- TODO format: `// TODO(your-name): description — tracked in #issue-number`
- Delete commented-out code — that's what git history is for

## Type Safety

- No `any` type — use `unknown` and narrow, or define proper types
- No type assertions (`as Type`) unless you've validated the data
- No `@ts-ignore` or `@ts-expect-error` — fix the type error
- Prefer discriminated unions over optional fields for variant types

## Testing

- Test behavior, not implementation
- One assertion per concept (multiple `expect` calls are fine if they test one thing)
- Test names describe the scenario: `"returns empty array when user has no orders"`
- Don't test framework code — test your logic
