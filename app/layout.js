import './globals.css';

export const metadata = {
  title: 'Digital Screens',
  description: 'Surveys, installs, engineer visits and project management for digital signage',
};

// Runs before the first paint, so someone who has chosen dark never sees a
// flash of the light theme while React hydrates. With nothing stored it leaves
// the attribute off entirely and the stylesheet falls back to the OS setting.
// Wrapped in try/catch because localStorage throws outright in some privacy
// modes rather than returning null.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the script above mutates <html> before React
    // hydrates, so server and client markup differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
