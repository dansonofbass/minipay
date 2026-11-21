import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'CrediFlow | Thoughtful finance. Fictional money.',
  description: 'A fictional buy now, pay later platform and banking reliability simulator.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
