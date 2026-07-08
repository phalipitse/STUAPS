interface LogoProps {
  /** Height in px of the icon mark. Wordmark text scales relative to this. */
  size?: number;
  /** Show the "STUAPS" wordmark next to the icon mark. */
  withWordmark?: boolean;
  className?: string;
}

const BRAND_BLUE = "#1D4ED8";

export function Logo({ size = 32, withWordmark = true, className }: LogoProps) {
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: size * 0.3 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="40" height="40" rx="8" fill={BRAND_BLUE} />
        {/* Outer house outline */}
        <path
          d="M8 19L20 9L32 19V31.5C32 32.05 31.55 32.5 31 32.5H9C8.45 32.5 8 32.05 8 31.5V19Z"
          stroke="white"
          strokeWidth="2.3"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Nested house-with-window mark */}
        <path
          d="M13.5 22L20 16.5L26.5 22V27.5C26.5 27.78 26.28 28 26 28H14C13.72 28 13.5 27.78 13.5 27.5V22Z"
          fill="white"
        />
        <rect x="16.5" y="22.5" width="7" height="4.5" fill={BRAND_BLUE} />
        <rect x="19.7" y="22.5" width="0.9" height="4.5" fill="white" />
      </svg>
      {withWordmark && (
        <span
          style={{
            fontSize: size * 0.62,
            lineHeight: 1,
            letterSpacing: "0.02em",
            fontWeight: 800,
            color: BRAND_BLUE,
          }}
        >
          STUAPS
        </span>
      )}
    </span>
  );
}
