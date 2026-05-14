import "./globals.css";
import Superbar from "@/components/desktop/Superbar";

export const metadata = {
  title: "Code Telephone",
  description: "A multiplayer coding game in the spirit of Telephone.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div className="desktop-root">
          <div className="window-area">{children}</div>
          <Superbar />
        </div>
      </body>
    </html>
  );
}
