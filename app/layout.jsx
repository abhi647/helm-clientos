import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "../src/helm.css";
import "../src/delivery.css";

export const metadata = {
  title: "Helm · Client delivery, together",
  description: "The collaborative workspace for Seven Billion client delivery.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
