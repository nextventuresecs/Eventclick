import { useEffect, useState } from "react";

const INSTALL_FLAG_KEY = "pwa_show_welcome";

export const PwaWelcomeSplash = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handleAppInstalled = () => {
      localStorage.setItem(INSTALL_FLAG_KEY, "1");
    };
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => window.removeEventListener("appinstalled", handleAppInstalled);
  }, []);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone && localStorage.getItem(INSTALL_FLAG_KEY) === "1") {
      setShow(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.removeItem(INSTALL_FLAG_KEY);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-brand-gradient flex items-center justify-center animate-in fade-in"
      onClick={dismiss}
    >
      <video
        src="/eventclick_logo_animation.mp4"
        autoPlay
        muted
        playsInline
        onEnded={dismiss}
        className="w-48 h-48 md:w-64 md:h-64 object-contain"
      />
    </div>
  );
};
