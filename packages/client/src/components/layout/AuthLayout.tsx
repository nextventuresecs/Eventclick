import { ReactNode } from "react";
import { Sparkles, ShieldCheck } from "lucide-react";

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen w-full bg-slate-50/50 relative overflow-x-hidden flex-col lg:flex-row font-sans selection:bg-purple-500/20 selection:text-purple-900">
      {/* Left (desktop) / Top (mobile) Section.
          On mobile this is a compact band rather than a half-screen hero, so the
          form stays above the fold on a ~667px-tall phone without scrolling. */}
      <div className="relative w-full lg:w-1/2 bg-brand-gradient text-white flex flex-col justify-between px-6 pt-safe pb-10 lg:p-14 z-0 lg:min-h-screen overflow-hidden">

        {/* Ambient Decorative Lighting */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
        <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-400/10 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Content Container — row on mobile, stacked and centered on desktop */}
        <div className="relative z-10 flex flex-row lg:flex-col items-center justify-center lg:flex-1 gap-4 lg:gap-0 text-left lg:text-center max-w-md mx-auto pt-5 lg:py-6">

          {/* Logo Badge */}
          <div className="group bg-white rounded-2xl lg:rounded-3xl p-2.5 lg:p-4 lg:mb-5 shadow-xl lg:shadow-2xl shadow-purple-950/20 ring-2 lg:ring-4 ring-white/20 w-14 h-14 lg:w-28 lg:h-28 shrink-0 flex items-center justify-center relative z-20 backdrop-blur-sm transition-all duration-300 lg:hover:scale-105 lg:hover:rotate-1">
            <img src="/only_icon.png" alt="EventClick Logo" className="w-9 h-9 lg:w-16 lg:h-16 object-contain transition-transform duration-300 lg:group-hover:scale-110" />
          </div>

          <div className="min-w-0 lg:contents">
            <h1 className="text-xl lg:text-4xl font-extrabold tracking-tight lg:mb-4 font-display drop-shadow-sm leading-tight">
              EventClick
            </h1>

            {/* Mobile tagline — one line, replaces the desktop paragraph + chip */}
            <p className="lg:hidden text-[11px] text-blue-100/85 font-medium leading-snug">
              Real-time attendance & live audit trail
            </p>

            <p className="hidden lg:block max-w-md text-xs lg:text-sm leading-relaxed text-blue-100/90 font-normal">
              Streamline your organization's events with real-time attendance verification, transparent activity reporting, and seamless member coordination.
            </p>
          </div>

          {/* Desktop Feature Chip */}
          <div className="hidden lg:inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2.5 rounded-2xl mt-8 text-left shadow-lg">
            <div className="p-2 rounded-xl bg-white/15">
              <ShieldCheck className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Verified Event Platform</p>
              <p className="text-[11px] text-blue-100/75">Real-time attendance & live audit trail</p>
            </div>
          </div>
        </div>

        {/* Footer Text — desktop only; on mobile it competes with the form for space */}
        <div className="relative z-10 text-center mt-6 lg:mt-8 pb-2 hidden lg:block">
          <span className="inline-block px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-[10px] lg:text-xs font-semibold tracking-widest text-blue-100 uppercase">
            TRUST | TRANSPARENCY | VISIBILITY MORE
          </span>
        </div>

        {/* Wavy Cloud Separator (Desktop) */}
        <div className="hidden lg:block absolute -right-0.5 top-0 bottom-0 h-full w-32 z-0 pointer-events-none">
          <svg viewBox="0 0 120 1000" preserveAspectRatio="none" className="h-full w-full absolute inset-0">
             <path fill="rgba(255,255,255,0.15)" d="M120,0 L120,1000 L50,1000 C0,950 80,900 50,850 C20,800 80,750 50,700 C20,650 80,600 50,550 C20,500 80,450 50,400 C20,350 80,300 50,250 C20,200 80,150 50,100 C20,50 80,0 120,0 Z" />
             <path fill="rgba(255,255,255,0.4)" d="M120,0 L120,1000 L70,1000 C30,950 90,900 70,850 C50,800 90,750 70,700 C50,650 90,600 70,550 C50,500 90,450 70,400 C50,350 90,300 70,250 C50,200 90,150 70,100 C50,50 90,0 120,0 Z" />
             <path fill="#ffffff" d="M120,0 L120,1000 L90,1000 C60,950 110,900 90,850 C70,800 110,750 90,700 C70,650 110,600 90,550 C70,500 110,450 90,400 C70,350 110,300 90,250 C70,200 110,150 90,100 C70,50 110,0 120,0 Z" />
          </svg>
        </div>
        
        {/* Wavy Cloud Separator (Mobile) */}
        <div className="block lg:hidden absolute -bottom-0.5 left-0 right-0 w-full h-10 z-0 pointer-events-none">
          <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="w-full h-full absolute inset-0">
             <path fill="rgba(255,255,255,0.15)" d="M0,80 L1000,80 L1000,40 C950,10 900,60 850,40 C800,20 750,60 700,40 C650,20 600,60 550,40 C500,20 450,60 400,40 C350,20 300,60 250,40 C200,20 150,60 100,40 C50,20 0,60 0,80 Z" />
             <path fill="rgba(255,255,255,0.4)" d="M0,80 L1000,80 L1000,55 C950,35 900,70 850,55 C800,40 750,70 700,55 C650,40 600,70 550,55 C500,40 450,70 400,55 C350,40 300,70 250,55 C200,40 150,70 100,55 C50,40 0,70 0,80 Z" />
             <path fill="#ffffff" d="M0,80 L1000,80 L1000,70 C950,55 900,80 850,70 C800,60 750,80 700,70 C650,60 600,80 550,70 C500,60 450,80 400,70 C350,60 300,80 250,70 C200,60 150,80 100,70 C50,60 0,80 0,80 Z" />
          </svg>
        </div>
      </div>

      {/* Right (desktop) / Bottom (mobile) Section */}
      <div className="flex-1 flex flex-col justify-center items-center px-5 pt-7 pb-safe lg:p-14 z-10 bg-white">
        <div className="w-full max-w-md mx-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
