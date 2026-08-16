// Build-time license flags (webpack DefinePlugin / vitest define). Centralized so
// both the popup and the background read the same source of truth.

declare const __LICENSE_ENABLED__: boolean
declare const __LICENSE_API_URL__: string
declare const __DEV_BYPASS_CODE__: string

// Master switch. false = gate is compiled OFF: the popup never shows the gate and
// the background always resolves as licensed. Dev builds leave this false.
export const LICENSE_ENABLED: boolean = __LICENSE_ENABLED__

export const LICENSE_API_URL: string = __LICENSE_API_URL__

// Admin/dev bypass code. When non-empty AND the user types exactly this at the
// gate, access is granted locally without touching the backend. Leave UNSET in
// beta/production builds so no bypass ships. Only meaningful when LICENSE_ENABLED
// is true (with the gate off there's nothing to bypass).
export const DEV_BYPASS_CODE: string = __DEV_BYPASS_CODE__
