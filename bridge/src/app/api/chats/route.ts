export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDbHelpers } from '@/lib/database';

export async function GET(request: NextRequest) {
  const dbHelpers = getDbHelpers();
  
  if (!dbHelpers) {
    return NextResponse.json({ success: false, error: 'Database not available' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    console.log(`[GET /api/chats] Fetching chats - limit: ${limit}, offset: ${offset}`);
    
    const countResult = dbHelpers.getChatCount.get() as { count: number };
    const totalCount = countResult?.count || 0;

    const chats = dbHelpers.getAllChats.all({ limit, offset }) as Array<any>;

    console.log(`[GET /api/chats] Found ${chats.length} chats out of ${totalCount} total`);

    return NextResponse.json({
      success: true,
      chats,
      count: chats.length,
      totalCount,
      limit,
      offset,
      hasMore: offset + chats.length < totalCount
    });
  } catch (error) {
    console.error('[GET /api/chats] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}