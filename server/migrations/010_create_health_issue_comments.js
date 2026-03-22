exports.up = (knex) =>
  knex.schema.createTable('health_issue_comments', (t) => {
    t.uuid('id').primary()
    t.uuid('health_issue_id')
      .notNullable()
      .references('id')
      .inTable('health_issues')
      .onDelete('CASCADE')
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
    t.text('comment').notNullable()
    t.timestamp('created_at').notNullable()
    t.timestamp('updated_at').notNullable()
    t.index('health_issue_id')
  })

exports.down = (knex) => knex.schema.dropTable('health_issue_comments')
