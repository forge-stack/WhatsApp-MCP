export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { sendMessage, getConnectionStatus } from '@/lib/whatsapp';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, jid, message } = body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Message content is required' },
        { status: 400 }
      );
    }

    if (!phone && !jid) {
      return NextResponse.json(
        { success: false, error: 'Either phone number or JID is required' },
        { status: 400 }
      );
    }

    const status = getConnectionStatus();
    if (status.status !== 'connected') {
      return NextResponse.json(
        { success: false, error: `WhatsApp is not connected (status: ${status.status})` },
        { status: 400 }
      );
    }

    console.log('[POST /api/send] Sending message to:', jid || phone);

    const result = await sendMessage(jid || phone, message.trim());

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send message' },
        { status: 400 }
      );
    }

    console.log('[POST /api/send] Message sent successfully:', result.messageId);

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Message sent successfully'
    });
  } catch (error) {
    console.error('[POST /api/send] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}