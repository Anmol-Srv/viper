import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Viper — internal builder platform",
  description: "Create a project, pick modules, get a ready-to-build zip with auth wired in.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
