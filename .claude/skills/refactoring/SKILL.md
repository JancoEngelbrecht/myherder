---
name: refactoring
description: Load when refactoring code. Provides safe refactoring patterns — extract, rename, simplify — with verification at each step.
---

# Safe Refactoring

## Golden Rule

**Refactoring changes structure, never behavior.** If tests pass before, they must pass after. If no tests exist, write them first.

## Before Starting

1. Ensure tests pass (run the full suite)
2. Commit current state (clean baseline to revert to)
3. Identify the specific smell you're fixing
4. Plan the steps — don't refactor opportunistically

## Common Refactoring Patterns

### Extract Function

When a block of code does something identifiable:

```
// Before
function processOrder(order) {
  // ... 20 lines calculating discount ...
  // ... 10 lines applying tax ...
  // ... 15 lines generating invoice ...
}

// After
function processOrder(order) {
  const discount = calculateDiscount(order)
  const total = applyTax(order.subtotal - discount)
  return generateInvoice(order, total)
}
```

Checklist:
- [ ] New function has a clear name describing WHAT it does
- [ ] All needed variables are passed as parameters
- [ ] No side effects that depend on the calling context
- [ ] Tests still pass

### Extract Component (Vue/React)

When a section of a template is self-contained:

```
// Signals to extract:
// - Template section has its own state/logic
// - Section is reused (or could be)
// - Component exceeds 200 lines
```

Checklist:
- [ ] Props are well-typed and minimal
- [ ] Events are emitted for parent communication (no prop mutation)
- [ ] Component is independently testable

### Rename

When a name doesn't communicate intent:

```
// Before
const d = new Date()
const res = await fetch(url)
function proc(items) { ... }

// After
const createdAt = new Date()
const response = await fetch(url)
function filterActiveItems(items) { ... }
```

Checklist:
- [ ] Updated ALL references (use IDE rename, not find-replace)
- [ ] Updated related test names if applicable
- [ ] No string references (API endpoints, config keys) left outdated

### Simplify Conditionals

```
// Before
if (user !== null && user !== undefined) {
  if (user.isActive) {
    if (user.role === 'admin') {
      return true
    }
  }
}
return false

// After — guard clauses
if (!user?.isActive) return false
return user.role === 'admin'
```

### Replace Magic Numbers/Strings

```
// Before
if (retries > 3) { ... }
if (status === 'PROC_COMPLETE') { ... }

// After
const MAX_RETRIES = 3
const OrderStatus = { COMPLETE: 'PROC_COMPLETE' } as const

if (retries > MAX_RETRIES) { ... }
if (status === OrderStatus.COMPLETE) { ... }
```

### Reduce Function Parameters

```
// Before
function createUser(name, email, role, department, startDate, manager) { ... }

// After
interface CreateUserInput {
  name: string
  email: string
  role: UserRole
  department: string
  startDate: Date
  manager?: string
}
function createUser(input: CreateUserInput) { ... }
```

## Verification After Each Step

After EVERY refactoring step:

1. **Run tests** — they must all pass
2. **Check git diff** — only structural changes, no behavior changes
3. **Run the app** — quick smoke test if applicable
4. **Commit** — small commit per refactoring step, not one giant commit

## When NOT to Refactor

- During a bugfix — fix the bug first, refactor separately
- Without tests — write tests first, then refactor
- When you don't understand the code — read and understand first
- Under time pressure — refactoring done hastily creates more problems
- Speculatively — refactor to solve a real problem, not a hypothetical one

## Code Smells (signals to refactor)

| Smell | Refactoring |
|-------|------------|
| Long function (>30 lines) | Extract Function |
| Long parameter list (>3 params) | Introduce Parameter Object |
| Duplicated code | Extract shared function/component |
| Deeply nested conditionals | Guard clauses, early returns |
| Magic numbers/strings | Extract constants |
| God class/component (>300 lines) | Extract classes/components |
| Feature envy (using another object's data extensively) | Move method to that object |
