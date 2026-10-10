import { randomUUID } from 'crypto'
import query from '../util/db'
import { parseTimestamp } from '../util/column-parsers'

export interface SystemAgentProps {
  id?: string
  displayName: string
  modelName: string
  avatarUrl?: string | null
  createdAt?: Date
  updatedAt?: Date
}

export default class SystemAgent implements SystemAgentProps {
  id?: string
  displayName: string
  modelName: string
  avatarUrl?: string | null
  createdAt?: Date
  updatedAt?: Date

  constructor(props: SystemAgentProps) {
    this.id = props.id
    this.displayName = props.displayName
    this.modelName = props.modelName
    this.avatarUrl = props.avatarUrl ?? null
    this.createdAt = props.createdAt
    this.updatedAt = props.updatedAt
  }

  /**
   * Find an agent by its model name.
   */
  static async findByModelName(modelName: string): Promise<SystemAgent | null> {
    const res = await query(
      'SELECT * FROM system_agents WHERE model_name = ?',
      [modelName]
    )
    return res.rowCount ? SystemAgent.parseRow(res.rows[0]) : null
  }

  /**
   * Find an existing agent by model name, or create one if it doesn't exist.
   */
  static async findOrCreate(props: {
    displayName: string
    modelName: string
    avatarUrl?: string | null
  }): Promise<SystemAgent> {
    const sql = `
      INSERT INTO system_agents (agent_id, display_name, model_name, avatar_url)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (model_name) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = CASE
              WHEN display_name IS NOT EXCLUDED.display_name
                OR avatar_url IS NOT EXCLUDED.avatar_url
              THEN EXCLUDED.updated_at
              ELSE updated_at
            END
      RETURNING *
    `
    const params = [
      randomUUID(),
      props.displayName,
      props.modelName,
      props.avatarUrl ?? null,
    ]

    const result = await query(sql, params)
    if (result.rowCount && result.rowCount > 0) {
      return SystemAgent.parseRow(result.rows[0])
    }
    throw new Error('Failed to upsert system agent.')
  }

  /**
   * Maps a DB row to a SystemAgent object.
   */
  static parseRow(row: any): SystemAgent {
    return new SystemAgent({
      id: row['agent_id'],
      displayName: row['display_name'],
      modelName: row['model_name'],
      avatarUrl: row['avatar_url'],
      createdAt: parseTimestamp(row['created_at']),
      updatedAt: parseTimestamp(row['updated_at']),
    })
  }
}
