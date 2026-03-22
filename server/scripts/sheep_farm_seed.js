/**
 * Sheep Farm Seed Script
 *
 * Creates a demo sheep farm ("Sheep Demo" / code SHEEP) with ~50 Dorper sheep
 * and 12 months of realistic meat sheep data (health issues, treatments,
 * breeding events). No milk records (sheep farms have milkRecording disabled).
 *
 * SAFETY:
 * - Idempotent: exits if SHEEP farm already exists
 * - Insert-only: zero DELETE/UPDATE statements
 * - Full transaction: all-or-nothing
 * - Farm-scoped: everything tied to the SHEEP farm_id
 *
 * Usage:
 *   node server/scripts/sheep_farm_seed.js                  # dev (SQLite)
 *   NODE_ENV=production node server/scripts/sheep_farm_seed.js  # production (MySQL)
 */

require('dotenv').config()
const { randomUUID } = require('crypto')
const bcrypt = require('bcryptjs')

const env = process.env.NODE_ENV || 'development'
const knexConfig = require('../../knexfile')[env]
const knex = require('knex')(knexConfig)

// ── Constants ────────────────────────────────────────────────────────────────

const SHEEP_FARM_ID = randomUUID()
const DORPER_BREED_TYPE_ID = randomUUID()
const SHEEP_SPECIES_ID = '00000000-0000-4000-a000-000000000002' // fixed UUID from migration 035

const TODAY = new Date()
TODAY.setHours(0, 0, 0, 0)
const START_DATE = new Date(TODAY)
START_DATE.setFullYear(START_DATE.getFullYear() - 1) // 12 months back

