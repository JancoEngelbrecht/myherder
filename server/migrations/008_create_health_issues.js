exports.up = function (knex) {
  return knex.schema.createTable('health_issues', (t) => {
    t.string('id', 36).primary()
    t.string('cow_id', 36).notNullable().references('id').inTable('cows')
    t.string('reported_by', 36).notNullable().references('id').inTable('users')
    t.enum('issue_type', [
      'lameness',
      'mastitis',
      'respiratory',
      'digestive',
      'fever',
      'bad_milk',
      'eye',
      'calving',
      'other',
    ]).notNullable()
    t.enum('severity', ['low', 'medium', 'high']).notNullable().defaultTo('medium')
    t.json('affected_teats').nullable()
    t.text('description')
    t.datetime('observed_at').notNullable()
    t.enum('status', ['open', 'treating', 'resolved']).notNullable().defaultTo('open')
    t.datetime('resolved_at').nullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
    t.timestamp('updated_at').defaultTo(knex.fn.now())
    t.timestamp('synced_at').nullable()
    t.index('cow_id')
    t.index('status')
    t.index('observed_at')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('health_issues')
}
