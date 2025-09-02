import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Compare",
  description: "Compare AI model responses side by side",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased font-sans"
      >
        {children}
      </body>
    </html>
  );
}
