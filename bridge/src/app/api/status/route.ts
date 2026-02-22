export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getQRCode, getConnectionStatus, initializeWhatsApp, logout } from '@/lib/whatsapp';

export async function GET(request: NextRequest) {
  try {
    const status = getConnectionStatus();
    const qrCode = getQRCode();

    return NextResponse.json({
      success: true,
      status: status.status,
      error: status.error || null,
      qrCode: qrCode || null,
      syncInProgress: status.syncInProgress || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[GET /api/status] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error', status: 'error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get('action');

  try {
    if (action === 'logout') {
      console.log('[POST /api/status?action=logout] Logging out...');
      await logout();
      return NextResponse.json({ success: true, message: 'Logged out successfully' });
    }

    console.log('[POST /api/status] Initializing WhatsApp connection...');
    await initializeWhatsApp();

    const status = getConnectionStatus();
    const qrCode = getQRCode();

    return NextResponse.json({
      success: true,
      status: status.status,
      error: status.error || null,
      qrCode: qrCode || null,
      syncInProgress: status.syncInProgress || false,
      message: 'Connection initialized',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[POST /api/status] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error', status: 'error' },
      { status: 500 }
    );
  }
}