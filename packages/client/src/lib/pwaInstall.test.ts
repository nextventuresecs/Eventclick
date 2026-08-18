import { describe, expect, it } from "vitest";
import { resolveInstallPlatform, type InstallEnvironment } from "./pwaInstall";

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
  safariIpadOs:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
};

const env = (over: Partial<InstallEnvironment>): InstallEnvironment => ({
  userAgent: UA.chromeAndroid,
  maxTouchPoints: 0,
  hasPrompt: false,
  isStandalone: false,
  ...over,
});

describe("resolveInstallPlatform", () => {
  it("reports standalone before anything else", () => {
    expect(resolveInstallPlatform(env({ isStandalone: true, hasPrompt: true }))).toBe("standalone");
  });

  it("uses the native prompt when the browser offered one", () => {
    expect(resolveInstallPlatform(env({ hasPrompt: true }))).toBe("prompt");
  });

  it("sends iOS Safari to the share sheet", () => {
    expect(resolveInstallPlatform(env({ userAgent: UA.safariIphone }))).toBe("ios-safari");
  });

  it("tells non-Safari iOS browsers to open Safari instead", () => {
    expect(resolveInstallPlatform(env({ userAgent: UA.chromeIphone }))).toBe("ios-other");
  });

  it("treats iPadOS (which reports as Macintosh) as iOS via touch points", () => {
    expect(resolveInstallPlatform(env({ userAgent: UA.safariIpadOs, maxTouchPoints: 5 }))).toBe(
      "ios-safari",
    );
  });

  it("sends macOS Safari to Add to Dock, not the share sheet", () => {
    expect(resolveInstallPlatform(env({ userAgent: UA.safariMac, maxTouchPoints: 0 }))).toBe(
      "macos-safari",
    );
  });

  it("falls back to generic instructions rather than claiming the browser is unsupported", () => {
    expect(resolveInstallPlatform(env({ userAgent: UA.firefoxWindows }))).toBe("manual");
  });

  it("never claims a Chrome tab without a prompt is unsupported", () => {
    // Installed-but-browsing-in-a-tab: no prompt, not standalone. Must not be a hard error.
    expect(resolveInstallPlatform(env({ userAgent: UA.chromeAndroid }))).toBe("manual");
  });
});
