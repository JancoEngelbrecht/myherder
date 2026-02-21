exports.up = function (knex) {
  return knex.schema.alterTable('treatments', (t) => {
    t.string('health_issue_id', 36).nullable().references('id').inTable('health_issues').after('id')
  })
}

exports.down = function (knex) {
  return knex.schema.alterTable('treatments', (t) => {
    t.dropColumn('health_issue_id')
  })
}
