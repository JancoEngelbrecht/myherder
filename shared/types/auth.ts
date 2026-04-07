/**
 * Auth types — JWT payload and Express request augmentation.
 */

import type { Request } from 'express'

/**
 * JWT payload shape — matches what issueFullToken() signs in server/routes/auth.js.
 * All 8 token-issuing endpoints must include these fields.
 */
export interface JwtPayload {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'worker' | 'super_admin'
  permissions: string[]
  language: string
  farm_id: string | null
  token_version: number
  login_type?: 'password' | 'pin'
  species_code?: string
  // Internal temp-token flag (2FA flow only — never issued for full tokens)
  type?: 'temp'
  // JWT standard claims
  iat?: number
  exp?: number
}

/**
 * Express Request with decoded JWT attached by the auth middleware.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload
  farmId?: number
}
