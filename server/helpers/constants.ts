// ── Shared constants and utility helpers ────────────────────────────────────
// Single source of truth for values duplicated across route files.

import type { Schema, ValidationResult } from 'joi'

/** ISO date pattern: YYYY-MM-DD with strict end-of-string anchor */
export const ISO_DATE_RE: RegExp = /^\d{4}-\d{2}-\d{2}$/

/**
 * Derive a URL-safe code slug from a name string.
 * Lowercases, replaces non-alphanumeric runs with underscores, trims
 * leading/trailing underscores, and caps at 50 characters.
 */
export function toCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50)
}

/** Default number of items per page */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum allowed page size */
export const MAX_PAGE_SIZE = 100

/** Maximum length allowed for user-supplied search strings */
export const MAX_SEARCH_LENGTH = 100

export interface PaginationResult {
  page: number
  limit: number
  offset: number
}

export interface PaginationDefaults {
  defaultLimit?: number
}

/**
 * Parse pagination query params into { page, limit, offset }.
 * Clamps page ≥ 1, limit between 1 and MAX_PAGE_SIZE.
 */
export function parsePagination(
  query: Record<string, unknown>,
  defaults: PaginationDefaults = {}
): PaginationResult {
  const defaultLimit = defaults.defaultLimit ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10) || defaultLimit)
  )
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

/** Milliseconds per day */
export const MS_PER_DAY = 1000 * 60 * 60 * 24

/** All valid animal status values */
export const ANIMAL_STATUSES: readonly string[] = [
  'active',
  'dry',
  'pregnant',
  'sick',
  'sold',
  'dead',
]

/** Extract a clean error message from a Joi validation error */
export function joiMsg(error: { details: Array<{ message: string }> }): string {
  return error.details[0].message.replace(/['"]/g, '')
}

/** Standard Joi options for request body validation */
export const BODY_OPTS = { abortEarly: false, stripUnknown: true }

/** Standard Joi options for query string validation */
export const QUERY_OPTS = { abortEarly: false, allowUnknown: false }

/**
 * Validate request body with standard options (abortEarly: false, stripUnknown: true).
 * Returns { error, value } — same as schema.validate().
 */
export function validateBody<T>(schema: Schema<T>, body: unknown): ValidationResult<T> {
  return schema.validate(body, BODY_OPTS)
}

/**
 * Validate query params with standard options (abortEarly: false, allowUnknown: false).
 * Returns { error, value } — same as schema.validate().
 */
export function validateQuery<T>(schema: Schema<T>, query: unknown): ValidationResult<T> {
  return schema.validate(query, QUERY_OPTS)
}

module.exports = {
  ISO_DATE_RE,
  toCode,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MAX_SEARCH_LENGTH,
  parsePagination,
  MS_PER_DAY,
  ANIMAL_STATUSES,
  joiMsg,
  validateBody,
  validateQuery,
}
