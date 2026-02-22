"""
WhatsApp MCP Server - Optimized for Token Efficiency
Minimal tool descriptions, intelligent caching, response filtering
"""

import os
import httpx
import time
import logging
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.ERROR, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
logging.getLogger('docket.worker').setLevel(logging.WARNING)
logging.getLogger('fakeredis').setLevel(logging.WARNING)

BRIDGE_URL = os.getenv("WHATSAPP_BRIDGE_URL", "http://localhost:3000")
CACHE_TTL = 30

mcp = FastMCP("Whatsapp-MCP")
client = httpx.Client(base_url=BRIDGE_URL, timeout=60.0)

_cache: Dict[str, Dict[str, Any]] = {
    'chats': {'data': None, 'timestamp': 0},
    'contacts': {'data': None, 'timestamp': 0},
    'messages': {}
}

def _is_cache_valid(cache_type: str) -> bool:
    """Check cache validity."""
    if _cache[cache_type]['data'] is None:
        return False
    return time.time() - _cache[cache_type]['timestamp'] < CACHE_TTL

def _invalidate_cache(cache_type: str = None):
    """Invalidate cache."""
    if cache_type:
        if cache_type == 'messages':
            _cache['messages'].clear()
        else:
            _cache[cache_type] = {'data': None, 'timestamp': 0}
    else:
        _cache['chats'] = {'data': None, 'timestamp': 0}
        _cache['contacts'] = {'data': None, 'timestamp': 0}
        _cache['messages'].clear()

def _filter_message(msg: Dict[str, Any], include_raw: bool = False) -> Dict[str, Any]:
    """Filter message to essential fields only."""
    filtered = {
        'id': msg.get('id'),
        'content': msg.get('content', '')[:500],  # Truncate long messages
        'sender': msg.get('sender_jid'),
        'timestamp': msg.get('timestamp'),
        'is_from_me': msg.get('is_from_me', False),
        'type': msg.get('message_type', 'text')
    }
    if include_raw:
        filtered['raw_data'] = msg.get('raw_data')
    return filtered

def _filter_chat(chat: Dict[str, Any]) -> Dict[str, Any]:
    """Filter chat to essential fields."""
    return {
        'jid': chat.get('jid'),
        'name': chat.get('name'),
        'unread': chat.get('unread_count', 0),
        'last_message': chat.get('last_message_at')
    }

def _filter_contact(contact: Dict[str, Any]) -> Dict[str, Any]:
    """Filter contact to essential fields."""
    return {
        'jid': contact.get('jid'),
        'name': contact.get('name') or contact.get('notify'),
        'phone': contact.get('phone')
    }

@mcp.tool()
def get_whatsapp_status() -> dict:
    """Check WhatsApp connection state."""
    try:
        response = client.get("/api/status")
        response.raise_for_status()
        data = response.json()
        
        if data.get('status') == 'connected':
            _invalidate_cache()
        
        return {
            'status': data.get('status'),
            'error': data.get('error'),
            'sync_in_progress': data.get('syncInProgress', False)
        }
    except Exception as e:
        return {"error": str(e), "status": "error"}