// Dorper breed timings
const DORPER = {
  heat_cycle_days: 17,
  gestation_days: 150,
  preg_check_days: 30,
  voluntary_waiting_days: 60,
  dry_off_days: 0, // no milking
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

function rand(min, max) {
  return Math.random() * (max - min) + min
}
function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function pickSeverity() {
  const r = Math.random()
  if (r < 0.3) return 'low'
  if (r < 0.8) return 'medium'
  return 'high'
}

// ── Sheep name lists (Afrikaans / SA themed) ─────────────────────────────────

const EWE_NAMES = [
  'Wollie', 'Skaapie', 'Witpens', 'Rooikop', 'Swartjie',
  'Blommie', 'Sterretjie', 'Vlekkie', 'Grysie', 'Hartjie',
  'Mielie', 'Soetjie', 'Bokkie', 'Lettie', 'Sannie',
  'Liewe', 'Nana', 'Hester', 'Elsie', 'Toffie',
  'Karoobos', 'Fynbos', 'Bossie', 'Doringbos', 'Vetplant',
  'Protea', 'Veldblom', 'Suurlemoen', 'Appelkoos', 'Perske',
  'Heuning', 'Koringaar', 'Lusern', 'Klawer', 'Gousblom',
  'Magriet', 'Annatjie', 'Sussie', 'Ouma', 'Tannie',
]

const RAM_NAMES = ['Groot Ram', 'Sterk Jan', 'Dik Hendrik']

const VET_NAMES = ['Dr. H. Botha', 'Dr. P. van Niekerk', 'Dr. S. Dlamini']

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sheep-seed] Environment: ${env}`)
  console.log(`[sheep-seed] Checking for existing SHEEP farm...`)

  // Idempotency check
  const existing = await knex('farms').where('code', 'SKAAP').first()
  if (existing) {
    console.log('[sheep-seed] Sheep farm already exists (code=SHEEP) — skipping.')
    await knex.destroy()
    process.exit(0) // eslint-disable-line n/no-process-exit
  }

  // Verify species row exists
  const sheepSpecies = await knex('species').where('id', SHEEP_SPECIES_ID).first()
  if (!sheepSpecies) {
    console.error('[sheep-seed] FAILED: Sheep species row not found. Run migrations first (npm run migrate).')
    await knex.destroy()
    process.exit(1) // eslint-disable-line n/no-process-exit
  }

  const isSQLite = knexConfig.client === 'better-sqlite3'

  console.log('[sheep-seed] Creating sheep farm with 12 months of data...')

  await knex.transaction(async (trx) => {
    const now = isoDatetime(new Date())

    // ── 1. Farm ────────────────────────────────────────────────────────────
    await trx('farms').insert({
      id: SHEEP_FARM_ID,
      name: 'Sheep Demo',
      code: 'SKAAP',
      slug: 'sheep-demo',
      is_active: true,
      created_at: now,
      updated_at: now,
    })

    // Link farm to sheep species
    await trx('farm_species').insert({
      farm_id: SHEEP_FARM_ID,
      species_id: SHEEP_SPECIES_ID,
    })
    console.log('[sheep-seed] ✓ Farm created + linked to sheep species')

    // ── 2. Users ───────────────────────────────────────────────────────────
    const adminId = randomUUID()
    const workerId = randomUUID()
    const adminHash = await bcrypt.hash('admin123', 10)
    const workerPinHash = await bcrypt.hash('1234', 10)

    await trx('users').insert([
      {
        id: adminId,
        farm_id: SHEEP_FARM_ID,
        username: 'admin',
        password_hash: adminHash,
        full_name: 'Skaap Admin',
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
        farm_id: SHEEP_FARM_ID,
        username: 'sipho',
        pin_hash: workerPinHash,
        full_name: 'Sipho Werker',
        role: 'worker',
        permissions: JSON.stringify([
          'can_log_issues',
          'can_log_treatments',
          'can_log_breeding',
          'can_view_analytics',
        ]),
        language: 'af',
        is_active: true,
        token_version: 0,
        created_at: now,
        updated_at: now,
      },
    ])
    const reporters = [adminId, workerId]
    console.log('[sheep-seed] ✓ Users created (admin/admin123, herder/PIN 1234)')

    // ── 3. Breed type (Dorper) ───────────────────────────────────────────
    await trx('breed_types').insert({
      id: DORPER_BREED_TYPE_ID,
      farm_id: SHEEP_FARM_ID,
      species_id: SHEEP_SPECIES_ID,
      code: 'dorper',
      name: 'Dorper',
      heat_cycle_days: DORPER.heat_cycle_days,
      gestation_days: DORPER.gestation_days,
      preg_check_days: DORPER.preg_check_days,
      voluntary_waiting_days: DORPER.voluntary_waiting_days,
      dry_off_days: DORPER.dry_off_days,
      calf_max_months: 6,
      heifer_min_months: 8,
      young_bull_min_months: 8,
      is_active: true,
      sort_order: 0,
      created_at: now,
      updated_at: now,
    })
    console.log('[sheep-seed] ✓ Breed type (Dorper)')

    // ── 4. Issue types (sheep-specific) ──────────────────────────────────
    const issueTypeDefs = [
      { code: 'pulpy_kidney', name: 'Pulpy Kidney', emoji: '💉', requires_teat_selection: false, sort_order: 0 },
      { code: 'blue_tongue', name: 'Blue Tongue', emoji: '👅', requires_teat_selection: false, sort_order: 1 },
      { code: 'internal_parasites', name: 'Internal Parasites', emoji: '🪱', requires_teat_selection: false, sort_order: 2 },
      { code: 'orf', name: 'Orf', emoji: '🤕', requires_teat_selection: false, sort_order: 3 },
      { code: 'foot_rot', name: 'Foot Rot', emoji: '🦶', requires_teat_selection: false, sort_order: 4 },
      { code: 'lameness', name: 'Lameness', emoji: '🦵', requires_teat_selection: false, sort_order: 5 },
      { code: 'respiratory', name: 'Respiratory', emoji: '🫁', requires_teat_selection: false, sort_order: 6 },
      { code: 'eye', name: 'Eye', emoji: '👁️', requires_teat_selection: false, sort_order: 7 },
      { code: 'other', name: 'Other', emoji: '❓', requires_teat_selection: false, sort_order: 8 },
    ]
    await trx('issue_type_definitions').insert(
      issueTypeDefs.map((d) => ({
        id: randomUUID(),
        farm_id: SHEEP_FARM_ID,
        ...d,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    )
    console.log('[sheep-seed] ✓ Issue types (9)')

    // ── 5. Medications (sheep-specific) ──────────────────────────────────
    const medDefs = [
      {
        name: 'Multivax P Plus',
        active_ingredient: 'Clostridial + Pasteurella',
        withdrawal_milk_hours: 0,
        withdrawal_meat_days: 21,
        default_dosage: '2ml',
        unit: 'ml',
        notes: 'Multi-clostridial + pasteurella vaccine. Administer SC.',
      },
      {
        name: 'Dectomax Injectable',
        active_ingredient: 'Doramectin',
        withdrawal_milk_hours: 0,
        withdrawal_meat_days: 35,
        default_dosage: '1ml/50kg',
        unit: 'ml',
        notes: 'Broad-spectrum parasiticide. Internal & external parasites.',
      },
      {
        name: 'Ivermectin 1%',
        active_ingredient: 'Ivermectin',
        withdrawal_milk_hours: 0,
        withdrawal_meat_days: 14,
        default_dosage: '1ml/50kg',
        unit: 'ml',
        notes: 'Antiparasitic. Effective against roundworms, lungworms, and external parasites.',
      },
      {
        name: 'Terramycin LA',
        active_ingredient: 'Oxytetracycline',
        withdrawal_milk_hours: 0,
        withdrawal_meat_days: 28,
        default_dosage: '1ml/10kg',
        unit: 'ml',
        notes: 'Long-acting antibiotic. For respiratory and foot rot.',
      },
      {
        name: 'Vitamins ADE',
        active_ingredient: 'Vitamins A, D, E',
        withdrawal_milk_hours: 0,
        withdrawal_meat_days: 0,
        default_dosage: '2ml',
        unit: 'ml',
        notes: 'No withdrawal period. General supplementation.',
      },
    ]
    const medRows = medDefs.map((d) => ({
      id: randomUUID(),
      farm_id: SHEEP_FARM_ID,
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
    console.log('[sheep-seed] ✓ Medications (5)')

    // ── 6. Feature flags + settings ──────────────────────────────────────
    await trx('feature_flags').insert(
      ['breeding', 'milk_recording', 'health_issues', 'treatments', 'analytics'].map((key) => ({
        farm_id: SHEEP_FARM_ID,
        key,
        enabled: key !== 'milk_recording', // no milking for meat sheep
      }))
    )
    await trx('app_settings').insert([
      { farm_id: SHEEP_FARM_ID, key: 'farm_name', value: 'Sheep Demo' },
      { farm_id: SHEEP_FARM_ID, key: 'default_language', value: 'af' },
    ])
    console.log('[sheep-seed] ✓ Feature flags & settings (milk_recording disabled)')

    // ── 7. Generate sheep ────────────────────────────────────────────────
    // Distribution: 20 breeding ewes, 8 pregnant ewes, 5 lambs (<6mo),
    //               3 rams, 2 sold, 2 dead, 5 young ewes (6-12mo) = 45 + extras
    const sheep = []
    let tagNum = 1

    function makeSheep(sex, status, dobDate, name, opts = {}) {
      const id = randomUUID()
      const tag = `S${String(tagNum++).padStart(3, '0')}`
      const animal = {
        id,
        farm_id: SHEEP_FARM_ID,
        tag_number: tag,
        name: name || tag,
        dob: isoDate(dobDate),
        breed: 'Dorper',
        sex,
        status,
        sire_id: null,
        dam_id: null,
        notes: null,
        created_by: adminId,
        breed_type_id: DORPER_BREED_TYPE_ID,
        species_id: SHEEP_SPECIES_ID,
        is_external: 0,
        purpose: sex === 'male' ? 'breeding' : 'meat',
        life_phase_override: null,
        is_dry: 0,
        status_changed_at: opts.statusChangedAt || null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }
      sheep.push(animal)
      return animal
    }

    // Rams first (needed as FK targets for sire_id)
    const rams = []
    for (let i = 0; i < 3; i++) {
      const ageMonths = randInt(18, 48)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const s = makeSheep('male', 'active', dob, RAM_NAMES[i])
      rams.push(s)
    }
    const ramIds = rams.map((r) => r.id)
    await trx('cows').insert(rams)

    // Breeding ewes (20): 1.5-6 years old, active
    const breedingEwes = []
    for (let i = 0; i < 20; i++) {
      const ageMonths = randInt(18, 72)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const s = makeSheep('female', 'active', dob, EWE_NAMES[i])
      if (Math.random() < 0.3) s.sire_id = pick(ramIds)
      breedingEwes.push(s)
    }

    // Pregnant ewes (8): confirmed pregnant
    const pregnantEwes = []
    for (let i = 0; i < 8; i++) {
      const ageMonths = randInt(18, 60)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const s = makeSheep('female', 'pregnant', dob, EWE_NAMES[20 + i])
      if (Math.random() < 0.3) s.sire_id = pick(ramIds)
      pregnantEwes.push(s)
    }

    // Young ewes (5): 6-12 months, not yet bred
    for (let i = 0; i < 5; i++) {
      const ageMonths = randInt(6, 12)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      makeSheep('female', 'active', dob, EWE_NAMES[28 + i])
    }

    // Lambs (5): < 6 months
    for (let i = 0; i < 5; i++) {
      const ageMonths = randInt(1, 5)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      makeSheep(Math.random() < 0.5 ? 'female' : 'male', 'active', dob, EWE_NAMES[33 + i] || `Lam${i + 1}`)
    }

    // Sold (2)
    for (let i = 0; i < 2; i++) {
      const ageMonths = randInt(12, 36)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const soldDate = addDays(TODAY, -randInt(30, 200))
      makeSheep('female', 'sold', dob, EWE_NAMES[38 + i] || `Sold${i + 1}`, {
        statusChangedAt: isoDatetime(soldDate),
      })
    }

    // Dead (2)
    for (let i = 0; i < 2; i++) {
      const ageMonths = randInt(12, 48)
      const dob = addDays(TODAY, -ageMonths * 30.4)
      const deadDate = addDays(TODAY, -randInt(30, 200))
      makeSheep('female', 'dead', dob, `Verloor${i + 1}`, {
        statusChangedAt: isoDatetime(deadDate),
      })
    }

    // Batch insert remaining sheep (rams already inserted)
    const nonRams = sheep.filter((s) => !ramIds.includes(s.id))
    for (let i = 0; i < nonRams.length; i += 50) {
      await trx.batchInsert('cows', nonRams.slice(i, i + 50), 50)
    }
    console.log(`[sheep-seed] ✓ Sheep (${sheep.length})`)

    // ── 8. Breeding events ───────────────────────────────────────────────
    const breedingEvents = []

    function generateSheepCycle(sheepId, lambingDate) {
      const events = []
      const gestDays = DORPER.gestation_days

      // Lambing event — sheep commonly have twins
      const offspringCount = Math.random() < 0.55 ? 2 : Math.random() < 0.8 ? 1 : 3
      events.push({
        id: randomUUID(),
        farm_id: SHEEP_FARM_ID,
        cow_id: sheepId,
        event_type: 'lambing',
        event_date: isoDate(lambingDate),
        sire_id: pick(ramIds),
        offspring_count: offspringCount,
        calving_details: JSON.stringify({
          calf_sex: offspringCount === 1 ? (Math.random() < 0.5 ? 'male' : 'female') : 'mixed',
          calf_alive: Math.random() < 0.90,
        }),
        recorded_by: pick(reporters),
        created_at: isoDatetime(lambingDate),
        updated_at: isoDatetime(lambingDate),
      })

      // Voluntary waiting → heat
      const vwpDays = randInt(60, 90)
      const heatDate = addDays(lambingDate, vwpDays)
      if (heatDate > TODAY) return { events, nextLambing: null }

      events.push({
        id: randomUUID(),
        farm_id: SHEEP_FARM_ID,
        cow_id: sheepId,
        event_type: 'heat_observed',
        event_date: isoDate(heatDate),
        heat_signs: JSON.stringify(pick([['standing_heat'], ['restlessness'], ['standing_heat', 'tail_wagging']])),
        recorded_by: pick(reporters),
        created_at: isoDatetime(heatDate),
        updated_at: isoDatetime(heatDate),
      })

      // Ram service (most common for sheep) or AI
      const serviceDate = addDays(heatDate, Math.random() < 0.8 ? 0 : 1)
      if (serviceDate > TODAY) return { events, nextLambing: null }

      const isAI = Math.random() < 0.2 // 20% AI, 80% ram service
      const sireId = pick(ramIds)
      events.push({
        id: randomUUID(),
        farm_id: SHEEP_FARM_ID,
        cow_id: sheepId,
        event_type: isAI ? 'ai_insemination' : 'ram_service',
        event_date: isoDate(serviceDate),
        sire_id: sireId,
        inseminator: isAI ? pick(VET_NAMES) : null,
        cost: isAI ? randInt(200, 350) : null,
        expected_next_heat: isoDate(addDays(serviceDate, DORPER.heat_cycle_days)),
        expected_preg_check: isoDate(addDays(serviceDate, DORPER.preg_check_days)),
        expected_calving: isoDate(addDays(serviceDate, gestDays)),
        recorded_by: pick(reporters),
        created_at: isoDatetime(serviceDate),
        updated_at: isoDatetime(serviceDate),
      })

      // Conception: sheep have higher first-service rates than cattle
      let conceived = Math.random() < 0.65
      let lastServiceDate = new Date(serviceDate)
      let serviceCount = 1

      while (!conceived && serviceCount < 3) {
        const reHeatDate = addDays(lastServiceDate, DORPER.heat_cycle_days)
        if (reHeatDate > TODAY) return { events, nextLambing: null }

        events.push({
          id: randomUUID(),
          farm_id: SHEEP_FARM_ID,
          cow_id: sheepId,
          event_type: 'heat_observed',
          event_date: isoDate(reHeatDate),
          heat_signs: JSON.stringify(['standing_heat']),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reHeatDate),
          updated_at: isoDatetime(reHeatDate),
        })

        const reServiceDate = addDays(reHeatDate, Math.random() < 0.8 ? 0 : 1)
        if (reServiceDate > TODAY) return { events, nextLambing: null }

        events.push({
          id: randomUUID(),
          farm_id: SHEEP_FARM_ID,
          cow_id: sheepId,
          event_type: isAI ? 'ai_insemination' : 'ram_service',
          event_date: isoDate(reServiceDate),
          sire_id: pick(ramIds),
          inseminator: isAI ? pick(VET_NAMES) : null,
          cost: isAI ? randInt(200, 350) : null,
          expected_next_heat: isoDate(addDays(reServiceDate, DORPER.heat_cycle_days)),
          expected_preg_check: isoDate(addDays(reServiceDate, DORPER.preg_check_days)),
          expected_calving: isoDate(addDays(reServiceDate, gestDays)),
          recorded_by: pick(reporters),
          created_at: isoDatetime(reServiceDate),
          updated_at: isoDatetime(reServiceDate),
        })

        lastServiceDate = new Date(reServiceDate)
        serviceCount++
        conceived = Math.random() < 0.7
      }

      if (!conceived) return { events, nextLambing: null }

      // Preg check positive
      const posDate = addDays(lastServiceDate, DORPER.preg_check_days)
      if (posDate > TODAY) return { events, nextLambing: null }

      const expectedLambing = addDays(lastServiceDate, gestDays)
      events.push({
        id: randomUUID(),
        farm_id: SHEEP_FARM_ID,
        cow_id: sheepId,
        event_type: 'preg_check_positive',
        event_date: isoDate(posDate),
        preg_check_method: pick(['manual', 'ultrasound']),
        expected_calving: isoDate(expectedLambing),
        notes: `Confirmed at ${DORPER.preg_check_days} days. Service #${serviceCount}.`,
        recorded_by: pick(reporters),
        created_at: isoDatetime(posDate),
        updated_at: isoDatetime(posDate),
      })

      return {
        events,
        nextLambing: expectedLambing <= TODAY ? expectedLambing : null,
      }
    }

    // Generate breeding cycles for breeding + pregnant ewes
    const breedableEwes = [...breedingEwes, ...pregnantEwes]
    for (const ewe of breedableEwes) {
      const eweDob = new Date(ewe.dob)
      // First lambing at ~12-15 months
      const firstLambingAge = randInt(360, 460)
      const firstLambing = addDays(eweDob, firstLambingAge)

      if (firstLambing > TODAY) continue

      // Fast-forward to a lambing within our window
      // Sheep can lamb every ~8 months (accelerated lambing)
      let currentLambing = new Date(firstLambing)
      while (currentLambing < START_DATE) {
        currentLambing = addDays(currentLambing, randInt(210, 270))
      }

      // Generate up to 2 cycles
      for (let cycle = 0; cycle < 2; cycle++) {
        if (currentLambing > TODAY) break
        const { events, nextLambing } = generateSheepCycle(ewe.id, currentLambing)
        breedingEvents.push(...events)
        if (!nextLambing) break
        currentLambing = nextLambing
      }
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
    console.log(`[sheep-seed] ✓ Breeding events (${breedingEvents.length})`)

    // ── 9. Health issues ─────────────────────────────────────────────────
    const issueTypeProbs = [
      { code: 'internal_parasites', baseProb: 0.03, seasonal: [0, 1.2, 1.3, 1.1, 0.8, 0.5, 0.4, 0.4, 0.6, 1.0, 1.3, 1.4, 1.3] },
      { code: 'foot_rot', baseProb: 0.02, seasonal: [0, 0.6, 0.5, 0.7, 1.0, 1.4, 1.6, 1.5, 1.3, 0.9, 0.7, 0.6, 0.6] },
      { code: 'pulpy_kidney', baseProb: 0.012, seasonal: [0, 0.8, 0.7, 0.9, 1.0, 1.2, 1.0, 0.8, 1.0, 1.5, 1.6, 1.2, 0.9] },
      { code: 'blue_tongue', baseProb: 0.008, seasonal: [0, 1.6, 1.8, 1.5, 1.0, 0.3, 0.2, 0.2, 0.4, 0.8, 1.2, 1.5, 1.6] },
      { code: 'orf', baseProb: 0.01, seasonal: [0, 0.8, 0.7, 0.9, 1.0, 1.2, 1.3, 1.2, 1.0, 0.9, 0.8, 0.8, 0.8] },
      { code: 'respiratory', baseProb: 0.01, seasonal: [0, 0.4, 0.4, 0.5, 0.8, 1.3, 1.6, 1.8, 1.4, 0.8, 0.5, 0.4, 0.4] },
      { code: 'eye', baseProb: 0.006, seasonal: [0, 1.5, 1.6, 1.3, 0.8, 0.5, 0.4, 0.4, 0.5, 0.8, 1.0, 1.3, 1.5] },
    ]

    const issueEligible = sheep.filter(
      (s) => s.status !== 'sold' && s.status !== 'dead'
    )

    const healthIssues = []
    const healthIssueIndex = {}

    const weekCursor = new Date(START_DATE)
    while (weekCursor <= TODAY) {
      const month = weekCursor.getMonth() + 1

      for (const animal of issueEligible) {
        for (const it of issueTypeProbs) {
          const prob = it.baseProb * (it.seasonal[month] || 1.0)
          if (Math.random() >= prob) continue

          const dayOffset = randInt(0, 6)
          const issueDate = addDays(weekCursor, dayOffset)
          if (issueDate > TODAY) continue

          const daysOld = Math.floor((TODAY - issueDate) / 86400000)
          let status = 'resolved'
          let resolvedAt = null
          if (daysOld < 3) {
            status = 'open'
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
            farm_id: SHEEP_FARM_ID,
            cow_id: animal.id,
            reported_by: pick(reporters),
            issue_types: JSON.stringify([it.code]),
            severity: pickSeverity(),
            affected_teats: null, // no teat selection for sheep
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
    console.log(`[sheep-seed] ✓ Health issues (${healthIssues.length})`)

    // ── 10. Treatments ───────────────────────────────────────────────────
    const treatmentMedMap = {
      internal_parasites: ['Dectomax Injectable', 'Ivermectin 1%'],
      foot_rot: ['Terramycin LA'],
      pulpy_kidney: ['Multivax P Plus'],
      blue_tongue: ['Vitamins ADE'], // supportive care only
      orf: ['Terramycin LA'],
      respiratory: ['Terramycin LA', 'Vitamins ADE'],
      eye: ['Terramycin LA'],
    }

    const costRanges = {
      'Multivax P Plus': [15, 30],
      'Dectomax Injectable': [25, 50],
      'Ivermectin 1%': [10, 25],
      'Terramycin LA': [30, 60],
      'Vitamins ADE': [10, 20],
    }

    const treatmentNotes = {
      internal_parasites: ['High worm count on FEC', 'Routine dosing', 'Drench resistance suspected — switched product', 'FAMACHA score 4'],
      foot_rot: ['Hoof trimmed, foot bath applied', 'Severe — isolated from flock', 'Bilateral front hooves'],
      pulpy_kidney: ['Vaccination — booster dose', 'Preventative — pre-lambing', 'Lamb vaccination program'],
      blue_tongue: ['Supportive care, shade provided', 'Swollen face, drooling', 'Mild case — monitoring'],
      orf: ['Scabs around mouth', 'Isolate from lambs', 'Secondary infection treated'],
      respiratory: ['Nasal discharge, coughing', 'Temperature 40.8°C', 'Post-dipping pneumonia'],
      eye: ['Pinkeye, fly season', 'Cloudy left eye', 'Bilateral — spray applied'],
    }

    const treatments = []
    const treatmentMeds = []

    for (const issue of Object.values(healthIssueIndex)) {
      if (Math.random() > 0.85) continue // 85% get treated

      const meds = treatmentMedMap[issue.issueCode] || ['Vitamins ADE']
      const numMeds = meds.length > 1 && Math.random() < 0.25 ? 2 : 1

      for (let m = 0; m < numMeds; m++) {
        const medName = meds[m]
        const med = medMap[medName]
        if (!med) continue

        const treatDate = addDays(issue.issueDate, randInt(0, 2))
        if (treatDate > TODAY) continue

        const [costMin, costMax] = costRanges[medName] || [10, 30]
        const cost = Math.round(rand(costMin, costMax) * 100) / 100
        const isVet = issue.severity === 'high' && Math.random() < 0.4

        let withdrawalEndMeat = null
        if (med.withdrawal_meat_days > 0) {
          const wt = addDays(treatDate, med.withdrawal_meat_days)
          withdrawalEndMeat = isoDatetime(wt)
        }

        const notePool = treatmentNotes[issue.issueCode] || ['General supportive care']
        const note = Math.random() < 0.6 ? pick(notePool) : null

        const treatmentId = randomUUID()
        treatments.push({
          id: treatmentId,
          farm_id: SHEEP_FARM_ID,
          cow_id: issue.cow_id,
          health_issue_id: issue.id,
          medication_id: med.id,
          administered_by: pick(reporters),
          dosage: med.default_dosage || '2ml',
          cost,
          treatment_date: isoDatetime(treatDate),
          withdrawal_end_milk: null, // no milk withdrawal for sheep
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
          dosage: med.default_dosage || '2ml',
        })
      }
    }

    for (let i = 0; i < treatments.length; i += 50) {
      await trx.batchInsert('treatments', treatments.slice(i, i + 50), 50)
    }
    for (let i = 0; i < treatmentMeds.length; i += 50) {
      await trx.batchInsert('treatment_medications', treatmentMeds.slice(i, i + 50), 50)
    }
    console.log(`[sheep-seed] ✓ Treatments (${treatments.length}, ${treatmentMeds.length} medication links)`)

    // ── Summary ──────────────────────────────────────────────────────────
    console.log('')
    console.log('═══════════════════════════════════════════')
    console.log('  Sheep farm seeded successfully!')
    console.log('═══════════════════════════════════════════')
    console.log(`  Farm:      Sheep Demo (code: SKAAP)`)
    console.log(`  Species:   Sheep (Dorper)`)
    console.log(`  Admin:     admin / admin123`)
    console.log(`  Worker:    sipho / PIN 1234 (farm code: SHEEP)`)
    console.log(`  Sheep:     ${sheep.length}`)
    console.log(`  Breeding:  ${breedingEvents.length} events`)
    console.log(`  Health:    ${healthIssues.length} issues`)
    console.log(`  Treatment: ${treatments.length} treatments`)
    console.log(`  Milk:      0 (disabled for sheep)`)
    console.log('═══════════════════════════════════════════')
  })
}

main()
  .then(() => {
    console.log('[sheep-seed] Done.')
    return knex.destroy()
  })
  .then(() => process.exit(0)) // eslint-disable-line n/no-process-exit
  .catch((err) => {
    console.error('[sheep-seed] FAILED:', err)
    knex.destroy().then(() => process.exit(1)) // eslint-disable-line n/no-process-exit
  })
