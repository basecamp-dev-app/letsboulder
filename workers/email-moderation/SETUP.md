# Email Moderation Worker - Setup Guide

A Cloudflare Worker for moderating email responses via Discord with AI-generated reply suggestions.

## Architecture

```
Email → Cloudflare Worker → Discord (Approve/Reject/Edit)
         ↓
         AI Reply Generation (Gemini 2.0 Flash)
         ↓
         Resend (for sending replies)
```

## Prerequisites

1. **Cloudflare account** with Email Routing enabled
2. **Discord server** with webhook channels
3. **Resend account** for sending emails
4. **Google Cloud account** with Gemini API access

## Setup Steps

### 1. Install Dependencies

```bash
cd workers/email-moderation
npm install
```

### 2. Create KV Namespace

```bash
npx wrangler kv:namespace create EMAIL_APPROVAL_KV
```

Copy the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "EMAIL_APPROVAL_KV"
id = "YOUR_NAMESPACE_ID_HERE"
preview_id = "YOUR_PREVIEW_ID_HERE"
```

### 3. Configure Environment Variables

**Important:** Use `wrangler secret put` for sensitive values. This stores them separately from `wrangler.toml` and they will survive deployments.

```bash
# Run these commands and enter each secret when prompted
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put DISCORD_LOG_WEBHOOK_URL
```

For local development, create a `.dev.vars` file:

```bash
cp .dev.vars.example .dev.vars
# Fill in values for local testing with `npm run dev`
```

Required secrets:
- `DISCORD_BOT_TOKEN` - Bot token for Discord interactions
- `DISCORD_PUBLIC_KEY` - Application public key for signature verification
- `GEMINI_API_KEY` - API key from Google AI Studio
- `RESEND_API_KEY` - API key from Resend
- `DISCORD_LOG_WEBHOOK_URL` - Webhook for logging spam attempts and actions

Non-sensitive variables (configured in `wrangler.toml`):
- `DISCORD_APPROVAL_CHANNEL_ID` - Channel ID for email approval requests
- `ENVIRONMENT` - `development` or `production`
- `DEBUG_MODE` - `true` for verbose logging

### 4. Deploy the Worker

```bash
npm run deploy
```

### 5. Configure Discord Application

1. Create an application at https://discord.com/developers/applications
2. Add a bot user and copy the bot token
3. Enable "Message Content Intent" in the Bot settings
4. Configure the interaction endpoint URL:
   ```
   https://YOUR_WORKER.workers.dev/interactions
   ```

### 6. Create Discord Webhooks

Create two webhook channels in your Discord server:

1. **Approval Requests** - Where new emails appear for review
2. **Logs** - Where actions are logged

Get the webhook URLs and add them to your `.dev.vars` file.

### 7. Enable Email Routing

1. Go to Cloudflare Dashboard → Email Routing
2. Create a custom address (e.g., `hello@gsyrocks.com`)
3. Set the destination to your Worker:
   ```
   https://YOUR_WORKER.workers.dev
   ```
4. Verify the email routing setup

### 8. Configure Interaction Endpoint

In Discord Developer Portal:
1. Go to your application → General Information
2. Set "Interactions Endpoint URL" to:
   ```
   https://YOUR_WORKER.workers.dev/interactions
   ```

## Usage

### Email Workflow

1. Email arrives at `hello@gsyrocks.com`
2. Worker processes the email:
   - Extracts content and metadata
   - Classifies the email (bug report, question, feature request, etc.)
   - Generates AI reply suggestion
   - Stores in KV for later action
   - Posts to Discord for approval

2. Developers review in Discord with 4 actions:
   - **✅ Approve & Send** - Sends the AI-generated reply
   - **❌ Reject** - Marks as rejected, no reply sent
   - **✏️ Edit & Send** - Opens a modal to edit the reply before sending
   - **📋 View Full** - Shows complete email details

3. Reply is sent via Resend if approved

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/stats` | Usage statistics and estimated costs |
| POST | `/interactions` | Discord button/modal interactions |
| POST | `/edit-submit` | Handle edited reply submissions |

### Spam Protection

The worker includes automatic spam protection:

- **Rate Limiting**: Max 10 emails/day per sender
- **Size Limit**: Rejects emails >100KB
- **Thread Detection**: Skips email replies (Re: headers)
- **Suspicious Content Detection**: Flags spam patterns, excessive caps, many links

Check `/stats` to monitor usage and estimated costs.

## Testing Locally

```bash
npm run dev
```

This starts the worker at `http://localhost:8787`.

## Environment Variables Reference

### Secrets (set via `wrangler secret put`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Discord bot token |
| `DISCORD_PUBLIC_KEY` | Yes | For signature verification |
| `GEMINI_API_KEY` | No | Gemini API key (optional) |
| `RESEND_API_KEY` | Yes | Resend API key |
| `DISCORD_LOG_WEBHOOK_URL` | Yes | Webhook for logging |

### Non-Sensitive Variables (in wrangler.toml)

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_APPROVAL_CHANNEL_ID` | Yes | Channel ID for email approvals |
| `ENVIRONMENT` | No | `development` or `production` |
| `DEBUG_MODE` | No | `true` for verbose logging |

## Email Categories

The system automatically classifies incoming emails:

- 🐛 **Bug Report** - Contains keywords like "bug", "error", "broken"
- ✨ **Feature Request** - Contains "feature", "suggestion", "add"
- ❓ **Question** - Contains "how", "what", "?"
- 💬 **General Inquiry** - Default category
- 🤝 **Partnership** - Contains "partnership", "collaboration"
- 📝 **Feedback** - Contains "feedback", "improvement"
- 🚨 **Urgent** - Contains "urgent", "critical", "emergency"

## Cost Estimation

- **Cloudflare Workers**: Free (100k requests/day)
- **Cloudflare Email Routing**: Free (100 forwards/day)
- **Resend**: Free tier (100 emails/month)
- **Gemini 2.0 Flash**: ~$0.10/M input tokens, $0.40/M output tokens

Estimated cost for 100 emails/month: **~$0.02**

## Troubleshooting

### Worker returns "healthy" but emails not processing
1. Check `/stats` endpoint for usage data
2. Verify all secrets are set: `npx wrangler secret list`
3. Check Cloudflare Dashboard → Workers → email-moderation → Logs

### Environment variables gone after deployment
This happens if you deploy with `wrangler deploy` after setting variables in the dashboard. To fix:

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put DISCORD_LOG_WEBHOOK_URL
```

Secrets set via `wrangler secret put` are stored separately and survive deployments.

### Emails not appearing in Discord
1. Check Cloudflare Email Routing is enabled
2. Verify the worker is deployed and running (`/health`)
3. Check Discord webhook URL is correct
4. Look for errors in Cloudflare logs

### AI replies not generating
1. Verify `GEMINI_API_KEY` is set: `npx wrangler secret list`
2. Check Google AI Studio has Gemini API enabled
3. Check worker logs for API errors

### Discord interactions not working
1. Verify interaction endpoint URL is set correctly in Discord Developer Portal
2. Check Discord bot has "Message Content Intent" enabled
3. Verify public key in environment variables
