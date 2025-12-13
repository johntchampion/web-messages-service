import query from '../util/db'
import isUUID from '../util/uuid'

export type ContentType = 'text' | 'image'

/**
 * Mirrors DB columns; everything optional so we can do partial updates safely.
 */
export interface MessageProps {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  convoId: string
  senderId?: string | null
  type: ContentType
  content: string
  senderName?: string | null
  senderAvatar?: string | null
}

export interface MessagePatch {
  convoId?: string
  senderId?: string | null
  type?: ContentType
  content?: string
  senderName?: string | null
  senderAvatar?: string | null
}

export interface ListOptions {
  /** Max rows to return. Defaults to 50; capped at 200. */
  limit?: number
  /**
   * Return messages created **before** this (cursor) tuple.
   * Use values returned from list() for stable pagination.
   */
  before?: { createdAt: Date; id: string }
  /**
   * Return messages created **after** this (cursor) tuple.
   * Useful for “load newer” or live tailing.
   */
  after?: { createdAt: Date; id: string }
  /** Sort order by created_at (and id tiebreak). Default 'asc'. */
  order?: 'asc' | 'desc'
}

export default class Message implements MessageProps {
  id?: string
  createdAt?: Date
  updatedAt?: Date
  convoId: string
  senderId?: string | null
  type: ContentType
  content: string
  senderName?: string | null
  senderAvatar?: string | null

  constructor(props: MessageProps) {
    this.id = props.id
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
    this.convoId = props.convoId
    this.senderId = props.senderId ?? null
    this.type = props.type
    this.content = props.content
    this.senderName = props.senderName ?? null
    this.senderAvatar = props.senderAvatar ?? null
  }

  // ----------------- Create -----------------

  /**
   * Creates the message.
   */
  async create(): Promise<Message> {
    validateContentLength(this.content)

    const sql = `
      INSERT INTO messages (
        convo_id, sender_id, type, content, sender_name, sender_avatar
      )
      VALUES ($1, $2, $3::content_type, $4, $5, $6)
      RETURNING *
    `
    const params = [
      this.convoId,
      this.senderId ?? null,
      this.type,
      this.content,
      this.senderName ?? null,
      this.senderAvatar ?? null,
    ]

    try {
      const result = await query(sql, params)
      if (result.rowCount && result.rowCount > 0) {
        Object.assign(this, Message.parseRow(result.rows[0]))
        return this
      }
      throw new Error('Insert returned no rows.')
    } catch (error) {
      throw new Error('Failed to insert message.')
    }
  }

  /**
   * Returns whether DB contains this message.
   */
  async isCreated(): Promise<boolean> {
    if (!this.id) return false
    const r = await query('SELECT 1 FROM messages WHERE message_id = $1', [
      this.id,
    ])
    return !!r.rowCount
  }

  /**
   * Partial update. Pass only fields you want to change.
   * `updated_at` is handled by trigger in DB.
   */
  async update(patch: MessagePatch = {}): Promise<Message> {
    if (!this.id) throw new Error('Message has not been persisted yet.')

    if (patch.content !== undefined) validateContentLength(patch.content)

    const sets: string[] = []
    const values: any[] = []
    const push = (sqlFragment: string, v: any) => {
      values.push(v)
      sets.push(`${sqlFragment} = $${values.length}`)
    }

    if ('convoId' in patch) push('convo_id', patch.convoId)
    if ('senderId' in patch) push('sender_id', patch.senderId ?? null)
    if ('type' in patch) push('type', patch.type)
    if ('content' in patch) push('content', patch.content)
    if ('senderName' in patch) push('sender_name', patch.senderName ?? null)
    if ('senderAvatar' in patch)
      push('sender_avatar', patch.senderAvatar ?? null)

    if (sets.length === 0) return this.reload()

    const sql = `UPDATE messages SET ${sets.join(', ')} WHERE message_id = $${
      values.length + 1
    } RETURNING *`
    values.push(this.id)

    const result = await query(sql, values)
    if (!result.rowCount) throw new Error('Failed to update message.')

    const fresh = Message.parseRow(result.rows[0])
    Object.assign(this, fresh)
    return this
  }

