---
name: testing
description: Load when writing or reviewing tests. Covers test structure, naming, patterns, and what to test vs what to skip.
---

# Testing Standards

## Test Structure

Follow Arrange-Act-Assert (AAA) pattern:

```
// Arrange — set up test data and dependencies
const user = createTestUser({ role: "admin" });
const service = new UserService(mockRepo);

// Act — execute the thing being tested
const result = await service.deactivate(user.id);

// Assert — verify the outcome
expect(result.active).toBe(false);
expect(mockRepo.save).toHaveBeenCalledWith(user.id, { active: false });
```

Separate each section with a blank line for readability.

## Test Naming

Describe the scenario, not the implementation:

```
// GOOD — describes behavior
"returns empty array when user has no orders"
"throws ValidationError when email format is invalid"
"sends notification email after successful registration"

// BAD — describes implementation
"test getUserOrders"
"should call validate"
"email test"
```

## What to Test

### Always Test
- Business logic and domain rules
- Input validation and edge cases
- Error handling paths
- Integration points (API calls, database queries)
- State transitions

### Skip Testing
- Framework code (React rendering, Express routing)
- Simple getters/setters with no logic
- Third-party library internals
- Exact CSS/HTML output (use visual testing for that)

## Test Patterns

### Mock External Dependencies
```
// Mock the HTTP client, not the business logic
const mockHttp = { get: vi.fn().mockResolvedValue({ data: testUser }) };
const service = new UserService(mockHttp);
```

### Test Edge Cases
- Empty inputs (null, undefined, empty string, empty array)
- Boundary values (0, -1, MAX_INT, empty string vs whitespace)
- Concurrent access (if applicable)
- Large inputs (performance)
- Unicode and special characters

### Test Error Paths
- Invalid input → appropriate error type and message
- External service down → graceful degradation or retry
- Timeout → proper cleanup and error propagation
- Permission denied → correct status code and message

## Anti-Patterns to Avoid

- **Test interdependence** — each test must work in isolation
- **Testing implementation** — don't assert on internal method calls unless that IS the behavior
- **Flaky tests** — no random data, no timing-dependent assertions, no shared state
- **Giant test files** — split by feature/behavior, not one file per class
- **Copy-paste tests** — extract shared setup into helpers/fixtures
- **Assertions in loops** — if the loop is empty, the test passes vacuously

## Coverage Guidance

- Aim for high coverage on business logic (80%+)
- Don't chase 100% — diminishing returns on boilerplate/config code
- Coverage is a signal, not a target — 100% coverage with bad assertions is worthless
