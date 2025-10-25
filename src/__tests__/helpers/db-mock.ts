import { QueryResult, QueryResultRow } from 'pg'

/**
 * Mock query results for testing
 */
export const createMockQueryResult = <T extends QueryResultRow = any>(
  rows: T[] = [],
  rowCount: number | null = null
): QueryResult<T> => {
  return {
    rows,
    rowCount: rowCount !== null ? rowCount : rows.length,
    command: '',
    oid: 0,
    fields: [],
  }
}

/**
 * Mock user database row
 */
export const createMockUserRow = (overrides: any = {}) => {
  return {
    user_id: 'test-user-id-123',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    display_name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    profile_pic_url: null,
    hashed_password: '$2a$12$hashedpassword',
    verified: false,
    verify_token: null,
    verify_token_timestamp: null,
    reset_password_token: null,
    reset_password_token_timestamp: null,
    ...overrides,
  }
}

/**
 * Mock message database row
 */
export const createMockMessageRow = (overrides: any = {}) => {
  return {
    message_id: 'test-message-id-123',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    convo_id: 'test-convo-id-123',
    sender_id: 'test-user-id-123',
    type: 'text',
    content: 'Test message content',
    sender_name: null,
    sender_avatar: null,
    ...overrides,
  }
}

/**
 * Mock conversation database row
 */
export const createMockConversationRow = (overrides: any = {}) => {
  return {
    convo_id: 'test-convo-id-123',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    name: 'Test Conversation',
    creator_id: null,
    ...overrides,
  }
}
