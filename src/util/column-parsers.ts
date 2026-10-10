type StoredTimestamp = string | Date | null | undefined
type StoredBoolean = number | boolean | null | undefined

/** Converts a stored ISO-8601 timestamp to a Date; a missing value becomes undefined. */
export const parseTimestamp = (value: StoredTimestamp): Date | undefined =>
  value === null || value === undefined ? undefined : new Date(value)

/** Converts a stored ISO-8601 timestamp to a Date; a missing value becomes null. */
export const parseNullableTimestamp = (value: StoredTimestamp): Date | null =>
  value === null || value === undefined ? null : new Date(value)

/** Converts a stored 0/1 flag to a boolean. */
export const parseBoolean = (value: StoredBoolean): boolean | undefined =>
  value === null || value === undefined ? undefined : Boolean(value)
