const { v4: uuidv4 } = require('uuid')

exports.seed = async function (knex) {
  // Only insert if the table is empty
  const count = await knex('medications').count('id as n').first()
  if (count.n > 0) return

  const now = new Date().toISOString()

  await knex('medications').insert([
    {
      id: uuidv4(),
      name: 'Penicillin G',
      active_ingredient: 'Benzylpenicillin',
      withdrawal_milk_hours: 72,
      withdrawal_meat_days: 10,
      default_dosage: '5ml',
      unit: 'ml',
      notes: 'Broad-spectrum antibiotic. Administer IM.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Oxytetracycline 200mg/ml',
      active_ingredient: 'Oxytetracycline',
      withdrawal_milk_hours: 96,
      withdrawal_meat_days: 28,
      default_dosage: '10ml',
      unit: 'ml',
      notes: 'Long-acting. For respiratory and systemic infections.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Flunixin Meglumine (Banamine)',
      active_ingredient: 'Flunixin',
      withdrawal_milk_hours: 36,
      withdrawal_meat_days: 4,
      default_dosage: '2ml',
      unit: 'ml',
      notes: 'NSAID. Anti-inflammatory and analgesic.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Mastitis Intramammary Tube',
      active_ingredient: 'Cloxacillin',
      withdrawal_milk_hours: 96,
      withdrawal_meat_days: 7,
      default_dosage: '1 tube',
      unit: 'tube',
      notes: 'For mastitis. Infuse directly into affected quarter after milking.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
    {
      id: uuidv4(),
      name: 'Vitamins B-complex',
      active_ingredient: 'B-vitamins',
      withdrawal_milk_hours: 0,
      withdrawal_meat_days: 0,
      default_dosage: '10ml',
      unit: 'ml',
      notes: 'No withdrawal period. General supplementation.',
      is_active: true,
      created_at: now,
      updated_at: now,
    },
  ])
}
