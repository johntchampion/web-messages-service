import User from '../../models/user'
import query from '../../util/db'
import bcrypt from 'bcryptjs'
import sendEmail from '../../util/mail'
import { createMockQueryResult, createMockUserRow } from '../helpers/db-mock'

// Mock dependencies
jest.mock('../../util/db')
jest.mock('../../util/mail', () => jest.fn())

const mockQuery = query as jest.MockedFunction<typeof query>
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>

describe('User Model', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSendEmail.mockResolvedValue({} as any)
  })

  describe('constructor', () => {
    it('should create a user instance with provided properties', () => {
      const user = new User({
        email: 'test@example.com',
        username: 'testuser',
        displayName: 'Test User',
      })

      expect(user.email).toBe('test@example.com')
      expect(user.username).toBe('testuser')
      expect(user.displayName).toBe('Test User')
    })

    it('should create an empty user instance when no properties provided', () => {
      const user = new User()

      expect(user.email).toBeUndefined()
      expect(user.username).toBeUndefined()
    })
  })

  describe('create', () => {
    it('should create a new user in the database', async () => {
      const mockRow = createMockUserRow({
        email: 'newuser@example.com',
        username: 'newuser',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({
        email: 'newuser@example.com',
        username: 'newuser',
        displayName: 'New User',
        hashedPassword: 'hashed',
      })

      await user.create()

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['New User', 'newuser', 'newuser@example.com'])
      )
      expect(user.id).toBe('test-user-id-123')
    })

    it('should throw error when email is already in use', async () => {
      const dbError: any = new Error('Unique constraint violation')
      dbError.code = '23505'
      dbError.detail = 'Key (email)=(test@example.com) already exists.'

      mockQuery.mockRejectedValue(dbError)

      const user = new User({
        email: 'test@example.com',
        username: 'testuser',
        hashedPassword: 'hashed',
      })

      await expect(user.create()).rejects.toThrow('Email already in use.')
    })

    it('should throw error when username is already in use', async () => {
      const dbError: any = new Error('Unique constraint violation')
      dbError.code = '23505'
      dbError.detail = 'Key (username)=(testuser) already exists.'

      mockQuery.mockRejectedValue(dbError)

      const user = new User({
        email: 'new@example.com',
        username: 'testuser',
        hashedPassword: 'hashed',
      })

      await expect(user.create()).rejects.toThrow('Username already in use.')
    })

    it('should throw error when insert returns no rows', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const user = new User({
        email: 'test@example.com',
        username: 'testuser',
        hashedPassword: 'hashed',
      })

      await expect(user.create()).rejects.toThrow('Insert returned no rows')
    })
  })

  describe('isCreated', () => {
    it('should return true when user exists in database', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([{ count: 1 }], 1))

      const user = new User({ id: 'test-user-id' })
      const result = await user.isCreated()

      expect(result).toBe(true)
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT 1 FROM users WHERE user_id = $1',
        ['test-user-id']
      )
    })

    it('should return false when user does not exist', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const user = new User({ id: 'nonexistent-id' })
      const result = await user.isCreated()

      expect(result).toBe(false)
    })

    it('should return false when user has no id', async () => {
      const user = new User()
      const result = await user.isCreated()

      expect(result).toBe(false)
      expect(mockQuery).not.toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('should update user properties', async () => {
      const updatedRow = createMockUserRow({
        display_name: 'Updated Name',
        email: 'updated@example.com',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([updatedRow], 1))

      const user = new User({ id: 'test-user-id' })
      await user.update({
        displayName: 'Updated Name',
        email: 'updated@example.com',
      })

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining([
          'Updated Name',
          'updated@example.com',
          'test-user-id',
        ])
      )
      expect(user.displayName).toBe('Updated Name')
      expect(user.email).toBe('updated@example.com')
    })

    it('should throw error when user has no id', async () => {
      const user = new User()

      await expect(user.update({ displayName: 'New Name' })).rejects.toThrow(
        'User has not been persisted yet.'
      )
    })

    it('should reload when no fields to update', async () => {
      const mockRow = createMockUserRow()
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })
      await user.update({})

      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE user_id = $1',
        ['test-user-id']
      )
    })
  })

  describe('reload', () => {
    it('should reload user data from database', async () => {
      const mockRow = createMockUserRow({
        display_name: 'Reloaded Name',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })
      await user.reload()

      expect(user.displayName).toBe('Reloaded Name')
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE user_id = $1',
        ['test-user-id']
      )
    })

    it('should throw error when user has no id', async () => {
      const user = new User()

      await expect(user.reload()).rejects.toThrow(
        'User has not been persisted yet.'
      )
    })

    it('should throw error when user not found', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const user = new User({ id: 'nonexistent-id' })

      await expect(user.reload()).rejects.toThrow('Could not reload user.')
    })
  })

  describe('delete', () => {
    it('should delete user from database', async () => {
      mockQuery.mockResolvedValue(createMockQueryResult([], 0))

      const user = new User({ id: 'test-user-id' })
      await user.delete()

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM users WHERE user_id = $1',
        ['test-user-id']
      )
    })

    it('should throw error when user has no id', async () => {
      const user = new User()

      await expect(user.delete()).rejects.toThrow('This user does not exist.')
    })
  })

  describe('generateVerifyToken', () => {
    it('should generate a 6-digit code', () => {
      const token = User.generateVerifyToken()

      expect(token).toMatch(/^\d{6}$/)
      expect(token.length).toBe(6)
    })

    it('should include leading zeros', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.000001)

      const token = User.generateVerifyToken()

      expect(token[0]).toBe('0')

      jest.spyOn(Math, 'random').mockRestore()
    })
  })

  describe('verify', () => {
    it('should verify user with correct code', async () => {
      const mockRow = createMockUserRow({
        verify_token: '123456',
        verify_token_timestamp: new Date(),
        verified: false,
      })
      const updatedRow = createMockUserRow({
        verified: true,
        verify_token: null,
      })

      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([mockRow], 1))
        .mockResolvedValueOnce(createMockQueryResult([updatedRow], 1))

      const user = new User({ id: 'test-user-id' })
      await user.setVerifiedStatus('123456')

      expect(user.verified).toBe(true)
      expect(user.verifyToken).toBeNull()
    })

    it('should throw error when user has no id', async () => {
      const user = new User()

      await expect(user.setVerifiedStatus('123456')).rejects.toThrow(
        'User is not yet saved to the database.'
      )
    })

    it('should throw error when no verification token set', async () => {
      const mockRow = createMockUserRow({ verify_token: null })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(user.setVerifiedStatus('123456')).rejects.toThrow(
        'No verification token set.'
      )
    })

    it('should throw error when verification token is incorrect', async () => {
      const mockRow = createMockUserRow({
        verify_token: '123456',
        verify_token_timestamp: new Date(),
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(user.setVerifiedStatus('654321')).rejects.toThrow(
        'The verification token is incorrect.'
      )
    })

    it('should throw error when verification token is expired', async () => {
      const expiredTimestamp = new Date(Date.now() - 16 * 60 * 1000) // 16 minutes ago
      const mockRow = createMockUserRow({
        verify_token: '123456',
        verify_token_timestamp: expiredTimestamp,
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(user.setVerifiedStatus('123456')).rejects.toThrow(
        'The verification token is expired. You need to request a new one.'
      )
    })
  })

  describe('beginPasswordReset', () => {
    it('should set reset password token', async () => {
      const updatedRow = createMockUserRow({
        reset_password_token: 'reset-token-123',
      })
      mockQuery.mockResolvedValue(createMockQueryResult([updatedRow], 1))

      const user = new User({ id: 'test-user-id' })
      await user.beginPasswordReset()

      expect(mockQuery).toHaveBeenCalled()
      expect(user.resetPasswordToken).toBeDefined()
    })

    it('should throw error when user has no id', async () => {
      const user = new User()

      await expect(user.beginPasswordReset()).rejects.toThrow(
        'User is not yet saved to the database.'
      )
    })
  })

  describe('completePasswordReset', () => {
    it('should reset password with valid token', async () => {
      const mockRow = createMockUserRow({
        reset_password_token: 'reset-token-123',
        reset_password_token_timestamp: new Date(),
      })
      const updatedRow = createMockUserRow({
        reset_password_token: null,
        hashed_password: 'new-hashed-password',
      })
      const tokenVersionRow = createMockUserRow({
        reset_password_token: null,
        token_version: (updatedRow.token_version || 0) + 1,
      })

      mockQuery
        .mockResolvedValueOnce(createMockQueryResult([mockRow], 1))
        .mockResolvedValueOnce(createMockQueryResult([updatedRow], 1))
        .mockResolvedValueOnce(createMockQueryResult([tokenVersionRow], 1))
        .mockResolvedValueOnce(createMockQueryResult([], 1))

      const user = new User({ id: 'test-user-id' })
      await user.completePasswordReset('reset-token-123', 'newpassword')

      expect(user.resetPasswordToken).toBeNull()
    })

    it('should throw error when no reset token set', async () => {
      const mockRow = createMockUserRow({ reset_password_token: null })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(
        user.completePasswordReset('token', 'newpassword')
      ).rejects.toThrow('No reset token set.')
    })

    it('should throw error when reset token is incorrect', async () => {
      const mockRow = createMockUserRow({
        reset_password_token: 'correct-token',
        reset_password_token_timestamp: new Date(),
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(
        user.completePasswordReset('wrong-token', 'newpassword')
      ).rejects.toThrow('Reset token is incorrect.')
    })

    it('should throw error when reset token is expired', async () => {
      const expiredTimestamp = new Date(Date.now() - 61 * 60 * 1000) // 61 minutes ago
      const mockRow = createMockUserRow({
        reset_password_token: 'reset-token-123',
        reset_password_token_timestamp: expiredTimestamp,
      })
      mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

      const user = new User({ id: 'test-user-id' })

      await expect(
        user.completePasswordReset('reset-token-123', 'newpassword')
      ).rejects.toThrow('This reset token is expired.')
    })
  })

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 12)
      const user = new User({ hashedPassword })

      const result = await user.verifyPassword('correctpassword')

      expect(result).toBe(true)
    })

    it('should return false for incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 12)
      const user = new User({ hashedPassword })

      const result = await user.verifyPassword('wrongpassword')

      expect(result).toBe(false)
    })

    it('should return false when no hashed password set', async () => {
      const user = new User()

      const result = await user.verifyPassword('anypassword')

      expect(result).toBe(false)
    })
  })

  describe('static finders', () => {
    describe('accountWithEmailExists', () => {
      it('should return true when email exists', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([{ count: 1 }], 1))

        const result = await User.accountWithEmailExists('test@example.com')

        expect(result).toBe(true)
        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT 1 FROM users WHERE email = $1',
          ['test@example.com']
        )
      })

      it('should return false when email does not exist', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const result = await User.accountWithEmailExists('new@example.com')

        expect(result).toBe(false)
      })
    })

    describe('accountWithUsernameExists', () => {
      it('should return true when username exists', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([{ count: 1 }], 1))

        const result = await User.accountWithUsernameExists('testuser')

        expect(result).toBe(true)
        expect(mockQuery).toHaveBeenCalledWith(
          'SELECT 1 FROM users WHERE username = $1',
          ['testuser']
        )
      })

      it('should return false when username does not exist', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const result = await User.accountWithUsernameExists('newuser')

        expect(result).toBe(false)
      })
    })

    describe('findById', () => {
      it('should return user when found', async () => {
        const mockRow = createMockUserRow()
        mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

        const user = await User.findById('test-user-id-123')

        expect(user).toBeInstanceOf(User)
        expect(user?.id).toBe('test-user-id-123')
      })

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const user = await User.findById('nonexistent-id')

        expect(user).toBeNull()
      })
    })

    describe('findByEmail', () => {
      it('should return user when found', async () => {
        const mockRow = createMockUserRow()
        mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

        const user = await User.findByEmail('test@example.com')

        expect(user).toBeInstanceOf(User)
        expect(user?.email).toBe('test@example.com')
      })

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const user = await User.findByEmail('notfound@example.com')

        expect(user).toBeNull()
      })
    })

    describe('findByUsername', () => {
      it('should return user when found', async () => {
        const mockRow = createMockUserRow()
        mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

        const user = await User.findByUsername('testuser')

        expect(user).toBeInstanceOf(User)
        expect(user?.username).toBe('testuser')
      })

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const user = await User.findByUsername('notfound')

        expect(user).toBeNull()
      })
    })

    describe('findByResetPasswordToken', () => {
      it('should return user when found', async () => {
        const mockRow = createMockUserRow({
          reset_password_token: 'reset-token-123',
        })
        mockQuery.mockResolvedValue(createMockQueryResult([mockRow], 1))

        const user = await User.findByResetPasswordToken('reset-token-123')

        expect(user).toBeInstanceOf(User)
        expect(user?.resetPasswordToken).toBe('reset-token-123')
      })

      it('should return null when not found', async () => {
        mockQuery.mockResolvedValue(createMockQueryResult([], 0))

        const user = await User.findByResetPasswordToken('invalid-token')

        expect(user).toBeNull()
      })
    })
  })

  describe('parseRow', () => {
    it('should correctly map database row to User instance', () => {
      const mockRow = createMockUserRow()
      const user = User.parseRow(mockRow)

      expect(user).toBeInstanceOf(User)
      expect(user.id).toBe('test-user-id-123')
      expect(user.email).toBe('test@example.com')
      expect(user.username).toBe('testuser')
      expect(user.displayName).toBe('Test User')
      expect(user.verified).toBe(false)
    })
  })

  describe('sendVerificationEmail', () => {
    it('should send verification email when required fields exist', async () => {
      const user = new User({
        email: 'test@example.com',
        username: 'testuser',
        verifyToken: '123456',
      })

      await expect(user.sendVerificationEmail()).resolves.toBeDefined()

      expect(mockSendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'testuser',
        'Your Verification Code',
        expect.stringContaining('123456')
      )
    })

    it('should reject when required fields are missing', async () => {
      const user = new User({ email: 'test@example.com' })

      await expect(user.sendVerificationEmail()).rejects.toThrow(
        'Missing email, username, or verification token.'
      )

      expect(mockSendEmail).not.toHaveBeenCalled()
    })
  })

  describe('sendPasswordResetEmail', () => {
    const originalAppBaseUrl = process.env.APP_BASE_URL

    afterEach(() => {
      if (originalAppBaseUrl) {
        process.env.APP_BASE_URL = originalAppBaseUrl
      } else {
        delete process.env.APP_BASE_URL
      }
    })

    it('should send password reset email using APP_BASE_URL when available', async () => {
      process.env.APP_BASE_URL = 'https://example.com'

      const user = new User({
        email: 'reset@example.com',
        username: 'resetuser',
        resetPasswordToken: 'reset-token-123',
      })

      await expect(user.sendPasswordResetEmail()).resolves.toBeDefined()

      expect(mockSendEmail).toHaveBeenCalledWith(
        'reset@example.com',
        'resetuser',
        'Reset Password',
        expect.stringContaining(
          'https://example.com/auth/reset-password/reset-token-123'
        )
      )
    })

    it('should fall back to localhost when APP_BASE_URL is not set', async () => {
      delete process.env.APP_BASE_URL

      const user = new User({
        email: 'reset@example.com',
        username: 'resetuser',
        resetPasswordToken: 'reset-token-123',
      })

      await expect(user.sendPasswordResetEmail()).resolves.toBeDefined()

      expect(mockSendEmail).toHaveBeenCalledWith(
        'reset@example.com',
        'resetuser',
        'Reset Password',
        expect.stringContaining(
          'http://localhost:3000/auth/reset-password/reset-token-123'
        )
      )
    })

    it('should reject when required fields are missing', async () => {
      const user = new User({ email: 'reset@example.com' })

      await expect(user.sendPasswordResetEmail()).rejects.toThrow(
        'Missing email, username, or reset token.'
      )

      expect(mockSendEmail).not.toHaveBeenCalled()
    })
  })
})
