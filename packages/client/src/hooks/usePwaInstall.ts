import { useCallback, useEffect, useState } from "react";
import {
  INSTALL_INSTRUCTIONS,
  getInstallPlatform,
  subscribeToInstallPrompt,
  triggerInstallPrompt,
  type InstallPlatform,
} from "@/lib/pwaInstall";

export interface UsePwaInstall {
  platform: InstallPlatform;
  /** Set when the browser can't show a native prompt and the user must install manually. */
  instructions: string | null;
  dismissInstructions: () => void;
  install: () => Promise<void>;
}

/**
 * Reads install state from `@/lib/pwaInstall`, which captures
 * `beforeinstallprompt` at module scope — see the note there for why the
 * listener can't live in a component.
 */
export const usePwaInstall = (): UsePwaInstall => {
  const [platform, setPlatform] = useState<InstallPlatform>(getInstallPlatform);
  const [instructions, setInstructions] = useState<string | null>(null);

  useEffect(() => subscribeToInstallPrompt(() => setPlatform(getInstallPlatform())), []);

  const install = useCallback(async () => {
    const outcome = await triggerInstallPrompt();
    if (outcome !== null) return;
    setInstructions(INSTALL_INSTRUCTIONS[getInstallPlatform()]);
  }, []);

  const dismissInstructions = useCallback(() => setInstructions(null), []);

  return { platform, instructions, dismissInstructions, install };
};
