---
name: express-patterns
description: Load when building Express APIs. Covers route structure, middleware, error handling, and Knex database patterns.
---

# Express + Knex Patterns

## Route Structure

```typescript
// routes/users.ts
import { Router } from 'express'
import { validateBody } from '../middleware/validate'
import { userSchema } from '../schemas/user'
import * as userService from '../services/userService'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const users = await userService.getAll()
    res.json(users)
  } catch (error) {
    next(error)
  }
})

router.post('/', validateBody(userSchema), async (req, res, next) => {
  try {
    const user = await userService.create(req.body)
    res.status(201).json(user)
  } catch (error) {
    next(error)
  }
})

export default router
```

## Middleware Pattern

```typescript
// middleware/validate.ts
import { RequestHandler } from 'express'
import { ZodSchema } from 'zod'

export function validateBody(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      })
    }
    req.body = result.data
    next()
  }
}
```

## Error Handling

```typescript
// middleware/errorHandler.ts
import { ErrorRequestHandler } from 'express'

class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'AppError'
  }
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    })
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
}
```

Rules:
- Always wrap async route handlers in try/catch with `next(error)`
- Use a global error handler as the last middleware
- Custom error classes for domain errors (NotFoundError, ValidationError, etc.)
- Never send stack traces to clients in production

## Knex Patterns

```typescript
// services/userService.ts
import { db } from '../database'

export async function getById(id: number) {
  const user = await db('users').where({ id }).first()
  if (!user) throw new NotFoundError(`User ${id} not found`)
  return user
}

export async function create(data: CreateUserInput) {
  const [user] = await db('users').insert(data).returning('*')
  return user
}

// Transaction example
export async function transferOrder(orderId: number, newOwnerId: number) {
  return db.transaction(async (trx) => {
    await trx('orders').where({ id: orderId }).update({ owner_id: newOwnerId })
    await trx('audit_log').insert({
      action: 'transfer',
      entity: 'order',
      entity_id: orderId,
      new_owner_id: newOwnerId,
    })
  })
}
```

Rules:
- Use transactions for multi-table writes
- Always handle "not found" — don't return undefined silently
- Use `.first()` for single-record queries
- Migrations: one change per migration, always write rollback (`down`)
- Never build raw SQL strings — use Knex query builder or `.raw()` with bindings

## Service Layer

Keep routes thin, services thick:

```
Route:     Parse request -> Call service -> Send response
Service:   Business logic -> Database calls -> Return data
Database:  Knex queries only
```

- Routes should not contain business logic
- Services should not know about req/res objects
- Database layer should not throw domain errors (services do that)
