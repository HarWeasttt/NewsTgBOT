# Telegram Content Manager Bot

A Telegram bot that runs content for Telegram channels: it pulls news from RSS feeds, writes posts with OpenAI, publishes them on a schedule and limits usage by subscription plan.

Built with **Node.js, Telegraf, MongoDB (Mongoose), Redis + Bull, OpenAI API, node-cron, Winston**.

> Документация на русском: [README.ru.md](README.ru.md)

## Features

- **AI post generation** with the OpenAI API: configurable tone and post type per channel.
- **RSS auto-posting:** feeds are polled on a schedule, new items are turned into posts and queued for publishing.
- **Publishing queue** on Bull + Redis: posts are published by a background worker that checks the user's daily limit before each post.
- **Scheduler:** per-channel publishing times, cron jobs for polling and a daily reset of limits.
- **Subscription plans** (Free / Start / Pro / Agency) with limits on channels, posts per day and AI access; payments are stored as transactions in MongoDB.
- **Admin panel inside Telegram:** user and AI usage statistics, creating and editing subscription plans.
- **Multi-step dialogs** built with Telegraf scenes (RSS setup, AI post, plan editing).
- **Logging** with Winston to files, plus maintenance scripts (backup, stats, queue and Redis checks).

## Architecture

```
Telegram ──► Telegraf bot (handlers, scenes, keyboards)
                  │
                  ▼
             Services ── UserService, PaymentService, AIService, RSSService,
                  │       AutoPostService, ConfigService, LogService
                  │
       ┌──────────┼──────────────┐
       ▼          ▼              ▼
   MongoDB    Bull queue      OpenAI API
 (users,     (Redis) ──► worker publishes posts to channels
 channels,
 transactions)
```

```
├── server.js        # app entry: DB connection, bot setup, cron jobs
├── config/          # bot settings, subscription plans, AI tones and prompts
├── models/          # Mongoose models: User, Channel, Transaction
├── services/        # business logic
├── bot/
│   ├── handlers/    # user, admin, channel and callback handlers
│   ├── scenes/      # multi-step dialogs (Telegraf Scenes)
│   └── keyboards/   # inline and reply keyboards
├── queues/          # Bull queue for post publishing
├── scripts/         # setup, backup, stats, Redis and queue utilities
└── utils/           # Winston logger
```

## Getting started

Requirements: Node.js 18+, MongoDB, Docker (for Redis).

```bash
git clone https://github.com/HarWeasttt/NewsTgBOT.git
cd NewsTgBOT
npm install
cp .env.example .env      # fill in your bot token, MongoDB URI and OpenAI key
docker compose up -d      # starts Redis (and Redis Commander on :8081)
npm start                 # or: npm run dev (nodemon)
```

## Environment variables

| Variable | Description |
|---|---|
| `BOT_TOKEN` | Telegram bot token from @BotFather |
| `ADMIN_IDS` | Comma-separated Telegram user IDs with admin access |
| `MONGODB_URI` | MongoDB connection string |
| `REDIS_URL` | Redis connection string, default `redis://localhost:6379` |
| `OPENAI_API_KEY` | OpenAI API key for AI post generation |
