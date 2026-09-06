export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      focusable="false"
      viewBox="0 0 64 64"
    >
      <rect className="brand-mark-background" width="64" height="64" rx="13" />
      <path
        className="brand-mark-four"
        d="M7 36 23 9h10v26h6v10h-6v10H22V45H7v-9Zm15-1V25l-6 10h6Z"
        fillRule="evenodd"
      />
      <path
        className="brand-mark-two"
        d="M36 21c0-8 5-13 14-13 8 0 14 5 14 13 0 6-3 10-9 14l-7 5h16v10H35V39l13-10c4-3 5-5 5-8 0-3-1-5-4-5s-4 2-4 6h-9Z"
      />
    </svg>
  );
}
