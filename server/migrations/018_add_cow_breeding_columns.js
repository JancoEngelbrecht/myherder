const { randomUUID: uuidv4 } = require('crypto')

exports.up = async function (knex) {
  // Add columns without FK constraint to avoid SQLite table rebuild
  // (SQLite ALTER TABLE ADD COLUMN works natively for simple columns)
  await knex.schema.alterTable('cows', (t) => {
    t.string('breed_type_id', 36).nullable()
    t.boolean('is_external').notNullable().defaultTo(false)
    t.string('purpose', 30).nullable()
    t.string('life_phase_override', 30).nullable()
    t.boolean('is_dry').notNullable().defaultTo(false)
  })

  // Migrate existing free-text breed values to breed_type_id
  const cows = await knex('cows').whereNotNull('breed').andWhere('breed', '!=', '')
  if (cows.length === 0) return

  const breedTypes = await knex('breed_types').select('id', 'name', 'code')
  const breedMap = new Map()
  for (const bt of breedTypes) {
    breedMap.set(bt.name.toLowerCase(), bt.id)
    breedMap.set(bt.code.toLowerCase(), bt.id)
  }

  const now = knex.fn.now()

  for (const cow of cows) {
    const breedText = cow.breed.trim().toLowerCase()
    let breedTypeId = breedMap.get(breedText)

    if (!breedTypeId) {
      // Create a new breed_type for unmatched values
      const code = breedText.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      const existing = await knex('breed_types').where('code', code).first()
      if (existing) {
        breedTypeId = existing.id
      } else {
        breedTypeId = uuidv4()
        await knex('breed_types').insert({
          id: breedTypeId,
          code,
          name: cow.breed.trim(),
          is_active: true,
          sort_order: 99,
          created_at: now,
          updated_at: now,
        })
      }
      breedMap.set(breedText, breedTypeId)
    }

    await knex('cows').where('id', cow.id).update({ breed_type_id: breedTypeId })
  }
}

exports.down = async function (knex) {
  await knex.schema.alterTable('cows', (t) => {
    t.dropColumn('breed_type_id')
    t.dropColumn('is_external')
    t.dropColumn('purpose')
    t.dropColumn('life_phase_override')
    t.dropColumn('is_dry')
  })
}
