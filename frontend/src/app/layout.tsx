import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { AdminRouteGuard } from "@/components/admin-route-guard";
import { QueryProvider } from "@/providers/query-provider";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Oceanic Tools Admin",
  description: "Manage inventory, sales and business finances with Oceanic Tools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${nunito.variable} min-h-full flex flex-col bg-background font-sans text-foreground antialiased`}>
        <QueryProvider>
          <AdminRouteGuard>{children}</AdminRouteGuard>
        </QueryProvider>
      </body>
    </html>
  );
}
