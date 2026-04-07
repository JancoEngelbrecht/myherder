import knexLib, { Knex } from 'knex'
const knexConfig = require('../../knexfile')
const { nodeEnv } = require('./env')

const db: Knex = knexLib(knexConfig[nodeEnv as string])

module.exports = db
