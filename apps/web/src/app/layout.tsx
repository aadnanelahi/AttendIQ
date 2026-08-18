import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { LocaleProvider } from '@/lib/i18n-client';
import './globals.css';

export const metadata: Metadata = {
  title: 'AttendIQ',
  description: 'Workforce management platform',
};

export default function RootLayout({ children }: { children: ReactNode }): React.JSX.Element {
  const store = cookies();
  const locale = store.get('attendiq_locale')?.value === 'ar' ? 'ar' : 'en';
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body className="font-sans">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
