const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

exports.seed = async function (knex) {
  await knex('treatments').del();
  await knex('medications').del();
  await knex('cows').del();
  await knex('users').del();

  const adminId = uuidv4();
  const workerId = uuidv4();

  await knex('users').insert([
    {
      id: adminId,
      username: 'admin',
      password_hash: await bcrypt.hash('admin123', 10),
      full_name: 'Farm Admin',
      role: 'admin',
      permissions: JSON.stringify(['can_manage_cows', 'can_manage_users']),
      language: 'en',
      is_active: true,
      failed_attempts: 0
    },
    {
      id: workerId,
      username: 'sipho',
      pin_hash: await bcrypt.hash('1234', 10),
      full_name: 'Sipho Ndlovu',
      role: 'worker',
      permissions: JSON.stringify(['can_manage_cows']),
      language: 'af',
      is_active: true,
      failed_attempts: 0
    }
  ]);

  // Sire and dam first so we can reference them
  const sire1 = uuidv4();
  const dam1 = uuidv4();
  const dam2 = uuidv4();

  const cows = [
    { id: sire1, tag_number: 'B001', name: 'Thunder', dob: '2019-03-15', breed: 'Holstein', sex: 'male', status: 'active', created_by: adminId },
    { id: dam1, tag_number: 'C001', name: 'Bella', dob: '2018-07-20', breed: 'Holstein', sex: 'female', status: 'active', created_by: adminId },
    { id: dam2, tag_number: 'C002', name: 'Daisy', dob: '2019-01-10', breed: 'Jersey', sex: 'female', status: 'pregnant', created_by: adminId },
    { id: uuidv4(), tag_number: 'C003', name: 'Rosie', dob: '2020-05-22', breed: 'Holstein', sex: 'female', status: 'active', sire_id: sire1, dam_id: dam1, created_by: adminId },
    { id: uuidv4(), tag_number: 'C004', name: 'Buttercup', dob: '2020-09-14', breed: 'Jersey', sex: 'female', status: 'dry', sire_id: sire1, dam_id: dam2, created_by: adminId },
    { id: uuidv4(), tag_number: 'C005', name: 'Clover', dob: '2021-02-03', breed: 'Ayrshire', sex: 'female', status: 'active', created_by: adminId },
    { id: uuidv4(), tag_number: 'C006', name: 'Molly', dob: '2021-06-18', breed: 'Holstein', sex: 'female', status: 'sick', created_by: workerId },
    { id: uuidv4(), tag_number: 'C007', name: 'Star', dob: '2022-01-25', breed: 'Jersey', sex: 'female', status: 'active', dam_id: dam1, created_by: workerId },
    { id: uuidv4(), tag_number: 'C008', name: 'Patches', dob: '2022-04-11', breed: 'Nguni', sex: 'female', status: 'active', created_by: adminId },
    { id: uuidv4(), tag_number: 'B002', name: 'Duke', dob: '2021-08-30', breed: 'Brahman', sex: 'male', status: 'sold', created_by: adminId }
  ];

  await knex('cows').insert(cows);
};
