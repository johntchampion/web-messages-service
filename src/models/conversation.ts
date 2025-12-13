import query from '../util/db'
import isUUID from '../util/uuid'

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000
const EXPIRY_DAYS = 30

class Conversation {
  createdAt?: Date
  updatedAt?: Date
  name: string
  id?: string
  creatorId?: string | null

  constructor(config: {
    id?: string
    name: string
    createdAt?: Date
    updatedAt?: Date
    creatorId?: string | null
  }) {
    this.id = config.id
    this.name = config.name
    this.createdAt = config.createdAt
    this.updatedAt = config.updatedAt
    this.creatorId = config.creatorId
  }

  /**
   * Creates or updates an instance of a conversation in the database.
   */
  async update(): Promise<void> {
    let result
    if (this.id) {
      result = await query(
        'UPDATE conversations SET name = $1, creator_id = $2 WHERE convo_id = $3 RETURNING *;',
        [this.name, this.creatorId, this.id]
      )
    } else {
      result = await query(
        'INSERT INTO conversations (name, creator_id) VALUES ($1, $2) RETURNING *;',
        [this.name, this.creatorId]
      )
    }

    this.name = result.rows[0]['name']
    this.createdAt = result.rows[0]['created_at']
    this.updatedAt = result.rows[0]['updated_at']
    this.id = result.rows[0]['convo_id']
    this.creatorId = result.rows[0]['creator_id']

    return
  }

  /**
   * Deletes an instance of a conversation in the database.
   */
  async delete(): Promise<void> {
    if (!this.id) return
    await query(
      `
      DELETE FROM conversations WHERE convo_id = $1 RETURNING convo_id;
      `,
      [this.id]
    )
  }

  /**
   * Returns a date and time which this conversation and its messages will be deleted.
   * @returns The date this conversatoin and its messages will be deleted.
   */
  getDeletionDate(): Date | void {
    if (!this.updatedAt) return

    const deletionDate = new Date(this.updatedAt)
    deletionDate.setDate(this.updatedAt.getDate() + EXPIRY_DAYS)

    return deletionDate
  }

  /**
   * Queries a single conversation.
   * @param id The ID of the conversation.
   * @returns A Conversation object.
   */
  static findById = async (id: string): Promise<Conversation> => {
    // Validate UUID format before querying database
    if (!isUUID(id)) {
      throw new Error('There is no conversation with that ID.')
    }

    const dbConversations = await query(
      'SELECT * FROM conversations WHERE convo_id = $1;',
      [id]
    )

    if (dbConversations?.rowCount && dbConversations.rowCount > 0) {
      const conversation = new Conversation({
        createdAt: dbConversations.rows[0]['created_at'],
        updatedAt: dbConversations.rows[0]['updated_at'],
        name: dbConversations.rows[0]['name'],
        id: dbConversations.rows[0]['convo_id'],
        creatorId: dbConversations.rows[0]['creator_id'],
      })
      return conversation
    } else {
      throw new Error('There is no conversation with that ID.')
    }
  }

  /**
   * Returns an array of Conversations created by a specific user.
   * @param userId The ID of the user who created the conversations.
   * @returns An array of Conversation objects created by the user.
   */
  static findByUserId = async (userId: string): Promise<Conversation[]> => {
    const dbConversations = await query(
      'SELECT * FROM conversations WHERE creator_id = $1 ORDER BY updated_at DESC;',
      [userId]
    )

    const conversations = dbConversations.rows.map((c) => {
      return new Conversation({
        createdAt: c['created_at'],
        updatedAt: c['updated_at'],
        name: c['name'],
        id: c['convo_id'],
        creatorId: c['creator_id'],
      })
    })

    return conversations
  }

  /**
   * Returns an array of Conversations that are active.
   * @param daysOld The number of days a conversation has been inactive with no new messages.
   * @param shouldDelete Optional boolean for whether or not the returned records should be deleted.
   * @returns An array of active Conversation objects.
   */
  static findByAge = async (
    daysOld: number,
    shouldDelete: boolean = false
  ): Promise<Conversation[]> => {
    const date = new Date()
    date.setDate(date.getDate() - daysOld)

    const dbConversations = await query(
      'SELECT * FROM conversations WHERE updated_at < $1;',
      [`${date.toISOString().split('T')[0]}`]
    )

    if (shouldDelete) {
      await query(
        `
        DELETE FROM conversations WHERE updated_at < $1 RETURNING convo_id;
        `,
        [`${date.toISOString().split('T')[0]}`]
      )
    }

    const conversations = dbConversations.rows.map((c) => {
      return new Conversation({
        createdAt: c['created_at'],
        updatedAt: c['updated_at'],
        name: c['name'],
        id: c['convo_id'],
        creatorId: c['creator_id'],
      })
    })

    return conversations
  }
}

export default Conversation
