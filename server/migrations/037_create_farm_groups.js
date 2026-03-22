/**
 * Migration 037: Create farm_groups and farm_group_members tables
 *
 * Farm groups define which farms can share users for farm switching.
 * A farm can belong to at most one group (UNIQUE constraint on farm_id).
 * Groups require at least 2 members — enforced at the application layer.
 */

exports.up = async function (knex) {
  await knex.schema.createTable('farm_groups', (table) => {
    table.uuid('id').primary()
    table.string('name', 100).notNullable()
    table.timestamp('created_at').defaultTo(knex.fn.now())
    table.timestamp('updated_at').defaultTo(knex.fn.now())
  })

  await knex.schema.createTable('farm_group_members', (table) => {
    table.uuid('id').primary()
    table.uuid('farm_group_id').notNullable()
    table.uuid('farm_id').notNullable()
    table.timestamp('added_at').defaultTo(knex.fn.now())

    table.foreign('farm_group_id').references('farm_groups.id').onDelete('CASCADE')
    table.foreign('farm_id').references('farms.id').onDelete('CASCADE')
    table.unique('farm_id')
    table.index('farm_group_id')
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('farm_group_members')
  await knex.schema.dropTableIfExists('farm_groups')
}
