declare const __IV_BUILD_IDENTITY__: { commit: string | null; dirty: boolean | null };
export const buildIdentity = typeof __IV_BUILD_IDENTITY__ === "undefined"
  ? { commit: null, dirty: null }
  : __IV_BUILD_IDENTITY__;
