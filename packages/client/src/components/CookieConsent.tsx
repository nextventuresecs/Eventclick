import { useState, useEffect } from "react";

const CONSENT_KEY = "eventclick_cookie_consent";

type Consent = { essential: true; analytics: boolean; marketing: boolean };

export function CookieConsent() {
  const [show, setShow] = useState(false);
  const [consent, setConsent] = useState<Consent>({ essential: true, analytics: false, marketing: false });

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (!stored) {
        setShow(true);
      } else {
        setConsent(JSON.parse(stored));
      }
    } catch {
      setShow(true);
    }
  }, []);

  const acceptAll = () => {
    const c = { essential: true, analytics: true, marketing: true } as Consent;
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
    setConsent(c);
    setShow(false);
  };

  const acceptEssential = () => {
    const c = { essential: true, analytics: false, marketing: false } as Consent;
    localStorage.setItem(CONSENT_KEY, JSON.stringify(c));
    setConsent(c);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-50 space-y-3">
      <p className="text-sm text-gray-700">
        This application uses essential cookies for authentication and security.
        Analytics and marketing cookies are optional.
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={acceptEssential} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-800">
          Essential Only
        </button>
        <button onClick={acceptAll} className="px-3 py-1.5 text-xs font-medium bg-[#402291] text-white rounded-lg hover:opacity-90">
          Accept All
        </button>
      </div>
    </div>
  );
}
