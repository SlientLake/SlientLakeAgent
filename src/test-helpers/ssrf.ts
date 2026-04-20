import { vi } from "vitest";
import * as ssrf from "../infra/net/ssrf.js";

export function mockPinnedHostnameResolution(addresses: string[] = ["93.184.216.34"]) {
  const originalResolvePinnedHostname = ssrf.resolvePinnedHostname;
  const originalResolvePinnedHostnameWithPolicy = ssrf.resolvePinnedHostnameWithPolicy;
  const buildPinned = async (
    hostname: string,
    params?: Parameters<typeof ssrf.resolvePinnedHostnameWithPolicy>[1],
  ) => {
    const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
    if (ssrf.isBlockedHostnameOrIp(normalized)) {
      return await originalResolvePinnedHostnameWithPolicy(normalized, params);
    }
    const pinnedAddresses = [...addresses];
    return {
      hostname: normalized,
      addresses: pinnedAddresses,
      lookup: ssrf.createPinnedLookup({ hostname: normalized, addresses: pinnedAddresses }),
    };
  };

  vi.spyOn(ssrf, "resolvePinnedHostname").mockImplementation(async (hostname, lookupFn) => {
    const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
    if (ssrf.isBlockedHostnameOrIp(normalized)) {
      return await originalResolvePinnedHostname(normalized, lookupFn);
    }
    const pinnedAddresses = [...addresses];
    return {
      hostname: normalized,
      addresses: pinnedAddresses,
      lookup: ssrf.createPinnedLookup({ hostname: normalized, addresses: pinnedAddresses }),
    };
  });
  return vi
    .spyOn(ssrf, "resolvePinnedHostnameWithPolicy")
    .mockImplementation(async (hostname, params) => await buildPinned(hostname, params));
}
