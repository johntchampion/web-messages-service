import fs from 'fs'
import path from 'path'
import { DatabaseSync, SQLInputValue } from 'node:sqlite'

export type QueryParam = string | number | boolean | Date | null | undefined

export interface QueryResult<Row = any> {
  rows: Row[]
  rowCount: number
}

const DEFAULT_DATABASE_PATH = path.join('data', 'messages.db')
const SCHEMA_PATH = path.join(__dirname, '..', '..', 'database', 'schema.sql')
const IN_MEMORY_DATABASE_PATH = ':memory:'

let database: DatabaseSync | undefined

const getDatabase = (): DatabaseSync => {
  if (!database) {
    database = openDatabase(process.env.SQLITE_PATH || DEFAULT_DATABASE_PATH)
  }
  return database
}

const openDatabase = (databasePath: string): DatabaseSync => {
  if (databasePath !== IN_MEMORY_DATABASE_PATH) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  }

  const openedDatabase = new DatabaseSync(databasePath)
  openedDatabase.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
  `)
  openedDatabase.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'))
  return openedDatabase
}

const toSqliteValue = (param: QueryParam): SQLInputValue => {
  if (param === undefined) return null
  if (typeof param === 'boolean') return param ? 1 : 0
  if (param instanceof Date) return param.toISOString()
  return param
}

/**
 * Runs a parameterized statement. Statements that produce rows (SELECT or
 * RETURNING) report the number of rows returned; others report rows changed.
 */
const query = async (
  sql: string,
  params: QueryParam[] = [],
): Promise<QueryResult> => {
  const statement = getDatabase().prepare(sql)
  const values = params.map(toSqliteValue)

  if (statement.columns().length > 0) {
    const rows = statement.all(...values)
    return { rows, rowCount: rows.length }
  }

  const { changes } = statement.run(...values)
  return { rows: [], rowCount: Number(changes) }
}

export default query
