import type { JSX } from "react";

const PATHS: Record<string, JSX.Element> = {
  home: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24 2.69269L44 19.5348V44H28V31H20V44H4V19.5348L24 2.69269Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  user: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6 40.0375C6 30.5723 14.1172 23 24 23C33.8828 23 42 30.5723 42 40.0375V40.7923L41.269 40.9647C29.759 43.6784 18.241 43.6784 6.73105 40.9647L6 40.7923V40.0375Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M16 12C16 7.58172 19.5817 4 24 4C28.4183 4 32 7.58172 32 12C32 16.4183 28.4183 20 24 20C19.5817 20 16 16.4183 16 12Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  palette: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.3493 3.00269C13.9636 3.04383 12.5139 3.53115 11.3733 4.35169C5.65736 8.34941 2 15.006 2 22.536C2 34.9476 11.9544 44.8519 24.109 44.9998C33.9246 45.0583 42.7141 38.1067 45.3653 28.7391C46.102 26.135 46.2022 23.2588 45.7751 20.5949C45.2549 17.3497 43.6984 13.929 39.9581 12.041C35.7459 9.91415 30.8588 10.673 26.5479 12.033C24.6659 12.6268 23.1574 13.1468 21.8678 13.2686C20.6792 13.3809 19.8542 13.1388 19.1865 12.3326C18.6821 11.5681 19.2851 10.2473 19.5045 9.48645C19.9825 7.82884 20.2947 6.03067 19.1708 4.54676C18.2382 3.41702 16.7776 2.96028 15.3493 3.00269ZM31.7498 26.2631C28.8115 24.5666 27.2627 21.0349 28.8706 18.2499C30.4785 15.4649 34.3115 15.0404 37.2498 16.7368C40.1881 18.4332 41.7369 21.9649 40.1289 24.7499C38.521 27.5349 34.6881 27.9595 31.7498 26.2631ZM11 18.9999C9.34315 18.9999 8 20.343 8 21.9999C8 23.6568 9.34315 24.9999 11 24.9999C12.6569 24.9999 14 23.6568 14 21.9999C14 20.343 12.6569 18.9999 11 18.9999ZM12.5 31.9999C12.5 30.343 13.8431 28.9999 15.5 28.9999C17.1569 28.9999 18.5 30.343 18.5 31.9999C18.5 33.6568 17.1569 34.9999 15.5 34.9999C13.8431 34.9999 12.5 33.6568 12.5 31.9999ZM26 32.9999C24.3431 32.9999 23 34.343 23 35.9999C23 37.6567 24.3431 38.9999 26 38.9999C27.6569 38.9999 29 37.6567 29 35.9999C29 34.343 27.6569 32.9999 26 32.9999Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  bot: (
    <>
      <path fillRule="evenodd" clipRule="evenodd" d="M25.5 2V8H22.5V2H25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M25.5 40V46H22.5V40H25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M35 2V8H32V2H35Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M35 40V46H32V40H35Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M16 2V8H13V2H16Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M16 40V46H13V40H16Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M46 25.5L40 25.5L40 22.5L46 22.5L46 25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8 25.5L2 25.5L2 22.5L8 22.5L8 25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M46 35L40 35L40 32L46 32L46 35Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8 35L2 35L2 32L8 32L8 35Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M46 16L40 16L40 13L46 13L46 16Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M8 16L2 16L2 13L8 13L8 16Z" fill="currentColor" stroke="none" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M36 42H12C8.68629 42 6 39.3137 6 36L6 12C6 8.6863 8.68629 6 12 6L36 6C39.3137 6 42 8.6863 42 12L42 36C42 39.3137 39.3137 42 36 42ZM27.471 20.4565L23.995 11.1208L20.5289 20.5289L11.1431 23.9868L20.5289 27.5435L24 36.8659L27.471 27.5435L36.822 24L27.471 20.4565Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  sliders: (
    <>
      <path fillRule="evenodd" clipRule="evenodd" d="M44 25.5L36.5 25.5L36.5 22.5L44 22.5L44 25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M4 40L11.5 40L11.5 37L4 37L4 40Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M4 11L11.5 11L11.5 8L4 8L4 11Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M23 25.5L4 25.5L4 22.5L23 22.5L23 25.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M25 40L44 40L44 37L25 37L25 40Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M25 11L44 11L44 8L25 8L25 11Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M32.5 17.5C36.0899 17.5 39 20.4101 39 24C39 27.5899 36.0899 30.5 32.5 30.5C28.9101 30.5 26 27.5899 26 24C26 20.4101 28.9101 17.5 32.5 17.5Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.5 32C11.9101 32 9 34.9101 9 38.5C9 42.0899 11.9101 45 15.5 45C19.0899 45 22 42.0899 22 38.5C22 34.9101 19.0899 32 15.5 32Z" fill="currentColor" stroke="none" />
      <path fillRule="evenodd" clipRule="evenodd" d="M15.5 3C11.9101 3 9 5.91015 9 9.5C9 13.0899 11.9101 16 15.5 16C19.0899 16 22 13.0899 22 9.5C22 5.91015 19.0899 3 15.5 3Z" fill="currentColor" stroke="none" />
    </>
  ),
  warning: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M28.7533 6.63936C26.6325 3.12021 21.3693 3.12021 19.2486 6.63936L2.7532 34.0174C0.580652 37.6226 3.34173 42 7.50564 42H40.4948C44.6587 42 47.4197 37.6225 45.2471 34.0173L28.7533 6.63936ZM25.5 14V28H22.5V14H25.5ZM24 36C25.3807 36 26.5 34.8807 26.5 33.5C26.5 32.1193 25.3807 31 24 31C22.6193 31 21.5 32.1193 21.5 33.5C21.5 34.8807 22.6193 36 24 36Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  check: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M45.1208 7.95402L15.1176 39.287L2.89404 23.695L5.255 21.8441L15.3439 34.713L42.954 5.87918L45.1208 7.95402Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  history: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24 5.5C34.2173 5.5 42.5 13.7827 42.5 24C42.5 34.2173 34.2173 42.5 24 42.5C13.7827 42.5 5.5 34.2173 5.5 24V22.5H2.5V24C2.5 35.8741 12.1259 45.5 24 45.5C35.8741 45.5 45.5 35.8741 45.5 24C45.5 12.1259 35.8741 2.5 24 2.5C15.854 2.5 8.76899 7.03005 5.12163 13.7035L5.06165 13.6766L4.45105 15.0391C4.39618 15.1587 4.34237 15.2788 4.28964 15.3994L7.033 16.6134L7.18291 16.2789C10.1101 9.91437 16.5412 5.5 24 5.5Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7 5V14H16V17H4V5H7Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25.5 11V23.3787L35.6213 33.5L33.5 35.6213L22.5 24.6213V11H25.5Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  cog: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M26.9269 2H21.0731L18.9719 7.25377C17.8317 7.59476 16.7413 8.04726 15.7109 8.60233L10.5141 6.37535L6.37535 10.5141L8.60226 15.7107C8.04706 16.7411 7.5956 17.8323 7.2542 18.9717L2 21.0731V26.9269L7.25377 29.0281C7.59476 30.1683 8.04726 31.2587 8.60233 32.2891L6.37535 37.4859L10.5141 41.6246L15.7107 39.3977C16.7411 39.9529 17.8323 40.4044 18.9717 40.7458L21.0731 46H26.9269L29.0281 40.7462C30.1683 40.4052 31.2587 39.9527 32.2891 39.3977L37.4859 41.6246L41.6246 37.4859L39.3977 32.2893C39.9529 31.2589 40.4044 30.1677 40.7458 29.0283L46 26.9269V21.0731L40.7462 18.9719C40.4052 17.8317 39.9527 16.7413 39.3977 15.7109L41.6246 10.5141L37.4859 6.37535L32.2893 8.60226C31.2589 8.04706 30.1677 7.5956 29.0283 7.2542L26.9269 2ZM33 24C33 28.9706 28.9706 33 24 33C19.0294 33 15 28.9706 15 24C15 19.0294 19.0294 15 24 15C28.9706 15 33 19.0294 33 24Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
  chevR: (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18.8787 15L27.8787 24L18.8787 33L21 35.1213L32.1213 24L21 12.8787L18.8787 15Z"
      fill="currentColor"
      stroke="none"
    />
  ),
  cards: (
    <>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.75 1C2.7835 1 2 1.7835 2 2.75V15.75C2 16.7165 2.7835 17.5 3.75 17.5H12.75C13.7165 17.5 14.5 16.7165 14.5 15.75V2.75C14.5 1.7835 13.7165 1 12.75 1H3.75ZM11.14605 9.2501L8.25 5.71045L5.35395 9.2501L8.25 12.78965L11.14605 9.2501Z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M7.21665 19C7.3449 19.6296 7.8164 20.16475 8.4792 20.34235L17.1725 22.67175C18.1061 22.9219 19.0657 22.36785 19.3158 21.4343L22.68045 8.87725C22.9306 7.9437 22.3766 6.9841 21.44305 6.73395L16 5.2755V15.75C16 17.5449 14.54495 19 12.75 19H7.21665Z"
        fill="currentColor"
        stroke="none"
      />
    </>
  ),
};

const VIEW_BOXES: Record<string, string> = {
  home: "0 0 48 48",
  user: "0 0 48 48",
  palette: "0 0 48 48",
  bot: "0 0 48 48",
  sliders: "0 0 48 48",
  warning: "0 0 48 48",
  check: "0 0 48 48",
  history: "0 0 48 48",
  cog: "0 0 48 48",
  chevR: "0 0 48 48",
};

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  className,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const node = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox={VIEW_BOXES[name] ?? "0 0 24 24"}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {node ?? null}
    </svg>
  );
}
