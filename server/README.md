# WhatsApp MCP Server

A FastMCP server that exposes WhatsApp functionality to Claude via the Model Context Protocol.

## Prerequisites

- Python 3.10+
- The WhatsApp Bridge running (see `../bridge/`)

## Setup

1. Create a virtual environment (optional but recommended):
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Copy environment file and configure:
```bash
cp .env.example .env
# Edit .env if your bridge is not on localhost:3000
```

## Running

### For Testing
```bash
python main.py
```

### With Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "python",
      "args": ["/full/path/to/server/main.py"],
      "env": {
        "WHATSAPP_BRIDGE_URL": "http://localhost:3000"
      }
    }
  }
}
```

Or using `uv`:
```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "uv",
      "args": ["run", "--directory", "/full/path/to/server", "python", "main.py"],
      "env": {
        "WHATSAPP_BRIDGE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### With Claude Code

```bash
claude mcp add whatsapp -- python /full/path/to/server/main.py
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_whatsapp_status` | Check connection status |
| `connect_whatsapp` | Initialize WhatsApp connection |
| `send_whatsapp_message` | Send message to phone number |
| `send_whatsapp_message_to_jid` | Send message to specific JID |
| `get_whatsapp_messages` | Get messages (with optional filters) |
| `search_whatsapp_messages` | Search messages across all chats |
| `get_whatsapp_contacts` | Get/search contacts |
| `get_whatsapp_chats` | List all chats |
| `get_chat_history` | Get messages from specific chat |
| `logout_whatsapp` | Logout and clear session |

## Usage Examples

Once connected to Claude, you can ask things like:

- "Check my WhatsApp connection status"
- "Send a WhatsApp message to 14155551234 saying Hello!"
- "Show me my recent WhatsApp chats"
- "Search my WhatsApp messages for 'meeting'"
- "Get messages from my chat with John"