@mcp.tool()
def connect_whatsapp() -> dict:
    """Initialize WhatsApp connection."""
    try:
        response = client.post("/api/status")
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def send_whatsapp_message(phone: str, message: str) -> dict:
    """
    Send message to phone number.
    
    Args:
        phone: Phone with country code, no + (e.g., "14155551234")
        message: Text to send
    """
    try:
        response = client.post("/api/send", json={"phone": phone, "message": message})
        response.raise_for_status()
        _invalidate_cache('messages')
        
        result = response.json()
        return {
            'success': result.get('success'),
            'message_id': result.get('messageId')
        }
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def send_whatsapp_message_to_jid(jid: str, message: str) -> dict:
    """
    Send message to JID from contacts/chats.
    
    Args:
        jid: WhatsApp JID (e.g., "14155551234@s.whatsapp.net")
        message: Text to send
    """
    try:
        response = client.post("/api/send", json={"jid": jid, "message": message})
        response.raise_for_status()
        _invalidate_cache('messages')
        
        result = response.json()
        return {
            'success': result.get('success'),
            'message_id': result.get('messageId')
        }
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def get_whatsapp_messages(
    chat_jid: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
) -> dict:
    """
    Get messages from a chat or search across all chats.
    
    Args:
        chat_jid: Specific chat JID (optional)
        search: Search term (optional)
        limit: Max results (default 50, max 100)
        offset: Pagination offset
    """
    try:
        limit = min(limit, 100)  # Cap at 100 to prevent token bloat
        params = {"limit": limit, "offset": offset}
        if chat_jid:
            params["chat_jid"] = chat_jid
        if search:
            params["search"] = search
            
        # Search queries always fetch fresh
        if search:
            response = client.get("/api/messages", params=params)
            response.raise_for_status()
            data = response.json()
            
            # Filter response to reduce tokens
            messages = data.get('messages', [])
            return {
                'success': True,
                'messages': [_filter_message(m) for m in messages[:limit]],
                'count': len(messages),
                'has_more': data.get('hasMore', False)
            }
        
        # Specific chat history with caching
        if chat_jid:
            cache_key = f"{chat_jid}:{limit}:{offset}"
            
            if cache_key in _cache['messages']:
                cached = _cache['messages'][cache_key]
                if time.time() - cached['timestamp'] < CACHE_TTL:
                    return cached['data']
            
            response = client.get("/api/messages", params=params)
            response.raise_for_status()
            data = response.json()
            
            messages = data.get('messages', [])
            result = {
                'success': True,
                'messages': [_filter_message(m) for m in messages],
                'count': len(messages),
                'chat_jid': chat_jid
            }
            
            _cache['messages'][cache_key] = {
                'data': result,
                'timestamp': time.time()
            }
            
            return result
        
        # Recent messages across all chats
        response = client.get("/api/messages", params=params)
        response.raise_for_status()
        data = response.json()
        
        messages = data.get('messages', [])
        return {
            'success': True,
            'messages': [_filter_message(m) for m in messages[:limit]],
            'count': len(messages)
        }
        
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def search_whatsapp_messages(query: str, limit: int = 20) -> dict:
    """
    Search messages across all chats.
    
    Args:
        query: Search term
        limit: Max results (default 20)
    """
    try:
        limit = min(limit, 50)  # Cap at 50
        response = client.get("/api/messages", params={"search": query, "limit": limit})
        response.raise_for_status()
        data = response.json()
        
        messages = data.get('messages', [])
        return {
            'success': True,
            'results': [_filter_message(m) for m in messages],
            'count': len(messages)
        }
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def get_whatsapp_contacts(search: Optional[str] = None, limit: int = 100) -> dict:
    """
    Get contacts list.
    
    Args:
        search: Filter by name/phone (optional)
        limit: Max results (default 100)
    """
    try:
        limit = min(limit, 200)  # Cap at 200
        
        # Don't cache search results
        if search:
            response = client.get("/api/contacts", params={"limit": limit, "search": search})
            response.raise_for_status()
            data = response.json()
            contacts = data.get('contacts', [])
            return {
                'success': True,
                'contacts': [_filter_contact(c) for c in contacts],
                'count': len(contacts)
            }
        
        # Cache full list
        if _cache['contacts']['data'] and _is_cache_valid('contacts'):
            return _cache['contacts']['data']
        
        response = client.get("/api/contacts", params={"limit": limit})
        response.raise_for_status()
        data = response.json()
        
        contacts = data.get('contacts', [])
        result = {
            'success': True,
            'contacts': [_filter_contact(c) for c in contacts],
            'count': len(contacts)
        }
        
        _cache['contacts']['data'] = result
        _cache['contacts']['timestamp'] = time.time()
        
        return result
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def get_whatsapp_chats(limit: int = 50, offset: int = 0) -> dict:
    """
    Get chat conversations list.
    
    Args:
        limit: Max results (default 50)
        offset: Pagination offset
    """
    try:
        limit = min(limit, 100)  # Cap at 100
        
        # Don't cache pagination
        if offset > 0:
            response = client.get("/api/chats", params={"limit": limit, "offset": offset})
            response.raise_for_status()
            data = response.json()
            chats = data.get('chats', [])
            return {
                'success': True,
                'chats': [_filter_chat(c) for c in chats],
                'count': len(chats),
                'offset': offset
            }
        
        # Cache first page
        if _cache['chats']['data'] and _is_cache_valid('chats'):
            return _cache['chats']['data']
        
        response = client.get("/api/chats", params={"limit": limit, "offset": offset})
        response.raise_for_status()
        data = response.json()
        
        chats = data.get('chats', [])
        result = {
            'success': True,
            'chats': [_filter_chat(c) for c in chats],
            'count': len(chats)
        }
        
        _cache['chats']['data'] = result
        _cache['chats']['timestamp'] = time.time()
        
        return result
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def get_chat_history(chat_jid: str, limit: int = 50) -> dict:
    """
    Get message history for specific chat.
    
    Args:
        chat_jid: Chat JID from get_whatsapp_chats
        limit: Max messages (default 50)
    """
    try:
        limit = min(limit, 100)  # Cap at 100
        cache_key = f"{chat_jid}:history:{limit}"
        
        if cache_key in _cache['messages']:
            cached = _cache['messages'][cache_key]
            if time.time() - cached['timestamp'] < CACHE_TTL:
                return cached['data']
        
        response = client.get("/api/messages", params={"chat_jid": chat_jid, "limit": limit})
        response.raise_for_status()
        data = response.json()
        
        messages = data.get('messages', [])
        result = {
            'success': True,
            'chat_jid': chat_jid,
            'messages': [_filter_message(m) for m in messages],
            'count': len(messages)
        }
        
        _cache['messages'][cache_key] = {
            'data': result,
            'timestamp': time.time()
        }
        
        return result
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.tool()
def logout_whatsapp() -> dict:
    """Logout and clear session."""
    try:
        response = client.post("/api/logout")
        response.raise_for_status()
        _invalidate_cache()
        return response.json()
    except Exception as e:
        return {"error": str(e), "success": False}

@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request):
    return JSONResponse({"status": "healthy"})

if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=8001)