import fs from 'fs'
import path from 'path'
import bcrypt from 'bcryptjs'
import { AxiosResponse } from 'axios'
import { QueryResult } from 'pg'
import query from '../util/db'
import sendEmail from '../util/mail'

interface AccountType {
  displayName?: string
  username?: string
  email?: string
  profilePicURL?: string | null
  hashedPassword?: string
  activated?: boolean
  activateToken?: string | null
  resetPasswordToken?: string | null
  socketId?: string | null
}

export interface UserConfigType {
  createdAt?: Date
  updatedAt?: Date
  displayName: string
  username: string
  email: string
  profilePicURL?: string | null
  hashedPassword: string
  activated: boolean
  activateToken?: string | null
  activateTokenTimestamp?: Date | null
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp?: Date | null
  socketId?: string | null
  id?: string
}

export interface AuthToken {
  userId: string
  activated: boolean
}

const updateUserQuery = (
  userId: string,
  updatedAccount: AccountType
): Promise<QueryResult> => {
  let queryString = 'UPDATE users SET'
  const paramKeys: AccountType[keyof AccountType][] = []
  Object.keys(updatedAccount).forEach((key, index) => {
    paramKeys.push(updatedAccount[key as keyof AccountType])

    if (index > 0) {
      queryString = queryString + ','
    }
    switch (key) {
      case 'displayName':
        queryString = queryString + ' display_name = $' + (index + 1)
        break
      case 'username':
        queryString = queryString + ' username = $' + (index + 1)
        break
      case 'email':
        queryString = queryString + ' email = $' + (index + 1)
        break
      case 'profilePicURL':
        queryString = queryString + ' profile_pic_url = $' + (index + 1)
        break
      case 'hashedPassword':
        queryString = queryString + ' hashed_password = $' + (index + 1)
        break
      case 'activated':
        queryString = queryString + ' activated = $' + (index + 1)
        break
      case 'activateToken':
        queryString = queryString + ' activate_token = $' + (index + 1)
        break
      case 'resetPasswordToken':
        queryString = queryString + ' reset_password_token = $' + (index + 1)
        break
      case 'socketId':
        queryString = queryString + ' socket_id = $' + (index + 1)
        break

      default:
        break
    }
  })
  paramKeys.push(userId)

  queryString =
    queryString + ' WHERE user_id = $' + paramKeys.length + ' RETURNING *;'

  return query(queryString, paramKeys)
}

class User {
  createdAt?: Date
  updatedAt?: Date
  displayName: string
  username: string
  email: string
  profilePicURL?: string | null
  hashedPassword: string
  activated: boolean
  activateToken?: string | null
  activateTokenTimestamp: Date
  resetPasswordToken?: string | null
  resetPasswordTokenTimestamp: Date
  socketId?: string | null
  id?: string

  constructor(config: UserConfigType) {
    this.createdAt = config.createdAt
    this.updatedAt = config.updatedAt
    this.displayName = config.displayName || ''
    this.username = config.username || ''
    this.email = config.email || ''
    this.profilePicURL = config.profilePicURL
    this.hashedPassword = config.hashedPassword || ''
    this.activated = config.activated
    this.activateToken = config.activateToken
    this.activateTokenTimestamp = config.activateTokenTimestamp || new Date()
    this.resetPasswordToken = config.resetPasswordToken
    this.resetPasswordTokenTimestamp =
      config.resetPasswordTokenTimestamp || new Date()
    this.socketId = config.socketId
    this.id = config.id
  }

