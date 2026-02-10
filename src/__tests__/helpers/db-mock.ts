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
    user_id: '550e8400-e29b-41d4-a716-446655440000',
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
    token_version: 0,
    password_changed_at: null,
    disabled: false,
    ...overrides,
  }
}

/**
 * Mock message database row
 */
export const createMockMessageRow = (overrides: any = {}) => {
  return {
    message_id: '660e8400-e29b-41d4-a716-446655440001',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    convo_id: '770e8400-e29b-41d4-a716-446655440002',
    sender_id: '550e8400-e29b-41d4-a716-446655440000',
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
    convo_id: '770e8400-e29b-41d4-a716-446655440002',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    name: 'Test Conversation',
    creator_id: null,
    ...overrides,
  }
}

/**
 * Mock conversation_visits database row
 */
export const createMockConversationVisitRow = (overrides: any = {}) => {
  return {
    user_id: '550e8400-e29b-41d4-a716-446655440000',
    convo_id: '770e8400-e29b-41d4-a716-446655440002',
    visited_at: new Date('2024-01-01'),
    ...overrides,
  }
}