  /**
   * Reloads from DB.
   */
  async reload(): Promise<Message> {
    if (!this.id) throw new Error('Message has not been persisted yet.')
    const res = await query('SELECT * FROM messages WHERE message_id = $1', [
      this.id,
    ])
    if (!res.rowCount) throw new Error('Could not reload message.')
    Object.assign(this, Message.parseRow(res.rows[0]))
    return this
  }

  /**
   * Deletes the user.
   */
  async delete(): Promise<Message> {
    if (!this.id) throw new Error('This user does not exist.')
    await query('DELETE FROM messages WHERE message_id = $1', [this.id])
    return this
  }

  /**
   * Find a message by its ID.
   */
  static async findById(id: string): Promise<Message | null> {
    // Validate UUID format before querying database
    if (!isUUID(id)) {
      return null
    }

    const res = await query('SELECT * FROM messages WHERE message_id = $1', [
      id,
    ])
    return res.rowCount ? Message.parseRow(res.rows[0]) : null
  }

  /**
   * List messages in a conversation with cursor pagination.
   * - order: 'asc' (oldest→newest) or 'desc' (newest→oldest)
   * - before/after: pass the tuple returned from a prior call for stable paging
   */
  static async listByConversation(
    convoId: string,
    opts: ListOptions = {}
  ): Promise<{
    messages: Message[]
    pageInfo: {
      hasMore: boolean
      nextBefore?: { createdAt: Date; id: string }
      nextAfter?: { createdAt: Date; id: string }
    }
  }> {
    // Validate UUID format before querying database
    if (!isUUID(convoId)) {
      return { messages: [], pageInfo: { hasMore: false } }
    }

    const limit = clamp(opts.limit ?? 50, 1, 200)
    const order = opts.order ?? 'asc'

    // Build cursor predicates using a (created_at, message_id) composite to break ties
    const whereParts = ['m.convo_id = $1']
    const params: any[] = [convoId]
    let paramIdx = params.length

    if (opts.before) {
      // strictly older than the tuple
      whereParts.push(
        `(m.created_at, m.message_id) < ($${++paramIdx}, $${++paramIdx}::uuid)`
      )
      params.push(opts.before.createdAt, opts.before.id)
    }
    if (opts.after) {
      // strictly newer than the tuple
      whereParts.push(
        `(m.created_at, m.message_id) > ($${++paramIdx}, $${++paramIdx}::uuid)`
      )
      params.push(opts.after.createdAt, opts.after.id)
    }

    const sql = `
      SELECT m.*
      FROM messages m
      WHERE ${whereParts.join(' AND ')}
      ORDER BY m.created_at ${order}, m.message_id ${order}
      LIMIT $${++paramIdx}
    `
    params.push(limit + 1) // fetch one extra to decide hasMore

    const res = await query(sql, params)
    const rows = res.rows as any[]

    const hasMore = rows.length > limit
    const slice = hasMore ? rows.slice(0, limit) : rows
    const messages = slice.map(Message.parseRow)

    // prepare cursors for next paging calls (based on the returned slice order)
    const nextBefore =
      messages.length > 0
        ? {
            createdAt: messages[0].createdAt!,
            id: messages[0].id!,
          }
        : undefined

    const nextAfter =
      messages.length > 0
        ? {
            createdAt: messages[messages.length - 1].createdAt!,
            id: messages[messages.length - 1].id!,
          }
        : undefined

    return { messages, pageInfo: { hasMore, nextBefore, nextAfter } }
  }

  // Map DB row → domain object
  /**
   * Maps a DB row to a Message object.
   */
  static parseRow(row: any): Message {
    return new Message({
      id: row['message_id'],
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
      convoId: row['convo_id'],
      senderId: row['sender_id'],
      type: row['type'],
      content: row['content'],
      senderName: row['sender_name'],
      senderAvatar: row['sender_avatar'],
    })
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

/**
 * Mirror DB CHECK (octet_length(content) <= 4096)
 * so we fail fast before sending to DB.
 */
function validateContentLength(content: string) {
  // Use Buffer.byteLength to match octet_length semantics
  const bytes = Buffer.byteLength(content ?? '', 'utf8')
  if (bytes > 4096) {
    throw new Error(`Message content exceeds 4096 bytes (got ${bytes}).`)
  }
}
