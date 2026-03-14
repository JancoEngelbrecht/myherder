/**
 * Demo Farm Seed Script
 *
 * Creates a complete demo farm ("Demo" / code DEMO) with ~100 Ayrshire cows
 * and 12 months of realistic dairy farm data (milk records, health issues,
 * treatments, breeding events).
 *
 * SAFETY:
 * - Idempotent: exits if DEMO farm already exists
 * - Insert-only: zero DELETE/UPDATE statements (except milk discard flags)
 * - Full transaction: all-or-nothing
 * - Farm-scoped: everything tied to the DEMO farm_id
 *
 * Usage:
 *   node server/seeds/demo_farm_seed.js                  # dev (SQLite)
 *   NODE_ENV=production node server/seeds/demo_farm_seed.js  # production (MySQL)
 */

require('dotenv').config()
const { randomUUID } = require('crypto')
const bcrypt = require('bcryptjs')

const env = process.env.NODE_ENV || 'development'
const knexConfig = require('../../knexfile')[env]
const knex = require('knex')(knexConfig)

// ── Constants ────────────────────────────────────────────────────────────────

const DEMO_FARM_ID = randomUUID()
const AYRSHIRE_BREED_TYPE_ID = randomUUID()

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
const START_DATE = new Date(TODAY)
START_DATE.setFullYear(START_DATE.getFullYear() - 1) // 12 months back

