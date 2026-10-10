import query from '../../util/db'

const CONVO_ID = '770e8400-e29b-41d4-a716-446655440002'
const USER_ID = '550e8400-e29b-41d4-a716-446655440000'

const insertUser = (userId: string, username: string) =>
  query(
    `INSERT INTO users (user_id, display_name, username, hashed_password, verified)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, 'Test User', username, 'hashed', true],
  )

describe('SQLite query', () => {
  beforeEach(async () => {
    await query('DELETE FROM users', [])
    await query('DELETE FROM conversations', [])
  })

  it('reports rows returned for SELECT and RETURNING statements', async () => {
    const inserted = await query(
      'INSERT INTO conversations (convo_id, name) VALUES (?, ?) RETURNING *',
      [CONVO_ID, 'Chat'],
    )
    const selected = await query('SELECT * FROM conversations', [])
    const selectedNothing = await query(
      'SELECT 1 FROM conversations WHERE name = ?',
      ['missing'],
    )

    expect(inserted.rowCount).toBe(1)
    expect(inserted.rows[0].convo_id).toBe(CONVO_ID)
    expect(selected.rowCount).toBe(1)
    expect(selectedNothing.rowCount).toBe(0)
  })

  it('reports rows changed for statements without RETURNING', async () => {
    await query('INSERT INTO conversations (convo_id, name) VALUES (?, ?)', [
      CONVO_ID,
      'Chat',
    ])

    const updated = await query(
      'UPDATE conversations SET name = ? WHERE convo_id = ?',
      ['Renamed', CONVO_ID],
    )
    const deleted = await query(
      'DELETE FROM conversations WHERE convo_id = ?',
      [CONVO_ID],
    )

    expect(updated).toEqual({ rows: [], rowCount: 1 })
    expect(deleted).toEqual({ rows: [], rowCount: 1 })
  })

  it('stores booleans as 0/1, dates as ISO text, and undefined as null', async () => {
    const date = new Date('2026-01-31T12:34:56.789Z')
    await insertUser(USER_ID, 'testuser')

    const result = await query(
      'UPDATE users SET verify_token_timestamp = ?, email = ? WHERE user_id = ? RETURNING *',
      [date, undefined, USER_ID],
    )

    expect(result.rows[0].verified).toBe(1)
    expect(result.rows[0].verify_token_timestamp).toBe(
      '2026-01-31T12:34:56.789Z',
    )
    expect(result.rows[0].email).toBeNull()
  })

  it('binds a numbered parameter everywhere it appears', async () => {
    const result = await query('SELECT ?1 AS first, ?1 AS second', ['value'])

    expect(result.rows[0]).toEqual({ first: 'value', second: 'value' })
  })

  it('defaults timestamps to ISO-8601 UTC text', async () => {
    const result = await query(
      'INSERT INTO conversations (convo_id, name) VALUES (?, ?) RETURNING created_at',
      [CONVO_ID, 'Chat'],
    )

    expect(result.rows[0].created_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    )
  })

  it('enforces foreign keys and cascades deletes', async () => {
    await query('INSERT INTO conversations (convo_id, name) VALUES (?, ?)', [
      CONVO_ID,
      'Chat',
    ])
    await query(
      `INSERT INTO messages (message_id, convo_id, type, content, sender_type)
       VALUES (?, ?, 'text', 'hi', 'anonymous')`,
      ['660e8400-e29b-41d4-a716-446655440001', CONVO_ID],
    )

    await query('DELETE FROM conversations WHERE convo_id = ?', [CONVO_ID])
    const messages = await query('SELECT * FROM messages', [])

    expect(messages.rowCount).toBe(0)
    await expect(
      query(
        `INSERT INTO messages (message_id, convo_id, type, content, sender_type)
         VALUES (?, ?, 'text', 'hi', 'anonymous')`,
        ['660e8400-e29b-41d4-a716-446655440009', CONVO_ID],
      ),
    ).rejects.toThrow('FOREIGN KEY constraint failed')
  })

  it('treats usernames as case-insensitive and unique', async () => {
    await insertUser(USER_ID, 'TestUser')

    const found = await query('SELECT * FROM users WHERE username = ?', [
      'testuser',
    ])

    expect(found.rowCount).toBe(1)
    await expect(
      insertUser('550e8400-e29b-41d4-a716-446655440009', 'TESTUSER'),
    ).rejects.toThrow('UNIQUE constraint failed: users.username')
  })

  it('rejects usernames that do not match the allowed characters', async () => {
    await expect(insertUser(USER_ID, 'bad name')).rejects.toThrow(
      'CHECK constraint failed',
    )
    await expect(insertUser(USER_ID, 'ab')).rejects.toThrow(
      'CHECK constraint failed',
    )
    await expect(insertUser(USER_ID, 'ok_name.with-dash')).resolves.toEqual({
      rows: [],
      rowCount: 1,
    })
  })

  it('rejects message content over 4096 bytes', async () => {
    await query('INSERT INTO conversations (convo_id, name) VALUES (?, ?)', [
      CONVO_ID,
      'Chat',
    ])

    await expect(
      query(
        `INSERT INTO messages (message_id, convo_id, type, content, sender_type)
         VALUES (?, ?, 'text', ?, 'anonymous')`,
        ['660e8400-e29b-41d4-a716-446655440001', CONVO_ID, 'é'.repeat(2049)],
      ),
    ).rejects.toThrow('CHECK constraint failed')
  })

  it('bumps the conversation updated_at when a message is added', async () => {
    const longAgo = '2020-01-01T00:00:00.000Z'
    await query(
      'INSERT INTO conversations (convo_id, name, updated_at) VALUES (?, ?, ?)',
      [CONVO_ID, 'Chat', longAgo],
    )

    await query(
      `INSERT INTO messages (message_id, convo_id, type, content, sender_type)
       VALUES (?, ?, 'text', 'hi', 'anonymous')`,
      ['660e8400-e29b-41d4-a716-446655440001', CONVO_ID],
    )
    const conversation = await query(
      'SELECT updated_at FROM conversations WHERE convo_id = ?',
      [CONVO_ID],
    )

    expect(conversation.rows[0].updated_at > longAgo).toBe(true)
  })
})
