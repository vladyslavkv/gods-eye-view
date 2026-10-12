/**
 * Wording for a source this build keeps off because its terms do not cover
 * commercial use (docs/COMMERCIAL_CONFIG.md, "Opt-in sources"). Shown as a
 * state, never as an error.
 */
export const NOT_LICENSED = 'not licensed for commercial use in this build';

/** `"<name> disabled — not licensed for commercial use in this build"`. */
export const disabledNotLicensed = (name) =>
  `${name} disabled — ${NOT_LICENSED}`;
