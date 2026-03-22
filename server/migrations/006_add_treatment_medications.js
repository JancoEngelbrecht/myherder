const { randomUUID } = require('crypto')

exports.up = async function (knex) {
  await knex.schema.createTable('treatment_medications', (t) => {
    t.string('id', 36).primary()
    t.string('treatment_id', 36)
      .notNullable()
      .references('id')
      .inTable('treatments')
      .onDelete('CASCADE')
    t.string('medication_id', 36).notNullable().references('id').inTable('medications')
    t.string('dosage', 50).nullable()
  })

  // Migrate existing single-medication treatments into the junction table
  const existing = await knex('treatments')
    .select('id', 'medication_id', 'dosage')
    .whereNotNull('medication_id')

  for (const tx of existing) {
    await knex('treatment_medications').insert({
      id: randomUUID(),
      treatment_id: tx.id,
      medication_id: tx.medication_id,
      dosage: tx.dosage || null,
    })
  }
}

exports.down = async function (knex) {
  await knex.schema.dropTable('treatment_medications')
}
