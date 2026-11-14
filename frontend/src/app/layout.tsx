import type { Metadata } from "next";
import { Suspense } from "react";
import { Playfair_Display, Jost } from "next/font/google";
import { QueryProvider } from "@/providers/query-provider";
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Oceanic Tools Monger | Industrial Power Tools & Construction Supplies",
  description:
    "Oceanic Tools Monger — An online store offering genuine industrial power tools, construction hardware, and site supplies with 3D product views and seamless ordering in a peach and white design.",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "256x256" },
      { url: "/favicon.ico" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${jost.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Jost:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body className={`${jost.className} min-h-full flex flex-col bg-white font-sans text-charcoal antialiased`}>
        <QueryProvider>
          <Suspense fallback={null}>
            <GoogleOneTap />
            {children}
          </Suspense>
        </QueryProvider>
      </body>
    </html>
  );
}
