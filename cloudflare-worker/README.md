# Cloudflare Workers WebSocket for 5etools Character Sync

This directory contains a Cloudflare Worker that provides WebSocket support for real-time character synchronization across devices.

## Setup Instructions

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Deploy the Worker

```bash
cd cloudflare-worker
wrangler deploy
```

This will deploy the worker and give you a URL like:
`https://5etools-character-sync.your-subdomain.workers.dev`

### 4. Update Client Code

Edit `js/character-manager.js` and replace the placeholder URL:

```javascript
// Replace this line:
const workerUrl = 'wss://5etools-character-sync.your-subdomain.workers.dev';

// With your actual worker URL:
const workerUrl = 'wss://5etools-character-sync.your-actual-subdomain.workers.dev';
```

### 5. Test

1. Open your 5etools site on Device A
2. Open your 5etools site on Device B (different computer)
3. Check console logs - you should see:
   ```
   CharacterP2P: WebSocket connected to Cloudflare Worker
   CharacterP2P: Received test message: Hello from device [other-device-id]
   ```

## How It Works

- **WebSocket Connection**: Each client connects to the Cloudflare Worker via WebSocket
- **Room-based**: All clients join the same room (`character-sync`)
- **Broadcasting**: Messages sent by one client are broadcast to all other clients in the room
- **Real-time Sync**: Character updates are instantly sent to all connected devices

## Message Types

The WebSocket handles these message types:

- `TEST_MESSAGE` - Test connectivity between devices
- `USER_JOINED` - User connected notification
- `USER_LEFT` - User disconnected notification  
- `CHARACTER_UPDATED` - Character was modified
- `CHARACTER_DELETED` - Character was removed
- `CONNECTED` - Welcome message from server

## Cost

Cloudflare Workers WebSocket usage:
- 1,000,000 requests/month free
- $0.50 per million additional requests
- Perfect for character sync - very low cost

## Production Enhancements

For production, consider upgrading to Durable Objects for:
- Persistent room state
- Better scaling
- User presence management
- Message history

## Troubleshooting

If connection fails:

1. Check Worker URL is correct
2. Verify Worker is deployed: `wrangler deployments list`
3. Check browser console for WebSocket errors
4. Test Worker directly: open `https://your-worker-url.workers.dev` (should show "Expected WebSocket")

## Development

To test locally:
```bash
wrangler dev
# Worker runs at http://localhost:8787
# Use ws://localhost:8787 for local testing
```
