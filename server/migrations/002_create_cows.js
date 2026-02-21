exports.up = function (knex) {
  return knex.schema.createTable('cows', (table) => {
    table.uuid('id').primary();
    table.string('tag_number').unique().notNullable();
    table.string('name');
    table.date('dob');
    table.string('breed');
    table.enum('sex', ['female', 'male']).notNullable().defaultTo('female');
    table.enum('status', ['active', 'dry', 'pregnant', 'sick', 'sold', 'dead']).notNullable().defaultTo('active');
    table.uuid('sire_id').references('id').inTable('cows');
    table.uuid('dam_id').references('id').inTable('cows');
    table.text('notes');
    table.uuid('created_by').references('id').inTable('users');
    table.timestamps(true, true);
    table.timestamp('deleted_at');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('cows');
};
