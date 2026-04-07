const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')

// ── Date helpers ────────────────────────────────────────────────────────────

const today = new Date()
today.setHours(0, 0, 0, 0)

function daysAgo(n) {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysFromNow(n) {
  const d = new Date(today)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FARM_ID = '00000000-0000-4000-a000-000000000099'

// ── Main seed ────────────────────────────────────────────────────────────────

exports.seed = async function (knex) {
  const isSQLite = knex.client.config.client === 'better-sqlite3'

  // Disable FK checks for the truncation phase (dialect-specific).
  if (isSQLite) {
    await knex.raw('PRAGMA foreign_keys = OFF')
  } else {
    await knex.raw('SET FOREIGN_KEY_CHECKS=0')
  }
  try {
    await knex('sync_log').del()
    await knex('breeding_events').del()
    await knex('treatments').del()
    await knex('health_issues').del()
    await knex('medications').del()
    try {
      await knex('milk_records').del()
    } catch {
      /* table may not exist */
    }
    await knex('animals').del()
    await knex('users').del()
    await knex('farms').del()
  } finally {
    if (isSQLite) {
      await knex.raw('PRAGMA foreign_keys = ON')
    } else {
      await knex.raw('SET FOREIGN_KEY_CHECKS=1')
    }
  }

  // ── Default farm ──────────────────────────────────────────────────────────

  await knex('farms').insert({
    id: DEFAULT_FARM_ID,
    name: 'My Farm',
    code: 'DEFAULT',
    slug: 'default',
    is_active: true,
  })

  // ── Users ────────────────────────────────────────────────────────────────

  // Deterministic IDs so JWTs survive re-seeding during development
  const superAdminId = '00000000-0000-4000-a000-000000000000'
  const adminId = '00000000-0000-4000-a000-000000000001'
  const workerId = '00000000-0000-4000-a000-000000000002'

  // Super-admin user (no farm — uses /login/super)
  await knex('users').insert({
    id: superAdminId,
    farm_id: null,
    username: 'superadmin',
    password_hash: await bcrypt.hash('super123', 10),
    full_name: 'System Admin',
    role: 'super_admin',
    permissions: JSON.stringify([]),
    language: 'en',
    is_active: true,
    failed_attempts: 0,
  })

  await knex('users').insert([
    {
      id: adminId,
      farm_id: DEFAULT_FARM_ID,
      username: 'admin',
      password_hash: await bcrypt.hash('admin123', 10),
      full_name: 'Farm Admin',
      role: 'admin',
      permissions: JSON.stringify(['can_manage_animals', 'can_manage_users']),
      language: 'en',
      is_active: true,
      failed_attempts: 0,
    },
    {
      id: workerId,
      farm_id: DEFAULT_FARM_ID,
      username: 'sipho',
      pin_hash: await bcrypt.hash('1234', 10),
      full_name: 'Sipho Ndlovu',
      role: 'worker',
      permissions: JSON.stringify(['can_manage_animals']),
      language: 'af',
      is_active: true,
      failed_attempts: 0,
    },
  ])

  // ── Breed type lookup ─────────────────────────────────────────────────────

  const breedRows = await knex('breed_types').select('id', 'code')
  const breedTypeMap = {}
  breedRows.forEach((bt) => {
    breedTypeMap[bt.code] = bt.id
  })

  // Gestation days per breed (mirrors migration 017 defaults)
  const gestationDays = {
    holstein: 280,
    jersey: 279,
    ayrshire: 279,
    nguni: 285,
    brahman: 292,
  }

  // ── Cow IDs (declared upfront so breeding events can reference them) ──────

  // Bulls (8)
  const B001 = uuidv4() // Thunder    – Holstein
  const B002 = uuidv4() // Warrior    – Nguni
  const B003 = uuidv4() // Goliath    – Brahman
  const B004 = uuidv4() // Apollo     – Holstein
  const B005 = uuidv4() // Samson     – Jersey
  const B006 = uuidv4() // Kgosi      – Nguni
  const B007 = uuidv4() // Titan      – Ayrshire
  const B008 = uuidv4() // Hercules   – Brahman

  // Cows (92)
  const C001 = uuidv4() // Bella        Holstein  2017
  const C002 = uuidv4() // Daisy        Jersey    2017
  const C003 = uuidv4() // Rosie        Holstein  2018
  const C004 = uuidv4() // Buttercup    Jersey    2018
  const C005 = uuidv4() // Clover       Ayrshire  2018
  const C006 = uuidv4() // Molly        Holstein  2018
  const C007 = uuidv4() // Star         Jersey    2019
  const C008 = uuidv4() // Patches      Nguni     2019
  const C009 = uuidv4() // Lena         Holstein  2019
  const C010 = uuidv4() // Grietjie     Holstein  2019
  const C011 = uuidv4() // Nandi        Nguni     2019
  const C012 = uuidv4() // Sarie        Jersey    2019
  const C013 = uuidv4() // Hettie       Holstein  2020
  const C014 = uuidv4() // Fiona        Ayrshire  2020
  const C015 = uuidv4() // Magda        Holstein  2020
  const C016 = uuidv4() // Thandi       Holstein  2020
  const C017 = uuidv4() // Lydia        Jersey    2020
  const C018 = uuidv4() // Boetie-se-ma Ayrshire  2020
  const C019 = uuidv4() // Florrie      Holstein  2020
  const C020 = uuidv4() // Sanna        Jersey    2020
  const C021 = uuidv4() // Trudie       Holstein  2021
  const C022 = uuidv4() // Sanele       Nguni     2021
  const C023 = uuidv4() // Wilna        Ayrshire  2021
  const C024 = uuidv4() // Elna         Holstein  2021
  const C025 = uuidv4() // Riana        Jersey    2021
  const C026 = uuidv4() // Betsie       Holstein  2021
  const C027 = uuidv4() // Zandile      Nguni     2021
  const C028 = uuidv4() // Corrie       Holstein  2021
  const C029 = uuidv4() // Noxolo       Ayrshire  2021
  const C030 = uuidv4() // Miems        Jersey    2021
  const C031 = uuidv4() // Heidi        Holstein  2022
  const C032 = uuidv4() // Liesel       Holstein  2022
  const C033 = uuidv4() // Nomvula      Nguni     2022
  const C034 = uuidv4() // Patricia     Ayrshire  2022
  const C035 = uuidv4() // Amanda       Jersey    2022
  const C036 = uuidv4() // Ronel        Holstein  2022
  const C037 = uuidv4() // Siphokazi    Brahman   2022
  const C038 = uuidv4() // Mieke        Holstein  2022
  const C039 = uuidv4() // Gladys       Jersey    2022
  const C040 = uuidv4() // Tannie Bets  Holstein  2022
  const C041 = uuidv4() // Lulu         Holstein  2022
  const C042 = uuidv4() // Charlotte    Ayrshire  2022
  const C043 = uuidv4() // Alet         Holstein  2022
  const C044 = uuidv4() // Susara       Jersey    2022
  const C045 = uuidv4() // Nokwanda     Brahman   2022
  const C046 = uuidv4() // Mara         Holstein  2023
  const C047 = uuidv4() // Annerie      Jersey    2023
  const C048 = uuidv4() // Zinhle       Nguni     2023
  const C049 = uuidv4() // Sanri        Holstein  2023
  const C050 = uuidv4() // Heléne       Ayrshire  2023
  const C051 = uuidv4() // Irene        Holstein  2023
  const C052 = uuidv4() // Nosipho      Holstein  2023
  const C053 = uuidv4() // Belinda      Jersey    2023
  const C054 = uuidv4() // Johanna      Holstein  2023
  const C055 = uuidv4() // Retha        Ayrshire  2023
  const C056 = uuidv4() // Madelief     Holstein  2023
  const C057 = uuidv4() // Bongiwe      Nguni     2023
  const C058 = uuidv4() // Corlia       Holstein  2023
  const C059 = uuidv4() // Thozama      Brahman   2023
  const C060 = uuidv4() // Lettie       Holstein  2023
  const C061 = uuidv4() // Nonhlanhla   Holstein  2024
  const C062 = uuidv4() // Santie       Jersey    2024
  const C063 = uuidv4() // Mpho         Ayrshire  2024
  const C064 = uuidv4() // Dorothea     Holstein  2024
  const C065 = uuidv4() // Nokukhanya   Nguni     2024
  const C066 = uuidv4() // Freda        Holstein  2024
  const C067 = uuidv4() // Joyline      Brahman   2024
  const C068 = uuidv4() // Engela       Holstein  2024
  const C069 = uuidv4() // Nomsa        Jersey    2024
  const C070 = uuidv4() // Petronella   Ayrshire  2024
  const C071 = uuidv4() // Leana        Holstein  2024
  const C072 = uuidv4() // Sonja        Holstein  2024
  const C073 = uuidv4() // Catharina    Jersey    2024
  const C074 = uuidv4() // Bulelwa      Nguni     2024
  const C075 = uuidv4() // Mariëtte     Holstein  2024
  const C076 = uuidv4() // Nompumelelo  Holstein  2024
  const C077 = uuidv4() // Hannelie     Ayrshire  2024
  const C078 = uuidv4() // Nokuthula    Holstein  2024
  const C079 = uuidv4() // Elzabe       Jersey    2024
  const C080 = uuidv4() // Magrieta     Holstein  2024
  // Calves 2024-2025
  const C081 = uuidv4() // Klein Bella  Holstein  2024 (calf)
  const C082 = uuidv4() // Sproetjie    Jersey    2024 (calf)
  const C083 = uuidv4() // Nandi Jr     Nguni     2024 (calf)
  const C084 = uuidv4() // Klein Rosie  Holstein  2025 (calf)
  const C085 = uuidv4() // Jabulani     Brahman   2025 (calf – male)
  const C086 = uuidv4() // Mpendulo     Nguni     2025 (calf – male)
  const C087 = uuidv4() // Sterre       Ayrshire  2025 (calf)
  const C088 = uuidv4() // Nuut         Holstein  2025 (calf)
  const C089 = uuidv4() // Tessa        Jersey    2025 (calf)
  const C090 = uuidv4() // Lina         Holstein  2025 (calf)
  const C091 = uuidv4() // Tweeling-A   Holstein  2025 (calf)
  const C092 = uuidv4() // Tweeling-B   Holstein  2025 (calf)

  // ── Cows table ────────────────────────────────────────────────────────────

  const cows = [
    // ── Bulls ──────────────────────────────────────────────────────────────
    {
      id: B001,
      tag_number: 'B001',
      name: 'Thunder',
      dob: '2019-03-15',
      breed: 'Holstein',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
      notes: 'Main AI sire. High milk EBV. Used in AI programme since 2021.',
    },
    {
      id: B002,
      tag_number: 'B002',
      name: 'Warrior',
      dob: '2018-06-20',
      breed: 'Nguni',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      created_by: adminId,
    },
    {
      id: B003,
      tag_number: 'B003',
      name: 'Goliath',
      dob: '2017-11-05',
      breed: 'Brahman',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      created_by: adminId,
      notes: 'Veteran bull. Still sound and fertile at 8 years.',
    },
    {
      id: B004,
      tag_number: 'B004',
      name: 'Apollo',
      dob: '2020-02-14',
      breed: 'Holstein',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
    },
    {
      id: B005,
      tag_number: 'B005',
      name: 'Samson',
      dob: '2021-07-30',
      breed: 'Jersey',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      created_by: adminId,
    },
    {
      id: B006,
      tag_number: 'B006',
      name: 'Kgosi',
      dob: '2020-09-12',
      breed: 'Nguni',
      sex: 'male',
      status: 'sold',
      breed_type_id: breedTypeMap.nguni,
      created_by: workerId,
      notes: 'Sold to neighbouring farm January 2025.',
    },
    {
      id: B007,
      tag_number: 'B007',
      name: 'Titan',
      dob: '2022-04-18',
      breed: 'Ayrshire',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: B008,
      tag_number: 'B008',
      name: 'Hercules',
      dob: '2023-01-09',
      breed: 'Brahman',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      created_by: adminId,
      notes: 'Young bull. First natural service season 2025.',
    },

    // ── Foundation cows (2017-2018) ─────────────────────────────────────────
    {
      id: C001,
      tag_number: 'C001',
      name: 'Bella',
      dob: '2017-05-12',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      created_by: adminId,
      notes: 'Top producer. 9 650 kg peak season 2023.',
    },
    {
      id: C002,
      tag_number: 'C002',
      name: 'Daisy',
      dob: '2017-09-03',
      breed: 'Jersey',
      sex: 'female',
      status: 'dry',
      breed_type_id: breedTypeMap.jersey,
      is_dry: true,
      created_by: adminId,
    },
    {
      id: C003,
      tag_number: 'C003',
      name: 'Rosie',
      dob: '2018-02-22',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C001,
      created_by: adminId,
    },
    {
      id: C004,
      tag_number: 'C004',
      name: 'Buttercup',
      dob: '2018-06-14',
      breed: 'Jersey',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C002,
      created_by: adminId,
    },
    {
      id: C005,
      tag_number: 'C005',
      name: 'Clover',
      dob: '2018-11-30',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C006,
      tag_number: 'C006',
      name: 'Molly',
      dob: '2018-04-08',
      breed: 'Holstein',
      sex: 'female',
      status: 'sick',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      created_by: workerId,
      notes: 'Recurring mastitis in left front quarter. Under treatment.',
    },
    {
      id: C007,
      tag_number: 'C007',
      name: 'Star',
      dob: '2018-08-19',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C002,
      created_by: workerId,
    },
    {
      id: C008,
      tag_number: 'C008',
      name: 'Patches',
      dob: '2018-12-07',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      created_by: adminId,
    },

    // ── 2019 cohort ─────────────────────────────────────────────────────────
    {
      id: C009,
      tag_number: 'C009',
      name: 'Lena',
      dob: '2019-01-25',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C003,
      created_by: adminId,
    },
    {
      id: C010,
      tag_number: 'C010',
      name: 'Grietjie',
      dob: '2019-03-14',
      breed: 'Holstein',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C006,
      created_by: adminId,
    },
    {
      id: C011,
      tag_number: 'C011',
      name: 'Nandi',
      dob: '2019-06-02',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      created_by: adminId,
    },
    {
      id: C012,
      tag_number: 'C012',
      name: 'Sarie',
      dob: '2019-08-17',
      breed: 'Jersey',
      sex: 'female',
      status: 'dry',
      breed_type_id: breedTypeMap.jersey,
      is_dry: true,
      dam_id: C007,
      created_by: adminId,
    },
    {
      id: C013,
      tag_number: 'C013',
      name: 'Hettie',
      dob: '2019-10-29',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      created_by: adminId,
    },

    // ── 2020 cohort ─────────────────────────────────────────────────────────
    {
      id: C014,
      tag_number: 'C014',
      name: 'Fiona',
      dob: '2020-01-11',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C015,
      tag_number: 'C015',
      name: 'Magda',
      dob: '2020-02-28',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C003,
      created_by: adminId,
    },
    {
      id: C016,
      tag_number: 'C016',
      name: 'Thandi',
      dob: '2020-04-15',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: workerId,
    },
    {
      id: C017,
      tag_number: 'C017',
      name: 'Lydia',
      dob: '2020-05-20',
      breed: 'Jersey',
      sex: 'female',
      status: 'dry',
      breed_type_id: breedTypeMap.jersey,
      is_dry: true,
      sire_id: B005,
      dam_id: C007,
      created_by: adminId,
    },
    {
      id: C018,
      tag_number: 'C018',
      name: 'Boetie-se-ma',
      dob: '2020-07-04',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C019,
      tag_number: 'C019',
      name: 'Florrie',
      dob: '2020-08-22',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      created_by: adminId,
    },
    {
      id: C020,
      tag_number: 'C020',
      name: 'Sanna',
      dob: '2020-10-10',
      breed: 'Jersey',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C002,
      created_by: adminId,
    },

    // ── 2021 cohort ─────────────────────────────────────────────────────────
    {
      id: C021,
      tag_number: 'C021',
      name: 'Trudie',
      dob: '2021-01-06',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C009,
      created_by: adminId,
    },
    {
      id: C022,
      tag_number: 'C022',
      name: 'Sanele',
      dob: '2021-02-17',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C011,
      created_by: adminId,
    },
    {
      id: C023,
      tag_number: 'C023',
      name: 'Wilna',
      dob: '2021-04-03',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C024,
      tag_number: 'C024',
      name: 'Elna',
      dob: '2021-05-19',
      breed: 'Holstein',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C015,
      created_by: adminId,
    },
    {
      id: C025,
      tag_number: 'C025',
      name: 'Riana',
      dob: '2021-06-30',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C012,
      created_by: adminId,
    },
    {
      id: C026,
      tag_number: 'C026',
      name: 'Betsie',
      dob: '2021-08-08',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      created_by: workerId,
    },
    {
      id: C027,
      tag_number: 'C027',
      name: 'Zandile',
      dob: '2021-09-14',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      created_by: adminId,
    },
    {
      id: C028,
      tag_number: 'C028',
      name: 'Corrie',
      dob: '2021-10-22',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C019,
      created_by: adminId,
    },
    {
      id: C029,
      tag_number: 'C029',
      name: 'Noxolo',
      dob: '2021-11-05',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'sick',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: workerId,
      notes: 'Suspected milk fever. Calcium IV given yesterday.',
    },
    {
      id: C030,
      tag_number: 'C030',
      name: 'Miems',
      dob: '2021-12-18',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C007,
      created_by: adminId,
    },

    // ── 2022 cohort ─────────────────────────────────────────────────────────
    {
      id: C031,
      tag_number: 'C031',
      name: 'Heidi',
      dob: '2022-01-14',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C016,
      created_by: adminId,
    },
    {
      id: C032,
      tag_number: 'C032',
      name: 'Liesel',
      dob: '2022-02-28',
      breed: 'Holstein',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C013,
      created_by: adminId,
    },
    {
      id: C033,
      tag_number: 'C033',
      name: 'Nomvula',
      dob: '2022-04-10',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C022,
      created_by: adminId,
    },
    {
      id: C034,
      tag_number: 'C034',
      name: 'Patricia',
      dob: '2022-05-22',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: workerId,
    },
    {
      id: C035,
      tag_number: 'C035',
      name: 'Amanda',
      dob: '2022-07-03',
      breed: 'Jersey',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C025,
      created_by: adminId,
    },
    {
      id: C036,
      tag_number: 'C036',
      name: 'Ronel',
      dob: '2022-08-15',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C021,
      created_by: adminId,
    },
    {
      id: C037,
      tag_number: 'C037',
      name: 'Siphokazi',
      dob: '2022-09-27',
      breed: 'Brahman',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      sire_id: B003,
      created_by: adminId,
    },
    {
      id: C038,
      tag_number: 'C038',
      name: 'Mieke',
      dob: '2022-10-12',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      dam_id: C028,
      created_by: adminId,
    },
    {
      id: C039,
      tag_number: 'C039',
      name: 'Gladys',
      dob: '2022-11-04',
      breed: 'Jersey',
      sex: 'female',
      status: 'dry',
      breed_type_id: breedTypeMap.jersey,
      is_dry: true,
      sire_id: B005,
      created_by: adminId,
    },
    {
      id: C040,
      tag_number: 'C040',
      name: 'Tannie Bets',
      dob: '2022-12-19',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C031,
      created_by: adminId,
    },
    {
      id: C041,
      tag_number: 'C041',
      name: 'Lulu',
      dob: '2022-01-28',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
    },
    {
      id: C042,
      tag_number: 'C042',
      name: 'Charlotte',
      dob: '2022-03-16',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C043,
      tag_number: 'C043',
      name: 'Alet',
      dob: '2022-06-07',
      breed: 'Holstein',
      sex: 'female',
      status: 'pregnant',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C015,
      created_by: adminId,
    },
    {
      id: C044,
      tag_number: 'C044',
      name: 'Susara',
      dob: '2022-08-02',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C030,
      created_by: workerId,
    },
    {
      id: C045,
      tag_number: 'C045',
      name: 'Nokwanda',
      dob: '2022-10-25',
      breed: 'Brahman',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      sire_id: B003,
      created_by: adminId,
    },

    // ── 2023 cohort ─────────────────────────────────────────────────────────
    {
      id: C046,
      tag_number: 'C046',
      name: 'Mara',
      dob: '2023-01-08',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C036,
      created_by: adminId,
    },
    {
      id: C047,
      tag_number: 'C047',
      name: 'Annerie',
      dob: '2023-02-14',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C039,
      created_by: adminId,
    },
    {
      id: C048,
      tag_number: 'C048',
      name: 'Zinhle',
      dob: '2023-03-29',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C033,
      created_by: adminId,
    },
    {
      id: C049,
      tag_number: 'C049',
      name: 'Sanri',
      dob: '2023-04-17',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C038,
      created_by: adminId,
    },
    {
      id: C050,
      tag_number: 'C050',
      name: 'Heléne',
      dob: '2023-05-05',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C051,
      tag_number: 'C051',
      name: 'Irene',
      dob: '2023-06-19',
      breed: 'Holstein',
      sex: 'female',
      status: 'sold',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
      notes: 'Sold at Vleissentraal auction June 2024.',
    },
    {
      id: C052,
      tag_number: 'C052',
      name: 'Nosipho',
      dob: '2023-07-31',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      dam_id: C052,
      created_by: adminId,
    },
    {
      id: C053,
      tag_number: 'C053',
      name: 'Belinda',
      dob: '2023-08-12',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C044,
      created_by: adminId,
    },
    {
      id: C054,
      tag_number: 'C054',
      name: 'Johanna',
      dob: '2023-09-26',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C040,
      created_by: workerId,
    },
    {
      id: C055,
      tag_number: 'C055',
      name: 'Retha',
      dob: '2023-10-08',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C056,
      tag_number: 'C056',
      name: 'Madelief',
      dob: '2023-11-15',
      breed: 'Holstein',
      sex: 'female',
      status: 'dry',
      breed_type_id: breedTypeMap.holstein,
      is_dry: true,
      sire_id: B001,
      dam_id: C009,
      created_by: adminId,
      notes: 'Third parity. Excellent conformation score.',
    },
    {
      id: C057,
      tag_number: 'C057',
      name: 'Bongiwe',
      dob: '2023-12-03',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      created_by: adminId,
    },
    {
      id: C058,
      tag_number: 'C058',
      name: 'Corlia',
      dob: '2023-01-22',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      created_by: adminId,
    },
    {
      id: C059,
      tag_number: 'C059',
      name: 'Thozama',
      dob: '2023-03-11',
      breed: 'Brahman',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      sire_id: B003,
      dam_id: C045,
      created_by: adminId,
    },
    {
      id: C060,
      tag_number: 'C060',
      name: 'Lettie',
      dob: '2023-05-27',
      breed: 'Holstein',
      sex: 'female',
      status: 'sold',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
      notes: 'Sold due to chronic low production.',
    },

    // ── 2024 cohort (heifers approaching first service) ──────────────────────
    {
      id: C061,
      tag_number: 'C061',
      name: 'Nonhlanhla',
      dob: '2024-01-03',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C016,
      created_by: adminId,
    },
    {
      id: C062,
      tag_number: 'C062',
      name: 'Santie',
      dob: '2024-02-11',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C025,
      created_by: adminId,
    },
    {
      id: C063,
      tag_number: 'C063',
      name: 'Mpho',
      dob: '2024-03-24',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C064,
      tag_number: 'C064',
      name: 'Dorothea',
      dob: '2024-04-07',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      dam_id: C028,
      created_by: adminId,
    },
    {
      id: C065,
      tag_number: 'C065',
      name: 'Nokukhanya',
      dob: '2024-05-19',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C027,
      created_by: adminId,
    },
    {
      id: C066,
      tag_number: 'C066',
      name: 'Freda',
      dob: '2024-06-01',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C021,
      created_by: workerId,
    },
    {
      id: C067,
      tag_number: 'C067',
      name: 'Joyline',
      dob: '2024-07-15',
      breed: 'Brahman',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      sire_id: B003,
      dam_id: C059,
      created_by: adminId,
    },
    {
      id: C068,
      tag_number: 'C068',
      name: 'Engela',
      dob: '2024-08-22',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C036,
      created_by: adminId,
    },
    {
      id: C069,
      tag_number: 'C069',
      name: 'Nomsa',
      dob: '2024-09-09',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C053,
      created_by: adminId,
    },
    {
      id: C070,
      tag_number: 'C070',
      name: 'Petronella',
      dob: '2024-10-14',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C071,
      tag_number: 'C071',
      name: 'Leana',
      dob: '2024-11-01',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      dam_id: C040,
      created_by: adminId,
    },
    {
      id: C072,
      tag_number: 'C072',
      name: 'Sonja',
      dob: '2024-11-20',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
    },
    {
      id: C073,
      tag_number: 'C073',
      name: 'Catharina',
      dob: '2024-12-05',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      created_by: adminId,
    },
    {
      id: C074,
      tag_number: 'C074',
      name: 'Bulelwa',
      dob: '2024-01-28',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C048,
      created_by: adminId,
    },
    {
      id: C075,
      tag_number: 'C075',
      name: 'Mariëtte',
      dob: '2024-03-15',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C043,
      created_by: adminId,
    },
    {
      id: C076,
      tag_number: 'C076',
      name: 'Nompumelelo',
      dob: '2024-05-08',
      breed: 'Holstein',
      sex: 'female',
      status: 'dead',
      breed_type_id: breedTypeMap.holstein,
      created_by: workerId,
      notes: 'Died of bloat September 2024. Emergency call too late.',
    },
    {
      id: C077,
      tag_number: 'C077',
      name: 'Hannelie',
      dob: '2024-06-25',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      created_by: adminId,
    },
    {
      id: C078,
      tag_number: 'C078',
      name: 'Nokuthula',
      dob: '2024-08-01',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      created_by: adminId,
    },
    {
      id: C079,
      tag_number: 'C079',
      name: 'Elzabe',
      dob: '2024-09-18',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      dam_id: C044,
      created_by: adminId,
    },
    {
      id: C080,
      tag_number: 'C080',
      name: 'Magrieta',
      dob: '2024-11-12',
      breed: 'Holstein',
      sex: 'female',
      status: 'sick',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      created_by: adminId,
      notes: 'Eye infection. Daily antibiotic wash.',
    },

    // ── 2024-2025 calves ─────────────────────────────────────────────────────
    {
      id: C081,
      tag_number: 'C081',
      name: 'Klein Bella',
      dob: '2024-07-18',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C001,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C082,
      tag_number: 'C082',
      name: 'Sproetjie',
      dob: '2024-09-03',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C002,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C083,
      tag_number: 'C083',
      name: 'Nandi Jr',
      dob: '2024-10-21',
      breed: 'Nguni',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C011,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C084,
      tag_number: 'C084',
      name: 'Klein Rosie',
      dob: '2025-01-15',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C003,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C085,
      tag_number: 'C085',
      name: 'Jabulani',
      dob: '2025-02-02',
      breed: 'Brahman',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.brahman,
      sire_id: B003,
      dam_id: C037,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C086,
      tag_number: 'C086',
      name: 'Mpendulo',
      dob: '2025-01-27',
      breed: 'Nguni',
      sex: 'male',
      status: 'active',
      breed_type_id: breedTypeMap.nguni,
      sire_id: B002,
      dam_id: C033,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C087,
      tag_number: 'C087',
      name: 'Sterre',
      dob: '2025-02-10',
      breed: 'Ayrshire',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.ayrshire,
      dam_id: C042,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C088,
      tag_number: 'C088',
      name: 'Nuut',
      dob: '2025-02-14',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B004,
      dam_id: C024,
      created_by: workerId,
      life_phase_override: 'calf',
    },
    {
      id: C089,
      tag_number: 'C089',
      name: 'Tessa',
      dob: '2025-02-18',
      breed: 'Jersey',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.jersey,
      sire_id: B005,
      dam_id: C039,
      created_by: adminId,
      life_phase_override: 'calf',
    },
    {
      id: C090,
      tag_number: 'C090',
      name: 'Lina',
      dob: '2025-02-20',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C032,
      created_by: adminId,
      life_phase_override: 'calf',
      notes: 'Twins with C091. Both doing well.',
    },
    {
      id: C091,
      tag_number: 'C091',
      name: 'Tweeling-A',
      dob: '2025-02-20',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C032,
      created_by: adminId,
      life_phase_override: 'calf',
      notes: 'Twin. Dam C032 (Liesel).',
    },
    {
      id: C092,
      tag_number: 'C092',
      name: 'Tweeling-B',
      dob: '2025-02-20',
      breed: 'Holstein',
      sex: 'female',
      status: 'active',
      breed_type_id: breedTypeMap.holstein,
      sire_id: B001,
      dam_id: C032,
      created_by: adminId,
      life_phase_override: 'calf',
      notes: 'Twin. Dam C032 (Liesel).',
    },
  ]

  // Fix self-reference on C052 (dam_id can't be itself; was placeholder)
  const c052 = cows.find((c) => c.id === C052)
  if (c052) delete c052.dam_id

  // Normalise NOT NULL columns that have DB defaults.
  // knex batchInsert uses UNION ALL and fills missing columns with null,
  // which overrides the DEFAULT and violates NOT NULL constraints.
  const normalisedCows = cows.map((c) => ({
    farm_id: DEFAULT_FARM_ID,
    is_dry: false,
    is_external: false,
    ...c,
  }))

  await knex.batchInsert('animals', normalisedCows, 50)

  // ── Breeding events ───────────────────────────────────────────────────────
  //
  // Legend of helpers used below:
  //   daysAgo(n)      → ISO date string n days before today
  //   daysFromNow(n)  → ISO date string n days after today
  //
  // Target notification buckets:
  //   Upcoming heats      (next 3 days):   C009, C013, C016, C019, C026
  //   Upcoming calvings   (next 14 days):  C004, C010, C020, C024
  //   Upcoming preg check (next 7 days):   C032, C035, C043
  //   Upcoming dry-offs   (next 14 days):  C014, C003
  //   Overdue (past):                      C005, C008, C018, C036
  //   Dismissed:                           C006, C029
  //
  // ── Helper: insemination date that produces a given expected_calving ──────
  // expected_calving = insem_date + gestation_days
  // insem_date = expected_calving - gestation_days
  function insemDateForCalving(calvingIso, gestation) {
    const d = new Date(calvingIso)
    d.setDate(d.getDate() - gestation)
    return d.toISOString().slice(0, 10)
  }

  // ── Upcoming calvings ─────────────────────────────────────────────────────
  // C004 (Buttercup, Jersey, pregnant) – calves in 6 days
  const ec004 = daysFromNow(6)
  const ai004 = insemDateForCalving(ec004, gestationDays.jersey)

  // C010 (Grietjie, Holstein, pregnant) – calves in 11 days
  const ec010 = daysFromNow(11)
  const ai010 = insemDateForCalving(ec010, gestationDays.holstein)

  // C020 (Sanna, Jersey, pregnant) – calves in 4 days
  const ec020 = daysFromNow(4)
  const ai020 = insemDateForCalving(ec020, gestationDays.jersey)

  // C024 (Elna, Holstein, pregnant) – calves in 13 days
  const ec024 = daysFromNow(13)
  const ai024 = insemDateForCalving(ec024, gestationDays.holstein)

  // ── Upcoming preg checks ──────────────────────────────────────────────────
  // C032 (Liesel, Holstein, pregnant) – preg check in 5 days
  const pc032 = daysFromNow(5)
  const ai032 = daysAgo(30) // inseminated 30 days ago, preg check due in 5 days (day 35)

  // C035 (Amanda, Jersey, pregnant) – preg check in 3 days
  const pc035 = daysFromNow(3)
  const ai035 = daysAgo(32)

  // C043 (Alet, Holstein, pregnant) – preg check in 7 days
  const pc043 = daysFromNow(7)
  const ai043 = daysAgo(28)

  // ── Upcoming dry-offs ─────────────────────────────────────────────────────
  // C014 (Fiona, Ayrshire, pregnant) – dry-off in 10 days
  const eco14 = daysFromNow(70) // calves in 70 days
  const ado14 = daysFromNow(10) // dry-off in 10 days
  const ai014 = insemDateForCalving(eco14, gestationDays.ayrshire)

  // C003 (Rosie, Holstein, active) – dry-off in 8 days (approaching 60-day dry period before calving)
  const eco03 = daysFromNow(68)
  const ado03 = daysFromNow(8)
  const ai003 = insemDateForCalving(eco03, gestationDays.holstein)

  // ── Upcoming heats ────────────────────────────────────────────────────────
  // C009 (Lena) – heat in 2 days
  const nh009 = daysFromNow(2)
  // C013 (Hettie) – heat tomorrow
  const nh013 = daysFromNow(1)
  // C016 (Thandi) – heat in 3 days
  const nh016 = daysFromNow(3)
  // C019 (Florrie) – heat in 1 day
  const nh019 = daysFromNow(1)
  // C026 (Betsie) – heat in 2 days
  const nh026 = daysFromNow(2)

  // ── Overdue ───────────────────────────────────────────────────────────────
  // C005 (Clover) – overdue heat (last heat 25 days ago, next was 4 days ago)
  const nh005_overdue = daysAgo(4)
  // C008 (Patches) – overdue preg check (inseminated 42 days ago, preg check 7 days overdue)
  const pc008_overdue = daysAgo(7)
  const ai008 = daysAgo(42)
  // C018 (Boetie-se-ma) – overdue calving (expected 5 days ago)
  const ec018_overdue = daysAgo(5)
  const ai018 = insemDateForCalving(ec018_overdue, gestationDays.ayrshire)
  // C036 (Ronel) – overdue dry-off (should have dried off 3 days ago)
  const ado36_overdue = daysAgo(3)

  const breedingEvents = [
    // ══════════════════════════════════════════════════════════════════════
    // HISTORICAL CALVINGS — establish multi-parity cows
    // ══════════════════════════════════════════════════════════════════════

    // C001 Bella – 3 calvings (2020, 2022, 2024)
    {
      id: uuidv4(),
      animal_id: C001,
      event_type: 'calving',
      event_date: '2020-06-14',
      sire_id: B001,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C009',
        birth_weight_kg: 42,
      }),
      notes: 'Easy birth. Calf stood within 2 hours.',
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C001,
      event_type: 'calving',
      event_date: '2022-08-02',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true, birth_weight_kg: 44 }),
      notes: 'Bull calf. Not retained.',
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C001,
      event_type: 'calving',
      event_date: '2024-07-18',
      sire_id: B001,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C081',
        birth_weight_kg: 43,
      }),
      notes: 'Klein Bella born. Excellent heifer calf — retained.',
      recorded_by: adminId,
    },
    // C001 current cycle – heat observed, AI done, now waiting
    {
      id: uuidv4(),
      animal_id: C001,
      event_type: 'heat_observed',
      event_date: daysAgo(32),
      heat_signs: JSON.stringify(['standing_heat', 'vulva_swelling']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C001,
      event_type: 'ai_insemination',
      event_date: daysAgo(30),
      sire_id: B001,
      semen_id: 'HF-2023-TH-441',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(5),
      expected_calving: daysFromNow(250),
      recorded_by: adminId,
    },

    // C002 Daisy – 2 calvings, now dry
    {
      id: uuidv4(),
      animal_id: C002,
      event_type: 'calving',
      event_date: '2021-11-20',
      sire_id: B005,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C030',
        birth_weight_kg: 30,
      }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C002,
      event_type: 'calving',
      event_date: '2024-09-03',
      sire_id: B005,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C082',
        birth_weight_kg: 31,
      }),
      recorded_by: adminId,
    },
    // C002 dried off 45 days ago
    {
      id: uuidv4(),
      animal_id: C002,
      event_type: 'dry_off',
      event_date: daysAgo(45),
      notes: 'Routine 60-day dry period. Good body condition score.',
      recorded_by: adminId,
    },

    // C003 Rosie – 2 historical calvings; now inseminated, upcoming dry-off
    {
      id: uuidv4(),
      animal_id: C003,
      event_type: 'calving',
      event_date: '2021-09-10',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true, birth_weight_kg: 44 }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C003,
      event_type: 'calving',
      event_date: '2023-11-05',
      sire_id: B001,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        birth_weight_kg: 41,
      }),
      recorded_by: workerId,
    },
    // Inseminated ~8 months ago; approaching dry-off in 8 days
    {
      id: uuidv4(),
      animal_id: C003,
      event_type: 'ai_insemination',
      event_date: ai003,
      sire_id: B001,
      semen_id: 'HF-2024-TH-522',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_calving: eco03,
      expected_dry_off: ado03,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C003,
      event_type: 'preg_check_positive',
      event_date: daysAgo(170),
      preg_check_method: 'ultrasound',
      expected_calving: eco03,
      expected_dry_off: ado03,
      notes: 'Single fetus confirmed. BCS 3.5.',
      recorded_by: adminId,
    },

    // C004 Buttercup – upcoming calving in 6 days
    {
      id: uuidv4(),
      animal_id: C004,
      event_type: 'calving',
      event_date: '2022-05-14',
      sire_id: B005,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        birth_weight_kg: 32,
      }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C004,
      event_type: 'ai_insemination',
      event_date: ai004,
      sire_id: B005,
      semen_id: 'JE-2024-SA-119',
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_preg_check: daysAgo(210),
      expected_calving: ec004,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C004,
      event_type: 'preg_check_positive',
      event_date: daysAgo(215),
      preg_check_method: 'ultrasound',
      expected_calving: ec004,
      notes: 'Heifer fetus at 35 days gestation.',
      recorded_by: adminId,
    },

    // C005 Clover – had a failed cycle; now overdue heat
    {
      id: uuidv4(),
      animal_id: C005,
      event_type: 'calving',
      event_date: '2022-12-01',
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C005,
      event_type: 'heat_observed',
      event_date: daysAgo(25),
      heat_signs: JSON.stringify(['standing_heat', 'mucus_discharge']),
      expected_next_heat: nh005_overdue,
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C005,
      event_type: 'ai_insemination',
      event_date: daysAgo(25),
      inseminator: 'Dr. H. Botha',
      cost: 320,
      expected_preg_check: daysAgo(10),
      expected_next_heat: nh005_overdue,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C005,
      event_type: 'preg_check_negative',
      event_date: daysAgo(10),
      preg_check_method: 'manual',
      expected_next_heat: nh005_overdue,
      notes: 'Not in calf. Recheck heat. Consider synchronisation protocol.',
      recorded_by: adminId,
    },

    // C006 Molly – dismissed event (sick cow, breeding postponed)
    {
      id: uuidv4(),
      animal_id: C006,
      event_type: 'heat_observed',
      event_date: daysAgo(18),
      heat_signs: JSON.stringify(['restlessness']),
      expected_next_heat: daysFromNow(3),
      dismissed_at: new Date(today.getTime() - 15 * 86400000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19),
      dismissed_by: adminId,
      dismiss_reason: 'Cow under mastitis treatment. Breeding postponed until cleared.',
      recorded_by: workerId,
    },

    // C007 Star – 1 historical calving, heat cycle
    {
      id: uuidv4(),
      animal_id: C007,
      event_type: 'calving',
      event_date: '2023-04-22',
      sire_id: B005,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        birth_weight_kg: 29,
      }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C007,
      event_type: 'heat_observed',
      event_date: daysAgo(21),
      heat_signs: JSON.stringify(['standing_heat']),
      expected_next_heat: daysFromNow(0),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C007,
      event_type: 'ai_insemination',
      event_date: daysAgo(21),
      sire_id: B005,
      semen_id: 'JE-2024-SA-203',
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_preg_check: daysFromNow(14),
      recorded_by: adminId,
    },

    // C008 Patches – overdue preg check (7 days past due)
    {
      id: uuidv4(),
      animal_id: C008,
      event_type: 'heat_observed',
      event_date: daysAgo(43),
      heat_signs: JSON.stringify(['standing_heat', 'increased_activity']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C008,
      event_type: 'bull_service',
      event_date: ai008,
      sire_id: B002,
      cost: 0,
      expected_preg_check: pc008_overdue,
      expected_next_heat: daysAgo(21),
      recorded_by: workerId,
    },

    // C009 Lena – upcoming heat in 2 days
    {
      id: uuidv4(),
      animal_id: C009,
      event_type: 'calving',
      event_date: '2023-01-18',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C009,
      event_type: 'heat_observed',
      event_date: daysAgo(19),
      heat_signs: JSON.stringify(['standing_heat']),
      expected_next_heat: nh009,
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C009,
      event_type: 'preg_check_negative',
      event_date: daysAgo(14),
      preg_check_method: 'manual',
      expected_next_heat: nh009,
      notes: 'Empty. Watch for heat in 2 days.',
      recorded_by: adminId,
    },

    // C010 Grietjie – upcoming calving in 11 days
    {
      id: uuidv4(),
      animal_id: C010,
      event_type: 'ai_insemination',
      event_date: ai010,
      sire_id: B001,
      semen_id: 'HF-2024-TH-601',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_calving: ec010,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C010,
      event_type: 'preg_check_positive',
      event_date: daysAgo(210),
      preg_check_method: 'ultrasound',
      expected_calving: ec010,
      notes: 'Confirmed pregnancy at 35 days.',
      recorded_by: adminId,
    },

    // C011 Nandi – natural service cycle
    {
      id: uuidv4(),
      animal_id: C011,
      event_type: 'calving',
      event_date: '2022-09-15',
      sire_id: B002,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true, calf_tag: 'C033' }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C011,
      event_type: 'bull_service',
      event_date: daysAgo(60),
      sire_id: B002,
      cost: 0,
      expected_preg_check: daysAgo(25),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C011,
      event_type: 'preg_check_positive',
      event_date: daysAgo(25),
      preg_check_method: 'manual',
      expected_calving: daysFromNow(225),
      notes: 'In calf. Manual check 35 days post-service.',
      recorded_by: adminId,
    },

    // C012 Sarie – dried off 20 days ago
    {
      id: uuidv4(),
      animal_id: C012,
      event_type: 'calving',
      event_date: '2024-01-12',
      sire_id: B005,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C012,
      event_type: 'dry_off',
      event_date: daysAgo(20),
      notes: 'BCS 3.0 at drying off. Dry cow therapy applied.',
      recorded_by: adminId,
    },

    // C013 Hettie – upcoming heat tomorrow
    {
      id: uuidv4(),
      animal_id: C013,
      event_type: 'calving',
      event_date: '2023-06-08',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C013,
      event_type: 'heat_observed',
      event_date: daysAgo(20),
      heat_signs: JSON.stringify(['standing_heat', 'chin_resting']),
      expected_next_heat: nh013,
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C013,
      event_type: 'ai_insemination',
      event_date: daysAgo(20),
      sire_id: B004,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(15),
      expected_next_heat: nh013,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C013,
      event_type: 'preg_check_negative',
      event_date: daysAgo(6),
      preg_check_method: 'blood_test',
      expected_next_heat: nh013,
      notes: 'P4 low — not in calf. Reinseminate at next heat tomorrow.',
      recorded_by: adminId,
    },

    // C014 Fiona – upcoming dry-off in 10 days, calving in 70 days
    {
      id: uuidv4(),
      animal_id: C014,
      event_type: 'ai_insemination',
      event_date: ai014,
      sire_id: B007,
      semen_id: 'AY-2024-TI-015',
      inseminator: 'Dr. M. van der Merwe',
      cost: 310,
      expected_calving: eco14,
      expected_dry_off: ado14,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C014,
      event_type: 'preg_check_positive',
      event_date: daysAgo(180),
      preg_check_method: 'ultrasound',
      expected_calving: eco14,
      expected_dry_off: ado14,
      notes: 'Single fetus. Good placentation.',
      recorded_by: adminId,
    },

    // C016 Thandi – upcoming heat in 3 days
    {
      id: uuidv4(),
      animal_id: C016,
      event_type: 'calving',
      event_date: '2024-02-20',
      sire_id: B004,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true }),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C016,
      event_type: 'heat_observed',
      event_date: daysAgo(18),
      heat_signs: JSON.stringify(['mucus_discharge', 'restlessness']),
      expected_next_heat: nh016,
      recorded_by: workerId,
    },

    // C017 Lydia – dried off 30 days ago (60-day dry period)
    {
      id: uuidv4(),
      animal_id: C017,
      event_type: 'calving',
      event_date: '2024-10-15',
      sire_id: B005,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C017,
      event_type: 'dry_off',
      event_date: daysAgo(30),
      notes: 'BCS 3.2. Teat sealant applied.',
      recorded_by: adminId,
    },

    // C018 Boetie-se-ma – overdue calving (5 days past expected date)
    {
      id: uuidv4(),
      animal_id: C018,
      event_type: 'ai_insemination',
      event_date: ai018,
      sire_id: B007,
      cost: 310,
      expected_calving: ec018_overdue,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C018,
      event_type: 'preg_check_positive',
      event_date: daysAgo(220),
      preg_check_method: 'ultrasound',
      expected_calving: ec018_overdue,
      notes: 'Confirmed pregnancy. Large calf noted on scan.',
      recorded_by: adminId,
    },

    // C019 Florrie – upcoming heat in 1 day (failed previous attempt)
    {
      id: uuidv4(),
      animal_id: C019,
      event_type: 'calving',
      event_date: '2023-12-04',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true }),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C019,
      event_type: 'heat_observed',
      event_date: daysAgo(42),
      heat_signs: JSON.stringify(['standing_heat']),
      expected_next_heat: daysAgo(21),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C019,
      event_type: 'ai_insemination',
      event_date: daysAgo(42),
      sire_id: B001,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysAgo(7),
      expected_next_heat: daysAgo(21),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C019,
      event_type: 'preg_check_negative',
      event_date: daysAgo(7),
      preg_check_method: 'blood_test',
      expected_next_heat: nh019,
      notes: 'Second failed insemination. Consult vet for hormone protocol.',
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C019,
      event_type: 'heat_observed',
      event_date: daysAgo(22),
      heat_signs: JSON.stringify(['standing_heat', 'vulva_swelling']),
      expected_next_heat: nh019,
      recorded_by: workerId,
    },

    // C020 Sanna – upcoming calving in 4 days
    {
      id: uuidv4(),
      animal_id: C020,
      event_type: 'ai_insemination',
      event_date: ai020,
      sire_id: B005,
      semen_id: 'JE-2024-SA-340',
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_calving: ec020,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C020,
      event_type: 'preg_check_positive',
      event_date: daysAgo(218),
      preg_check_method: 'ultrasound',
      expected_calving: ec020,
      notes: 'First calf heifer confirmed in calf.',
      recorded_by: adminId,
    },

    // C021 Trudie – complete recent cycle
    {
      id: uuidv4(),
      animal_id: C021,
      event_type: 'calving',
      event_date: '2024-04-10',
      sire_id: B004,
      calving_details: JSON.stringify({ calf_sex: 'female', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C021,
      event_type: 'heat_observed',
      event_date: daysAgo(35),
      heat_signs: JSON.stringify(['standing_heat', 'clear_mucus']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C021,
      event_type: 'ai_insemination',
      event_date: daysAgo(34),
      sire_id: B004,
      semen_id: 'HF-2024-AP-088',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(1),
      recorded_by: adminId,
    },

    // C024 Elna – upcoming calving in 13 days
    {
      id: uuidv4(),
      animal_id: C024,
      event_type: 'ai_insemination',
      event_date: ai024,
      sire_id: B001,
      semen_id: 'HF-2024-TH-711',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_calving: ec024,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C024,
      event_type: 'preg_check_positive',
      event_date: daysAgo(228),
      preg_check_method: 'ultrasound',
      expected_calving: ec024,
      notes: 'Strong heartbeat visible. Estimated twins excluded.',
      recorded_by: adminId,
    },
    // Liesel (C032) is her calf — calved 2024 Feb
    {
      id: uuidv4(),
      animal_id: C024,
      event_type: 'calving',
      event_date: '2025-02-14',
      sire_id: B001,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C088',
        birth_weight_kg: 40,
      }),
      notes: 'Nuut born. Dam performed well.',
      recorded_by: workerId,
    },

    // C026 Betsie – upcoming heat in 2 days
    {
      id: uuidv4(),
      animal_id: C026,
      event_type: 'calving',
      event_date: '2024-05-22',
      sire_id: B004,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true }),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C026,
      event_type: 'heat_observed',
      event_date: daysAgo(19),
      heat_signs: JSON.stringify(['standing_heat', 'chin_resting', 'increased_activity']),
      expected_next_heat: nh026,
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C026,
      event_type: 'ai_insemination',
      event_date: daysAgo(19),
      sire_id: B004,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(16),
      expected_next_heat: nh026,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C026,
      event_type: 'preg_check_negative',
      event_date: daysAgo(5),
      preg_check_method: 'manual',
      expected_next_heat: nh026,
      notes: 'Not in calf. Re-inseminate at next heat.',
      recorded_by: adminId,
    },

    // C029 Noxolo – dismissed event (sick, breeding postponed)
    {
      id: uuidv4(),
      animal_id: C029,
      event_type: 'heat_observed',
      event_date: daysAgo(10),
      heat_signs: JSON.stringify(['mucus_discharge']),
      expected_next_heat: daysFromNow(11),
      dismissed_at: new Date(today.getTime() - 9 * 86400000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19),
      dismissed_by: adminId,
      dismiss_reason: 'Cow showing signs of milk fever. Breeding deferred until recovered.',
      recorded_by: workerId,
    },

    // C032 Liesel – upcoming preg check in 5 days (inseminated 30 days ago)
    {
      id: uuidv4(),
      animal_id: C032,
      event_type: 'heat_observed',
      event_date: daysAgo(31),
      heat_signs: JSON.stringify(['standing_heat', 'vulva_swelling']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C032,
      event_type: 'ai_insemination',
      event_date: ai032,
      sire_id: B001,
      semen_id: 'HF-2024-TH-802',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: pc032,
      expected_calving: daysFromNow(250),
      recorded_by: adminId,
    },
    // C032 prior calving (Lina + twins C090-C092 born 2025-02-20 attributed to Liesel)
    {
      id: uuidv4(),
      animal_id: C032,
      event_type: 'calving',
      event_date: '2025-02-20',
      sire_id: B001,
      calving_details: JSON.stringify({
        calf_sex: 'female',
        calf_alive: true,
        calf_tag: 'C090',
        twin: true,
        twin_tag: 'C091',
        birth_weight_kg: 36,
      }),
      notes: 'Twin delivery — Lina (C090) and Tweeling-A (C091). Both alive. Vet assisted.',
      recorded_by: workerId,
    },

    // C035 Amanda – upcoming preg check in 3 days
    {
      id: uuidv4(),
      animal_id: C035,
      event_type: 'heat_observed',
      event_date: daysAgo(33),
      heat_signs: JSON.stringify(['standing_heat']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C035,
      event_type: 'ai_insemination',
      event_date: ai035,
      sire_id: B005,
      semen_id: 'JE-2024-SA-401',
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_preg_check: pc035,
      expected_calving: daysFromNow(247),
      recorded_by: adminId,
    },

    // C036 Ronel – overdue dry-off (should have dried off 3 days ago)
    {
      id: uuidv4(),
      animal_id: C036,
      event_type: 'ai_insemination',
      event_date: daysAgo(213),
      sire_id: B004,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_calving: daysFromNow(67),
      expected_dry_off: ado36_overdue,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C036,
      event_type: 'preg_check_positive',
      event_date: daysAgo(178),
      preg_check_method: 'ultrasound',
      expected_calving: daysFromNow(67),
      expected_dry_off: ado36_overdue,
      notes: 'In calf. Advised farmer to dry off at day 220 post insem.',
      recorded_by: adminId,
    },

    // C039 Gladys – dried off 15 days ago, upcoming calving
    {
      id: uuidv4(),
      animal_id: C039,
      event_type: 'ai_insemination',
      event_date: daysAgo(255),
      sire_id: B005,
      semen_id: 'JE-2024-SA-310',
      cost: 290,
      expected_calving: daysFromNow(24),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C039,
      event_type: 'preg_check_positive',
      event_date: daysAgo(220),
      preg_check_method: 'ultrasound',
      expected_calving: daysFromNow(24),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C039,
      event_type: 'dry_off',
      event_date: daysAgo(15),
      notes: 'Dried off 60 days before expected calving. BCS 3.0.',
      recorded_by: adminId,
    },

    // C043 Alet – upcoming preg check in 7 days
    {
      id: uuidv4(),
      animal_id: C043,
      event_type: 'heat_observed',
      event_date: daysAgo(29),
      heat_signs: JSON.stringify(['standing_heat', 'mucus_discharge']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C043,
      event_type: 'ai_insemination',
      event_date: ai043,
      sire_id: B001,
      semen_id: 'HF-2024-TH-900',
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: pc043,
      expected_calving: daysFromNow(252),
      recorded_by: adminId,
    },

    // C056 Madelief – dried off 10 days ago
    {
      id: uuidv4(),
      animal_id: C056,
      event_type: 'calving',
      event_date: '2024-08-30',
      sire_id: B001,
      calving_details: JSON.stringify({ calf_sex: 'male', calf_alive: true }),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C056,
      event_type: 'ai_insemination',
      event_date: daysAgo(240),
      sire_id: B001,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_calving: daysFromNow(40),
      expected_dry_off: daysAgo(10),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C056,
      event_type: 'preg_check_positive',
      event_date: daysAgo(205),
      preg_check_method: 'ultrasound',
      expected_calving: daysFromNow(40),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C056,
      event_type: 'dry_off',
      event_date: daysAgo(10),
      notes: 'Third parity cow. Excellent BCS 3.5. Teat sealant applied.',
      recorded_by: adminId,
    },

    // ── Additional historical events for completeness ──────────────────────

    // C023 Wilna – completed full cycle, in calf
    {
      id: uuidv4(),
      animal_id: C023,
      event_type: 'heat_observed',
      event_date: daysAgo(55),
      heat_signs: JSON.stringify(['standing_heat']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C023,
      event_type: 'ai_insemination',
      event_date: daysAgo(54),
      sire_id: B007,
      inseminator: 'Dr. M. van der Merwe',
      cost: 310,
      expected_preg_check: daysAgo(19),
      expected_calving: daysFromNow(225),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C023,
      event_type: 'preg_check_positive',
      event_date: daysAgo(19),
      preg_check_method: 'ultrasound',
      expected_calving: daysFromNow(225),
      notes: 'Confirmed 35-day pregnancy. Single fetus.',
      recorded_by: adminId,
    },

    // C025 Riana – completed full cycle, in calf
    {
      id: uuidv4(),
      animal_id: C025,
      event_type: 'heat_observed',
      event_date: daysAgo(62),
      heat_signs: JSON.stringify(['standing_heat', 'clear_mucus']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C025,
      event_type: 'ai_insemination',
      event_date: daysAgo(61),
      sire_id: B005,
      semen_id: 'JE-2024-SA-288',
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_preg_check: daysAgo(26),
      expected_calving: daysFromNow(218),
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C025,
      event_type: 'preg_check_positive',
      event_date: daysAgo(26),
      preg_check_method: 'manual',
      expected_calving: daysFromNow(218),
      recorded_by: adminId,
    },

    // C028 Corrie – natural service, confirmed
    {
      id: uuidv4(),
      animal_id: C028,
      event_type: 'bull_service',
      event_date: daysAgo(70),
      sire_id: B004,
      cost: 0,
      expected_preg_check: daysAgo(35),
      expected_calving: daysFromNow(210),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C028,
      event_type: 'preg_check_positive',
      event_date: daysAgo(35),
      preg_check_method: 'manual',
      expected_calving: daysFromNow(210),
      notes: 'In calf from Titan natural service.',
      recorded_by: adminId,
    },

    // C030 Miems – recent insemination, preg check upcoming
    {
      id: uuidv4(),
      animal_id: C030,
      event_type: 'heat_observed',
      event_date: daysAgo(36),
      heat_signs: JSON.stringify(['standing_heat']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C030,
      event_type: 'ai_insemination',
      event_date: daysAgo(35),
      sire_id: B005,
      inseminator: 'Dr. M. van der Merwe',
      cost: 290,
      expected_preg_check: daysFromNow(0),
      recorded_by: adminId,
    },

    // C034 Patricia – recent AI, preg check upcoming
    {
      id: uuidv4(),
      animal_id: C034,
      event_type: 'heat_observed',
      event_date: daysAgo(37),
      heat_signs: JSON.stringify(['mucus_discharge', 'restlessness']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C034,
      event_type: 'ai_insemination',
      event_date: daysAgo(36),
      sire_id: B007,
      inseminator: 'Dr. M. van der Merwe',
      cost: 310,
      expected_preg_check: daysFromNow(1),
      recorded_by: adminId,
    },

    // C037 Siphokazi – Brahman natural service cycle
    {
      id: uuidv4(),
      animal_id: C037,
      event_type: 'bull_service',
      event_date: daysAgo(80),
      sire_id: B003,
      cost: 0,
      expected_preg_check: daysAgo(45),
      expected_calving: daysFromNow(212),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C037,
      event_type: 'preg_check_positive',
      event_date: daysAgo(45),
      preg_check_method: 'manual',
      expected_calving: daysFromNow(212),
      notes: 'Confirmed. Brahman gestation 292 days.',
      recorded_by: adminId,
    },

    // C045 Nokwanda – Brahman, natural service confirmed
    {
      id: uuidv4(),
      animal_id: C045,
      event_type: 'bull_service',
      event_date: daysAgo(75),
      sire_id: B003,
      cost: 0,
      expected_preg_check: daysAgo(40),
      expected_calving: daysFromNow(217),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C045,
      event_type: 'preg_check_positive',
      event_date: daysAgo(40),
      preg_check_method: 'manual',
      expected_calving: daysFromNow(217),
      recorded_by: adminId,
    },

    // C052 Nosipho – recent first heat, AI done
    {
      id: uuidv4(),
      animal_id: C052,
      event_type: 'heat_observed',
      event_date: daysAgo(25),
      heat_signs: JSON.stringify(['standing_heat']),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C052,
      event_type: 'ai_insemination',
      event_date: daysAgo(24),
      sire_id: B004,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(11),
      recorded_by: adminId,
    },

    // C058 Corlia – abortion history, back in cycle
    {
      id: uuidv4(),
      animal_id: C058,
      event_type: 'ai_insemination',
      event_date: daysAgo(180),
      sire_id: B004,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C058,
      event_type: 'preg_check_positive',
      event_date: daysAgo(145),
      preg_check_method: 'ultrasound',
      notes: 'Confirmed pregnancy at 35 days.',
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C058,
      event_type: 'abortion',
      event_date: daysAgo(80),
      notes:
        'Spontaneous abortion at approximately 100 days gestation. Fetus removed. Vet notified.',
      recorded_by: adminId,
    },
    {
      id: uuidv4(),
      animal_id: C058,
      event_type: 'heat_observed',
      event_date: daysAgo(30),
      heat_signs: JSON.stringify(['standing_heat', 'vulva_swelling']),
      expected_next_heat: daysAgo(9),
      recorded_by: workerId,
    },
    {
      id: uuidv4(),
      animal_id: C058,
      event_type: 'ai_insemination',
      event_date: daysAgo(29),
      sire_id: B001,
      inseminator: 'Dr. H. Botha',
      cost: 380,
      expected_preg_check: daysFromNow(6),
      recorded_by: adminId,
    },

    // C059 Thozama – Brahman, natural service in progress
    {
      id: uuidv4(),
      animal_id: C059,
      event_type: 'bull_service',
      event_date: daysAgo(30),
      sire_id: B003,
      cost: 0,
      expected_preg_check: daysFromNow(5),
      recorded_by: workerId,
    },
  ]

  // dry_off is a valid app event type but was not added to the SQLite CHECK
  // constraint when migration 019 introduced it (SQLite cannot ALTER a CHECK).
  // Temporarily disable CHECK enforcement so dry_off rows insert correctly.
  const normalisedBreedingEvents = breedingEvents.map((e) => ({
    farm_id: DEFAULT_FARM_ID,
    ...e,
  }))

  if (isSQLite) await knex.raw('PRAGMA ignore_check_constraints = ON')
  try {
    await knex.batchInsert('breeding_events', normalisedBreedingEvents, 50)
  } finally {
    if (isSQLite) await knex.raw('PRAGMA ignore_check_constraints = OFF')
  }
}
