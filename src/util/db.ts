import pg, { Pool } from 'pg'

const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'messages',
  password: process.env.PGPASSWORD || 'password',
  port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
  keepAlive: true,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

// Surface pool-level failures (e.g. pg_hba rejects on a fresh connection)
// instead of letting them go unhandled and crash the process.
pool.on('error', (error) => {
  console.error('[db] unexpected error on idle client', error)
})

const query = (
  query: string,
  params: (string | number | boolean | null | undefined)[]
): Promise<pg.QueryResult> => {
  return pool.query(query, params)
}

export default query
