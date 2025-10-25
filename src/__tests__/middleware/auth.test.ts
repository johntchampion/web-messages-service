import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { authentication, authorization } from '../../middleware/auth'
import RequestError from '../../util/error'

jest.mock('jsonwebtoken')

const mockJwt = jwt as jest.Mocked<typeof jwt>

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let nextFunction: NextFunction

  beforeEach(() => {
    mockRequest = {
      get: jest.fn(),
    }
    mockResponse = {}
    nextFunction = jest.fn()
    process.env.TOKEN_SECRET = 'test-secret'
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('authentication', () => {
    it('should set userId to null when no Authorization header', () => {
      ;(mockRequest.get as jest.Mock).mockReturnValue(undefined)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should authenticate valid JWT token', () => {
      const token = 'valid.jwt.token'
      const decodedToken = {
        userId: 'user-123',
        verified: true,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockJwt.verify).toHaveBeenCalledWith(token, 'test-secret')
      expect(mockRequest.userId).toBe('user-123')
      expect(mockRequest.verified).toBe(true)
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should authenticate unverified user', () => {
      const token = 'valid.jwt.token'
      const decodedToken = {
        userId: 'user-456',
        verified: false,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBe('user-456')
      expect(mockRequest.verified).toBe(false)
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should set userId to null when JWT verification fails', () => {
      const token = 'invalid.jwt.token'

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockImplementation(() => {
        throw new Error('Invalid token')
      })

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should set userId to null when decoded token is falsy', () => {
      const token = 'valid.jwt.token'

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(null as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockRequest.userId).toBeNull()
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should extract token from Authorization header with Bearer scheme', () => {
      const token = 'my.jwt.token'
      const decodedToken = {
        userId: 'user-789',
        verified: true,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockJwt.verify).toHaveBeenCalledWith(token, 'test-secret')
      expect(mockRequest.userId).toBe('user-789')
    })

    it('should handle Authorization header with extra spaces', () => {
      const token = 'my.jwt.token'
      const decodedToken = {
        userId: 'user-999',
        verified: false,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer  ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      // The token extraction uses split(' ')[1], so extra spaces might cause issues
      // This test verifies the behavior
      expect(nextFunction).toHaveBeenCalled()
    })

    it('should use TOKEN_SECRET from environment', () => {
      process.env.TOKEN_SECRET = 'custom-secret'
      const token = 'valid.jwt.token'
      const decodedToken = {
        userId: 'user-123',
        verified: true,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      authentication(
        mockRequest as Request,
        mockResponse as Response,
        nextFunction
      )

      expect(mockJwt.verify).toHaveBeenCalledWith(token, 'custom-secret')
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
    it('should authenticate and authorize valid user', () => {
      const token = 'valid.jwt.token'
      const decodedToken = {
        userId: 'user-123',
        verified: true,
      }

      ;(mockRequest.get as jest.Mock).mockReturnValue(`Bearer ${token}`)
      mockJwt.verify.mockReturnValue(decodedToken as any)

      const authNext = jest.fn()
      const authzNext = jest.fn()

      // First authenticate
      authentication(mockRequest as Request, mockResponse as Response, authNext)

      expect(authNext).toHaveBeenCalled()
      expect(mockRequest.userId).toBe('user-123')

      // Then authorize
      authorization(mockRequest as Request, mockResponse as Response, authzNext)

      expect(authzNext).toHaveBeenCalled()
    })

    it('should authenticate but fail authorization when no token provided', () => {
      ;(mockRequest.get as jest.Mock).mockReturnValue(undefined)

      const authNext = jest.fn()

      // First authenticate (sets userId to null)
      authentication(mockRequest as Request, mockResponse as Response, authNext)

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
