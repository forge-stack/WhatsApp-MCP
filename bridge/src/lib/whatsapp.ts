import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  isJidGroup,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import fs from 'fs';
import pino from 'pino';
import { dbHelpers, db, checkpointDatabase } from './database';

// Auth directory
const authDir = path.join(process.cwd(), 'data', 'auth');

// Logger
const logger = pino({ 
  level: process.env.NODE_ENV === 'development' ? 'info' : 'silent' 
});

// Global state
const globalForWhatsApp = globalThis as unknown as {
  socket: WASocket | null;
  qrCode: string | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  connectionError: string | null;
  isInitializing: boolean;
  initPromise: Promise<void> | null;
  syncInProgress: boolean;
  contactsCache: Map<string, any>;
};

// Initialize global state
globalForWhatsApp.socket = globalForWhatsApp.socket ?? null;
globalForWhatsApp.qrCode = globalForWhatsApp.qrCode ?? null;
globalForWhatsApp.connectionStatus = globalForWhatsApp.connectionStatus ?? 'disconnected';
globalForWhatsApp.connectionError = globalForWhatsApp.connectionError ?? null;
globalForWhatsApp.isInitializing = globalForWhatsApp.isInitializing ?? false;
globalForWhatsApp.initPromise = globalForWhatsApp.initPromise ?? null;
globalForWhatsApp.syncInProgress = globalForWhatsApp.syncInProgress ?? false;
globalForWhatsApp.contactsCache = globalForWhatsApp.contactsCache ?? new Map();

export function getQRCode(): string | null {
  return globalForWhatsApp.qrCode;
}

export function getConnectionStatus() {
  return {
    status: globalForWhatsApp.connectionStatus,
    error: globalForWhatsApp.connectionError,
    syncInProgress: globalForWhatsApp.syncInProgress
  };
}

export function getSocket(): WASocket | null {
  return globalForWhatsApp.socket;
}

export async function initializeWhatsApp(): Promise<void> {
  console.log('[initializeWhatsApp] Called. Current state:', {
    isInitializing: globalForWhatsApp.isInitializing,
    connectionStatus: globalForWhatsApp.connectionStatus,
    hasSocket: !!globalForWhatsApp.socket,
    syncInProgress: globalForWhatsApp.syncInProgress
  });

  // If already initializing, wait for that to complete
  if (globalForWhatsApp.initPromise) {
    console.log('[initializeWhatsApp] Already initializing, waiting...');
    return globalForWhatsApp.initPromise;
  }

  // If connected, do nothing
  if (globalForWhatsApp.connectionStatus === 'connected' && globalForWhatsApp.socket) {
    console.log('[initializeWhatsApp] Already connected');
    return;
  }

  // Create the initialization promise
  globalForWhatsApp.initPromise = doInitialize();
  
  try {
    await globalForWhatsApp.initPromise;
  } finally {
    globalForWhatsApp.initPromise = null;
  }
}

