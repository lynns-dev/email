import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
          *{margin:0;padding:0;box-sizing:border-box}
          body{background:#F7F7F5;color:#141414;font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6}
          a{color:inherit}
        `,
          }}
        />
        {/* Ryze Pixel — web analytics / A-B test redirects. */}
        <script src="https://px.get-ryze.ai/px.js?key=rz_pk_a78be2ffd8bc875cb7bd97f725fee300" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
