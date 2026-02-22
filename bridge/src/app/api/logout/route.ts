export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    console.log('[POST /api/logout] Logging out from WhatsApp...');
    await logout();
    console.log('[POST /api/logout] Logout successful');

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
      status: 'disconnected'
    });
  } catch (error) {
    console.error('[POST /api/logout] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}