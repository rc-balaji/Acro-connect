import "./globals.css";
import AppNav from "@/components/AppNav";

export const metadata = {
  title: "AGRO CONNECT | Smart Farming Dashboard",
  description: "Realtime IoT smart farming dashboard for AGRO CONNECT",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
