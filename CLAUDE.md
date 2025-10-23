# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Messenger Hawk is a backend messaging service built with Express.js and TypeScript. It provides REST API endpoints and real-time messaging via Socket.IO. The service supports user authentication, conversations, and messages with a PostgreSQL database backend.

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
- `VERIFY_USERS` - Set to 'true' to enable email verification
- `NODE_ENV` - Set to 'test' to disable email sending

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
- Instance methods: `create()`, `update()`, `delete()`, `verify()`, `verifyPassword()`, `sendVerificationEmail()`, `sendPasswordResetEmail()`

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
- Auth tokens contain: `{ userId: string, verified: boolean }` and expire in 1 hour
- `verified` field tracks email verification status (if `VERIFY_USERS=true`)

Additional middleware:

- `src/middleware/verified.ts` - Ensures user has verified their email

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

**Auth Routes** (`/auth/*`):

- `PUT /auth/login` - Email/password login
- `POST /auth/signup` - Create new account
- `PUT /auth/confirm-email` - Verify email with 6-digit code
- `PUT /auth/resend-verification-code` - Request new verification email
- `PUT /auth/request-new-password` - Start password reset flow
- `PUT /auth/reset-password` - Complete password reset with token
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

- JWT tokens: 1 hour
- Email verification codes: 15 minutes
- Password reset tokens: 1 hour
- Token timestamp fields (`verify_token_timestamp`, `reset_password_token_timestamp`) are managed by database triggers

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

Current test coverage (128 tests):
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

## Planned Features & Future Work

### User-Conversation Ownership Tracking

**Database Changes:**

- Add `creator_id` column to `conversations` table (nullable UUID, foreign key to `users.user_id`)
- This allows tracking which user created each conversation
- Nullable to support existing anonymous conversations

**Model Updates (Conversation):**

- Add `creatorId?: string | null` property to `Conversation` class
- Update `constructor()` to accept `creatorId` in config
- Update `update()` to handle `creator_id` column in INSERT/UPDATE
- Update `parseRow()` to map `creator_id` to `creatorId`
- Add new static method: `findByUserId(userId: string): Promise<Conversation[]>` to query all conversations created by a user
- Update `create()` logic to set `creator_id` when user is authenticated

**Controller Updates:**

- Update conversation creation endpoints to accept optional `userId` from authenticated requests
- Add new controller function to get conversations by user ID

**REST API Endpoints to Add:**

- `GET /conversations` - List all conversations created by authenticated user (requires auth middleware)
- `GET /conversations/:id` - Get single conversation by ID
- `POST /conversations` - Create new conversation (optionally authenticated to set creator)
- `PUT /conversations/:id` - Update conversation name (requires auth, only creator can update)
- `DELETE /conversations/:id` - Delete conversation (optionally require creator ownership)

**Routes File:**

- Create `src/routes/conversation.ts` with route definitions
- Apply `authentication` middleware to track creator on POST
- Apply `authorization` middleware for user-specific queries (GET /conversations)
- Use `express-validator` for input validation

### Socket.IO Feature Parity with REST API

Currently, Socket.IO handles conversations and messages, but lacks feature parity with REST endpoints. Need to expand Socket.IO functionality:

**New Socket Events to Implement:**

**Messages:**

- `list-messages` - Get paginated message list with cursor support (params: `{ convoId, limit?, before?, after?, order? }`)
  - Response: `{ messages: Message[], pageInfo: { hasMore, nextBefore?, nextAfter? } }`
- `update-message` - Edit existing message content (params: `{ messageId, content }`)
- `delete-message` - Delete a message (params: `{ messageId }`)

**Conversations:**

- `list-conversations` - Get all conversations for authenticated user (params: `{ userId? }`)
  - For authenticated users, return their created conversations
  - For anonymous, could return recently accessed or all public conversations
- `get-conversation` - Get single conversation details (params: `{ convoId }`)
- `update-conversation` - Update conversation name (params: `{ convoId, name }`)

**Socket Authentication:**

- Socket.IO currently doesn't handle authentication (no JWT verification)
- To implement authenticated Socket events:
  1. Accept `token` parameter in socket handshake or event payloads
  2. Create helper function `authenticateSocketEvent(token)` that verifies JWT and returns `{ userId, verified }`
  3. For user-specific operations (list-conversations, update-message), verify token and check ownership
  4. For anonymous operations, allow without token but don't set `creator_id`

**Implementation Pattern:**

- Each socket event handler should follow similar structure to REST controllers
- Validate input parameters
- Handle authentication if required
- Call appropriate model methods
- Emit response or error
- For mutations (create, update, delete), broadcast updates to relevant rooms

**Room Management:**

- Currently, updates are emitted to `convoId` room, but clients don't explicitly join rooms
- Consider having clients join conversation rooms: `socket.join(convoId)`
- Emit updates only to sockets in the conversation room
- When user creates/joins conversation, have them join the room
- When conversation is deleted, clear the room

**Error Handling:**

- Standardize socket error responses: `socket.emit('error', { event: 'original-event-name', message: 'error description' })`
- Ensure all async errors are caught and emitted back to client

### Migration Path

When implementing these features:

1. **Database Migration First:**

   - Add `creator_id` column to conversations table
   - Update database schema repository (https://github.com/appdevjohn/web-messages-db)

2. **Model Layer:**

   - Update `Conversation` model with new properties and methods
   - Ensure backward compatibility with existing null `creator_id` values

3. **REST API:**

   - Create conversation routes file
   - Implement controllers for CRUD operations
   - Add route registrations to `src/index.ts`
   - Test endpoints with authenticated and anonymous users

4. **Socket.IO Expansion:**

   - Add authentication helper for socket events
   - Implement new socket event handlers in `src/util/io.ts`
   - Update existing handlers to use creator_id when available
   - Implement room management for better event targeting
   - Update frontend to use new socket events

5. **Testing:**
   - Add tests for user-conversation ownership
   - Test authenticated vs anonymous conversation creation
   - Verify authorization checks (only creator can update/delete)
   - Test socket authentication and event handling
