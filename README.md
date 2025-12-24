# Web Messages - Backend Service

Express.js backend service providing REST API endpoints and real-time messaging capabilities via Socket.IO. Supports user authentication, conversations, and message management with PostgreSQL database integration.

## Overview

This backend service provides a complete messaging platform with:

- JWT-based authentication with dual-token system (access + refresh tokens)
- User registration with email verification
- Password reset functionality
- Real-time messaging via Socket.IO
- Link-based conversation access
- Anonymous and authenticated messaging
- Image upload support
- Automatic conversation cleanup (30-day inactivity)

## Features

- **User Authentication**: JWT-based auth with access tokens (1 hour) and refresh tokens (7 days)
- **Token Versioning**: Automatic token invalidation on password change
- **Email Verification**: Optional 6-digit verification codes via SendGrid
- **Password Reset**: Secure token-based password reset flow
- **Real-Time Messaging**: Socket.IO for instant message delivery
- **Conversation Management**: Create, delete, and manage conversations
- **Message Types**: Support for text and image messages
- **Anonymous Access**: Participate without authentication via shared links
- **Automatic Cleanup**: Cron job removes inactive conversations (30+ days)
- **File Uploads**: Image upload support via multer
- **Comprehensive Testing**: Jest test suite with 131+ tests

## Technology Stack

- **Runtime**: Node.js 24
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL (via pg library)
- **Real-time**: Socket.IO
- **Authentication**: JWT (jsonwebtoken) with bcrypt password hashing
- **Email**: SendGrid
- **File Uploads**: Multer
- **Task Scheduling**: node-cron
- **Testing**: Jest with ts-jest
- **Validation**: express-validator

## Prerequisites

- Node.js 24 or higher
- PostgreSQL database (configured and running)
- npm or yarn package manager
- SendGrid API key (optional, for email features)

## Environment Variables

Create a `.env` file in the root directory with these variables:

### Required Variables

| Variable     | Description                                   | Example               |
| ------------ | --------------------------------------------- | --------------------- |
| PGUSER       | PostgreSQL database username                  | user                  |
| PGHOST       | Database host address                         | localhost             |
| PGDATABASE   | Database name                                 | messages_db           |
| PGPASSWORD   | Database user password                        | password1             |
| PGPORT       | Database port                                 | 5432                  |
| TOKEN_SECRET | JWT signing secret (use strong random string) | your-secret-key-here  |
| APP_BASE_URL | Frontend application URL for email links      | http://localhost:3000 |
| BASE_URL     | Backend API URL for image links               | http://localhost:8000 |

### Optional Variables

| Variable         | Description                                     | Default     |
| ---------------- | ----------------------------------------------- | ----------- |
| PORT             | Server port                                     | 8000        |
| SOCKET_PATH      | Path for Socket.IO connection                   | /socket.io  |
| APP_NAME         | Application name (used in emails)               | OneTimeChat |
| VERIFY_USERS     | Enable email verification ('true' or 'false')   | false       |
| SEND_EMAILS      | Enable email sending ('true' or 'false')        | false       |
| ENABLE_UPLOADS   | Enable image uploads ('true' or 'false')        | false       |
| SENDGRID_API_KEY | SendGrid API key (required if SEND_EMAILS=true) |             |
| NODE_ENV         | Environment mode ('production' or 'test')       |             |

## Installation

Install dependencies:

```bash
npm install
```

## Running the Application

### Development Mode

Run with hot-reload (automatically restarts on code changes):

```bash
npm run dev
```

The server will start on `http://localhost:8000` (or your configured PORT).

### Production Mode

Build and run the production version:

```bash
# Build TypeScript to JavaScript
npm run build

# Start production server
npm start
```

### Development with Docker

Build the development Docker image:

```bash
docker build -f Dockerfile.dev -t messages-service-dev .
```

Run the development container:

```bash
docker run -p 8000:8000 --env-file .env messages-service-dev
```

### Production with Docker

Build the production Docker image:

```bash
docker build -t messages-service .
```

Run the production container:

```bash
docker run -p 8000:8000 --env-file .env messages-service
```

## API Endpoints

### Health Check

**GET** `/health-check`

- Returns service status and feature flags
- Response: `{ message, features: { verifyUsersEnabled, emailSendingEnabled, imageUploadsEnabled } }`

**GET** `/`

- Root endpoint health check
- Response: `{ message: "Alive and well!" }`

### Authentication Routes (`/auth/*`)

**POST** `/auth/signup`

- Create new user account
- Body: `{ displayName, username, email?, password }`
- Returns: `{ accessToken, refreshToken, userId }`
- Validations:
  - `displayName`: Required, min 1 character
  - `username`: Required, alphanumeric only
  - `email`: Optional, must be valid email if provided
  - `password`: Required, min 4 characters