  /**
   * Creates the user in the database.
   * @returns Whether or not the action was successful.
   */
  create(): Promise<User> {
    const newAccount: AccountType = {
      displayName: this.displayName,
      username: this.username,
      email: this.email,
      profilePicURL: this.profilePicURL,
      hashedPassword: this.hashedPassword,
      activated: this.activated,
      activateToken: this.activateToken,
      resetPasswordToken: this.resetPasswordToken,
      socketId: this.socketId,
    }

    return query(
      'INSERT INTO users (display_name, username, email, hashed_password, activated, activate_token, reset_password_token, socket_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;',
      [
        newAccount.displayName,
        newAccount.username,
        newAccount.email,
        newAccount.hashedPassword,
        newAccount.activated,
        newAccount.activateToken,
        newAccount.resetPasswordToken,
        newAccount.socketId,
      ]
    )
      .then((result) => {
        if (result?.rowCount! > 0) {
          this.createdAt = result.rows[0]['created_at']
          this.updatedAt = result.rows[0]['updated_at']
          this.activateTokenTimestamp =
            result.rows[0]['activate_token_timestamp']
          this.resetPasswordTokenTimestamp =
            result.rows[0]['reset_password_token_timestamp']
          this.id = result.rows[0]['user_id']
          return this
        } else {
          throw new Error('Could not update user on database.')
        }
      })
      .catch((error) => {
        console.error(error)
        throw new Error(error)
      })
  }

  /**
   * Finds out if this user exists in the database.
   * @returns Whether or not the user has been created in the database.
   */
  isCreated(): Promise<boolean> {
    if (this.id) {
      return query('SELECT * FROM users WHERE user_id = $1;', [this.id])
        .then((result) => {
          return result?.rowCount! > 0
        })
        .catch(() => {
          return false
        })
    } else {
      return Promise.resolve(false)
    }
  }

  /**
   * Activates the account with the activation token.
   * @param token The token used to activate the account.
   * @returns Whether or not the token could successfully activate the account.
   */
  async activate(token: string): Promise<User> {
    if (this.id) {
      if (token !== this.activateToken) {
        throw new Error('The activation token is incorrect.')
      } else if (
        this.activateTokenTimestamp < new Date(Date.now() - 15 * 60 * 1000)
      ) {
        throw new Error(
          'The activation token is expired. You need to request a new one.'
        )
      }

      this.activated = true
      this.activateToken = null
      await this.update()
      return this
    } else {
      throw new Error('User is not yet saved to the database.')
    }
  }

  async resetPassword(newPassword: string): Promise<User> {
    if (this.id) {
      if (
        this.resetPasswordTokenTimestamp < new Date(Date.now() - 15 * 60 * 1000)
      ) {
        throw new Error('This reset token is expired.')
      }
      const newHashedPassword = await bcrypt.hash(newPassword, 12)

      this.hashedPassword = newHashedPassword
      this.resetPasswordToken = null
      await this.update()

      return this
    } else {
      throw new Error('User is not yet saved to database.')
    }
  }

  /**
   * Updates the user in the database.
   * @returns Whether or not the action was successful.
   */
  update(): Promise<User> {
    if (this.id) {
      const updatedAccount: AccountType = {
        displayName: this.displayName,
        username: this.username,
        email: this.email,
        profilePicURL: this.profilePicURL,
        hashedPassword: this.hashedPassword,
        activated: this.activated,
        activateToken: this.activateToken,
        resetPasswordToken: this.resetPasswordToken,
        socketId: this.socketId,
      }

      return updateUserQuery(this.id, updatedAccount)
        .then((result) => {
          if (result?.rowCount! > 0) {
            this.updatedAt = result.rows[0]['updated_at']
            this.activateTokenTimestamp =
              result.rows[0]['activate_token_timestamp']
            this.resetPasswordTokenTimestamp =
              result.rows[0]['reset_password_token_timestamp']
            return this
          } else {
            throw new Error('Could not update user with database.')
          }
        })
        .catch((error) => {
          console.error(error)
          throw new Error(error)
        })
    } else {
      throw new Error('This user does not exist.')
    }
  }

