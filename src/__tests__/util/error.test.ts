import RequestError from '../../util/error'

describe('RequestError', () => {
  describe('withMessageAndCode', () => {
    it('should create error with custom message and code', () => {
      const error = RequestError.withMessageAndCode('Custom error', 400)

      expect(error).toBeInstanceOf(RequestError)
      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Custom error')
      expect(error.code).toBe(400)
    })

    it('should handle different status codes', () => {
      const testCases = [
        { message: 'Bad Request', code: 400 },
        { message: 'Internal Server Error', code: 500 },
        { message: 'Forbidden', code: 403 },
      ]

      testCases.forEach(({ message, code }) => {
        const error = RequestError.withMessageAndCode(message, code)

        expect(error.message).toBe(message)
        expect(error.code).toBe(code)
      })
    })
  })

  describe('notAuthorized', () => {
    it('should create 401 error with correct message', () => {
      const error = RequestError.notAuthorized()

      expect(error).toBeInstanceOf(RequestError)
      expect(error.message).toBe('Not Authorized.')
      expect(error.code).toBe(401)
    })
  })

  describe('notVerified', () => {
    it('should create 401 error for unverified users', () => {
      const error = RequestError.notVerified()

      expect(error).toBeInstanceOf(RequestError)
      expect(error.message).toBe('Not Verified.')
      expect(error.code).toBe(401)
    })
  })

  describe('accountDoesNotExist', () => {
    it('should create 404 error for non-existent accounts', () => {
      const error = RequestError.accountDoesNotExist()

      expect(error).toBeInstanceOf(RequestError)
      expect(error.message).toBe('This account does not exist.')
      expect(error.code).toBe(404)
    })
  })

  describe('passwordIncorrect', () => {
    it('should create 401 error for incorrect password', () => {
      const error = RequestError.passwordIncorrect()

      expect(error).toBeInstanceOf(RequestError)
      expect(error.message).toBe('Password is incorrect.')
      expect(error.code).toBe(401)
    })
  })

  describe('error inheritance', () => {
    it('should be catchable as Error', () => {
      const error = RequestError.notAuthorized()

      try {
        throw error
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
        expect(e).toBeInstanceOf(RequestError)
      }
    })

    it('should have stack trace', () => {
      const error = RequestError.withMessageAndCode('Test error', 500)

      expect(error.stack).toBeDefined()
      expect(error.stack).toContain('Test error')
    })
  })

  describe('error code property', () => {
    it('should be optional on base RequestError', () => {
      const error = new RequestError('Basic error')

      expect(error.message).toBe('Basic error')
      expect(error.code).toBeUndefined()
    })
  })
})
