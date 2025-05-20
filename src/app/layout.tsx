
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google'; // Assuming Geist is a desired modern font
import './globals.css';
import { Toaster } from "@/components/ui/toaster"; // Ensure Toaster is available globally if needed, or in page.tsx

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Knowledge Canvas',
  description: 'Visually manage and link your knowledge assets.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased font-sans`}>
        {children}
        {/* Toaster can also be placed here if preferred over page.tsx */}
      </body>
    </html>
  );
}

