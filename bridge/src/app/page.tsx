'use client';

import { useEffect, useState } from 'react';
import QRCode from 'react-qr-code';

interface StatusResponse {
  status: 'disconnected' | 'connecting' | 'connected';
  error: string | null;
  qrCode: string | null;
}

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const connect = async () => {
    setLoading(true);
    try {
      await fetch('/api/status', { method: 'POST' });
      setTimeout(fetchStatus, 1000);
    } catch (error) {
      console.error('Error connecting:', error);
    }
    setLoading(false);
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
      await fetchStatus();
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = () => {
    switch (status?.status) {
      case 'connected': return '#22c55e';
      case 'connecting': return '#eab308';
      case 'disconnected': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <main style={{ 
      minHeight: '100vh', 
      padding: '2rem',
      fontFamily: 'system-ui, sans-serif',
      backgroundColor: '#0f172a',
      color: '#e2e8f0'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>
          WhatsApp MCP Bridge
        </h1>
        
        <div style={{ 
          backgroundColor: '#1e293b', 
          padding: '1.5rem', 
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <div style={{ 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              backgroundColor: getStatusColor()
            }} />
            <span style={{ textTransform: 'capitalize', fontWeight: '600' }}>
              {status?.status || 'Loading...'}
            </span>
          </div>

          {status?.error && (
            <div style={{ 
              backgroundColor: '#7f1d1d', 
              padding: '0.75rem', 
              borderRadius: '0.25rem',
              marginBottom: '1rem',
              fontSize: '0.875rem'
            }}>
              {status.error}
            </div>
          )}

          {status?.status === 'disconnected' && (
            <button
              onClick={connect}
              disabled={loading}
              style={{
                backgroundColor: '#22c55e',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Connecting...' : 'Connect to WhatsApp'}
            </button>
          )}

          {status?.status === 'connecting' && !status?.qrCode && (
            <div style={{ color: '#94a3b8' }}>
              Initializing connection...
            </div>
          )}

          {status?.status === 'connected' && (
            <button
              onClick={disconnect}
              disabled={loading}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.375rem',
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          )}
        </div>

        {status?.qrCode && status?.status !== 'connected' && (
          <div style={{ 
            backgroundColor: '#1e293b', 
            padding: '1.5rem', 
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
              Scan QR Code with WhatsApp
            </h2>
            <div style={{ 
              backgroundColor: 'white', 
              padding: '1rem', 
              display: 'inline-block',
              borderRadius: '0.5rem'
            }}>
              <QRCode value={status.qrCode} size={256} />
            </div>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#94a3b8' }}>
              Open WhatsApp → Settings → Linked Devices → Link a Device
            </p>
          </div>
        )}

        {status?.status === 'connected' && (
          <div style={{ 
            backgroundColor: '#1e293b', 
            padding: '1.5rem', 
            borderRadius: '0.5rem'
          }}>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>
              ✅ Connected Successfully
            </h2>
            <p style={{ color: '#94a3b8', marginBottom: '1rem' }}>
              The WhatsApp bridge is running. You can now use the MCP server to interact with WhatsApp.
            </p>
            <div style={{ fontSize: '0.875rem' }}>
              <h3 style={{ fontWeight: '600', marginBottom: '0.5rem' }}>API Endpoints:</h3>
              <ul style={{ color: '#94a3b8', paddingLeft: '1.5rem' }}>
                <li><code>GET /api/status</code> - Connection status</li>
                <li><code>POST /api/send</code> - Send message</li>
                <li><code>GET /api/messages</code> - Get messages</li>
                <li><code>GET /api/contacts</code> - Get contacts</li>
                <li><code>GET /api/chats</code> - Get chats</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}