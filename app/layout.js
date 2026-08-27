import './globals.css';

export const metadata = {
  title: 'Site Survey — Digital Signage',
  description: 'Engineer intake and PM reporting for digital signage site surveys',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="titleblock">
          <a href="/" className="brand"><span className="mark"></span>Site Survey — Digital Signage</a>
          <nav>
            <a href="/">New Survey</a>
            <a href="/dashboard">Dashboard</a>
          </nav>
        </header>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
