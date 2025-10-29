import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import query from '../util/db'
import sendEmail from '../util/mail'

/**
 * Mirrors DB columns; everything optional so we can do partial updates safely.
 * Note: email & username are CITEXT in DB (case-insensitive).
 */
export interface Account {
  createdAt?: Date
  updatedAt?: Date
  displayName?: string
  username?: string
  email?: string | null
  profilePicURL?: string | null
  hashedPassword?: string
  passwordChangedAt?: Date
  tokenVersion?: number
  verified?: boolean
  verifyToken?: string | null
  verifyTokenTimestamp?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp?: Date | null
  disabled?: boolean
  id?: string
}

export interface AccountPatch {
  displayName?: string
  username?: string
  email?: string | null
  profilePicURL?: string | null
  hashedPassword?: string
  tokenVersion?: number
  verified?: boolean
  verifyToken?: string | null
  resetPasswordToken?: string | null
  disabled?: boolean
}

export interface AccessToken {
  userId: string
  verified: boolean
  tokenVersion: number
}

export interface RefreshToken {
  userId: string
}

export default class User implements Account {
  createdAt?: Date
  updatedAt?: Date
  displayName?: string
  username?: string
  email?: string | null
  profilePicURL?: string | null
  hashedPassword?: string
  passwordChangedAt?: Date
  tokenVersion?: number
  verified?: boolean
  verifyToken?: string | null
  verifyTokenTimestamp?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp?: Date | null
  disabled?: boolean
  id?: string

  constructor(props: Account = {}) {
    Object.assign(this, props)
  }

  // ---------- CRUD ----------

