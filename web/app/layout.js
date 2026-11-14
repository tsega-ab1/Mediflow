import './globals.css';

export const metadata = { title: 'MediFlow', description: 'Pharmaceutical wholesale order fulfillment' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
