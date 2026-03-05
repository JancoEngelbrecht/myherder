const Joi = require('joi')
const { ISO_DATE_RE } = require('./constants')

const PREG_CHECK_METHODS = ['manual', 'ultrasound', 'blood_test']

// Status transitions triggered by certain event types
const STATUS_TRANSITIONS = {
  preg_check_positive: 'pregnant',
  calving: 'active',
  preg_check_negative: 'active',
  abortion: 'active',
}

// Fixed workflow event types — not configurable
const VALID_EVENT_TYPES = [
  'heat_observed', 'ai_insemination', 'bull_service',
  'preg_check_positive', 'preg_check_negative',
  'calving', 'abortion', 'dry_off',
]

const createSchema = Joi.object({
  cow_id: Joi.string().uuid().required(),
  event_type: Joi.string().required(),
  event_date: Joi.string().isoDate().required(),
  sire_id: Joi.string().uuid().allow(null, '').default(null),
  semen_id: Joi.string().max(100).allow(null, '').default(null),
  inseminator: Joi.string().max(100).allow(null, '').default(null),
  heat_signs: Joi.array().items(Joi.string().max(100)).max(20).allow(null).default(null),
  preg_check_method: Joi.string().valid(...PREG_CHECK_METHODS).allow(null).default(null),
  calving_details: Joi.object({
    calf_sex: Joi.string().valid('male', 'female').allow(null),
    calf_tag_number: Joi.string().max(50).allow(null, ''),
    calf_weight: Joi.number().min(0).max(999).allow(null),
    complications: Joi.string().max(2000).allow(null, ''),
  }).allow(null).default(null),
  cost: Joi.number().precision(2).min(0).allow(null).default(null),
  notes: Joi.string().max(2000).allow(null, '').default(null),
  expected_calving: Joi.string().isoDate().allow(null, '').default(null),
  expected_dry_off: Joi.string().isoDate().allow(null, '').default(null),
})

const updateSchema = Joi.object({
  event_type: Joi.string().optional(),
  event_date: Joi.string().isoDate().optional(),
  sire_id: Joi.string().uuid().allow(null, '').optional(),
  semen_id: Joi.string().max(100).allow(null, '').optional(),
  inseminator: Joi.string().max(100).allow(null, '').optional(),
  preg_check_method: Joi.string().valid(...PREG_CHECK_METHODS).allow(null).optional(),
  calving_details: Joi.object({
    calf_sex: Joi.string().valid('male', 'female').allow(null),
    calf_tag_number: Joi.string().max(50).allow(null, ''),
    calf_weight: Joi.number().min(0).max(999).allow(null),
    complications: Joi.string().max(2000).allow(null, ''),
  }).allow(null).optional(),
  cost: Joi.number().precision(2).min(0).allow(null).optional(),
  notes: Joi.string().max(2000).allow(null, '').optional(),
  expected_calving: Joi.string().isoDate().allow(null, '').optional(),
  expected_dry_off: Joi.string().isoDate().allow(null, '').optional(),
})

const breedingQuerySchema = Joi.object({
  cow_id: Joi.string().uuid(),
  event_type: Joi.string().max(200),
  cow_status: Joi.string().valid('active', 'pregnant', 'dry'),
  date_from: Joi.string().pattern(ISO_DATE_RE),
  date_to: Joi.string().pattern(ISO_DATE_RE),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
})

module.exports = {
  STATUS_TRANSITIONS,
  VALID_EVENT_TYPES,
  createSchema,
  updateSchema,
  breedingQuerySchema,
}
