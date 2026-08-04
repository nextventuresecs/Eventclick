import { useState, useEffect } from "react";
import { ShieldCheck, X, Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getConsentCookie,
  setConsentCookie,
  hasConsent,
  type ConsentPreferences,
} from "@/lib/cookie-consent";

export const CookieBanner = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [view, setView] = useState<"notice" | "preferences">("notice");
  const [preferences, setPreferences] = useState<Omit<ConsentPreferences, "timestamp">>({
    analytics: true,
    marketing: true,
  });

  useEffect(() => {
    if (!hasConsent()) {
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (analytics: boolean, marketing: boolean) => {
    setConsentCookie({ analytics, marketing });
    setShowBanner(false);
  };

  const handleAcceptAll = () => saveConsent(true, true);
  const handleDeclineAll = () => saveConsent(false, false);
  const handleSavePreferences = () =>
    saveConsent(preferences.analytics, preferences.marketing);

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-8 md:bottom-8 z-[100] md:w-[420px] max-w-full">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-border rounded-2xl p-5 sm:p-6 overflow-hidden relative shadow-lg">
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <ShieldCheck className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-[15px] font-semibold text-foreground leading-tight">
                {view === "notice" ? "Your Privacy Preferences" : "Customise Cookies"}
              </h3>
            </div>
            <button
              onClick={handleDeclineAll}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {view === "notice" ? (
            <div className="space-y-4">
              <div className="text-[13px] text-muted-foreground leading-relaxed space-y-2">
                <p>
                  We use essential cookies to keep the application secure, and
                  optional analytical cookies to understand usage patterns.
                </p>
                <p>
                  By clicking "Accept All", you consent to the storage of
                  these cookies on your device. You can manage your
                  preferences or withdraw consent at any time. Read our{" "}
                  <a
                    href="https://eventclick.live/cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline"
                  >
                    Cookie Policy
                  </a>{" "}
                  for details.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <Button
                  onClick={handleAcceptAll}
                  className="flex-1"
                  size="sm"
                >
                  Accept All
                </Button>
                <Button
                  onClick={() => setView("preferences")}
                  variant="outline"
                  className="flex-1"
                  size="sm"
                >
                  <Settings2 className="w-4 h-4 mr-2" />
                  Customise
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3 pt-2">
                {/* Essential Cookies */}
                <div className="flex items-start justify-between p-3 rounded-xl bg-muted/50 border border-border">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      Essential Cookies
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 pr-4">
                      Required for the application to function securely.
                      Cannot be disabled.
                    </p>
                  </div>
                  <div className="w-8 h-5 bg-primary/60 rounded-full relative opacity-50 shrink-0 mt-1">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                      <Check className="w-2.5 h-2.5 text-primary" />
                    </div>
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-start justify-between p-3 rounded-xl hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      Analytical Cookies
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 pr-4">
                      Help us understand how users interact with the
                      application by collecting anonymous usage data.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPreferences((p) => ({
                        ...p,
                        analytics: !p.analytics,
                      }))
                    }
                    className={`w-8 h-5 rounded-full relative transition-colors shrink-0 mt-1 ${
                      preferences.analytics
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                    role="switch"
                    aria-checked={preferences.analytics}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        preferences.analytics
                          ? "left-3.5"
                          : "left-0.5"
                      }`}
                    />
                  </button>
                </div>

                {/* Marketing Cookies */}
                <div className="flex items-start justify-between p-3 rounded-xl hover:bg-muted/50 border border-transparent hover:border-border transition-colors">
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">
                      Marketing & Ad Cookies
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 pr-4">
                      Used to track visitors across websites to display
                      relevant advertisements. Currently not used.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      setPreferences((p) => ({
                        ...p,
                        marketing: !p.marketing,
                      }))
                    }
                    className={`w-8 h-5 rounded-full relative transition-colors shrink-0 mt-1 ${
                      preferences.marketing
                        ? "bg-primary"
                        : "bg-muted-foreground/30"
                    }`}
                    role="switch"
                    aria-checked={preferences.marketing}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        preferences.marketing
                          ? "left-3.5"
                          : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
                <Button
                  onClick={handleSavePreferences}
                  className="flex-1"
                  size="sm"
                >
                  Save Preferences
                </Button>
                <Button
                  onClick={handleAcceptAll}
                  variant="outline"
                  className="flex-1"
                  size="sm"
                >
                  Accept All
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
