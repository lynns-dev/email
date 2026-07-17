// Brand-neutral design tokens — this app serves whichever storefront(s)
// point their SES_FROM_NAME / SITE_REDIRECT_URL at a given deployment, so
// it shouldn't carry any one brand's look.
export const T = {
  white: '#FFFFFF',
  paper: '#F7F7F5',
  ink: '#141414',
  soft: '#6B6B6B',
  line: 'rgba(20,20,20,0.14)',
  sans: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export const S = {
  label: {
    fontSize: 10, letterSpacing: '0.24em', textTransform: 'uppercase',
    color: T.soft, fontWeight: 700,
  },
  btnFill: {
    display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
    background: T.ink, color: T.white, border: 'none', cursor: 'pointer',
    fontFamily: T.sans, fontSize: 12, fontWeight: 600,
  },
  btnOutline: {
    display: 'inline-flex', alignItems: 'center', height: 40, padding: '0 20px',
    background: 'transparent', color: T.ink, border: `1px solid ${T.line}`, cursor: 'pointer',
    fontFamily: T.sans, fontSize: 12, fontWeight: 600, textDecoration: 'none',
  },
};
