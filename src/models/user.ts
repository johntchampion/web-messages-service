// src/models/user.ts
import bcrypt from 'bcryptjs'
import { QueryResult } from 'pg'
import query from '../util/db'
import sendEmail from '../util/mail'

/**
 * Mirrors DB columns; everything optional so we can do partial updates safely.
 * Note: email & username are CITEXT in DB (case-insensitive).
 */
export interface Account {
  displayName?: string
  username?: string
  email?: string
  profilePicURL?: string | null
  hashedPassword?: string
  activated?: boolean
  activateToken?: string | null
  activateTokenTimestamp?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp?: Date | null
  id?: string
}

export interface AuthToken {
  userId: string
  activated: boolean
}

export default class User implements Account {
  createdAt?: Date
  updatedAt?: Date
  displayName?: string
  username?: string
  email?: string
  profilePicURL?: string | null
  hashedPassword?: string
  activated?: boolean
  activateToken?: string | null
  activateTokenTimestamp?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp?: Date | null
  id?: string

  constructor(props: Account = {}) {
    Object.assign(this, props)
  }

  // ---------- Creation ----------

  /**
   * Creates a user. Token timestamps are managed by DB triggers.
   */
  async create(): Promise<User> {
    const sql = `
      INSERT INTO users (
        display_name, username, email, profile_pic_url,
        hashed_password, activated, activate_token, reset_password_token
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `
    const params = [
      this.displayName,
      this.username,
      this.email,
      this.profilePicURL ?? null,
      this.hashedPassword,
      this.activated ?? false,
      this.activateToken ?? null,
      this.resetPasswordToken ?? null,
    ]

    try {
      const result = await query(sql, params)
      if (result.rowCount && result.rowCount > 0) {
        return User.parseRow(result.rows[0])
      }
      throw new Error('Insert returned no rows')
    } catch (err: any) {
      // Unique constraint violations (23505): email/username
      if (err?.code === '23505') {
        if (String(err.detail || '').includes('(email)')) {
          throw new Error('Email already in use.')
        }
        if (String(err.detail || '').includes('(username)')) {
          throw new Error('Username already in use.')
        }
      }
      throw err
    }
  }

  /**
   * Returns whether DB contains this user id.
   */
  async isCreated(): Promise<boolean> {
    if (!this.id) return false
    const r = await query('SELECT 1 FROM users WHERE user_id = $1', [this.id])
    return !!r.rowCount
  }

  // ---------- Updates ----------

  /**
   * Partial update. Pass only fields you want to change.
   * `updated_at` is handled by trigger in DB.
   */
  async update(patch: Account = {}): Promise<User> {
    if (!this.id) throw new Error('This user does not exist.')

    const sets: string[] = []
    const values: any[] = []
    const push = (sqlFragment: string, v: any) => {
      values.push(v)
      sets.push(`${sqlFragment} = $${values.length}`)
    }

    if ('displayName' in patch) push('display_name', patch.displayName)
    if ('username' in patch) push('username', patch.username)
    if ('email' in patch) push('email', patch.email)
    if ('profilePicURL' in patch)
      push('profile_pic_url', patch.profilePicURL ?? null)
    if ('hashedPassword' in patch) push('hashed_password', patch.hashedPassword)
    if ('activated' in patch) push('activated', patch.activated)
    if ('activateToken' in patch)
      push('activate_token', patch.activateToken ?? null)
    if ('resetPasswordToken' in patch)
      push('reset_password_token', patch.resetPasswordToken ?? null)

    if (sets.length === 0) return this.reload()

    const sql = `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${
      values.length + 1
    } RETURNING *`
    values.push(this.id)

    const result = await query(sql, values)
    if (!result.rowCount) throw new Error('Could not update user.')
    const fresh = User.parseRow(result.rows[0])
    Object.assign(this, fresh)
    return this
  }

  /**
   * Reloads from DB.
   */
  async reload(): Promise<User> {
    if (!this.id) throw new Error('This user does not exist.')
    const res = await query('SELECT * FROM users WHERE user_id = $1', [this.id])
    if (!res.rowCount) throw new Error('Could not reload user.')
    Object.assign(this, User.parseRow(res.rows[0]))
    return this
  }

  /**
   * Deletes the user.
   */
  async delete(): Promise<void> {
    if (!this.id) return
    await query('DELETE FROM users WHERE user_id = $1', [this.id])
  }

  // ---------- Auth flows ----------

  /**
   * Generate a 6-digit code (with leading zeros).
   */
  static generateActivateToken(): string {
    let code = Math.floor(Math.random() * 1_000_000).toString()
    while (code.length < 6) code = '0' + code
    return code
  }

  /**
   * Activates the account using the code. Also clears the token.
   * Respects token timestamp (15 min window) if present.
   */
  async activate(code: string): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.reload()

    if (!this.activateToken) throw new Error('No activation token set.')
    if (code !== this.activateToken)
      throw new Error('The activation token is incorrect.')