**PUT** `/auth/login`

- Authenticate existing user
- Body: `{ username, password }`
- Returns: `{ accessToken, refreshToken, userId }`

**POST** `/auth/refresh`

- Get new access token using refresh token
- Body: `{ refreshToken }`
- Returns: `{ accessToken }`

**POST** `/auth/logout`

- Logout from current session (invalidates refresh token)
- Body: `{ refreshToken }`
- Returns: `{ success: true }`

**POST** `/auth/logout-everywhere`

- Logout from all sessions (invalidates all refresh tokens)
- Requires: Authentication + Authorization
- Returns: `{ success: true }`

**PUT** `/auth/confirm-email`

- Verify email with 6-digit code
- Body: `{ activateToken }`
- Requires: Authentication + Authorization
- Validations: 6-digit numeric code
- Returns: `{ success: true }`

**PUT** `/auth/resend-verification-code`

- Request new verification email
- Requires: Authentication + Authorization
- Returns: `{ success: true }`

**PUT** `/auth/request-new-password`

- Initiate password reset flow
- Body: `{ email }`
- Returns: `{ success: true }`

**PUT** `/auth/reset-password`

- Complete password reset with token
- Body: `{ resetPasswordToken, newPassword }`
- Validations: `newPassword` min 4 characters
- Returns: `{ success: true }`
- Note: Invalidates all existing sessions

**PUT** `/auth/update-profile`

- Update user profile (display name and/or profile picture)
- Body: `{ displayName?, profilePicURL? }`
- Requires: Authentication + Authorization
- Returns: `{ user: {...} }`
- Note: Broadcasts `user-updated` event to all active conversations

**DELETE** `/auth/delete-account`

- Delete user account
- Requires: Authentication + Authorization
- Returns: `{ success: true }`

**GET** `/auth/ping`

- Check authentication status
- Requires: Authentication + Authorization
- Returns: `{ userId, verified }`

### Message Routes

**GET** `/messages`

- List messages for a conversation
- Query params: `convoId` (required), `before`/`after` (cursor), `order` (asc/desc)
- Returns: Array of message objects with pagination info

**POST** `/message`

- Create new message
- Body: `{ convoId, content }`
- Requires: Authentication (not authorization - allows anonymous with token)
- Returns: Message object

### Conversation Routes

**GET** `/conversations`

- List all conversations created by the authenticated user
- Requires: Authentication + Authorization
- Returns: Array of conversation objects

**GET** `/conversations/:convoId`

- Get a single conversation by ID
- No authentication required
- Returns: Conversation object

**POST** `/conversations`

- Create new conversation
- Body: `{ name }` (passed in conversation controller)
- Requires: Authentication (sets creator if authenticated)
- Returns: Conversation object

**PUT** `/conversations/:convoId`

- Update conversation name
- Body: `{ name }`
- Requires: Authentication (creator check in controller)
- Returns: Updated conversation object

**DELETE** `/conversations/:convoId`

- Delete conversation
- Requires: Authentication (creator check in controller)
- Returns: `{ success: true }`

## Socket.IO Events

All Socket.IO events use callbacks for responses. Responses follow the format:

- Success: `{ success: true, data: {...} }`
- Error: `{ success: false, error: "error message" }`

### Client → Server Events

**Message Events:**

- `list-messages` - List messages in a conversation with cursor-based pagination

  - Params: `{ convoId, limit?, before?, after?, order? }`
  - Returns: `{ messages: [], pageInfo: {...}, conversation: {...}, deletionDate: Date }`
  - Note: Messages include enriched sender details (displayName, profilePicURL) for authenticated users

- `create-message` - Create/send a new message
  - Params: `{ convoId, content, userName?, userAvatar?, token? }`
  - Returns: `{ message: {...} }`
  - Note: Provide `token` for authenticated messaging, or `userName`/`userAvatar` for anonymous
  - Broadcasts `message-created` to conversation room

**Conversation Events:**

- `list-conversations` - List all conversations for authenticated user

  - Params: `{ token }` (required)
  - Returns: `{ conversations: [...] }`
  - Auth: Required

- `get-conversation` - Get a single conversation by ID

  - Params: `{ convoId }`
  - Returns: `{ conversation: {...}, deletionDate: Date }`

- `create-conversation` - Create a new conversation

  - Params: `{ name, token? }`
  - Returns: `{ conversation: {...}, deletionDate: Date }`
  - Note: Providing `token` sets the creator, allowing future updates/deletes

