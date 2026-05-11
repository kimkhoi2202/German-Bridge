export const easeOutQuart = [0.25, 1, 0.5, 1] as const;
export const easeOutQuint = [0.22, 1, 0.36, 1] as const;

export const layoutTransition = {
  type: "spring",
  stiffness: 520,
  damping: 44,
  mass: 0.82,
} as const;

export const stateTransition = {
  duration: 0.18,
  ease: easeOutQuint,
} as const;

export const exitTransition = {
  duration: 0.13,
  ease: easeOutQuart,
} as const;