  /**
   * Creates a user. Token timestamps are managed by DB triggers.
   */
  async create(): Promise<User> {
    const sql = `
      INSERT INTO users (
        display_name, username, email, profile_pic_url,
        hashed_password, verified, verify_token, reset_password_token
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `
    const params = [
      this.displayName,
      this.username,
      this.email ?? null,
      this.profilePicURL ?? null,
      this.hashedPassword,
      this.verified ?? false,
      this.verifyToken ?? null,
      this.resetPasswordToken ?? null,
    ]

    try {
      const result = await query(sql, params)
      if (result.rowCount && result.rowCount > 0) {
        Object.assign(this, User.parseRow(result.rows[0]))
        return this
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
   * Returns whether DB contains this user.
   */
  async isCreated(): Promise<boolean> {
    if (!this.id) return false
    const r = await query('SELECT 1 FROM users WHERE user_id = $1', [this.id])
    return !!r.rowCount
  }

  /**
   * Partial update. Pass only fields you want to change.
   * `updated_at` is handled by trigger in DB.
   */
  async update(patch: AccountPatch = {}): Promise<User> {
    if (!this.id) throw new Error('User has not been persisted yet.')

    const sets: string[] = []
    const values: any[] = []
    const push = (sqlFragment: string, v: any) => {
      values.push(v)
      sets.push(`${sqlFragment} = $${values.length}`)
    }

    if ('displayName' in patch) push('display_name', patch.displayName)
    if ('username' in patch) push('username', patch.username)
    if ('email' in patch) push('email', patch.email ?? null)
    if ('profilePicURL' in patch)
      push('profile_pic_url', patch.profilePicURL ?? null)
    if ('hashedPassword' in patch) push('hashed_password', patch.hashedPassword)
    if ('tokenVersion' in patch) push('token_version', patch.tokenVersion)
    if ('verified' in patch) push('verified', patch.verified)
    if ('verifyToken' in patch) push('verify_token', patch.verifyToken ?? null)
    if ('resetPasswordToken' in patch)
      push('reset_password_token', patch.resetPasswordToken ?? null)
    if ('disabled' in patch) push('disabled', patch.disabled ?? null)

    if (sets.length === 0) return this.reload()

    const sql = `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${
      values.length + 1
    } RETURNING *`
    values.push(this.id)

    const result = await query(sql, values)
    if (!result.rowCount) throw new Error('Failed to update user.')

    const fresh = User.parseRow(result.rows[0])
    Object.assign(this, fresh)
    return this
  }

  /**
   * Reloads from DB.
   */
  async reload(): Promise<User> {
    if (!this.id) throw new Error('User has not been persisted yet.')
    const res = await query('SELECT * FROM users WHERE user_id = $1', [this.id])
    if (!res.rowCount) throw new Error('Could not reload user.')
    Object.assign(this, User.parseRow(res.rows[0]))
    return this
  }

  /**
   * Deletes the user.
   */
  async delete(): Promise<User> {
    if (!this.id) throw new Error('This user does not exist.')
    await query('DELETE FROM users WHERE user_id = $1', [this.id])
    return this
  }

  // ---------- Auth flows ----------

  static async hashPassword(plaintext: string): Promise<string> {
    return await bcrypt.hash(plaintext, 12)
  }

  async generateTokens(options?: { userAgent?: string; ip?: string }): Promise<{
    accessToken: string
    refreshToken: string
  }> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.reload()

    const accessTokenPayload: AccessToken = {
      userId: this.id!,
      verified: this.verified || false,
      tokenVersion: this.tokenVersion!,
    }
    const refreshTokenPayload: RefreshToken = {
      userId: this.id!,
    }

    const accessToken = jwt.sign(
      accessTokenPayload,
      process.env.TOKEN_SECRET as string,
      {
        expiresIn: '1h',
      }
    )
    const refreshToken = jwt.sign(
      refreshTokenPayload,
      process.env.TOKEN_SECRET as string,
      {
        expiresIn: '7d',
      }
    )

    // Store refresh token in sessions table
    await User.storeRefreshToken(
      this.id!,
      refreshToken,
      options?.userAgent,
      options?.ip
    )

    return {
      accessToken: accessToken,
      refreshToken: refreshToken,
    }
  }

  /**
   * Stores a refresh token in the sessions table (hashed).
   * Returns the session ID.
   */
  static async storeRefreshToken(
    userId: string,
    refreshToken: string,
    userAgent?: string,
    ip?: string
  ): Promise<string> {
    const rtHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const sql = `
      INSERT INTO sessions (user_id, rt_hash, user_agent, ip, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING session_id
    `
    const result = await query(sql, [
      userId,
      rtHash,
      userAgent ?? null,
      ip ?? null,
      expiresAt.toISOString(),
    ])
    return result.rows[0]?.session_id
  }

  /**
   * Validates an access token and returns the user if valid.
   * Checks: token signature, expiry, user exists, and tokenVersion matches.
   */
  static async validateAccessToken(accessToken: string): Promise<User | null> {
    try {
      // Verify JWT signature and expiry
      const decoded = jwt.verify(
        accessToken,
        process.env.TOKEN_SECRET as string
      ) as AccessToken

      if (!decoded.userId) return null

      // Get user from database
      const user = await User.findById(decoded.userId)
      if (!user) return null

      // Verify tokenVersion matches (invalidates old tokens when password changes)
      if (user.tokenVersion !== decoded.tokenVersion) return null

      return user
    } catch (err) {
      // Invalid token (expired, malformed, wrong signature, etc.)
      return null
    }
  }

  /**
   * Validates a refresh token and returns the user if valid.
   * Checks: token signature, expiry, session exists, not revoked, tokenVersion matches.
   */
  static async validateRefreshToken(
    refreshToken: string
  ): Promise<User | null> {
    try {
      // Verify JWT signature and expiry
      const decoded = jwt.verify(
        refreshToken,
        process.env.TOKEN_SECRET as string
      ) as RefreshToken

      if (!decoded.userId) return null

      // Hash the token to look up in sessions table
      const rtHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex')

      // Check if session exists and is not revoked
      const sessionResult = await query(
        `SELECT * FROM sessions
         WHERE rt_hash = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()`,
        [rtHash]
      )

      if (!sessionResult.rowCount) return null

      // Get user
      const user = await User.findById(decoded.userId)
      if (!user) return null

      // Note: We don't check tokenVersion here because refresh tokens
      // don't contain it. Instead, we rely on revokeAllSessions() being
      // called when password changes to invalidate all refresh tokens.

      return user
    } catch (err) {
      // Invalid token (expired, malformed, wrong signature, etc.)
      return null
    }
  }

  /**
   * Revokes a specific session by ID.
   */
  static async revokeSession(refreshToken: string): Promise<void> {
    // Hash the token to look up in sessions table
    const rtHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex')

    await query('UPDATE sessions SET revoked_at = NOW() WHERE rt_hash = $1', [
      rtHash,
    ])
  }

  /**
   * Revokes all sessions for a user and increments tokenVersion.
   * This invalidates all access tokens and refresh tokens.
   */
  async revokeAllSessions(): Promise<void> {
    if (!this.id) throw new Error('User is not yet saved to the database.')

    // Increment tokenVersion to invalidate all access tokens
    const newVersion = (this.tokenVersion || 0) + 1
    await this.update({ tokenVersion: newVersion })

    // Revoke all refresh tokens
    await query('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1', [
      this.id,
    ])
  }

  /**
   * Increments the token version to invalidate existing tokens.
   */
  async incrementTokenVersion(): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.reload()

    const newVersion = (this.tokenVersion || 0) + 1
    await this.update({ tokenVersion: newVersion })
    return this
  }

  /**
   * Generate a 6-digit code (with leading zeros).
   */
  static generateVerifyToken(): string {
    let code = Math.floor(Math.random() * 1_000_000).toString()
    while (code.length < 6) code = '0' + code
    return code
  }

  /**
   * Verifies the account using the code. Also clears the token.
   * Respects token timestamp (15 min window) if present.
   */
  async setVerifiedStatus(code: string): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    await this.reload()

    if (!this.verifyToken) throw new Error('No verification token set.')
    if (code !== this.verifyToken)
      throw new Error('The verification token is incorrect.')

    if (this.verifyTokenTimestamp) {
      const expiryMs = 15 * 60 * 1000
      const expired =
        this.verifyTokenTimestamp.getTime() < Date.now() - expiryMs
      if (expired)
        throw new Error(
          'The verification token is expired. You need to request a new one.'
        )
    }

    await this.update({ verified: true, verifyToken: null })
    return this
  }

