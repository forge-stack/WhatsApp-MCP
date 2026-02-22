# WhatsApp MCP Bridge

A NextJS-based WhatsApp Web bridge using the Baileys library. This bridge connects to WhatsApp Web and provides REST API endpoints for sending/receiving messages.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open http://localhost:3000 in your browser

4. Click "Connect to WhatsApp" and scan the QR code with your phone

## API Endpoints

### Status
- `GET /api/status` - Get connection status and QR code
- `POST /api/status` - Initialize WhatsApp connection

### Messaging
- `POST /api/send` - Send a message
  ```json
  {
    "phone": "1234567890",
    "message": "Hello!"
  }
  ```
  Or use JID directly:
  ```json
  {
    "jid": "1234567890@s.whatsapp.net",
    "message": "Hello!"
  }
  ```

### Data
- `GET /api/messages` - Get messages
  - `?chat_jid=xxx` - Messages from specific chat
  - `?search=xxx` - Search messages
  - `?limit=50&offset=0` - Pagination

- `GET /api/contacts` - Get contacts
  - `?search=xxx` - Search contacts

- `GET /api/chats` - Get chats
  - `?limit=50&offset=0` - Pagination

### Auth
- `POST /api/logout` - Logout and clear session

## Data Storage

All data is stored locally in the `data/` directory:
- `data/auth/` - WhatsApp authentication credentials
- `data/whatsapp.db` - SQLite database with messages, contacts, and chats

## Notes

- The bridge needs to stay running to maintain the WhatsApp connection
- QR code re-authentication may be required after ~20 days
- Message history is synced when you first connect
