/**
 * Durable Object class for managing WebSocket rooms
 * This ensures persistent state across multiple worker instances
 */
export class RoomManager {
  constructor(controller, env) {
    this.controller = controller;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    const url = new URL(request.url);
    const roomName = url.searchParams.get('room') || 'character-sync';
    const userId = url.searchParams.get('userId') || 'anonymous';
    const sessionId = `${userId}:${Date.now()}`;

    console.log(`User ${userId} joining room ${roomName} (session: ${sessionId})`);

    // Accept WebSocket connection
    server.accept();

    // Store session
    this.sessions.set(sessionId, {
      socket: server,
      userId: userId,
      roomName: roomName,
      connected: true
    });

    // Broadcast user joined to other sessions
    this.broadcastToRoom(roomName, {
      type: 'USER_JOINED',
      userId: userId,
      timestamp: Date.now(),
      room: roomName
    }, sessionId);

    // Handle messages
    server.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        
        const fullMessage = {
          ...message,
          userId: userId,
          timestamp: Date.now(),
          room: roomName
        };

        console.log(`Broadcasting ${message.type} from ${userId} to room ${roomName}`);
        
        // Special handling for dice rolls - ensure they have the required data
        if (message.type === 'DICE_ROLL') {
          fullMessage.characterName = fullMessage.characterName || 'Unknown Character';
          fullMessage.rollType = fullMessage.rollType || 'dice';
          fullMessage.diceExpression = fullMessage.diceExpression || fullMessage.roll || 'Unknown';
        }
        
        this.broadcastToRoom(roomName, fullMessage, sessionId);
        
      } catch (error) {
        console.error('Error processing message:', error);
        server.send(JSON.stringify({
          type: 'ERROR',
          message: 'Invalid message format',
          error: error.message
        }));
      }
    });

    // Handle disconnection
    server.addEventListener('close', event => {
      console.log(`User ${userId} disconnected from room ${roomName}`);
      this.sessions.delete(sessionId);
      
      // Broadcast user left
      this.broadcastToRoom(roomName, {
        type: 'USER_LEFT',
        userId: userId,
        timestamp: Date.now(),
        room: roomName
      }, sessionId);
    });

    server.addEventListener('error', event => {
      console.error(`WebSocket error for user ${userId}:`, event);
      this.sessions.delete(sessionId);
    });

    // Send welcome message
    server.send(JSON.stringify({
      type: 'CONNECTED',
      message: `Connected to room: ${roomName}`,
      userId: userId,
      timestamp: Date.now(),
      connectedUsers: Array.from(this.sessions.values())
        .filter(s => s.roomName === roomName)
        .map(s => s.userId)
    }));

    // Send test message after delay
    setTimeout(() => {
      try {
        server.send(JSON.stringify({
          type: 'TEST_MESSAGE',
          message: `Hello from Durable Object! User: ${userId}`,
          timestamp: Date.now()
        }));
      } catch (error) {
        console.error('Error sending test message:', error);
      }
    }, 1000);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast message to all sessions in a room except the sender
   */
  broadcastToRoom(roomName, message, excludeSessionId = null) {
    const messageStr = JSON.stringify(message);
    let broadcastCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      // Skip sender's session
      if (sessionId === excludeSessionId) {
        continue;
      }
      
      // Only broadcast to sessions in the same room
      if (session.roomName !== roomName) {
        continue;
      }
      
      try {
        if (session.socket && session.socket.readyState === WebSocket.READY_STATE_OPEN) {
          session.socket.send(messageStr);
          broadcastCount++;
        } else {
          // Clean up dead sessions
          console.log(`Removing dead session: ${sessionId}`);
          this.sessions.delete(sessionId);
        }
      } catch (error) {
        console.error(`Error broadcasting to session ${sessionId}:`, error);
        this.sessions.delete(sessionId);
      }
    }
    
    console.log(`Broadcasted ${message.type} to ${broadcastCount} sessions in room ${roomName}`);
  }
}
