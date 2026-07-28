import type { Metadata, Viewport } from 'next';
import './globals.css';

// The favicon and apple-touch icon come from app/icon.png and app/apple-icon.png
// (Next.js file conventions) — no <link> tags needed here.
export const metadata: Metadata = {
  title: 'ISTV AI MOCK Calls sales rep training',
  description: 'AI sales roleplay training — rehearse objection handling against realistic buyers.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
