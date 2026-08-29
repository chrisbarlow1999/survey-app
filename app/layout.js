import './globals.css';

export const metadata = {
  title: 'Site Survey — Digital Signage',
  description: 'Engineer intake and PM reporting for digital signage site surveys',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
