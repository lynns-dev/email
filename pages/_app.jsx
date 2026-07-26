import Head from 'next/head';

// Belongs here (next/head, per-render) rather than pages/_document.jsx —
// Next.js warns/strips a viewport meta tag placed in _document's Head
// since that only renders once at build/SSR time, not per-navigation.
// Was missing entirely before this, which meant every mobile browser
// rendered the whole app at a fixed desktop width and zoomed out,
// making any responsive CSS underneath pointless.
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