// Ayrshire breed timings
const AYRSHIRE = {
  heat_cycle_days: 21,
  gestation_days: 279,
  preg_check_days: 35,
  voluntary_waiting_days: 45,
  dry_off_days: 60,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoDatetime(d) {
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${isoDate(d)} ${h}:${min}:${s}`
}

function rand(min, max) { return Math.random() * (max - min) + min }
function randInt(min, max) { return Math.floor(rand(min, max + 1)) }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function jitter(base, pct) { return base * (1 + (Math.random() - 0.5) * 2 * pct) }

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// South African seasonal milk factor
function seasonalMilkFactor(month) {
  //                  Jan   Feb   Mar   Apr   May   Jun   Jul   Aug   Sep   Oct   Nov   Dec
  const f = [0, 1.10, 1.12, 1.05, 0.95, 0.85, 0.78, 0.75, 0.80, 0.90, 0.98, 1.05, 1.08]
  return f[month] || 1.0
}

function pickSeverity() {
  const r = Math.random()
  if (r < 0.3) return 'low'
  if (r < 0.8) return 'medium'
  return 'high'
}

const TEATS = ['front_left', 'front_right', 'rear_left', 'rear_right']
function randomTeats() {
  const count = Math.random() < 0.6 ? 1 : Math.random() < 0.8 ? 2 : 3
  const shuffled = [...TEATS].sort(() => Math.random() - 0.5)
  return JSON.stringify(shuffled.slice(0, count))
}

// ── Cow name lists (Afrikaans / SA themed) ───────────────────────────────────

const FEMALE_NAMES = [
  'Bessie', 'Daisy', 'Blossom', 'Rosie', 'Bella', 'Sarie', 'Lettie', 'Elsie',
  'Gertie', 'Mielie', 'Bokkie', 'Toffie', 'Kaatjie', 'Rooibes', 'Soetjie',
  'Witblits', 'Boerland', 'Vaalwit', 'Sterretjie', 'Klippie', 'Bloekom',
  'Sannie', 'Nellie', 'Hettie', 'Marietjie', 'Koeitjie', 'Lemoentjie',
  'Vonkel', 'Perske', 'Appelkoos', 'Malva', 'Fynbos', 'Karoo', 'Namaqualand',
  'Protea', 'Rooibos', 'Melktert', 'Koeksisters', 'Tannie', 'Ouma',
  'Springbok', 'Kudu', 'Gemsbok', 'Suikerbos', 'Waterbessie', 'Bergie',
  'Namib', 'Kalahari', 'Limpopo', 'Mpumalanga', 'Overberg', 'Tsitsikamma',
  'Drakensberg', 'Langkloof', 'Swartberg', 'Bainskloof', 'Helderberg',
  'Franschhoek', 'Stellenbosch', 'Paarl', 'Tulbagh', 'Ceres', 'Montagu',
  'Barrydale', 'Swellendam', 'Bredasdorp', 'Hermanus', 'Knysna', 'Mosselbaai',
  'Graaff-Reinet', 'Nieu-Bethesda', 'Matjiesfontein', 'Rietbron', 'Vrystaat',
  'Bloemfontein', 'Ladybrand', 'Clarens', 'Bethlehem', 'Harrismith',
  'Bergville', 'Winterton', 'Howick', 'Nottingham', 'Lidgetton', 'Mooi River',
  'Estcourt', 'Dundee', 'Vryheid', 'Pongola', 'Mkuze', 'Hluhluwe',
  'Eshowe', 'Stanger', 'Ballito', 'Umhlali', 'Tongaat', 'Shongweni',
]

const MALE_NAMES = [
  'Bul', 'Groot Jan', 'Sterk Hendrik',
]

const VET_NAMES = ['Dr. H. Botha', 'Dr. P. van Niekerk', 'Dr. S. Dlamini', 'Dr. M. van der Merwe']

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[demo-seed] Environment: ${env}`)
  console.log(`[demo-seed] Checking for existing DEMO farm...`)

  // Idempotency check
  const existing = await knex('farms').where('code', 'DEMO').first()
  if (existing) {
    console.log('[demo-seed] Demo farm already exists (code=DEMO) — skipping.')
    await knex.destroy()
    process.exit(0) // eslint-disable-line n/no-process-exit
  }

  const isSQLite = (knexConfig.client === 'better-sqlite3')

  console.log('[demo-seed] Creating demo farm with 12 months of data...')

  await knex.transaction(async (trx) => {
    const now = isoDatetime(new Date())

    // ── 1. Farm ────────────────────────────────────────────────────────────
    await trx('farms').insert({
      id: DEMO_FARM_ID,
      name: 'Demo',
      code: 'DEMO',
      slug: 'demo',
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    console.log('[demo-seed] ✓ Farm created')

    // ── 2. Users ───────────────────────────────────────────────────────────
    const adminId = randomUUID()
    const workerId = randomUUID()
    const adminHash = await bcrypt.hash('demo123', 10)
    const workerPinHash = await bcrypt.hash('1234', 10)

    await trx('users').insert([
      {
        id: adminId,
        farm_id: DEMO_FARM_ID,
        username: 'demo',
        password_hash: adminHash,
        full_name: 'Demo Admin',
        role: 'admin',
        permissions: JSON.stringify([]),
        language: 'af',
        is_active: true,
        token_version: 0,
        created_at: now,
        updated_at: now,
      },
      {
        id: workerId,
        farm_id: DEMO_FARM_ID,
        username: 'melker',
        pin_hash: workerPinHash,
        full_name: 'Melker Werker',
        role: 'worker',
        permissions: JSON.stringify(['can_record_milk', 'can_log_issues', 'can_log_treatments', 'can_log_breeding', 'can_view_analytics']),
        language: 'af',
        is_active: true,
        token_version: 0,
        created_at: now,
        updated_at: now,
      },
    ])
    const reporters = [adminId, workerId]
    console.log('[demo-seed] ✓ Users created (demo/demo123, melker/PIN 1234)')

    // ── 3. Breed type (Ayrshire only) ──────────────────────────────────────
    await trx('breed_types').insert({
      id: AYRSHIRE_BREED_TYPE_ID,
      farm_id: DEMO_FARM_ID,
      code: 'ayrshire',
      name: 'Ayrshire',
      heat_cycle_days: AYRSHIRE.heat_cycle_days,
      gestation_days: AYRSHIRE.gestation_days,
      preg_check_days: AYRSHIRE.preg_check_days,
      voluntary_waiting_days: AYRSHIRE.voluntary_waiting_days,
      dry_off_days: AYRSHIRE.dry_off_days,
      calf_max_months: 6,
      heifer_min_months: 15,
      young_bull_min_months: 15,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })
    console.log('[demo-seed] ✓ Breed type (Ayrshire)')

    // ── 4. Issue types ─────────────────────────────────────────────────────
    const issueTypeDefs = [
      { code: 'lameness', name: 'Lameness', emoji: '🦵', requires_teat_selection: false, sort_order: 0 },
      { code: 'mastitis', name: 'Mastitis', emoji: '🍼', requires_teat_selection: true, sort_order: 1 },
      { code: 'respiratory', name: 'Respiratory', emoji: '🫁', requires_teat_selection: false, sort_order: 2 },
      { code: 'digestive', name: 'Digestive', emoji: '🤢', requires_teat_selection: false, sort_order: 3 },
      { code: 'fever', name: 'Fever', emoji: '🌡️', requires_teat_selection: false, sort_order: 4 },
      { code: 'bad_milk', name: 'Bad Milk', emoji: '🥛', requires_teat_selection: true, sort_order: 5 },
      { code: 'eye', name: 'Eye', emoji: '👁️', requires_teat_selection: false, sort_order: 6 },
      { code: 'calving', name: 'Calving', emoji: '🐄', requires_teat_selection: false, sort_order: 7 },
      { code: 'other', name: 'Other', emoji: '❓', requires_teat_selection: false, sort_order: 8 },
    ]
    await trx('issue_type_definitions').insert(
      issueTypeDefs.map((d) => ({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        ...d,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    )
    console.log('[demo-seed] ✓ Issue types (9)')

    // ── 5. Medications ─────────────────────────────────────────────────────
    const medDefs = [
      { name: 'Penicillin G', active_ingredient: 'Benzylpenicillin', withdrawal_milk_hours: 72, withdrawal_meat_days: 10, default_dosage: '5ml', unit: 'ml', notes: 'Broad-spectrum antibiotic. Administer IM.' },
      { name: 'Oxytetracycline 200mg/ml', active_ingredient: 'Oxytetracycline', withdrawal_milk_hours: 96, withdrawal_meat_days: 28, default_dosage: '10ml', unit: 'ml', notes: 'Long-acting. For respiratory and systemic infections.' },
      { name: 'Flunixin Meglumine (Banamine)', active_ingredient: 'Flunixin', withdrawal_milk_hours: 36, withdrawal_meat_days: 4, default_dosage: '2ml', unit: 'ml', notes: 'NSAID. Anti-inflammatory and analgesic.' },
      { name: 'Mastitis Intramammary Tube', active_ingredient: 'Cloxacillin', withdrawal_milk_hours: 96, withdrawal_meat_days: 7, default_dosage: '1 tube', unit: 'tube', notes: 'For mastitis. Infuse directly into affected quarter after milking.' },
      { name: 'Vitamins B-complex', active_ingredient: 'B-vitamins', withdrawal_milk_hours: 0, withdrawal_meat_days: 0, default_dosage: '10ml', unit: 'ml', notes: 'No withdrawal period. General supplementation.' },
    ]
    const medRows = medDefs.map((d) => ({
      id: randomUUID(),
      farm_id: DEMO_FARM_ID,
      ...d,
      withdrawal_milk_days: 0,
      withdrawal_meat_hours: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    }))
    await trx('medications').insert(medRows)
    const medMap = {}
    medRows.forEach((m) => { medMap[m.name] = m })
    console.log('[demo-seed] ✓ Medications (5)')

    // ── 6. Feature flags + settings ────────────────────────────────────────
    await trx('feature_flags').insert(
      ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics'].map((key) => ({
        farm_id: DEMO_FARM_ID,
        key,
        enabled: true,
      }))
    )
    await trx('app_settings').insert([
      { farm_id: DEMO_FARM_ID, key: 'farm_name', value: 'Demo' },
      { farm_id: DEMO_FARM_ID, key: 'default_language', value: 'af' },
    ])
    console.log('[demo-seed] ✓ Feature flags & settings')

    // ── 7. Generate cows ───────────────────────────────────────────────────
    // Distribution: 45 milking, 15 pregnant, 8 dry, 10 unbred heifers,
    //               5 bred heifers, 8 calves, 3 bulls, 4 sold, 2 dead = 100

    const cows = []
    let tagNum = 1

    function makeCow(sex, status, isDry, dobDate, name, opts = {}) {
      const id = randomUUID()
      const tag = `D${String(tagNum++).padStart(3, '0')}`
      const cow = {
        id,
        farm_id: DEMO_FARM_ID,
        tag_number: tag,
        name: name || tag,
        dob: isoDate(dobDate),
        breed: 'Ayrshire',
        sex,
        status,
        sire_id: null,
        dam_id: null,
        notes: null,
        created_by: adminId,
        breed_type_id: AYRSHIRE_BREED_TYPE_ID,
        is_external: 0,
        purpose: sex === 'male' ? 'breeding' : 'dairy',
        life_phase_override: null,
        is_dry: isDry ? 1 : 0,
        status_changed_at: opts.statusChangedAt || null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }
      cows.push(cow)
      return cow
    }

    // Bulls first (needed as FK targets for sire_id)
    const bulls = []
    for (let i = 0; i < 3; i++) {
      const ageMonths = randInt(24, 60)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const cow = makeCow('male', 'active', false, dob, MALE_NAMES[i])
      bulls.push(cow)
    }
    const bullIds = bulls.map((b) => b.id)

    // Insert bulls first so FK references work
    await trx('cows').insert(bulls)

    // Milking cows (45): 2-7 years old, active, not dry
    const milkingCows = []
    for (let i = 0; i < 45; i++) {
      const ageMonths = randInt(24, 84)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const cow = makeCow('female', 'active', false, dob, FEMALE_NAMES[i])
      if (Math.random() < 0.4) cow.sire_id = pick(bullIds)
      milkingCows.push(cow)
    }

    // Pregnant cows (15): confirmed pregnant, various stages
    const pregnantCows = []
    for (let i = 0; i < 15; i++) {
      const ageMonths = randInt(30, 72)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const cow = makeCow('female', 'pregnant', false, dob, FEMALE_NAMES[45 + i])
      if (Math.random() < 0.4) cow.sire_id = pick(bullIds)
      pregnantCows.push(cow)
    }

    // Dry cows (8): late pregnancy, dried off
    const dryCows = []
    for (let i = 0; i < 8; i++) {
      const ageMonths = randInt(36, 72)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const cow = makeCow('female', 'active', true, dob, FEMALE_NAMES[60 + i])
      if (Math.random() < 0.4) cow.sire_id = pick(bullIds)
      dryCows.push(cow)
    }

    // Unbred heifers (10): 15-24 months
    for (let i = 0; i < 10; i++) {
      const ageMonths = randInt(15, 24)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      makeCow('female', 'active', false, dob, FEMALE_NAMES[68 + i])
    }

    // Bred heifers (5): recently inseminated
    const bredHeifers = []
    for (let i = 0; i < 5; i++) {
      const ageMonths = randInt(18, 26)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const cow = makeCow('female', 'active', false, dob, FEMALE_NAMES[78 + i])
      bredHeifers.push(cow)
    }

    // Calves (8): < 6 months
    for (let i = 0; i < 8; i++) {
      const ageMonths = randInt(1, 5)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      makeCow('female', 'active', false, dob, FEMALE_NAMES[83 + i])
    }

    // Sold cows (4): sold in last 12 months
    for (let i = 0; i < 4; i++) {
      const ageMonths = randInt(36, 72)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const soldDate = addDays(TODAY, -randInt(30, 300))
      makeCow('female', 'sold', false, dob, FEMALE_NAMES[91 + i], { statusChangedAt: isoDatetime(soldDate) })
    }

    // Dead cows (2): died in last 12 months
    for (let i = 0; i < 2; i++) {
      const ageMonths = randInt(36, 72)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const deadDate = addDays(TODAY, -randInt(30, 300))
      makeCow('female', 'dead', false, dob, FEMALE_NAMES[95 + i], { statusChangedAt: isoDatetime(deadDate) })
    }

    // Batch insert remaining cows (bulls already inserted)
    const femaleCows = cows.filter((c) => c.sex !== 'male')
    for (let i = 0; i < femaleCows.length; i += 50) {
      await trx.batchInsert('cows', femaleCows.slice(i, i + 50), 50)
    }
    console.log(`[demo-seed] ✓ Cows (${cows.length})`)

    // ── 8. Breeding events ─────────────────────────────────────────────────
    const breedingEvents = []

    // Helper: generate a complete breeding cycle from calving
    function generateCycle(cowId, calvingDate) {
      const events = []
      const gestDays = AYRSHIRE.gestation_days

      // Calving event
      events.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: cowId,
        event_type: 'calving',
        event_date: isoDate(calvingDate),
        sire_id: pick(bullIds),
        calving_details: JSON.stringify({
          calf_sex: Math.random() < 0.5 ? 'male' : 'female',
          calf_alive: Math.random() < 0.92,
        }),
        recorded_by: pick(reporters),
        created_at: isoDatetime(calvingDate),
        updated_at: isoDatetime(calvingDate),
      })

      // Voluntary waiting period → heat
      const vwpDays = randInt(45, 75)
      const heatDate = addDays(calvingDate, vwpDays)
      if (heatDate > TODAY) return { events, nextCalving: null }

      const heatSigns = pick([
        ['standing_heat'],
        ['standing_heat', 'mucus_discharge'],
        ['standing_heat', 'restlessness'],
        ['mucus_discharge', 'vulva_swelling'],
      ])
      events.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: cowId,
        event_type: 'heat_observed',
        event_date: isoDate(heatDate),
        heat_signs: JSON.stringify(heatSigns),
        recorded_by: pick(reporters),
        created_at: isoDatetime(heatDate),
        updated_at: isoDatetime(heatDate),
      })

      // AI insemination
      const aiDate = addDays(heatDate, Math.random() < 0.7 ? 0 : 1)
      if (aiDate > TODAY) return { events, nextCalving: null }

      const sireId = pick(bullIds)
      events.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: cowId,
        event_type: 'ai_insemination',
        event_date: isoDate(aiDate),
        sire_id: sireId,
        inseminator: pick(VET_NAMES),
        cost: randInt(250, 400),
        expected_next_heat: isoDate(addDays(aiDate, AYRSHIRE.heat_cycle_days)),
        expected_preg_check: isoDate(addDays(aiDate, AYRSHIRE.preg_check_days)),
        expected_calving: isoDate(addDays(aiDate, gestDays)),
        expected_dry_off: isoDate(addDays(addDays(aiDate, gestDays), -AYRSHIRE.dry_off_days)),
        recorded_by: pick(reporters),
        created_at: isoDatetime(aiDate),
        updated_at: isoDatetime(aiDate),
      })

      // Conception attempts
      let serviceCount = 1
      let conceived = Math.random() < 0.55
      let lastAiDate = new Date(aiDate)

      while (!conceived && serviceCount < 4) {
        // Preg check negative
        const negDate = addDays(lastAiDate, 35)
        if (negDate > TODAY) return { events, nextCalving: null }
        events.push({
          id: randomUUID(),
          farm_id: DEMO_FARM_ID,
          cow_id: cowId,
          event_type: 'preg_check_negative',
          event_date: isoDate(negDate),
          preg_check_method: pick(['manual', 'ultrasound', 'blood_test']),
          recorded_by: pick(reporters),
          created_at: isoDatetime(negDate),
          updated_at: isoDatetime(negDate),
        })

        // Re-heat → re-AI
        const reHeatDate = addDays(lastAiDate, 21)
        if (reHeatDate > TODAY) return { events, nextCalving: null }
        events.push({
          id: randomUUID(),
          farm_id: DEMO_FARM_ID,
          cow_id: cowId,
          event_type: 'heat_observed',
          event_date: isoDate(reHeatDate),
          heat_signs: JSON.stringify(pick([['standing_heat'], ['standing_heat', 'mucus_discharge']])),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reHeatDate),
          updated_at: isoDatetime(reHeatDate),
        })

        const reAiDate = addDays(reHeatDate, Math.random() < 0.7 ? 0 : 1)
        if (reAiDate > TODAY) return { events, nextCalving: null }
        events.push({
          id: randomUUID(),
          farm_id: DEMO_FARM_ID,
          cow_id: cowId,
          event_type: 'ai_insemination',
          event_date: isoDate(reAiDate),
          sire_id: pick(bullIds),
          inseminator: pick(VET_NAMES),
          cost: randInt(250, 400),
          expected_next_heat: isoDate(addDays(reAiDate, AYRSHIRE.heat_cycle_days)),
          expected_preg_check: isoDate(addDays(reAiDate, AYRSHIRE.preg_check_days)),
          expected_calving: isoDate(addDays(reAiDate, gestDays)),
          expected_dry_off: isoDate(addDays(addDays(reAiDate, gestDays), -AYRSHIRE.dry_off_days)),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reAiDate),
          updated_at: isoDatetime(reAiDate),
        })

        lastAiDate = new Date(reAiDate)
        serviceCount++
        conceived = Math.random() < (serviceCount === 2 ? 0.60 : 0.70)
      }

      if (!conceived) return { events, nextCalving: null }

      // Preg check positive
      const posDate = addDays(lastAiDate, 35)
      if (posDate > TODAY) return { events, nextCalving: null }

      const expectedCalving = addDays(lastAiDate, gestDays)
      events.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: cowId,
        event_type: 'preg_check_positive',
        event_date: isoDate(posDate),
        preg_check_method: pick(['manual', 'ultrasound']),
        expected_calving: isoDate(expectedCalving),
        notes: `Confirmed at 35 days. Service #${serviceCount}.`,
        recorded_by: pick(reporters),
        created_at: isoDatetime(posDate),
        updated_at: isoDatetime(posDate),
      })

      return {
        events,
        nextCalving: expectedCalving <= TODAY ? expectedCalving : null,
      }
    }

    // Generate breeding cycles for milking + pregnant + dry cows
    const breedableCows = [...milkingCows, ...pregnantCows, ...dryCows]
    for (const cow of breedableCows) {
      const cowDob = new Date(cow.dob)
      // First calving at ~24 months
      const firstCalvingAge = randInt(700, 780) // ~23-26 months in days
      const firstCalving = addDays(cowDob, firstCalvingAge)

      // Skip if cow is too young
      if (firstCalving > TODAY) continue

      // Fast-forward to a calving within our window
      let currentCalving = new Date(firstCalving)
      while (currentCalving < START_DATE) {
        currentCalving = addDays(currentCalving, randInt(365, 420))
      }

      // Generate up to 2 cycles
      for (let cycle = 0; cycle < 2; cycle++) {
        if (currentCalving > TODAY) break
        const { events, nextCalving } = generateCycle(cow.id, currentCalving)
        breedingEvents.push(...events)
        if (!nextCalving) break
        currentCalving = nextCalving
      }
    }

    // Bred heifers: heat + AI, awaiting preg check
    for (const heifer of bredHeifers) {
      const aiDate = addDays(TODAY, -randInt(7, 30))
      const heatDate = addDays(aiDate, -1)

      breedingEvents.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: heifer.id,
        event_type: 'heat_observed',
        event_date: isoDate(heatDate),
        heat_signs: JSON.stringify(['standing_heat', 'mucus_discharge']),
        recorded_by: pick(reporters),
        created_at: isoDatetime(heatDate),
        updated_at: isoDatetime(heatDate),
      })
      breedingEvents.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: heifer.id,
        event_type: 'ai_insemination',
        event_date: isoDate(aiDate),
        sire_id: pick(bullIds),
        inseminator: pick(VET_NAMES),
        cost: randInt(250, 400),
        expected_next_heat: isoDate(addDays(aiDate, AYRSHIRE.heat_cycle_days)),
        expected_preg_check: isoDate(addDays(aiDate, AYRSHIRE.preg_check_days)),
        expected_calving: isoDate(addDays(aiDate, AYRSHIRE.gestation_days)),
        expected_dry_off: isoDate(addDays(addDays(aiDate, AYRSHIRE.gestation_days), -AYRSHIRE.dry_off_days)),
        recorded_by: pick(reporters),
        created_at: isoDatetime(aiDate),
        updated_at: isoDatetime(aiDate),
      })
    }

    // Dry cows: add dry_off event
    for (const cow of dryCows) {
      const dryOffDate = addDays(TODAY, -randInt(10, 50))
      breedingEvents.push({
        id: randomUUID(),
        farm_id: DEMO_FARM_ID,
        cow_id: cow.id,
        event_type: 'dry_off',
        event_date: isoDate(dryOffDate),
        notes: 'Dried off for calving preparation',
        recorded_by: pick(reporters),
        created_at: isoDatetime(dryOffDate),
        updated_at: isoDatetime(dryOffDate),
      })
    }

    // Insert breeding events
    if (breedingEvents.length > 0) {
      if (isSQLite) await trx.raw('PRAGMA ignore_check_constraints = ON')
      try {
        for (let i = 0; i < breedingEvents.length; i += 50) {
          await trx.batchInsert('breeding_events', breedingEvents.slice(i, i + 50), 50)
        }
      } finally {
        if (isSQLite) await trx.raw('PRAGMA ignore_check_constraints = OFF')
      }
    }
    console.log(`[demo-seed] ✓ Breeding events (${breedingEvents.length})`)

    // ── 9. Health issues ───────────────────────────────────────────────────
    const issueTypeProbs = [
      { code: 'mastitis',    baseProb: 0.025, seasonal: [0, 0.7, 0.6, 0.8, 1.0, 1.4, 1.6, 1.8, 1.5, 1.0, 0.8, 0.7, 0.7] },
      { code: 'lameness',    baseProb: 0.015, seasonal: [0, 0.6, 0.5, 0.7, 0.9, 1.3, 1.5, 1.4, 1.2, 0.9, 0.7, 0.6, 0.6] },
      { code: 'respiratory', baseProb: 0.010, seasonal: [0, 0.4, 0.4, 0.5, 0.7, 1.2, 1.6, 1.8, 1.4, 0.8, 0.5, 0.4, 0.4] },
      { code: 'digestive',   baseProb: 0.008, seasonal: [0, 0.6, 0.5, 0.7, 0.8, 0.9, 0.8, 0.8, 0.9, 1.5, 1.6, 1.0, 0.7] },
      { code: 'fever',       baseProb: 0.006, seasonal: [0, 0.8, 0.7, 0.8, 0.9, 1.2, 1.4, 1.3, 1.1, 0.9, 0.8, 0.7, 0.8] },
      { code: 'eye',         baseProb: 0.005, seasonal: [0, 1.5, 1.6, 1.3, 0.8, 0.5, 0.4, 0.4, 0.5, 0.8, 1.0, 1.3, 1.5] },
      { code: 'bad_milk',    baseProb: 0.004, seasonal: [0, 0.8, 0.7, 0.8, 1.0, 1.3, 1.5, 1.4, 1.2, 0.9, 0.8, 0.7, 0.8] },
    ]

    // Only generate issues for female cows that are alive
    const issueEligibleCows = cows.filter((c) => c.sex === 'female' && c.status !== 'sold' && c.status !== 'dead')

    const healthIssues = []
    const healthIssueIndex = {} // id -> { ...issue, issueCode, issueDate }

    const weekCursor = new Date(START_DATE)
    while (weekCursor <= TODAY) {
      const month = weekCursor.getMonth() + 1

      for (const cow of issueEligibleCows) {
        for (const it of issueTypeProbs) {
          const prob = it.baseProb * (it.seasonal[month] || 1.0)
          if (Math.random() >= prob) continue

          const dayOffset = randInt(0, 6)
          const issueDate = addDays(weekCursor, dayOffset)
          if (issueDate > TODAY) continue

          const needsTeats = (it.code === 'mastitis' || it.code === 'bad_milk')
          const daysOld = Math.floor((TODAY - issueDate) / 86400000)

          let status = 'resolved'
          let resolvedAt = null
          if (daysOld < 3) {
            status = 'open' // Very recent issues always open
          } else if (daysOld < 10) {
            status = Math.random() < 0.5 ? 'open' : 'treating'
          } else if (daysOld < 21) {
            status = Math.random() < 0.15 ? 'treating' : 'resolved'
          }
          if (status === 'resolved') {
            const resolveDate = addDays(issueDate, randInt(3, 14))
            resolvedAt = isoDatetime(resolveDate > TODAY ? TODAY : resolveDate)
          }

          const issue = {
            id: randomUUID(),
            farm_id: DEMO_FARM_ID,
            cow_id: cow.id,
            reported_by: pick(reporters),
            issue_types: JSON.stringify([it.code]),
            severity: pickSeverity(),
            affected_teats: needsTeats ? randomTeats() : null,
            description: null,
            observed_at: isoDatetime(issueDate),
            status,
            resolved_at: resolvedAt,
            created_at: isoDatetime(issueDate),
            updated_at: isoDatetime(issueDate),
          }

          healthIssues.push(issue)
          healthIssueIndex[issue.id] = { ...issue, issueCode: it.code, issueDate }
        }
      }

      weekCursor.setDate(weekCursor.getDate() + 7)
    }

    for (let i = 0; i < healthIssues.length; i += 50) {
      await trx.batchInsert('health_issues', healthIssues.slice(i, i + 50), 50)
    }
    console.log(`[demo-seed] ✓ Health issues (${healthIssues.length})`)

    // ── 10. Treatments ─────────────────────────────────────────────────────
    const treatmentMedMap = {
      mastitis:    ['Mastitis Intramammary Tube', 'Penicillin G'],
      lameness:    ['Flunixin Meglumine (Banamine)', 'Oxytetracycline 200mg/ml'],
      respiratory: ['Oxytetracycline 200mg/ml', 'Flunixin Meglumine (Banamine)'],
      digestive:   ['Vitamins B-complex'],
      fever:       ['Flunixin Meglumine (Banamine)', 'Penicillin G'],
      eye:         ['Oxytetracycline 200mg/ml'],
      bad_milk:    ['Mastitis Intramammary Tube'],
    }

    const costRanges = {
      'Penicillin G': [25, 60],
      'Oxytetracycline 200mg/ml': [45, 90],
      'Flunixin Meglumine (Banamine)': [80, 150],
      'Mastitis Intramammary Tube': [55, 95],
      'Vitamins B-complex': [15, 35],
    }

    const treatmentNotes = {
      mastitis:    ['Swelling in affected quarter', 'Milk clots observed', 'Repeat treatment after 48h', 'Mild case, responding well'],
      lameness:    ['Hoof trimmed and cleaned', 'Abscess drained', 'Swelling in left rear', 'Stone bruise on sole'],
      respiratory: ['Nasal discharge, laboured breathing', 'Coughing for 3 days', 'Isolated from herd', 'Temperature 40.2°C'],
      digestive:   ['Off feed for 2 days', 'Rumen sounds reduced', 'Possible grain overload'],
      fever:       ['Temperature 40.5°C', 'Lethargic, not eating', 'Responded well to treatment'],
      eye:         ['Pinkeye, left eye cloudy', 'Tearing and swelling', 'Fly irritation likely cause'],
      bad_milk:    ['Abnormal milk consistency', 'Flakes in foremilk', 'CMT positive'],
    }

    const treatments = []
    const treatmentMeds = []
    const cowWithdrawalEnd = {} // cow_id -> Date when milk withdrawal ends

    for (const issue of Object.values(healthIssueIndex)) {
      if (Math.random() > 0.85) continue // 85% get treated

      const meds = treatmentMedMap[issue.issueCode] || ['Vitamins B-complex']
      const numMeds = (meds.length > 1 && Math.random() < 0.3) ? 2 : 1

      for (let m = 0; m < numMeds; m++) {
        const medName = meds[m]
        const med = medMap[medName]
        if (!med) continue

        const treatDate = addDays(issue.issueDate, randInt(0, 2))
        if (treatDate > TODAY) continue

        const [costMin, costMax] = costRanges[medName] || [20, 50]
        const cost = Math.round(rand(costMin, costMax) * 100) / 100
        const isVet = issue.severity === 'high' && Math.random() < 0.6

        let withdrawalEndMilk = null
        let withdrawalEndMeat = null
        if (med.withdrawal_milk_hours > 0) {
          const wm = new Date(treatDate)
          wm.setHours(wm.getHours() + med.withdrawal_milk_hours)
          withdrawalEndMilk = isoDatetime(wm)
          if (!cowWithdrawalEnd[issue.cow_id] || wm > cowWithdrawalEnd[issue.cow_id]) {
            cowWithdrawalEnd[issue.cow_id] = new Date(wm)
          }
        }
        if (med.withdrawal_meat_days > 0) {
          const wt = addDays(treatDate, med.withdrawal_meat_days)
          withdrawalEndMeat = isoDatetime(wt)
        }

        const notePool = treatmentNotes[issue.issueCode] || ['General supportive care']
        const note = Math.random() < 0.6 ? pick(notePool) : null

        const treatmentId = randomUUID()
        treatments.push({
          id: treatmentId,
          farm_id: DEMO_FARM_ID,
          cow_id: issue.cow_id,
          health_issue_id: issue.id,
          medication_id: med.id,
          administered_by: pick(reporters),
          dosage: med.default_dosage || '5ml',
          cost,
          treatment_date: isoDatetime(treatDate),
          withdrawal_end_milk: withdrawalEndMilk,
          withdrawal_end_meat: withdrawalEndMeat,
          is_vet_visit: isVet ? 1 : 0,
          vet_name: isVet ? pick(VET_NAMES) : null,
          notes: note,
          created_at: isoDatetime(treatDate),
          updated_at: isoDatetime(treatDate),
        })
        treatmentMeds.push({
          id: randomUUID(),
          treatment_id: treatmentId,
          medication_id: med.id,
          dosage: med.default_dosage || '5ml',
        })
      }
    }

    for (let i = 0; i < treatments.length; i += 50) {
      await trx.batchInsert('treatments', treatments.slice(i, i + 50), 50)
    }
    for (let i = 0; i < treatmentMeds.length; i += 50) {
      await trx.batchInsert('treatment_medications', treatmentMeds.slice(i, i + 50), 50)
    }
    console.log(`[demo-seed] ✓ Treatments (${treatments.length}, ${treatmentMeds.length} medication links)`)

    // ── 11. Milk records ───────────────────────────────────────────────────
    // Daily records for milking cows, 2 sessions, 12 months
    // Ayrshire base: 10-13 litres/session

    const milkRecords = []
    const cowMilkBase = {}

    // All female, non-calf, non-dry cows that should be milked
    const milkableCows = cows.filter((c) =>
      c.sex === 'female' &&
      !['sold', 'dead'].includes(c.status) &&
      c.is_dry !== 1 &&
      // Exclude calves (< 12 months old)
      new Date(c.dob) < addDays(TODAY, -365)
    )

    for (const cow of milkableCows) {
      cowMilkBase[cow.id] = rand(10, 13)
    }

    const dayCursor = new Date(START_DATE)
    while (dayCursor <= TODAY) {
      const month = dayCursor.getMonth() + 1
      const seasonFactor = seasonalMilkFactor(month)
      const dateStr = isoDate(dayCursor)

      for (const cow of milkableCows) {
        // 1% skip chance (missed milking)
        if (Math.random() < 0.01) continue

        // Sold/dead cows: only generate records up to status change
        if (cow.status_changed_at) {
          const changeDate = cow.status_changed_at.slice(0, 10)
          if (dateStr > changeDate) continue
        }

        const baseLitres = cowMilkBase[cow.id]
        const morningLitres = Math.round(jitter(baseLitres * 0.55 * seasonFactor, 0.15) * 100) / 100
        const afternoonLitres = Math.round(jitter(baseLitres * 0.45 * seasonFactor, 0.15) * 100) / 100

        if (morningLitres > 0.5) {
          milkRecords.push({
            id: randomUUID(),
            farm_id: DEMO_FARM_ID,
            cow_id: cow.id,
            recorded_by: pick(reporters),
            session: 'morning',
            litres: Math.max(0.5, morningLitres),
            recording_date: dateStr,
            milk_discarded: 0,
            discard_reason: null,
            created_at: isoDatetime(dayCursor),
            updated_at: isoDatetime(dayCursor),
          })
        }
        if (afternoonLitres > 0.5) {
          milkRecords.push({
            id: randomUUID(),
            farm_id: DEMO_FARM_ID,
            cow_id: cow.id,
            recorded_by: pick(reporters),
            session: 'afternoon',
            litres: Math.max(0.5, afternoonLitres),
            recording_date: dateStr,
            milk_discarded: 0,
            discard_reason: null,
            created_at: isoDatetime(dayCursor),
            updated_at: isoDatetime(dayCursor),
          })
        }
      }

      dayCursor.setDate(dayCursor.getDate() + 1)
    }

    // Batch insert milk records (large dataset)
    console.log(`[demo-seed]   Inserting ${milkRecords.length.toLocaleString()} milk records...`)
    for (let i = 0; i < milkRecords.length; i += 50) {
      await trx.batchInsert('milk_records', milkRecords.slice(i, i + 50), 50)
      if (i % 5000 === 0 && i > 0) {
        console.log(`[demo-seed]   ... ${i.toLocaleString()} / ${milkRecords.length.toLocaleString()}`)
      }
    }
    console.log(`[demo-seed] ✓ Milk records (${milkRecords.length.toLocaleString()})`)

    // ── 12. Mark milk records during withdrawal periods ────────────────────
    // This is the ONE place we use UPDATE — only on records we just inserted
    // (scoped to DEMO farm_id, so it cannot touch other farms)
    let discardCount = 0
    for (const t of treatments) {
      if (!t.withdrawal_end_milk) continue
      const treatStart = t.treatment_date.slice(0, 10)
      const treatEnd = t.withdrawal_end_milk.slice(0, 10)

      const updated = await trx('milk_records')
        .where('farm_id', DEMO_FARM_ID)
        .where('cow_id', t.cow_id)
        .where('recording_date', '>=', treatStart)
        .where('recording_date', '<=', treatEnd)
        .update({
          milk_discarded: 1,
          discard_reason: 'Withdrawal period — antibiotics',
        })
      discardCount += updated
    }
    if (discardCount > 0) {
      console.log(`[demo-seed] ✓ Marked ${discardCount} milk records as discarded (withdrawal)`)
    }

    // ── Summary ────────────────────────────────────────────────────────────
    console.log('')
    console.log('═══════════════════════════════════════════')
    console.log('  Demo farm seeded successfully!')
    console.log('═══════════════════════════════════════════')
    console.log(`  Farm:      Demo (code: DEMO)`)
    console.log(`  Admin:     demo / demo123`)
    console.log(`  Worker:    melker / PIN 1234 (farm code: DEMO)`)
    console.log(`  Cows:      ${cows.length}`)
    console.log(`  Breeding:  ${breedingEvents.length} events`)
    console.log(`  Health:    ${healthIssues.length} issues`)
    console.log(`  Treatment: ${treatments.length} treatments`)
    console.log(`  Milk:      ${milkRecords.length.toLocaleString()} records`)
    console.log('═══════════════════════════════════════════')
  })
}

main()
  .then(() => {
    console.log('[demo-seed] Done.')
    return knex.destroy()
  })
  .then(() => process.exit(0)) // eslint-disable-line n/no-process-exit
  .catch((err) => {
    console.error('[demo-seed] FAILED:', err)
    knex.destroy().then(() => process.exit(1)) // eslint-disable-line n/no-process-exit
  })
