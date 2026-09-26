const I = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>{children}</svg>
);

export const Search = (p) => <I {...p}><circle cx="10" cy="10" r="6" /><path d="m15 15 5.5 5.5" /></I>;
export const List = (p) => <I {...p}><path d="M4 6h16M4 12h16M4 18h16" /></I>;
export const Kanban = (p) => <I {...p}><rect x="3.5" y="4" width="7" height="16" rx="1.5" /><rect x="13.5" y="4" width="7" height="10" rx="1.5" /></I>;
export const Caret = (p) => <I {...p}><path d="m6 9 6 6 6-6" /></I>;
export const Plus = (p) => <I {...p}><path d="M12 5v14M5 12h14" /></I>;
export const X = (p) => <I {...p}><path d="M6 6l12 12M18 6 6 18" /></I>;
export const Pencil = (p) => <I {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></I>;
export const Printer = (p) => <I {...p}><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3" /><rect x="7" y="14" width="10" height="7" /></I>;
export const Trash = (p) => <I {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></I>;
export const ArrowIn = (p) => <I {...p}><path d="M12 4v12M6 11l6 6 6-6M4 20h16" /></I>;
export const ArrowOut = (p) => <I {...p}><path d="M12 20V8M6 13l6-6 6 6M4 4h16" /></I>;
export const Swap = (p) => <I {...p}><path d="M4 8h13l-3-3M20 16H7l3 3" /></I>;

// Crate mark used for the logo & favicon
export const Crate = (p) => (
  <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...p}>
    <rect x="3" y="3" width="26" height="26" rx="3" stroke="var(--coral)" strokeWidth="2.5" />
    <path d="M3 11h26M3 21h26M9 3l14 26" stroke="var(--coral)" strokeWidth="2.5" />
  </svg>
);

export const Wordmark = (p) => (
  <svg viewBox="0 0 120 40" aria-label="StockSense" {...p}>
    <rect x="2" y="6" width="28" height="28" rx="3" fill="none" stroke="var(--coral)" strokeWidth="2.5" />
    <path d="M2 15h28M2 25h28M9 6l14 28" stroke="var(--coral)" strokeWidth="2.5" fill="none" />
    <text x="38" y="27" fill="var(--ink)" style={{ font: '900 19px var(--f-stencil)', letterSpacing: '0.06em' }}>STOCK</text>
    <text x="38" y="38" fill="var(--coral)" style={{ font: '700 9px var(--f-mono)', letterSpacing: '0.42em' }}>SENSE</text>
  </svg>
);
