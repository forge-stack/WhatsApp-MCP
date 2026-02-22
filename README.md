# WhatsApp MCP 🟢

A self-hosted WhatsApp integration using the **Model Context Protocol (MCP)**, enabling AI assistants (like Claude) to read and send WhatsApp messages directly from your desktop.

Built with:
- **Bridge** — Next.js + [Baileys](https://github.com/WhiskeySockets/Baileys) (WhatsApp Web API)
- **Server** — Python + [FastMCP](https://github.com/jlowin/fastmcp) (MCP server)
- **Storage** — SQLite via `better-sqlite3` (local `data/` folder)

---

## 📁 Project Structure

```
whatsapp-mcp/
├── bridge/          # Next.js app — WhatsApp connection & REST API
│   ├── src/
│   │   ├── lib/
│   │   │   ├── whatsapp.ts      # Baileys socket, sync, message handling
│   │   │   └── database.ts      # SQLite schema & helpers
│   │   └── app/api/             # REST endpoints
│   ├── data/                    # Auto-created: auth + SQLite DB
│   └── package.json
│
└── server/          # Python MCP server — exposes tools to Claude
    ├── main.py      # FastMCP tools (send, receive, chats, contacts...)
    ├── pyproject.toml
    └── .env
```

---

## ✨ Features

- 🔐 **QR Code Login** — Scan once, sessions persist automatically
- 💬 **Send & Receive** messages via AI assistant
- 📋 **Chats & Contacts** — Browse all conversations and contacts
- 🔍 **Search** messages across all chats
- 🔄 **Full History Sync** — Syncs message history on first connect
- 🗄️ **Local SQLite Storage** — All data stays on your machine
- 🤖 **MCP Compatible** — Works with Claude Desktop and other MCP clients

---

## 🚀 Getting Started

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | Comes with Node.js |
| Python | ≥ 3.11 | [python.org](https://python.org) |
| uv | latest | `pip install uv` or [docs.astral.sh/uv](https://docs.astral.sh/uv) |

---

### Step 1 — Clone the Repository

```bash
git clone https://github.com/your-org/whatsapp-mcp.git
cd whatsapp-mcp
```

---

### Step 2 — Set Up the Bridge (Next.js)

The bridge connects to WhatsApp using the Baileys library and exposes a local REST API.

```bash
cd bridge
npm install
npm run dev
```

The bridge will start on **http://localhost:3000**.

On first run, it will create a `data/` folder containing:
- `data/auth/` — WhatsApp session credentials
- `data/whatsapp.db` — SQLite database with all messages, chats, and contacts

> **Note:** The `data/` folder is gitignored. Never commit it — it contains your session keys.

---

### Step 3 — Connect WhatsApp (Scan QR Code)

1. Open **http://localhost:3000** in your browser
2. Click **Connect**
3. Scan the QR code with your WhatsApp mobile app:
   - Open WhatsApp → Settings → Linked Devices → Link a Device
4. Wait for the sync to complete (first sync may take a minute depending on your chat history)

Once connected, the status will show **Connected** and message history will begin syncing to the local database.

---

### Step 4 — Set Up the MCP Server (Python)

The server exposes WhatsApp functionality as MCP tools that Claude (or any MCP client) can call.

```bash
cd ../server
```

Create a `.env` file:

```env
WHATSAPP_BRIDGE_URL=http://localhost:3000
```

Install dependencies and run using `uv`:

```bash
uv sync
uv run main.py
```

The MCP server will start on **http://localhost:8001**.

---

### Step 5 — Connect to Claude Desktop

Add the following to your Claude Desktop MCP config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "uv",
      "args": [
        "run",
        "--project",
        "/absolute/path/to/whatsapp-mcp/server",
        "main.py"
      ],
      "env": {
        "WHATSAPP_BRIDGE_URL": "http://localhost:3000"
      }
    }
  }
}
```

> Replace `/absolute/path/to/whatsapp-mcp/server` with the actual path on your machine.

Restart Claude Desktop. You should now see WhatsApp tools available in Claude.

---

## 🛠️ Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_whatsapp_status` | Check connection status |
| `connect_whatsapp` | Initialize WhatsApp connection |
| `get_whatsapp_chats` | List all chat conversations |
| `get_whatsapp_contacts` | List contacts with search support |
| `get_whatsapp_messages` | Get messages from a chat or search all |
| `get_chat_history` | Get message history for a specific chat |
| `search_whatsapp_messages` | Full-text search across all messages |
| `send_whatsapp_message` | Send a message by phone number |
| `send_whatsapp_message_to_jid` | Send a message by WhatsApp JID |
| `logout_whatsapp` | Log out and clear session |

---

## 🌐 Bridge REST API Endpoints

The bridge exposes the following endpoints (used internally by the MCP server):

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Connection status |
| `POST` | `/api/status` | Initialize connection |
| `GET` | `/api/chats` | List chats |
| `GET` | `/api/contacts` | List contacts |
| `GET` | `/api/messages` | Get/search messages |
| `POST` | `/api/send` | Send a message |
| `POST` | `/api/logout` | Logout |

---

## ⚙️ Configuration

### Bridge (`bridge/.env.local`)

```env
# Optional: Set to 'development' to enable verbose Baileys logs
NODE_ENV=production
```

### Server (`server/.env`)

```env
WHATSAPP_BRIDGE_URL=http://localhost:3000
```

---

## 🗄️ Database

All data is stored locally in `bridge/data/whatsapp.db` (SQLite). The schema is auto-created by `database.ts` on first run and includes:

- **messages** — Full message history with content, type, sender, timestamp
- **chats** — All conversations with unread count and last message time
- **contacts** — Contact JIDs, names, and phone numbers
- **sync_status** — Tracks the last successful history sync

---

## 🔒 Privacy & Security

- All data is stored **locally on your machine** — nothing is sent to any external server
- WhatsApp session credentials are stored in `bridge/data/auth/` — keep this folder secure
- The bridge and MCP server only communicate over `localhost`
- To fully remove your session, run logout or delete the `bridge/data/` folder

---

## 🐛 Troubleshooting

**QR code not appearing**
- Make sure the bridge is running on port 3000
- Try refreshing the browser and clicking Connect again

**Session expired / logged out**
- Rescan the QR code — the old `data/auth/` folder is cleared automatically on logout

**Messages not syncing**
- Wait for the initial sync to complete (check the status indicator)
- Large accounts may take 2–5 minutes on first connect

**Claude can't see WhatsApp tools**
- Verify the absolute path in `claude_desktop_config.json`
- Make sure `uv` is installed and accessible in your PATH
- Restart Claude Desktop after config changes

**Port conflict**
- Bridge default: `3000` — change with `PORT=3001 npm run dev`
- Server default: `8001` — change the port in `main.py` and update your `.env`

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgements

- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API library
- [FastMCP](https://github.com/jlowin/fastmcp) — Python MCP framework
- [Model Context Protocol](https://modelcontextprotocol.io) — by Anthropic

---

> ⚠️ **Disclaimer:** This project uses an unofficial WhatsApp API (Baileys). Use responsibly and in accordance with WhatsApp's Terms of Service. The authors are not responsible for any account bans or misuse.
