import "./globals.css";

export const metadata = {
  title: "AGRO CONNECT | Smart Farming Dashboard",
  description: "Realtime IoT smart farming dashboard for AGRO CONNECT"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
