const knex = require('knex')
const knexConfig = require('../../knexfile')
const { nodeEnv } = require('./env')

const db = knex(knexConfig[nodeEnv])

module.exports = db
