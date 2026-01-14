# Ron Burgundy Slackbot

A Slack bot that responds as Ron Burgundy from Anchorman, powered by OpenAI's GPT models.

## Features

- Responds to mentions with Ron Burgundy's pompous, confident personality
- Workspace memory system for context and inside jokes
- Admin commands to manage memories (add, remove, view, reset)
- Rate limiting (per-hour and cooldown)
- Structured JSON logging for monitoring
- TypeScript for type safety
- Docker support with multi-stage builds
- **Slackbot rivalry**: Ron is hostile to Slackbot and will mock it unprompted (20% of the time)
- Security features:
  - Input validation and sanitization
  - Memory size limits (500 chars per memory, 50 memories max)
  - User input truncation (2000 chars max)
  - Prompt injection detection
  - Environment variable validation on startup

## Setup

### Prerequisites

- Node.js 20+
- Slack workspace with bot permissions
- OpenAI API key

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Set your environment variables in `.env`:
   - `SLACK_BOT_TOKEN`: Your Slack bot token (xoxb-...)
   - `SLACK_APP_TOKEN`: Your Slack app token (xapp-...)
   - `OPENAI_API_KEY`: Your OpenAI API key

### Development

Build the TypeScript code:
```bash
npm run build
```

Run the bot:
```bash
npm start
```

Or build and run in one command:
```bash
npm run dev
```

### Docker Deployment

Build the Docker image:
```bash
docker-compose build
```

Run with Docker Compose:
```bash
docker-compose up -d
```

The bot will store its SQLite database in the `./data` directory.

## Configuration

All configuration is done via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_BOT_TOKEN` | - | Slack bot token (required) |
| `SLACK_APP_TOKEN` | - | Slack app token for Socket Mode (required) |
| `OPENAI_API_KEY` | - | OpenAI API key (required) |
| `RON_DB_PATH` | `/data/ron.sqlite` | Path to SQLite database |
| `RON_MODEL` | `gpt-4o-mini` | OpenAI model to use |
| `RON_MAX_REQ_PER_HOUR` | `30` | Maximum requests per hour |
| `RON_COOLDOWN_MS` | `15000` | Cooldown between requests (ms) |
| `RON_MAX_OUTPUT_TOKENS` | `160` | Maximum tokens in responses |

## Usage

### Talking to Ron

Mention the bot in any channel:
```
@Ron tell me about San Diego
```

Ron will respond in character with his signature pompous style.

### Admin Commands

Workspace admins have access to memory management commands:

**View all memories:**
```
@Ron memories
```

**Add a new memory/inside joke:**
```
@Ron remember We always call the break room "the think tank"
```

**Remove a memory by number:**
```
@Ron forget 2
```

**Reset all memories:**
```
@Ron reset
```

## Architecture

- **TypeScript**: Full type safety with strict mode
- **Slack Bolt**: Event-driven Slack integration with Socket Mode
- **OpenAI API**: GPT-powered responses with character prompts
- **SQLite**: Persistent workspace memory storage
- **Docker**: Multi-stage builds for optimized production images

## Project Structure

```
.
├── src/
│   └── index.ts          # Main bot code
├── dist/                 # Compiled JavaScript (git-ignored)
├── data/                 # SQLite database (git-ignored)
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Docker Compose configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## License

MIT
