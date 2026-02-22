export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getDbHelpers } from '@/lib/database';

export async function GET(request: NextRequest) {
  const dbHelpers = getDbHelpers();
  
  if (!dbHelpers) {
    return NextResponse.json({ success: false, error: 'Database not available' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 1000);
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    let contacts: any[] = [];

    if (search) {
      console.log(`[GET /api/contacts] Searching for: "${search}"`);
      contacts = dbHelpers.searchContacts.all({
        query: `%${search}%`,
        limit
      }) as any[];
    } else {
      console.log(`[GET /api/contacts] Fetching contacts - limit: ${limit}, offset: ${offset}`);
      contacts = dbHelpers.getAllContacts.all({ limit, offset }) as any[];
    }

    const formattedContacts = contacts.map(contact => ({
      jid: contact.jid,
      phone: contact.phone,
      name: contact.name || null,
      notify: contact.notify || null,
      displayName: contact.notify || contact.name || contact.phone
    }));

    console.log(`[GET /api/contacts] Returning ${formattedContacts.length} contacts`);

    return NextResponse.json({
      success: true,
      contacts: formattedContacts,
      count: formattedContacts.length,
      limit,
      offset,
      hasMore: formattedContacts.length === limit
    });
  } catch (error) {
    console.error('[GET /api/contacts] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}