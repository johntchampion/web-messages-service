/**
 * UUID v4 regex pattern for validation
 */
const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates if a string matches UUID v4 format
 * @param value The string to test
 * @returns True if the string is a valid UUID, false otherwise
 */
export default function isUUID(value: string): boolean {
  return uuidRegex.test(value)
}