    if (this.activateTokenTimestamp) {
      const expiryMs = 15 * 60 * 1000
      const expired =
        this.activateTokenTimestamp.getTime() < Date.now() - expiryMs
      if (expired)
        throw new Error(
          'The activation token is expired. You need to request a new one.'
        )
    }

    await this.update({ activated: true, activateToken: null })
    return this
  }

  /**
   * Starts password reset by setting a token (timestamp is handled by DB trigger).
   */
  async beginPasswordReset(resetToken: string): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.update({ resetPasswordToken: resetToken })
    return this
  }

  /**
   * Completes password reset given a token and a new password.
   * Clears token afterward.
   */
  async completePasswordReset(
    token: string,
    newPassword: string
  ): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.reload()

    if (!this.resetPasswordToken) throw new Error('No reset token set.')
    if (token !== this.resetPasswordToken)
      throw new Error('Reset token is incorrect.')

    if (this.resetPasswordTokenTimestamp) {
      const expiryMs = 60 * 60 * 1000 // 1 hour window
      const expired =
        this.resetPasswordTokenTimestamp.getTime() < Date.now() - expiryMs
      if (expired) throw new Error('This reset token is expired.')
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 12)
    await this.update({
      hashedPassword: newHashedPassword,
      resetPasswordToken: null,
    })
    return this
  }

  /**
   * Utility: verify a plaintext password against the stored hash.
   */
  async verifyPassword(plaintext: string): Promise<boolean> {
    if (!this.hashedPassword) return false
    return bcrypt.compare(plaintext, this.hashedPassword)
  }

  // ---------- Mail helpers (reuse your mailer) ----------

  sendActivationEmail() {
    if (!this.email || !this.username || !this.activateToken) {
      return Promise.reject(
        new Error('Missing email, username, or activation token.')
      )
    }
    return sendEmail(
      this.email,
      `${this.username}`,
      'Your Verification Code',
      `Your verification code is ${this.activateToken}. It expires in 15 minutes.`
    )
  }

  sendPasswordResetEmail(
    appDomain = process.env.APP_DOMAIN_NAME || 'http://localhost:3000'
  ) {
    if (!this.email || !this.username || !this.resetPasswordToken) {
      return Promise.reject(
        new Error('Missing email, username, or reset token.')
      )
    }
    const url = `${appDomain}/auth/reset-password/${this.resetPasswordToken}`
    return sendEmail(
      this.email,
      `${this.username}`,
      'Reset Password',
      `Please click <a href="${url}">here</a> to reset your password. If you did not request a password reset, someone may be trying to access your account.`
    )
  }

  // ---------- Lookups ----------

  static async accountWithEmailExists(email: string): Promise<boolean> {
    const r = await query('SELECT 1 FROM users WHERE email = $1', [email])
    return !!r.rowCount
  }

  static async accountWithUsernameExists(username: string): Promise<boolean> {
    const r = await query('SELECT 1 FROM users WHERE username = $1', [username])
    return !!r.rowCount
  }

  static async findById(id: string): Promise<User | null> {
    const r = await query('SELECT * FROM users WHERE user_id = $1', [id])
    return r.rowCount ? User.parseRow(r.rows[0]) : null
  }

  static async findByEmail(email: string): Promise<User | null> {
    // CITEXT means case-insensitive by default
    const r = await query('SELECT * FROM users WHERE email = $1', [email])
    return r.rowCount ? User.parseRow(r.rows[0]) : null
  }

  static async findByUsername(username: string): Promise<User | null> {
    const r = await query('SELECT * FROM users WHERE username = $1', [username])
    return r.rowCount ? User.parseRow(r.rows[0]) : null
  }

  static async findByResetPasswordToken(token: string): Promise<User | null> {
    const r = await query(
      'SELECT * FROM users WHERE reset_password_token = $1',
      [token]
    )
    return r.rowCount ? User.parseRow(r.rows[0]) : null
  }

  /**
   * Uses the new user_sessions table (socket_id moved out of users).
   */
  static async findBySocketId(socketId: string): Promise<User | null> {
    const r = await query(
      `
      SELECT u.*
      FROM user_sessions s
      JOIN users u ON u.user_id = s.user_id
      WHERE s.socket_id = $1
      `,
      [socketId]
    )
    return r.rowCount ? User.parseRow(r.rows[0]) : null
  }

  // ---------- Row mapping ----------

  static parseRow(row: any): User {
    return new User({
      createdAt: row['created_at'],
      updatedAt: row['updated_at'],
      displayName: row['display_name'],
      username: row['username'],
      email: row['email'],
      profilePicURL: row['profile_pic_url'],
      hashedPassword: row['hashed_password'],
      activated: row['activated'],
      activateToken: row['activate_token'],
      activateTokenTimestamp: row['activate_token_timestamp'],
      resetPasswordToken: row['reset_password_token'],
      resetPasswordTokenTimestamp: row['reset_password_token_timestamp'],
      id: row['user_id'],
    })
  }
}
