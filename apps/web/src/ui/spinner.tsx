/** Kuat Spinner: a 3px ring at 20% with a turning quarter, in `--primary`. */
export const Spinner = ({ size = 20 }: Readonly<{ size?: number }>) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className="animate-spin text-primary [animation-duration:800ms]"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
