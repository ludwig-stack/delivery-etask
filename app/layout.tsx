import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import "./stage-one.css";
import {WorkspaceProvider} from "./workspace-tools";

export const metadata: Metadata = {
  title: "DSI Daily Delivery | IdeaHub",
  description: "DSI delivery workspace. October 22 to December 20, 2026. Execution through December 16, with review, recovery, and conditional weekend coverage.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><WorkspaceProvider>{children}</WorkspaceProvider></body>
    </html>
  );
}
