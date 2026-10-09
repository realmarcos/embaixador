import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { AppError } from "../../errors/app-errors";
import { MediaPlatform } from "../../providers/media-extractor/types";

interface ValidatedMediaUrl {
  url: string;
  platform: MediaPlatform;
}

const platformHosts: { platform: MediaPlatform; hosts: string[] }[] = [
  { platform: "YOUTUBE", hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"] },
  { platform: "INSTAGRAM", hosts: ["instagram.com"] },
  { platform: "FACEBOOK", hosts: ["facebook.com", "fb.watch"] },
];

interface ValidateMediaUrlServiceDependencies {
  resolveAddresses?: (hostname: string) => Promise<string[]>;
}

function ipv4Number(address: string): bigint | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return null;
  }
  return parts.reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function isPrivateIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) {
    return true;
  }
  const ranges: [bigint, number][] = [
    [0x00000000n, 8],
    [0x0a000000n, 8],
    [0x64400000n, 10],
    [0x7f000000n, 8],
    [0xa9fe0000n, 16],
    [0xac100000n, 12],
    [0xc0000000n, 24],
    [0xc0000200n, 24],
    [0xc0586300n, 24],
    [0xc0a80000n, 16],
    [0xc6120000n, 15],
    [0xc6336400n, 24],
    [0xcb007100n, 24],
    [0xe0000000n, 4],
    [0xf0000000n, 4],
  ];
  return ranges.some(([network, prefix]) => (value >> BigInt(32 - prefix)) === (network >> BigInt(32 - prefix)));
}

function ipv6Number(address: string): bigint | null {
  let normalized = address.toLowerCase().split("%")[0] ?? "";
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const ipv4 = ipv4Number(normalized.slice(separator + 1));
    if (ipv4 === null) return null;
    normalized = `${normalized.slice(0, separator)}:${Number(ipv4 >> 16n).toString(16)}:${Number(ipv4 & 0xffffn).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isPublicAddress(address: string): boolean {
  const addressType = isIP(address);
  if (addressType === 4) return !isPrivateIpv4(address);
  if (addressType !== 6) return false;

  const value = ipv6Number(address);
  if (value === null || (value >> 125n) !== 1n) return false;
  const prefix32 = value >> 96n;
  const prefix16 = value >> 112n;
  return prefix32 !== 0x20010db8n && prefix32 !== 0x20010000n && prefix16 !== 0x2002n;
}

async function resolvePublicDnsAddresses(hostname: string): Promise<string[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.map((address) => address.address);
}

function invalidUrlError(): AppError {
  return new AppError({
    message: "The media URL is invalid or unsafe",
    code: "INVALID_MEDIA_URL",
    statusCode: 400,
  });
}

function unsupportedPlatformError(): AppError {
  return new AppError({
    message: "This media platform is not supported",
    code: "UNSUPPORTED_PLATFORM",
    statusCode: 422,
  });
}

function resolvePlatform(hostname: string): MediaPlatform | undefined {
  for (const entry of platformHosts) {
    if (entry.hosts.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
      return entry.platform;
    }
  }

  return undefined;
}

class ValidateMediaUrlService {
  constructor(private readonly dependencies: ValidateMediaUrlServiceDependencies = {}) {}

  execute(input: string): Promise<ValidatedMediaUrl> {
    return Promise.resolve().then(async () => {
      if (typeof input !== "string" || input.length === 0 || input.length > 2048) {
        throw invalidUrlError();
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(input.trim());
      } catch {
        throw invalidUrlError();
      }

      if (
        (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
        parsedUrl.username.length > 0 ||
        parsedUrl.password.length > 0 ||
        parsedUrl.port.length > 0 ||
        isIP(parsedUrl.hostname.replace(/^\[|\]$/g, "")) !== 0
      ) {
        throw invalidUrlError();
      }

      const hostname = parsedUrl.hostname.toLowerCase().replace(/\.$/, "");
      const platform = resolvePlatform(hostname);
      if (!platform) {
        throw unsupportedPlatformError();
      }

      if (this.dependencies.resolveAddresses) {
        try {
          const addresses = await this.dependencies.resolveAddresses(hostname);
          if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
            throw invalidUrlError();
          }
        } catch {
          throw invalidUrlError();
        }
      }

      return { url: parsedUrl.toString(), platform };
    });
  }
}

export { isPublicAddress, resolvePublicDnsAddresses, ValidateMediaUrlService, ValidatedMediaUrl };