- `update-conversation` - Update a conversation's name

  - Params: `{ convoId, name, token? }`
  - Returns: `{ conversation: {...}, deletionDate: Date }`
  - Auth: Required if conversation has a creator (only creator can update)
  - Broadcasts `conversation-updated` to conversation room

- `delete-conversation` - Delete a conversation
  - Params: `{ convoId, token? }`
  - Returns: `{ success: true }`
  - Auth: Required if conversation has a creator (only creator can delete)
  - Broadcasts `conversation-deleted` to conversation room

**Room Management Events:**

- `join-conversation` - Join a conversation room to receive real-time updates

  - Params: `{ convoId }`
  - Returns: `{ convoId, joined: true }`

- `leave-conversation` - Leave a conversation room to stop receiving updates
  - Params: `{ convoId }`
  - Returns: `{ convoId, left: true }`

### Server → Client Events (Broadcasts)

These events are broadcast to all clients in a conversation room:

- `message-created` - New message was created

  - Data: `{ convoId, message: {...} }`
  - Triggered by: `create-message` event

- `conversation-updated` - Conversation was updated

  - Data: `{ conversation: {...}, deletionDate: Date }`
  - Triggered by: `update-conversation` event

- `conversation-deleted` - Conversation was deleted

  - Data: `{ convoId }`
  - Triggered by: `delete-conversation` event

- `user-updated` - User profile was updated (display name or profile picture)
  - Data: `{ userId, displayName?, profilePicURL?, convoId }`
  - Triggered by: User profile updates

## Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with verbose output
npm run test:verbose
```

Test coverage:

- 131+ tests
- 93.77% statement coverage for models
- 100% coverage for authentication middleware

## Project Structure

```
src/
├── controllers/        # Request handlers
├── middleware/         # Auth, validation, verification
├── models/            # Database models (User, Message, Conversation)
├── routes/            # Express route definitions
├── util/              # Database, Socket.IO, error handling, cron jobs
├── __tests__/         # Jest test files
└── index.ts           # Application entry point
```

## Authentication Flow

1. **Signup**: User registers with email/username/password
2. **Email Verification** (optional): User receives 6-digit code via email
3. **Login**: User authenticates and receives access + refresh tokens
4. **Access Token**: Used for API requests (1 hour expiry)
5. **Refresh Token**: Used to get new access tokens (7 days expiry)
6. **Token Versioning**: Password changes increment `tokenVersion`, invalidating all tokens

## Security Features

- **Password Hashing**: bcrypt with 12 salt rounds
- **JWT Tokens**: Signed with secret, includes token versioning
- **Token Invalidation**: Automatic on password change
- **Session Management**: Refresh tokens stored in database
- **Input Validation**: express-validator on all endpoints
- **SQL Injection Protection**: Parameterized queries
- **CORS Configuration**: Configurable origins

## Automatic Cleanup

A cron job runs hourly to delete conversations inactive for 30+ days:

- Runs in America/New_York timezone
- Cascades to associated messages
- Started automatically on server start

## Troubleshooting

### Database Connection Errors

Check database configuration:

```bash
# Verify database is running
psql -U $PGUSER -h $PGHOST -d $PGDATABASE -c "SELECT version();"

# Check environment variables
echo $PGHOST $PGUSER $PGDATABASE
```

### Port Already in Use

Change the PORT environment variable:

```bash
PORT=8001 npm run dev
```

### Email Not Sending

Verify SendGrid configuration:

- `SEND_EMAILS=true`
- `SENDGRID_API_KEY` is set correctly
- Check SendGrid dashboard for delivery status

### Token Errors

If experiencing authentication issues:

- Verify `TOKEN_SECRET` is set and consistent
- Check token expiry times
- Ensure `tokenVersion` matches between token and database

### Image Upload Failures

Verify configuration:

- `ENABLE_UPLOADS=true`
- Check file size limits in code
- Ensure write permissions for upload directory

## Development Notes

- TypeScript source files are in `src/`
- Compiled JavaScript output goes to `dist/`
- Use `npm run dev` for development with auto-restart
- Database uses `snake_case`, models use `camelCase`
- Message content limited to 4096 bytes
- Access tokens expire in 1 hour, refresh tokens in 7 days
- Email verification codes expire in 15 minutes
- Password reset tokens expire in 1 hour

## Production Deployment

For production deployment:

1. Set `NODE_ENV=production`
2. Use strong values for `TOKEN_SECRET` and database passwords
3. Configure CORS for your domain
4. Enable SSL/TLS
5. Set up proper logging and monitoring
6. Configure database backups
7. Use process manager (PM2, systemd)
8. Set up reverse proxy (nginx, Caddy)
9. Configure rate limiting
10. Enable SendGrid for email features

## License

Refer to the LICENSE file in the repository for licensing information.
