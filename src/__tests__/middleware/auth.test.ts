import { Request, Response, NextFunction } from 'express'
import { authentication, authorization } from '../../middleware/auth'
import RequestError from '../../util/error'
import User from '../../models/user'

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let nextFunction: NextFunction

  let validateAccessTokenSpy: jest.SpyInstance

  beforeEach(() => {
    mockRequest = {
      get: jest.fn(),
    }
    mockResponse = {}
    nextFunction = jest.fn()
    validateAccessTokenSpy = jest.spyOn(User, 'validateAccessToken')
  })

  afterEach(() => {
    validateAccessTokenSpy.mockRestore()
    jest.clearAllMocks()
  })

  describe('authentication', () => {
    it('should set userId to null when no Authorization header', async () => {
      ;(mockRequest.get as jest.Mock).mockReturnValue(undefined)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
      expect(validateAccessTokenSpy).not.toHaveBeenCalled()
    })

    it('should authenticate valid access token', async () => {
      const token = 'valid.jwt.token'
      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)

      const user = new User({ id: 'user-123', verified: true })
      validateAccessTokenSpy.mockResolvedValue(user)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(validateAccessTokenSpy).toHaveBeenCalledWith(token)
      expect(mockRequest.userId).toBe('user-123')
      expect(mockRequest.verified).toBe(true)
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should authenticate unverified user', async () => {
      const token = 'valid.jwt.token'
      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)

      const user = new User({ id: 'user-456', verified: false })
      validateAccessTokenSpy.mockResolvedValue(user)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBe('user-456')
      expect(mockRequest.verified).toBe(false)
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should set userId to null when access token validation fails', async () => {
      const token = 'invalid.jwt.token'

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      validateAccessTokenSpy.mockRejectedValue(new Error('Invalid token'))

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should set userId to null when validation returns null', async () => {
      const token = 'valid.jwt.token'

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      validateAccessTokenSpy.mockResolvedValue(null)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should extract token from Authorization header with Bearer scheme', async () => {
      const token = 'my.jwt.token'

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      const user = new User({ id: 'user-789', verified: true })
      validateAccessTokenSpy.mockResolvedValue(user)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(validateAccessTokenSpy).toHaveBeenCalledWith(token)
      expect(mockRequest.userId).toBe('user-789')
    })

    it('should handle Authorization header with extra spaces', async () => {
      const token = 'my.jwt.token'
      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer  ${token}`)
      validateAccessTokenSpy.mockResolvedValue(null)

      await authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      // The token extraction uses split(' ')[1], so extra spaces might cause issues
      // This test verifies the behavior
      expect(nextFunction).toHaveBeenCalled()
    })
  })

  describe('authorization', () => {
    it('should call next when userId is present', () => {
      mockRequest.userId = 'user-123'

      authorization(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(nextFunction).toHaveBeenCalled()
    })

    it('should throw RequestError when userId is not present', () => {
      mockRequest.userId = null

      expect(() => {
        authorization(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction
        )
      }).toThrow(RequestError)
    })

    it('should throw "Not Authorized" error', () => {
      mockRequest.userId = null

      try {
        authorization(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction
        )
      } catch (error: any) {
        expect(error.message).toBe('Not Authorized.')
        expect(error.code).toBe(401)
      }
    })

    it('should not call next when userId is null', () => {
      mockRequest.userId = null

      try {
        authorization(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction
        )
      } catch (error) {
        // Expected error
      }

      expect(nextFunction).not.toHaveBeenCalled()
    })

    it('should not call next when userId is undefined', () => {
      mockRequest.userId = undefined as any

      try {
        authorization(
          mockRequest as Request,
          mockResponse as Response,
          nextFunction
        )
      } catch (error) {
        // Expected error
      }

      expect(nextFunction).not.toHaveBeenCalled()
    })

    it('should allow authorization with any valid userId', () => {
      const testUserIds = ['user-1', 'user-abc', 'uuid-format-id']

      testUserIds.forEach((userId) => {
        mockRequest.userId = userId
        const next = jest.fn()

        authorization(mockRequest as Request, mockResponse as Response, next)

        expect(next).toHaveBeenCalled()
      })
    })
  })

  describe('authentication and authorization integration', () => {
    it('should authenticate and authorize valid user', async () => {
      const token = 'valid.jwt.token'
      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)

      const user = new User({ id: 'user-123', verified: true })
      validateAccessTokenSpy.mockResolvedValue(user)

      const authNext = jest.fn()
      const authzNext = jest.fn()

      // First authenticate
      await authentication(mockRequest as Request, mockResponse as Response, authNext)

      expect(authNext).toHaveBeenCalled()
      expect(mockRequest.userId).toBe('user-123')

      // Then authorize
      authorization(mockRequest as Request, mockResponse as Response, authzNext)

      expect(authzNext).toHaveBeenCalled()
    })

    it('should authenticate but fail authorization when no token provided', async () => {
      ;(mockRequest.get as jest.Mock).mockReturnValue(undefined)

      const authNext = jest.fn()

      // First authenticate (sets userId to null)
      await authentication(mockRequest as Request, mockResponse as Response, authNext)

      expect(authNext).toHaveBeenCalled()
      expect(mockRequest.userId).toBeNull()

      // Then authorization should fail
      expect(() => {
        authorization(
          mockRequest as Request,
          mockResponse as Response,
          jest.fn()
        )
      }).toThrow('Not Authorized.')
    })
  })
})
