# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a backend messaging service built with Express.js and TypeScript. It provides REST API endpoints and real-time messaging via Socket.IO. The service supports user authentication, conversations, and messages with a PostgreSQL database backend.

This service is designed to work with a separate frontend application (https://github.com/appdevjohn/web-messages) and requires a PostgreSQL database (https://github.com/appdevjohn/web-messages-db).

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (auto-restart on file changes)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production mode (requires build first)
npm start

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with verbose output
npm run test:verbose
```

## Docker

```bash
# Build Docker image
docker build -t messages-service .

# Run container with environment variables
docker run -p 8000:8000 --env-file .env web-messages-service
```

## Environment Variables

Required environment variables (create a `.env` file in the root):

- `PGUSER` - PostgreSQL database user
- `PGHOST` - Database host (e.g., localhost)
- `PGDATABASE` - Database name
- `PGPASSWORD` - Database password
- `PGPORT` - Database port (defaults to 5432)
- `PORT` - Server port (defaults to 8000)
- `TOKEN_SECRET` - JWT signing secret
- `APP_BASE_URL` - Frontend application URL for password reset links
- `BASE_URL` - Backend application URL for the image base URL links
- `VERIFY_USERS` - Set to 'true' to enable email verification
- `SEND_EMAILS` - Set to 'true' to enable any email sending
- `ENABLE_UPLOADS` - Set to 'true' to enable image uploads
- `MAILJET_API_KEY` - API key to authenticate with Mailjet
- `MAILJET_API_SECRET` - API secret to authenticate with Mailjet
- `NODE_ENV` - Set to 'test' to enable additional logging

## Architecture

### Core Structure

The application follows an MVC-like pattern with separation of concerns:

- **Models** (`src/models/`) - Database entities with CRUD operations and business logic
- **Controllers** (`src/controllers/`) - Request handlers that orchestrate model operations
- **Routes** (`src/routes/`) - Express route definitions with validation middleware
- **Middleware** (`src/middleware/`) - Authentication, authorization, and verification checks
- **Utils** (`src/util/`) - Database connection, Socket.IO setup, error handling, file uploads, email, and cron jobs

### Entry Point

`src/index.ts` is the main application entry point. It:

- Sets up Express server and HTTP server
- Initializes Socket.IO via `setupSocketIO()`
- Registers routes: `/auth/*`, `/messages`, and conversation controller
- Sets up global error handler middleware
- Starts a cron job (runs hourly) to delete conversations older than 30 days
- Listens on port 8000 (or `process.env.PORT`)

### Database Layer

`src/util/db.ts` exports a single `query()` function that wraps `pg.Pool.query()`. All database operations use this function with parameterized queries to prevent SQL injection.

Database schema uses:

- `snake_case` column names (mapped to `camelCase` in TypeScript models)
- UUIDs for primary keys (`user_id`, `message_id`, `convo_id`)
- CITEXT type for case-insensitive email/username lookups
- Database triggers handle `updated_at` timestamps and token timestamp updates

### Models

All models follow a consistent pattern:

**User** (`src/models/user.ts`):

- Handles user accounts with authentication
- Password hashing with bcrypt (salt rounds: 12)
- Email verification with 6-digit codes (15-minute expiry)
- Password reset with crypto tokens (1-hour expiry)
- Static finders: `findById()`, `findByEmail()`, `findByUsername()`, `findByResetPasswordToken()`, `findBySocketId()`
- Instance methods: `create()`, `update()`, `delete()`, `setVerifiedStatus()`, `verifyPassword()`, `sendVerificationEmail()`, `sendPasswordResetEmail()`

**Message** (`src/models/message.ts`):

- Represents individual messages in conversations
- Content limited to 4096 bytes (validated before DB insert)
- Supports types: 'text' or 'image'
- Can have an associated `senderId` (for logged-in users) or be anonymous with `senderName`/`senderAvatar`
- Cursor-based pagination with `listByConversation()` supporting `before`/`after` cursors and `asc`/`desc` ordering
- Uses composite key `(created_at, message_id)` for stable pagination

**Conversation** (`src/models/conversation.ts`):

- Represents chat conversations
- Auto-deleted after 30 days of inactivity (via cron job)
- `getDeletionDate()` calculates when conversation will be deleted
- `findByAge()` queries conversations by age, optionally deleting them

### Authentication & Authorization

JWT-based authentication implemented in `src/middleware/auth.ts`:

- `authentication` middleware: Extracts JWT from `Authorization: Bearer <token>` header, validates it, and sets `req.userId` and `req.verified`
- `authorization` middleware: Ensures `req.userId` exists (user must be logged in)
- Access tokens contain: `{ userId: string, verified: boolean, tokenVersion: number }` and expire in 1 hour
- `verified` field tracks email verification status (if `VERIFY_USERS=true`)

Additional middleware:

- `src/middleware/verified.ts` - Ensures user has verified their email

**Token Refresh System:**

The application uses a dual-token system for enhanced security:

- **Access Tokens** (1 hour expiry):

  - Contains `userId`, `verified`, and `tokenVersion`
  - Used for authenticating API requests
  - Short-lived for security
  - Validated against `tokenVersion` on the user record

- **Refresh Tokens** (7 days expiry):

  - Contains only `userId`
  - Used exclusively to obtain new access tokens
  - Stored in `sessions` database table
  - Longer-lived for user convenience

- **Sessions Table**:

  - Tracks all issued refresh tokens
  - Enables server-side token revocation
  - Allows invalidation on password change

- **Token Versioning & Invalidation**:
  - User model has `tokenVersion` field (integer)
  - When user changes password, `tokenVersion` increments
  - This invalidates all existing access tokens and refresh tokens
  - Provides automatic logout across all devices on password change
  - Both access and refresh tokens are validated against current `tokenVersion`

### Socket.IO Real-time Messaging

`src/util/io.ts` handles WebSocket connections:

**Socket Events (client → server):**

- `get-messages` - Fetch messages for a conversation (params: `{ convoId }`)
- `send-message` - Send a new message (params: `{ convoId, content, userName, userAvatar }`)
- `create-conversation` - Create new conversation (params: `{ name }`)
- `delete-conversation` - Delete conversation (params: `{ convoId }`)

Additional notes:

- Models have been updated since these events were written, so these event functions will need to be revised.

**Socket Events (server → client):**

- `messages` - Response with message list and conversation details
- `response` - Generic response with event type and data
- `error` - Error message
- Room-based updates: Server emits to `convoId` room when new messages arrive

Socket.IO is initialized in `setupSocketIO()` with CORS configured to allow all origins for GET methods.

### Routes & Validation

Routes use `express-validator` for input validation:

**Health Check Route**:

- `GET /health-check` - Health check endpoint that returns service status and feature availability
  - Returns `emailEnabled` (true if `VERIFY_USERS=true`)
  - Returns `imageUploadsEnabled` (true if `ENABLE_UPLOADS=true`)

**Auth Routes** (`/auth/*`):

- `PUT /auth/login` - Email/password login (returns access token and refresh token)
- `POST /auth/signup` - Create new account (returns access token and refresh token)
- `PUT /auth/refresh` - Get new access token using refresh token
- `PUT /auth/confirm-email` - Verify email with 6-digit code
- `PUT /auth/resend-verification-code` - Request new verification email
- `PUT /auth/request-new-password` - Start password reset flow
- `PUT /auth/reset-password` - Complete password reset with token (invalidates all sessions)
- `DELETE /auth/delete-account` - Delete user account
- `GET /auth/ping` - Check authentication status

**Message Routes**:

- `GET /messages` - List messages (defined in `src/routes/message.ts`)
- `POST /message` - Create message (requires auth)

**Conversation Routes**:

- Registered via controller in `src/controllers/conversation.ts`

### Error Handling

Custom `RequestError` class (`src/util/error.ts`) extends Error with HTTP status codes. Global error handler in `src/index.ts` catches errors and returns JSON responses with appropriate status codes.

### Cron Jobs

`src/util/cron.ts` defines scheduled tasks:

- Hourly job (via `node-cron`) deletes conversations inactive for 30+ days
- Runs in America/New_York timezone
- Started automatically when server starts

### File Uploads

`src/util/upload.ts` handles file upload logic (uses multer for multipart/form-data).

### TypeScript Configuration

- Target: ES2016
- Module: CommonJS
- Strict mode enabled
- Source: `src/`
- Output: `dist/`
- Root directory structure preserved in build output

## Development Notes

### Database Queries

Always use parameterized queries via the `query()` function. Column names use `snake_case` in the database but are mapped to `camelCase` in TypeScript models via `parseRow()` static methods.

### Model Updates

Models use partial updates - only fields present in the patch object are updated. The `updated_at` timestamp is automatically managed by database triggers.

### Token Expiry

- Access tokens (JWT): 1 hour
- Refresh tokens (JWT): 7 days
- Email verification codes: 15 minutes
- Password reset tokens: 1 hour
- Token timestamp fields (`verify_token_timestamp`, `reset_password_token_timestamp`) are managed by database triggers
- Token versioning: User's `tokenVersion` field increments on password change, invalidating all existing access and refresh tokens

### Testing

The project uses Jest with ts-jest for unit testing. All tests are located in `src/__tests__/` directory.

**Test Organization:**

- `src/__tests__/models/` - Unit tests for User, Message, and Conversation models
- `src/__tests__/middleware/` - Unit tests for authentication and authorization middleware
- `src/__tests__/util/` - Unit tests for utility functions like RequestError
- `src/__tests__/helpers/` - Test helper utilities and mock factories
- `src/__tests__/setup.ts` - Global test setup (runs before all tests)

**Running Tests:**

```bash
npm test                 # Run all tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:verbose     # Run tests with verbose output
```

**Test Coverage:**

Current test coverage (131 tests):

- Models: 93.77% statement coverage
- Authentication middleware: 100% coverage
- RequestError utility: 100% coverage

**Writing Tests:**

- All tests use Jest's mocking capabilities to avoid database dependencies
- Database queries are mocked using `jest.mock('../../util/db')`
- Use helper functions in `src/__tests__/helpers/db-mock.ts` for creating mock data
- Tests follow AAA pattern: Arrange, Act, Assert
- `NODE_ENV=test` is automatically set to prevent emails from being sent

**Test Utilities:**

- `createMockQueryResult<T>(rows, rowCount)` - Creates mock pg QueryResult
- `createMockUserRow(overrides)` - Creates mock user database row
- `createMockMessageRow(overrides)` - Creates mock message database row
- `createMockConversationRow(overrides)` - Creates mock conversation database row

**Configuration:**

- `jest.config.js` - Jest configuration with ts-jest preset
- `tsconfig.json` - TypeScript configured with Jest types
- Coverage reports are generated in `coverage/` directory (gitignored)

### Message Content Validation

Messages have a 4096-byte limit (validated in-memory before database insert to fail fast). Use `Buffer.byteLength()` to match PostgreSQL's `octet_length()` semantics.

### Conversation Lifecycle

Conversations are soft-expired based on `updated_at` timestamp. The cron job permanently deletes conversations (and cascades to messages) after 30 days of inactivity.