async function doInitialize(): Promise<void> {
  console.log('[doInitialize] Starting...');
  
  globalForWhatsApp.isInitializing = true;
  globalForWhatsApp.connectionStatus = 'connecting';
  globalForWhatsApp.connectionError = null;

  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('[doInitialize] Created auth directory');
  }

  try {
    // Get latest version
    const { version } = await fetchLatestBaileysVersion();
    console.log('[doInitialize] Using Baileys version:', version);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    console.log('[doInitialize] Auth state loaded');

    const socket = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ['WhatsApp MCP', 'Chrome', '120.0.0'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: true,
      markOnlineOnConnect: false
    });

    console.log('[doInitialize] Socket created');
    globalForWhatsApp.socket = socket;

    // Connection events
    socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      console.log('[connection.update]', { 
        connection, 
        hasQR: !!qr, 
        qrLength: qr?.length,
        lastDisconnect: lastDisconnect?.error?.message 
      });

      if (qr) {
        console.log('[connection.update] QR CODE RECEIVED!');
        globalForWhatsApp.qrCode = qr;
        globalForWhatsApp.connectionStatus = 'connecting';
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorMessage = (lastDisconnect?.error as Boom)?.message;
        
        console.log('[connection.update] Connection closed:', { statusCode, errorMessage });
        
        globalForWhatsApp.socket = null;
        globalForWhatsApp.isInitializing = false;
        
        // 515 = restart required after pairing - AUTO RECONNECT
        if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
          console.log('[connection.update] Restart required - auto reconnecting in 1 second...');
          globalForWhatsApp.connectionStatus = 'connecting';
          globalForWhatsApp.connectionError = 'Reconnecting after pairing...';
          globalForWhatsApp.qrCode = null;
          globalForWhatsApp.initPromise = null;
          setTimeout(() => {
            initializeWhatsApp();
          }, 1500);
          return;
        }
        
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('[connection.update] Logged out - clearing auth');
          globalForWhatsApp.connectionStatus = 'disconnected';
          globalForWhatsApp.connectionError = 'Logged out. Click Connect to scan QR again.';
          globalForWhatsApp.qrCode = null;
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
          } catch (e) {
            console.error('Error clearing auth:', e);
          }
        } else if (statusCode === 405) {
          console.log('[connection.update] 405 Conflict - clearing auth');
          globalForWhatsApp.connectionStatus = 'disconnected';
          globalForWhatsApp.connectionError = 'Conflict error. Click Connect to retry.';
          globalForWhatsApp.qrCode = null;
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
          } catch (e) {
            console.error('Error clearing auth:', e);
          }
        } else if (statusCode === DisconnectReason.connectionClosed || 
                   statusCode === DisconnectReason.connectionLost ||
                   statusCode === DisconnectReason.timedOut) {
          // Auto-reconnect for temporary connection issues
          console.log('[connection.update] Temporary disconnect - auto reconnecting...');
          globalForWhatsApp.connectionStatus = 'connecting';
          globalForWhatsApp.connectionError = 'Reconnecting...';
          globalForWhatsApp.initPromise = null;
          setTimeout(() => {
            initializeWhatsApp();
          }, 2000);
        } else {
          globalForWhatsApp.connectionStatus = 'disconnected';
          globalForWhatsApp.connectionError = `Disconnected: ${statusCode} - ${errorMessage}`;
        }
      }

      if (connection === 'open') {
        console.log('[connection.update] CONNECTED!');
        globalForWhatsApp.qrCode = null;
        globalForWhatsApp.connectionStatus = 'connected';
        globalForWhatsApp.connectionError = null;
        globalForWhatsApp.isInitializing = false;
      }
    });

    // Save credentials
    socket.ev.on('creds.update', saveCreds);

    // Handle contacts update (only fires for WhatsApp Business)
    socket.ev.on('contacts.update', (contacts) => {
      console.log(`[contacts.update] Updating ${contacts.length} contacts`);
      const batchInsert = db.transaction(() => {
        for (const contact of contacts) {
          if (contact.id) {
            try {
              // Cache the contact
              globalForWhatsApp.contactsCache.set(contact.id, contact);
              
              dbHelpers.upsertContact.run({
                jid: contact.id,
                name: contact.name || null,
                notify: contact.notify || null,
                phone: contact.id.split('@')[0]
              });
            } catch (e) { /* ignore */ }
          }
        }
      });
      batchInsert();
    });

    // // Handle contacts set (initial sync - only fires for WhatsApp Business)
    // socket.ev.on('contacts.set', ({ contacts }) => {
    //   console.log(`[contacts.set] Syncing ${contacts.length} contacts`);
    //   const batchInsert = db.transaction(() => {
    //     for (const contact of contacts) {
    //       if (contact.id) {
    //         try {
    //           // Cache the contact
    //           globalForWhatsApp.contactsCache.set(contact.id, contact);
              
    //           dbHelpers.upsertContact.run({
    //             jid: contact.id,
    //             name: contact.name || null,
    //             notify: contact.notify || null,
    //             phone: contact.id.split('@')[0]
    //           });
    //         } catch (e) { 
    //           console.error('[upsertContact] Error:', e);
    //          }
    //       }
    //     }
    //   });
    //   batchInsert();
    // });

    // // Handle chats set
    // socket.ev.on('chats.set', ({ chats }) => {
    //   console.log(`[chats.set] Syncing ${chats.length} chats`);
    //   const batchInsert = db.transaction(() => {
    //     for (const chat of chats) {
    //       try {
    //         dbHelpers.upsertChat.run({
    //           jid: chat.id,
    //           name: chat.name || null,
    //           is_group: isJidGroup(chat.id) ? 1 : 0,
    //           unread_count: chat.unreadCount || 0,
    //           last_message_at: chat.conversationTimestamp 
    //             ? new Date(Number(chat.conversationTimestamp) * 1000).toISOString()
    //             : null
    //         });
    //       } catch (e) {console.error('[upsertContact] Error:', e); }
    //     }
    //   });
    //   batchInsert();
    // });

    // Handle chats update
    socket.ev.on('chats.update', (chats) => {
      console.log(`[chats.update] Updating ${chats.length} chats`);
      const batchInsert = db.transaction(() => {
        for (const chat of chats) {
          try {
            dbHelpers.upsertChat.run({
              jid: chat.id,
              name: chat.name || null,
              is_group: chat.id ? (isJidGroup(chat.id) ? 1 : 0) : 0,
              unread_count: chat.unreadCount || null,
              last_message_at: chat.conversationTimestamp 
                ? new Date(Number(chat.conversationTimestamp) * 1000).toISOString()
                : null
            });
          } catch (e) { /* ignore */ }
        }
      });
      batchInsert();
    });

    // Handle incoming messages
    socket.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`[messages.upsert] Processing ${messages.length} messages (type: ${type})`);
      await processMessages(messages);
    });

    // Handle message history sync
    socket.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
      if (globalForWhatsApp.syncInProgress) {
        console.log('[messaging-history.set] Sync already in progress, skipping duplicate');
        return;
      }

      globalForWhatsApp.syncInProgress = true;
      console.log(`[messaging-history.set] History sync starting: ${messages.length} messages, ${chats.length} chats, ${contacts.length} contacts, isLatest: ${isLatest}`);
      
      try {
        const batchSync = db.transaction(() => {
          // Sync contacts first (only available for WhatsApp Business)
          for (const contact of contacts) {
            if (contact.id) {
              try {
                // Cache the contact
                globalForWhatsApp.contactsCache.set(contact.id, contact);
                
                dbHelpers.upsertContact.run({
                  jid: contact.id,
                  name: contact.name || null,
                  notify: contact.notify || null,
                  phone: contact.id.split('@')[0]
                });
              } catch (e) { /* ignore */ }
            }
          }

          // Then sync chats
          for (const chat of chats) {
            try {
              dbHelpers.upsertChat.run({
                jid: chat.id,
                name: chat.name || null,
                is_group: isJidGroup(chat.id) ? 1 : 0,
                unread_count: chat.unreadCount || 0,
                last_message_at: chat.conversationTimestamp 
                  ? new Date(Number(chat.conversationTimestamp) * 1000).toISOString()
                  : null
              });
            } catch (e) { /* ignore */ }
          }

          // Finally sync messages AND extract pushNames for contacts
          for (const msg of messages) {
            insertMessageToDb(msg);
          }
        });

        batchSync();
        
        if (isLatest) {
          console.log('[messaging-history.set] Sync complete - all messages loaded');
          dbHelpers.setSyncStatus.run({ 
            key: 'last_sync',
            value: new Date().toISOString()
          });
          
          // Force checkpoint after large sync to prevent WAL compaction errors
          checkpointDatabase();
        }

        console.log(`[messaging-history.set] Batched sync complete for ${messages.length} messages`);
      } catch (error) {
        console.error('[messaging-history.set] Sync error:', error);
      } finally {
        globalForWhatsApp.syncInProgress = false;
      }
    });

    console.log('[doInitialize] Setup complete, waiting for QR/connection...');

  } catch (error) {
    console.error('[doInitialize] Error:', error);
    globalForWhatsApp.connectionStatus = 'disconnected';
    globalForWhatsApp.connectionError = error instanceof Error ? error.message : 'Failed to initialize';
    globalForWhatsApp.isInitializing = false;
    globalForWhatsApp.socket = null;
  }
}

