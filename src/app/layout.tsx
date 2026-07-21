import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ListingPilot AI',
  description: 'Build trusted Shopify listings from supplier information with traceable claims and review-ready exports.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-[#07111f] text-slate-50 antialiased">{children}</body>
    </html>
  );
}
