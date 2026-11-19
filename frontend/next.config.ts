import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      {
        source: "/staff/products/new",
        destination: "/admin/products/new",
      },
      {
        source: "/staff/products",
        destination: "/admin/products",
      },
      {
        source: "/staff/products/:path*",
        destination: "/admin/products/:path*",
      },
      {
        source: "/staff/inventory",
        destination: "/admin/inventory",
      },
      {
        source: "/staff/inventory/:path*",
        destination: "/admin/inventory/:path*",
      },
      {
        source: "/staff/sales",
        destination: "/admin/sales",
      },
      {
        source: "/staff/sales/:path*",
        destination: "/admin/sales/:path*",
      },
      {
        source: "/staff/purchasing",
        destination: "/admin/purchasing",
      },
      {
        source: "/staff/purchasing/:path*",
        destination: "/admin/purchasing/:path*",
      },
      {
        source: "/staff/customers",
        destination: "/admin/customers",
      },
      {
        source: "/staff/customers/:path*",
        destination: "/admin/customers/:path*",
      },
      {
        source: "/staff/creditors",
        destination: "/admin/creditors",
      },
      {
        source: "/staff/creditors/:path*",
        destination: "/admin/creditors/:path*",
      },
      {
        source: "/staff/orders",
        destination: "/admin/orders",
      },
      {
        source: "/staff/orders/:path*",
        destination: "/admin/orders/:path*",
      },
      {
        source: "/staff/notes",
        destination: "/admin/notes",
      },
      {
        source: "/staff/notes/:path*",
        destination: "/admin/notes/:path*",
      },
      {
        source: "/staff/categories",
        destination: "/admin/categories",
      },
      {
        source: "/staff/categories/:path*",
        destination: "/admin/categories/:path*",
      },
    ];
  },
};

export default nextConfig;