async function processMessages(messages: proto.IWebMessageInfo[]): Promise<void> {
  if (messages.length === 0) return;

  try {
    // Batch all inserts into a single transaction
    const batchInsert = db.transaction(() => {
      for (const msg of messages) {
        insertMessageToDb(msg);
      }
    });

    batchInsert();
    console.log(`[processMessages] Batched ${messages.length} messages`);
    
    // Checkpoint after large batch to prevent WAL bloat
    if (messages.length > 100) {
      checkpointDatabase();
    }
  } catch (error) {
    console.error('[processMessages] Batch error:', error);
  }
}

function insertMessageToDb(msg: proto.IWebMessageInfo): void {
  try {
    const chatJid = msg.key.remoteJid;
    if (!chatJid) return;

    // IMPORTANT: Extract pushName from message to populate contacts
    // This is the PRIMARY way to get contact names for regular WhatsApp (non-Business)
    // pushName = the name the sender has set for themselves on WhatsApp
    const senderJid = msg.key.fromMe ? null : (msg.key.participant || chatJid);
    
    if (senderJid && (msg as any).pushName && !isJidGroup(senderJid)) {
      try {
        dbHelpers.upsertContact.run({
          jid: senderJid,
          name: null, // This would be YOUR saved name (only available in WA Business)
          notify: (msg as any).pushName, // This is THEIR display name
          phone: senderJid.split('@')[0]
        });
        console.log(`[insertMessageToDb] Saved contact from pushName: ${(msg as any).pushName} (${senderJid})`);
      } catch (e) { 
        // Ignore contact insert errors
      }
    }

    // Auto-create chat if it doesn't exist
    try {
      // For chats, also try to get name from pushName for 1:1 chats
      const chatName = !isJidGroup(chatJid) && (msg as any).pushName ? (msg as any).pushName : null;
      
      dbHelpers.upsertChat.run({
        jid: chatJid,
        name: chatName,
        is_group: isJidGroup(chatJid) ? 1 : 0,
        unread_count: 0,
        last_message_at: msg.messageTimestamp 
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString()
      });
    } catch (e) {
      // Ignore chat creation errors
    }

    const messageContent = extractMessageContent(msg);
    const messageType = getMessageType(msg);
    
    dbHelpers.insertMessage.run({
      id: msg.key.id,
      chat_jid: chatJid,
      sender_jid: msg.key.fromMe ? 'me' : (msg.key.participant || chatJid),
      content: messageContent,
      message_type: messageType,
      is_from_me: msg.key.fromMe ? 1 : 0,
      timestamp: msg.messageTimestamp 
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      raw_data: JSON.stringify(msg)
    });
  } catch (error) {
    console.error('[insertMessageToDb] Error:', error);
  }
}

