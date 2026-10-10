# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a backend messaging service built with Express.js and TypeScript. It provides REST API endpoints and real-time messaging via Socket.IO. The service supports user authentication, conversations, and messages, stored in a SQLite database file.

This service is designed to work with a separate frontend application (https://github.com/appdevjohn/web-messages). No separate database server is needed: the SQLite database file and its schema are created automatically on first use.

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

# Run container with environment variables (the volume keeps the SQLite database)
docker run -p 8000:8000 --env-file .env -v messages-data:/app/data messages-service
```

## Environment Variables

Required environment variables (create a `.env` file in the root):

- `SQLITE_PATH` - Path to the SQLite database file (defaults to `data/messages.db`)
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
- `OLLAMA_HOST` - Ollama server URL for AI messages (defaults to `http://localhost:11434`)

## Architecture

### Core Structure

The application follows an MVC-like pattern with separation of concerns:

- **Models** (`src/models/`) - Database entities with CRUD operations and business logic
- **Controllers** (`src/controllers/`) - Request handlers that orchestrate model operations
- **Routes** (`src/routes/`) - Express route definitions with validation middleware
- **Middleware** (`src/middleware/`) - Authentication, authorization, and verification checks
- **Utils** (`src/util/`) - SQLite connection, Socket.IO setup, error handling, file uploads, email, and cron jobs

### Entry Point

`src/index.ts` is the main application entry point. It:

- Sets up Express server and HTTP server
- Initializes Socket.IO via `setupSocketIO()`
- Registers routes: `/auth/*`, `/messages`, and conversation controller
- Sets up global error handler middleware
- Starts a cron job (runs hourly) to delete conversations older than 30 days
- Listens on port 8000 (or `process.env.PORT`)

### Database Layer

`src/util/db.ts` opens the SQLite database (Node's built-in `node:sqlite`) on first use and exports a single `query(sql, params)` function that returns `{ rows, rowCount }`. All database operations use this function with parameterized queries (`?` placeholders, or `?1` when a parameter is reused) to prevent SQL injection.

- Opening the database creates the file's directory, enables `PRAGMA foreign_keys` (required for cascading deletes), WAL mode, and a busy timeout, and applies `database/schema.sql`
- Every statement in `database/schema.sql` is idempotent (`CREATE ... IF NOT EXISTS`), so it runs on every startup
- `query()` converts parameters before binding: `Date` → ISO-8601 string, boolean → 1/0, `undefined` → `null`
- `rowCount` is the number of rows returned for statements that return rows (SELECT or RETURNING), otherwise the number of rows changed

Database schema uses:

- `snake_case` column names (mapped to `camelCase` in TypeScript models)
- UUID text primary keys (`user_id`, `message_id`, `convo_id`), generated in the models with `crypto.randomUUID()`
- Timestamps stored as ISO-8601 UTC text (same format as `Date#toISOString()`), so they sort and compare correctly as text
- Booleans stored as 0/1 integers
- `COLLATE NOCASE` for case-insensitive email/username lookups and uniqueness
- `CHECK` constraints in place of enums
- Triggers bump a conversation's `updated_at` when its messages change. `updated_at` on other tables and the token timestamps are set by the models in their own SQL, because SQLite's `RETURNING` does not reflect changes made by `AFTER` triggers

`src/util/column-parsers.ts` converts stored values back to JavaScript types (`parseTimestamp`, `parseNullableTimestamp`, `parseBoolean`) inside each model's `parseRow()`. `src/util/sqlite-errors.ts` recognizes UNIQUE constraint failures.

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
- `senderType` field: `'user'` (authenticated), `'anonymous'` (no auth), or `'system'` (AI/agent)
- Can have an associated `senderId` (for logged-in users), be anonymous with `senderName`/`senderAvatar`, or be a system message with `agentId`
- Cursor-based pagination with `listByConversation()` supporting `before`/`after` cursors and `asc`/`desc` ordering
- Uses composite key `(created_at, message_id)` for stable pagination

**Conversation** (`src/models/conversation.ts`):

- Represents chat conversations
- `parseRow()` maps DB rows to Conversation objects
- Auto-deleted after 30 days of inactivity (via cron job)
- `getDeletionDate()` calculates when conversation will be deleted
- `findByAge()` queries conversations by age, optionally deleting them

**SystemAgent** (`src/models/system-agent.ts`):

- Represents AI/system agents that can send messages in conversations
- Stored in `system_agents` table with unique `model_name` and `display_name` constraints
- Static methods: `findByModelName()`, `findOrCreate()` (upsert pattern)
- Referenced by `messages.agent_id` when `sender_type = 'system'`

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
- `create-message` - Send a new message (params: `{ convoId, content, userName?, userAvatar?, token?, aiResponse? }`). When `aiResponse` is true, triggers an AI response via Ollama
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
- `POST /message` - Create message (requires auth). Accepts optional `aiResponse: boolean` to trigger an AI response in the conversation

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

Always use parameterized queries via the `query()` function. Column names use `snake_case` in the database but are mapped to `camelCase` in TypeScript models via `parseRow()` static methods, which also convert timestamps and booleans using `src/util/column-parsers.ts`. Pass `new Date()` as a parameter instead of using SQL time functions so stored timestamps share one format.

### Model Updates

Models use partial updates - only fields present in the patch object are updated. Each `update()` also sets `updated_at`, and setting a verification or reset token sets (or clears) its timestamp.

### Token Expiry

- Access tokens (JWT): 1 hour
- Refresh tokens (JWT): 7 days
- Email verification codes: 15 minutes
- Password reset tokens: 1 hour
- Token timestamp fields (`verify_token_timestamp`, `reset_password_token_timestamp`) are set by the User model whenever their tokens change
- Token versioning: User's `tokenVersion` field increments on password change, invalidating all existing access and refresh tokens

### Testing

The project uses Jest with ts-jest for unit testing. All tests are located in `src/__tests__/` directory.

**Test Organization:**

- `src/__tests__/models/` - Unit tests for User, Message, and Conversation models
- `src/__tests__/middleware/` - Unit tests for authentication and authorization middleware
- `src/__tests__/util/` - Unit tests for utility functions like RequestError, plus `db.test.ts`, which runs `query()` against a real in-memory SQLite database
- `src/__tests__/integration/` - Model tests that run against a real in-memory SQLite database (no mocks)
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

Current test coverage (191 tests; the coverage figures below are from an earlier run):

- Models: 93.77% statement coverage
- Authentication middleware: 100% coverage
- RequestError utility: 100% coverage

**Writing Tests:**

- Model unit tests mock database queries using `jest.mock('../../util/db')`
- `src/__tests__/setup.ts` sets `SQLITE_PATH=:memory:`, so unmocked tests get a fresh in-memory database per test file
- Use helper functions in `src/__tests__/helpers/db-mock.ts` for creating mock data
- Tests follow AAA pattern: Arrange, Act, Assert
- `NODE_ENV=test` is automatically set to prevent emails from being sent

**Test Utilities:**

- `createMockQueryResult<T>(rows, rowCount)` - Creates a mock `QueryResult` (`{ rows, rowCount }`)
- `createMockUserRow(overrides)` - Creates mock user database row
- `createMockMessageRow(overrides)` - Creates mock message database row
- `createMockConversationRow(overrides)` - Creates mock conversation database row

**Configuration:**

- `jest.config.js` - Jest configuration with ts-jest preset
- `tsconfig.json` - TypeScript configured with Jest types
- Coverage reports are generated in `coverage/` directory (gitignored)

### Message Content Validation

Messages have a 4096-byte limit (validated in-memory before database insert to fail fast). Use `Buffer.byteLength()` to count bytes, matching the schema's `length(CAST(content AS BLOB))` check.

### Conversation Lifecycle

Conversations are soft-expired based on `updated_at` timestamp. The cron job permanently deletes conversations (and cascades to messages) after 30 days of inactivity.

### AI Messages

When a user sends a message with `aiResponse: true` (via REST or Socket.IO), the system:

1. Saves the user's message normally and responds immediately
2. Asynchronously fetches the last 50 messages for conversation context
3. Finds or creates the `gemma4` agent in the `system_agents` table
4. Queries Ollama (`gemma4` model) via `src/util/ollama.ts`
5. Saves the AI response as a `sender_type = 'system'` message with the agent's `agent_id`
6. Broadcasts the AI message to the conversation room via Socket.IO

**Key files:**
- `src/util/ollama.ts` — Ollama client, message mapping, response generation
- `src/util/ai-response.ts` — Orchestrator (fire-and-forget, errors logged not propagated)
- `src/models/system-agent.ts` — Agent model with `findOrCreate()` upsert

The AI response is non-blocking: the user's request returns before AI generation starts. If Ollama is unreachable or fails, the error is logged and the user's message is unaffected.
