import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Earthshare — A world worth sharing",
  description:
    "Build a civilization. Navigate a living economy. Protect the world you share.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
