import Joi, { ObjectSchema } from 'joi'
const { ISO_DATE_RE } = require('./constants')

export const PREG_CHECK_METHODS = ['manual', 'ultrasound', 'blood_test'] as const
export type PregCheckMethod = (typeof PREG_CHECK_METHODS)[number]

// Status transitions triggered by certain event types
export const STATUS_TRANSITIONS: Record<string, string> = {
  preg_check_positive: 'pregnant',
  calving: 'active',
  lambing: 'active',
  preg_check_negative: 'active',
  abortion: 'active',
  dry_off: 'dry',
}

// Fixed workflow event types — not configurable
// Includes both cattle-specific (bull_service, calving, dry_off) and
// sheep-specific (ram_service, lambing) types for universal livestock support.
export const VALID_EVENT_TYPES = [
  'heat_observed',
  'ai_insemination',
  'bull_service',
  'ram_service',
  'preg_check_positive',
  'preg_check_negative',
  'calving',
  'lambing',
  'abortion',
  'dry_off',
] as const
export type ValidEventType = (typeof VALID_EVENT_TYPES)[number]

// Birth event types that produce offspring
export const BIRTH_EVENT_TYPES = ['calving', 'lambing'] as const

// Service/insemination event types (natural mating)
export const SERVICE_EVENT_TYPES = ['bull_service', 'ram_service'] as const

export const EVENT_TYPE_LABELS: Record<string, string> = {
  heat_observed: 'Heat Observed',
  ai_insemination: 'AI Insemination',
  bull_service: 'Bull Service',
  ram_service: 'Ram Service',
  preg_check_positive: 'Preg Check (+)',
  preg_check_negative: 'Preg Check (–)',
  calving: 'Calving',
  lambing: 'Lambing',
  abortion: 'Abortion',
  dry_off: 'Dry Off',
}

export const createSchema: ObjectSchema = Joi.object({
  animal_id: Joi.string().uuid().required(),
  event_type: Joi.string()
    .valid(...VALID_EVENT_TYPES)
    .required(),
  event_date: Joi.string().isoDate().required(),
  sire_id: Joi.string().uuid().allow(null, '').default(null),
  semen_id: Joi.string().max(100).allow(null, '').default(null),
  inseminator: Joi.string().max(100).allow(null, '').default(null),
  heat_signs: Joi.array().items(Joi.string().max(100)).max(20).allow(null).default(null),
  preg_check_method: Joi.string()
    .valid(...PREG_CHECK_METHODS)
    .allow(null)
    .default(null),
  calving_details: Joi.object({
    complications: Joi.string().max(2000).allow(null, ''),
  })
    .allow(null)
    .default(null),
  offspring_count: Joi.number().integer().min(0).max(10).default(1),
  cost: Joi.number().precision(2).min(0).allow(null).default(null),
  notes: Joi.string().max(2000).allow(null, '').default(null),
  expected_calving: Joi.string().isoDate().allow(null, '').default(null),
  expected_dry_off: Joi.string().isoDate().allow(null, '').default(null),
})

export const updateSchema: ObjectSchema = Joi.object({
  event_type: Joi.string()
    .valid(...VALID_EVENT_TYPES)
    .optional(),
  event_date: Joi.string().isoDate().optional(),
  sire_id: Joi.string().uuid().allow(null, '').optional(),
  semen_id: Joi.string().max(100).allow(null, '').optional(),
  inseminator: Joi.string().max(100).allow(null, '').optional(),
  preg_check_method: Joi.string()
    .valid(...PREG_CHECK_METHODS)
    .allow(null)
    .optional(),
  calving_details: Joi.object({
    complications: Joi.string().max(2000).allow(null, ''),
  })
    .allow(null)
    .optional(),
  offspring_count: Joi.number().integer().min(0).max(10).optional(),
  cost: Joi.number().precision(2).min(0).allow(null).optional(),
  notes: Joi.string().max(2000).allow(null, '').optional(),
  expected_calving: Joi.string().isoDate().allow(null, '').optional(),
  expected_dry_off: Joi.string().isoDate().allow(null, '').optional(),
})

export const breedingQuerySchema: ObjectSchema = Joi.object({
  animal_id: Joi.string().uuid(),
  // Legacy param - accept cow_id for backward compat
  cow_id: Joi.string().uuid(),
  event_type: Joi.string().max(200),
  animal_status: Joi.string().valid('active', 'pregnant', 'dry'),
  // Legacy param - accept cow_status for backward compat
  cow_status: Joi.string().valid('active', 'pregnant', 'dry'),
  date_from: Joi.string().pattern(ISO_DATE_RE),
  date_to: Joi.string().pattern(ISO_DATE_RE),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

module.exports = {
  STATUS_TRANSITIONS,
  VALID_EVENT_TYPES,
  BIRTH_EVENT_TYPES,
  SERVICE_EVENT_TYPES,
  EVENT_TYPE_LABELS,
  createSchema,
  updateSchema,
  breedingQuerySchema,
}
