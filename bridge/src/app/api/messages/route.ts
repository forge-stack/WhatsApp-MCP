export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDbHelpers } from '@/lib/database';

export async function GET(request: NextRequest) {
  const dbHelpers = getDbHelpers();
  
  if (!dbHelpers) {
    return NextResponse.json({ success: false, error: 'Database not available' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const chatJid = searchParams.get('chat_jid');
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');
  const timeRange = searchParams.get('time_range');

  try {
    console.log(`[GET /api/messages] Query - chatJid: ${chatJid}, search: ${search}, limit: ${limit}, offset: ${offset}, timeRange: ${timeRange}`);
    
    let messages: any[] = [];

    if (search) {
      console.log(`[GET /api/messages] Searching for: "${search}"`);
      messages = dbHelpers.searchMessages.all({ query: `%${search}%`, limit }) as any[];
    } else if (chatJid) {
      console.log(`[GET /api/messages] Fetching chat history for: ${chatJid}`);
      messages = dbHelpers.getMessages.all({ chat_jid: chatJid, limit, offset }) as any[];
    } else if (timeRange === 'today') {
      console.log(`[GET /api/messages] Fetching last 24 hours`);
      messages = dbHelpers.getLastDayMessages.all({ limit }) as any[];
    } else {
      console.log(`[GET /api/messages] Fetching recent messages`);
      messages = dbHelpers.getRecentMessages.all({ limit }) as any[];
    }

    console.log(`[GET /api/messages] Returning ${messages.length} messages`);

    return NextResponse.json({
      success: true,
      messages,
      count: messages.length,
      limit,
      offset,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('[GET /api/messages] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}