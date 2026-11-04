import { redirect } from "next/navigation";

// The root URL is a redirect-only entry point, so it has no page shell to prefetch.
export const instant = false;

export default function HomePage() {
  redirect("/admin");
}
