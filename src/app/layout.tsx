import type { Metadata, Viewport } from "next";
import { Playfair_Display, Plus_Jakarta_Sans, Vazirmatn } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["600", "700", "800"],
  display: "swap",
});

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-persian",
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Weekend BBQ | کباب زغالی آخر هفته — Calgary Persian Charcoal Kebab",
  description:
    "Pre-order authentic Persian charcoal-grilled Koobideh, Saffron Joojeh, and house-made Tiramisu for weekend pickup in Calgary.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FAF6EE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${plusJakarta.variable} ${playfair.variable} ${vazirmatn.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-ivory-100 text-charcoal-900 min-h-screen">
        {children}
      </body>
    </html>
  );
}
