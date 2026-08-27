import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'CivicEye — moderatie',
  description: 'Quarantainewachtrij en beheer',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

/**
 * Bewust één globale stylesheet inline: de console is een intern werktuig
 * voor één moderator, geen product. Zelfde kleuren als de app (ui/theme.ts).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#f6f7f8',
          color: '#14181c',
        }}
      >
        {children}
      </body>
    </html>
  );
}
