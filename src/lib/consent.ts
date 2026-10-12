/** Placeholder until Nilo approves final Privacy Notice wording. */
export const PRIVACY_VERSION = 'placeholder-1';

export function encodeConsentVersion(marketingOptIn: boolean): string {
  return marketingOptIn ? `${PRIVACY_VERSION}:optin` : PRIVACY_VERSION;
}

export function parseMarketingOptIn(consentVersion: string): boolean {
  return consentVersion.endsWith(':optin');
}

export function privacyVersionOf(consentVersion: string): string {
  return consentVersion.split(':')[0] ?? PRIVACY_VERSION;
}
