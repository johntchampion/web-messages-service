// Test setup file - runs before all tests
// Set NODE_ENV to test to prevent emails from being sent
process.env.NODE_ENV = 'test'
process.env.TOKEN_SECRET = 'test-secret-key-for-jwt-testing'
process.env.APP_BASE_URL = 'http://localhost:3000'
