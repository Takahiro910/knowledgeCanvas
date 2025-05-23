// src/app/layout.tsx

import type {Metadata} from 'next';
// import { Geist, Geist_Mono } from 'next/font/google'; // ← 削除
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

// const geistSans = Geist({ // ← 削除
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
// });

// const geistMono = Geist_Mono({ // ← 削除
//   variable: '--font-geist-mono',
//   subsets: ['latin'],
// });

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
    // ↓ この <html> タグに suppressHydrationWarning={true} を追加します
    <html lang="en" suppressHydrationWarning={true}> 
      {/* ↓ <body>からフォント変数を削除。CSSでフォントを指定します */}
      <body className="antialiased"> 
        {children}
      </body>
    </html>
  );
}
