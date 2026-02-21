exports.up = async function (knex) {
  // Add new issue_types column (JSON array, like affected_teats)
  await knex.schema.table('health_issues', (t) => {
    t.text('issue_types').nullable()
  })
  // Migrate existing single value into a one-element JSON array
  await knex.raw(`UPDATE health_issues SET issue_types = json_array(issue_type)`)
  // Drop the old single-value column (requires SQLite ≥ 3.35, bundled with better-sqlite3 ≥ v7)
  await knex.schema.table('health_issues', (t) => {
    t.dropColumn('issue_type')
  })
}

exports.down = async function (knex) {
  await knex.schema.table('health_issues', (t) => {
    t.text('issue_type').nullable()
  })
  // Restore first element from the array
  await knex.raw(`UPDATE health_issues SET issue_type = json_extract(issue_types, '$[0]')`)
  await knex.schema.table('health_issues', (t) => {
    t.dropColumn('issue_types')
  })
}
