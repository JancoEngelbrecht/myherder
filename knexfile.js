require('dotenv').config(process.env.NODE_ENV === 'test' ? { quiet: true } : undefined)

module.exports = {
  test: {
    client: 'better-sqlite3',
    connection: { filename: ':memory:' },
    useNullAsDefault: true,
    migrations: { directory: './server/migrations' },
    pool: {
      afterCreate: (conn, cb) => {
        conn.pragma('foreign_keys = ON')
        cb(null, conn)
      },
    },
  },

  development: {
    client: 'better-sqlite3',
    connection: {
      filename: process.env.DB_PATH || './dev.sqlite3',
    },
    useNullAsDefault: true,
    migrations: {
      directory: './server/migrations',
    },
    seeds: {
      directory: './server/seeds',
    },
    pool: {
      afterCreate: (conn, cb) => {
        conn.pragma('foreign_keys = ON')
        cb(null, conn)
      },
    },
  },

  production: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: 'utf8mb4',
    },
    pool: { min: 0, max: 5 },
    migrations: {
      directory: './server/migrations',
    },
    seeds: {
      directory: './server/seeds/production',
    },
  },
}
