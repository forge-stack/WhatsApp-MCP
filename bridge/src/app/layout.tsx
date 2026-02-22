import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WhatsApp MCP Bridge',
  description: 'WhatsApp Bridge for MCP integration',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
