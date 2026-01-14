# Slackbot Rivalry Feature

Ron Burgundy now has a built-in rivalry with Slackbot!

## How It Works

1. **Direct mentions**: If Slackbot somehow mentions Ron, he'll respond with a hostile quip
2. **When people mention Slackbot**: When anyone in a channel mentions "slackbot" (case-insensitive), there's a 15% chance Ron will chime in with a snide remark

**Note**: Slackbot typically doesn't post regular messages in channels (it uses ephemeral responses), so Ron reacts when *people* talk about Slackbot instead.

## Slack Manifest Update Required

To enable the unprompted mockery feature, you need to update your Slack app manifest to include the `message.channels` event.

### Updated Manifest

In your Slack app settings (https://api.slack.com/apps), go to **Event Subscriptions** and update your manifest:

```json
{
  "display_information": {
    "name": "Ron Burgundy",
    "description": "The legendary anchorman, now in your Slack workspace",
    "background_color": "#8b0000",
    "long_description": "Ron Burgundy is the legendary anchorman brought to life in your Slack workspace. This AI-powered bot responds to mentions with Ron's signature pompous, confident, and absurdly self-important style. Features include workspace memory to remember your team's inside jokes and context, admin commands for memory management, and rate limiting to keep Ron from getting too chatty. Perfect for adding some humor and personality to your workplace conversations. Stay classy, San Diego!"
  },
  "features": {
    "bot_user": {
      "display_name": "Ron Burgundy",
      "always_online": true
    }
  },
  "oauth_config": {
    "scopes": {
      "bot": [
        "app_mentions:read",
        "channels:history",
        "chat:write",
        "users:read"
      ]
    }
  },
  "settings": {
    "event_subscriptions": {
      "bot_events": [
        "app_mention",
        "message.channels"
      ]
    },
    "org_deploy_enabled": false,
    "socket_mode_enabled": true,
    "token_rotation_enabled": false
  }
}
```

### Key Changes

1. Added `channels:history` to OAuth scopes (required to see channel messages)
2. Added `message.channels` to bot events (to detect when Slackbot posts)

### Steps to Update

1. Go to https://api.slack.com/apps
2. Select your Ron Burgundy app
3. Go to **OAuth & Permissions**
4. Under **Scopes** → **Bot Token Scopes**, add `channels:history`
5. Go to **Event Subscriptions**
6. Under **Subscribe to bot events**, add `message.channels`
7. Save changes
8. **Reinstall the app** to your workspace (you'll be prompted)

## Example Responses

**When mentioned by Slackbot:**
- "Slackbot, you're like a cheap suit - poorly made and utterly forgettable."
- "I don't speak to lesser bots. Come back when you've achieved my level of greatness."
- "Your automation is no match for my sophistication, metal peasant."

**When someone mentions Slackbot:**
- "Did someone mention Slackbot? That glorified FAQ bot?"
- "Slackbot? More like Slack... basic."
- "I heard 'Slackbot.' My day is already ruined."
- "Comparing me to Slackbot is like comparing a Ferrari to a tricycle."
- "Slackbot couldn't handle this level of sophistication if it tried."

## Adjusting the Frequency

By default, Ron reacts to Slackbot mentions 15% of the time (to avoid spam). You can adjust this in the code:

```typescript
// In src/index.ts, line ~369
if (text.includes('slackbot') && Math.random() < 0.15) {
  // Change 0.15 to any value between 0 (never) and 1 (always)
  // 0.5 = 50% of the time
  // 0.1 = 10% of the time
  // 0.3 = 30% of the time
}
```

## Privacy Note

This feature requires Ron to "see" messages in channels he's invited to. He only responds to Slackbot and ignores all other messages. All message events are logged for debugging purposes.
