const SQLITE_CONSTRAINT_UNIQUE = 2067

/**
 * Whether an error is a UNIQUE constraint failure on the given column,
 * written as `table.column` (e.g. `users.email`).
 */
export const isUniqueConstraintViolation = (
  error: unknown,
  tableColumn: string,
): boolean => {
  const sqliteError = error as { errcode?: number; message?: string } | null
  return (
    sqliteError?.errcode === SQLITE_CONSTRAINT_UNIQUE &&
    String(sqliteError.message).includes(tableColumn)
  )
}