function extractMessageContent(msg: proto.IWebMessageInfo): string {
  const message = msg.message;
  if (!message) return '';

  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return `[Image] ${message.imageMessage.caption}`;
  if (message.imageMessage) return '[Image]';
  if (message.videoMessage?.caption) return `[Video] ${message.videoMessage.caption}`;
  if (message.videoMessage) return '[Video]';
  if (message.audioMessage) return '[Audio]';
  if (message.documentMessage?.fileName) return `[Document] ${message.documentMessage.fileName}`;
  if (message.documentMessage) return '[Document]';
  if (message.stickerMessage) return '[Sticker]';
  if (message.contactMessage?.displayName) return `[Contact] ${message.contactMessage.displayName}`;
  if (message.locationMessage) return '[Location]';
  if (message.reactionMessage?.text) return `[Reaction] ${message.reactionMessage.text}`;
  if (message.protocolMessage) return '';  // Skip protocol messages
  if (message.senderKeyDistributionMessage) return '';  // Skip key distribution

  return '[Unknown message type]';
}

function getMessageType(msg: proto.IWebMessageInfo): string {
  const message = msg.message;
  if (!message) return 'unknown';

  if (message.conversation || message.extendedTextMessage) return 'text';
  if (message.imageMessage) return 'image';
  if (message.videoMessage) return 'video';
  if (message.audioMessage) return 'audio';
  if (message.documentMessage) return 'document';
  if (message.stickerMessage) return 'sticker';
  if (message.contactMessage) return 'contact';
  if (message.locationMessage) return 'location';
  if (message.reactionMessage) return 'reaction';
  if (message.protocolMessage) return 'protocol';

  return 'unknown';
}

export async function sendMessage(jid: string, content: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!globalForWhatsApp.socket || globalForWhatsApp.connectionStatus !== 'connected') {
    return { success: false, error: 'WhatsApp not connected' };
  }

  try {
    let normalizedJid = jid;
    if (!jid.includes('@')) {
      normalizedJid = `${jid}@s.whatsapp.net`;
    }

    const result = await globalForWhatsApp.socket.sendMessage(normalizedJid, { text: content });
    
    return { 
      success: true, 
      messageId: result?.key?.id || undefined
    };
  } catch (error) {
    console.error('[sendMessage] Error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export async function logout(): Promise<void> {
  console.log('[logout] Called');
  if (globalForWhatsApp.socket) {
    try {
      await globalForWhatsApp.socket.logout();
    } catch (e) {
      console.error('[logout] Error:', e);
    }
    globalForWhatsApp.socket = null;
  }
  globalForWhatsApp.connectionStatus = 'disconnected';
  globalForWhatsApp.qrCode = null;
  globalForWhatsApp.isInitializing = false;
  globalForWhatsApp.initPromise = null;
  
  try {
    fs.rmSync(authDir, { recursive: true, force: true });
    fs.mkdirSync(authDir, { recursive: true });
  } catch (e) {
    console.error('[logout] Error clearing auth:', e);
  }
}