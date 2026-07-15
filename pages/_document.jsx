import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          *{margin:0;padding:0;box-sizing:border-box}
          body{background:#F7F7F5;color:#141414;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6}
          a{color:inherit}
        `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
