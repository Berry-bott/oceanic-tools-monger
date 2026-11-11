"use client";

import Link from "next/link";

export function StoreFooter() {
  const currentYear = 2026;

  return (
    <footer className="bg-charcoal text-white font-sans">
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-2 md:grid-cols-4 gap-10">
        {/* Brand & Socials Column */}
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <img
              src="/oceantoolslogo.png"
              alt="Oceanic Tools Monger Logo"
              className="h-12 w-auto object-contain brightness-110 shrink-0 transition-transform duration-200 group-hover:scale-105"
            />
            <div className="flex flex-col justify-center">
              <span className="font-display text-2xl font-black text-white leading-none">
                Oceanic
              </span>
              <span className="text-[10px] font-bold tracking-[0.24em] text-peach uppercase leading-none mt-1">
                Tools Monger
              </span>
            </div>
          </Link>
          <p className="mt-4 text-sm text-white/60 leading-relaxed">
            Nigeria&apos;s leading distributor of genuine heavy industrial power tools, construction hardware, workshop machinery, and jobsite safety equipment.
          </p>
          <div className="flex gap-3 mt-5">
            {["Instagram", "Facebook", "TikTok", "X"].map((social) => (
              <a
                key={social}
                href="#"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-peach-dark transition-colors flex items-center justify-center text-xs font-bold"
                aria-label={social}
              >
                {social[0]}
              </a>
            ))}
          </div>
        </div>

        {/* Column 2: Shop */}
        <div>
          <h4 className="font-semibold text-sm tracking-wide mb-4 text-peach uppercase">
            Shop
          </h4>
          <ul className="space-y-2.5">
            {[
              { name: "Power Tools", href: "/store?category=Power Tools" },
              { name: "Saws & Cutters", href: "/store?category=Saw & Cutting Tools" },
              { name: "Safety & Boots", href: "/store?category=Safety & Boots" },
              { name: "Fasteners & Nails", href: "/store?category=Fasteners & Nails" },
              { name: "Hand Tools", href: "/store?category=Hand Tools" },
              { name: "Heavy Machinery", href: "/store?category=Workshop Machinery" },
              { name: "New Arrivals", href: "/store?badge=NEW" },
              { name: "Deals", href: "/store?badge=BEST SELLER" },
            ].map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Customer Service */}
        <div>
          <h4 className="font-semibold text-sm tracking-wide mb-4 text-peach uppercase">
            Customer Service
          </h4>
          <ul className="space-y-2.5">
            {[
              "Contact Depot",
              "FAQs",
              "Freight Delivery Information",
              "14-Day Returns Policy",
              "Waybill & Order Tracking",
              "Equipment Sizing Guide",
            ].map((item) => (
              <li key={item}>
                <Link
                  href="/checkout"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  {item}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 4: Company */}
        <div>
          <h4 className="font-semibold text-sm tracking-wide mb-4 text-peach uppercase">
            Company
          </h4>
          <ul className="space-y-2.5">
            {[
              { name: "About Oceanic Tools Monger", href: "/store" },
              { name: "Our Story & Depots", href: "/store" },
              { name: "Track Your Order", href: "/track-order" },
              { name: "Authorized Service Centers", href: "/store" },
              { name: "Privacy Policy", href: "/store" },
              { name: "Terms & Conditions", href: "/store" },
            ].map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10 px-6 py-5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/40">
            © {currentYear} Oceanic Tools Monger (OceanicToolsMonger Ltd). All rights reserved.
          </p>
          <div className="flex items-center gap-3 flex-wrap justify-center">
            {["Paystack", "Flutterwave", "Visa", "Mastercard", "Bank Transfer"].map((method) => (
              <span
                key={method}
                className="px-2.5 py-1 bg-white/10 text-white/60 text-[10px] font-medium rounded"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