  /**
   * Deletes the user from the database.
   * @returns Whether or not the action was successful.
   */
  delete(): Promise<User> {
    if (this.id) {
      return query('DELETE FROM users WHERE user_id = $1 RETURNING *;', [
        this.id!,
      ])
        .then((result) => {
          if (this.profilePicURL) {
            const imgPath = path.join(
              __dirname,
              '..',
              '..',
              'uploads',
              this.profilePicURL
            )
            fs.unlink(imgPath, () => {
              console.log('Profile Picture Deleted')
            })
          }

          if (result?.rowCount! > 0) {
            return this
          } else {
            throw new Error('Could not delete user from database.')
          }
        })
        .catch((error) => {
          console.error(error)
          throw new Error('Could not delete user from database.')
        })
    } else {
      throw new Error('Could not delete user.')
    }
  }

  sendActivationCodeEmail = (): Promise<AxiosResponse<any>> => {
    return sendEmail(
      this.email,
      `${this.username}`,
      'Verification Code - Web Messages',
      `Your verification code is ${this.activateToken}. It expires in 15 minutes.`
    )
  }

  sendPasswordResetEmail = (): Promise<AxiosResponse<any>> => {
    const rootDomain = process.env.APP_DOMAIN_NAME
      ? process.env.APP_DOMAIN_NAME
      : 'http://localhost:3000'
    const url = rootDomain + '/auth/reset-password/' + this.resetPasswordToken

    return sendEmail(
      this.email,
      `${this.username}`,
      'Reset Password - Web Messages',
      `Please click <a href="${url}">here</a> to reset your password. If you did not request a password reset, someone may be tyring to break into your account.`
    )
  }

  static generateActivateToken = (): string => {
    let activateToken = Math.floor(Math.random() * 1000000).toString()
    while (activateToken.length < 6) {
      activateToken = '0' + activateToken
    }
    return activateToken
  }

  static accountWithEmailExists = async (email: string): Promise<boolean> => {
    const result = await query('SELECT user_id FROM users WHERE email = $1;', [
      email,
    ])
    return result?.rowCount! > 0
  }

  static findById = (userId: string): Promise<User> => {
    return query('SELECT * FROM users WHERE user_id = $1;', [userId])
      .then((result) => {
        if (result?.rowCount! > 0) {
          return User.parseRow(result.rows[0])
        } else {
          throw new Error('Could not find this account.')
        }
      })
      .catch((error) => {
        throw new Error(error)
      })
  }

  static findByEmail = (email: string): Promise<User> => {
    return query('SELECT * FROM users WHERE email = $1;', [email])
      .then((result) => {
        if (result?.rowCount! > 0) {
          return User.parseRow(result.rows[0])
        } else {
          throw new Error('Could not find this account.')
        }
      })
      .catch((error) => {
        throw new Error(error)
      })
  }

  static findByUsername = (username: string): Promise<User> => {
    return query('SELECT * FROM users WHERE username = $1;', [username])
      .then((result) => {
        if (result?.rowCount! > 0) {
          return User.parseRow(result.rows[0])
        } else {
          throw new Error('Could not find this account.')
        }
      })
      .catch((error) => {
        throw new Error(error)
      })
  }

  static findByResetPasswordToken = (
    resetPasswordToken: string
  ): Promise<User> => {
    return query('SELECT * FROM users WHERE reset_password_token = $1;', [
      resetPasswordToken,
    ])
      .then((result) => {
        if (result?.rowCount! > 0) {
          return User.parseRow(result.rows[0])
        } else {
          throw new Error('Could not find this account.')
        }
      })
      .catch((error) => {
        throw new Error(error)
      })
  }

  static findBySocketId = (socketId: string): Promise<User | null> => {
    return query('SELECT * FROM users WHERE socket_id = $1;', [socketId])
      .then((result) => {
        if (result?.rowCount! > 0) {
          return User.parseRow(result.rows[0])
        } else {
          throw new Error('Could not find this account.')
        }
      })
      .catch(() => {
        // User not online
        return null
      })
  }

  static parseRow = (row: any): User => {
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
      socketId: row['socket_id'],
      id: row['user_id'],
    })
  }
}

export default User
