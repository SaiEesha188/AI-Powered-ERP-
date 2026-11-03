import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/lib/query';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Vidya ERP', template: '%s · Vidya ERP' },
  description: 'Attendance, homework, circulars and parent updates for your institute.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Vidya ERP',
  appleWebApp: { capable: true, title: 'Vidya ERP', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script may set data-theme before React hydrates.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </body>
    </html>
  );
}
