import type { Metadata } from "next";
import { Suspense } from "react";
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
  title: "OceanicToolsMonger Admin",
  description: "Manage inventory, sales and business finances with OceanicToolsMonger.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className={`${nunito.variable} min-h-full flex flex-col bg-background font-sans text-foreground antialiased`}>
        <QueryProvider>
          <Suspense
            fallback={
              <main className="grid min-h-screen place-items-center bg-background text-sm text-muted">
                Loading OceanicToolsMonger...
              </main>
            }
          >
            <AdminRouteGuard>{children}</AdminRouteGuard>
          </Suspense>
        </QueryProvider>
      </body>
    </html>
  );
}