  /**
   * Starts password reset by setting a token (timestamp is handled by DB trigger).
   */
  async beginPasswordReset(): Promise<User> {
    if (!this.id) throw new Error('User is not yet saved to the database.')
    const buffer = crypto.randomBytes(32)
    const resetToken = buffer.toString('hex')

    await this.update({ resetPasswordToken: resetToken })
    return this
  }

  /**
   * Completes password reset given a token and a new password.
   * Increments tokenVersion and revokes all sessions to invalidate all tokens.
   * Clears reset token afterward.
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
    const newVersion = (this.tokenVersion || 0) + 1

    await this.update({
      hashedPassword: newHashedPassword,
      resetPasswordToken: null,
      tokenVersion: newVersion,
    })

    // Revoke all existing sessions to invalidate refresh tokens
    await this.revokeAllSessions()

    return this
  }

  /**
   * Verify a plaintext password against the stored hash.
   */
  async verifyPassword(plaintext: string): Promise<boolean> {
    if (!this.hashedPassword) return false
    return bcrypt.compare(plaintext, this.hashedPassword)
  }

  // ---------- Mail helpers (reuse your mailer) ----------

  sendVerificationEmail() {
    if (!this.email || !this.username || !this.verifyToken) {
      return Promise.reject(
        new Error('Missing email, username, or verification token.')
      )
    }
    return sendEmail(
      this.email,
      `${this.username}`,
      'Your Verification Code',
      `Your verification code is ${this.verifyToken}. It expires in 15 minutes.`
    )
  }

  sendPasswordResetEmail(
    appDomain = process.env.APP_BASE_URL || 'http://localhost:3000'
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
      passwordChangedAt: row['password_changed_at'],
      tokenVersion: row['token_version'],
      verified: row['verified'],
      verifyToken: row['verify_token'],
      verifyTokenTimestamp: row['verify_token_timestamp'],
      resetPasswordToken: row['reset_password_token'],
      resetPasswordTokenTimestamp: row['reset_password_token_timestamp'],
      disabled: row['disabled'],
      id: row['user_id'],
    })
  }
}
