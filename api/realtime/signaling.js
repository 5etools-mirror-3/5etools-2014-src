/**
 * Simple signaling server to coordinate shared Cloudflare SFU sessions
 * This helps multiple clients join the same session for real-time communication
 */

// In-memory store for active sessions (in production, use Redis or similar)
const activeSessions = new Map();
const SESSION_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // Get or create a shared session for character sync
      const roomName = req.query.room || 'character-sync';
      
      // Clean up old sessions
      const now = Date.now();
      for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.created > SESSION_TIMEOUT) {
          activeSessions.delete(sessionId);
        }
      }
      
      // Find existing session for this room
      let sharedSession = null;
      for (const [sessionId, session] of activeSessions.entries()) {
        if (session.room === roomName && session.clients < 10) { // Max 10 clients per session
          sharedSession = { sessionId, ...session };
          break;
        }
      }
      
      // Create session entry if none exists
      if (!sharedSession) {
        const sessionId = `session-${roomName}-${Date.now()}`;
        sharedSession = {
          sessionId,
          room: roomName,
          clients: 0,
          created: now
        };
        activeSessions.set(sessionId, sharedSession);
      }
      
      return res.status(200).json({
        success: true,
        sessionId: sharedSession.sessionId,
        room: roomName,
        clients: sharedSession.clients
      });
      
    } else if (req.method === 'POST') {
      // Join or leave a session
      const { sessionId, action, userId } = req.body;
      
      if (!sessionId || !action) {
        return res.status(400).json({ error: 'sessionId and action required' });
      }
      
      const session = activeSessions.get(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      if (action === 'join') {
        session.clients = Math.min(session.clients + 1, 10);
        session.lastActivity = Date.now();
        console.log(`User ${userId} joined session ${sessionId} (${session.clients} clients)`);
      } else if (action === 'leave') {
        session.clients = Math.max(session.clients - 1, 0);
        session.lastActivity = Date.now();
        console.log(`User ${userId} left session ${sessionId} (${session.clients} clients)`);
      }
      
      return res.status(200).json({
        success: true,
        sessionId,
        clients: session.clients
      });
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Signaling server error:', error);
    return res.status(500).json({
      error: 'Signaling server error',
      message: error.message
    });
  }
}
