import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen w-full bg-white relative overflow-hidden flex-col lg:flex-row">
      {/* Left / Top Section */}
      <div className="relative w-full lg:w-1/2 bg-brand-gradient text-white flex flex-col justify-between p-8 lg:p-16 z-0 lg:min-h-screen overflow-hidden">
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 text-center h-full max-w-md mx-auto">
          <h2 className="text-xl lg:text-2xl font-bold mb-4 lg:mb-8 font-display">Welcome to</h2>
          
          <div className="bg-white rounded-full p-4 mb-4 shadow-lg w-24 h-24 lg:w-28 lg:h-28 flex items-center justify-center relative z-20">
            <img src="/only_icon.png" alt="EventClick Logo" className="w-14 h-14 lg:w-16 lg:h-16 object-contain" />
          </div>
          
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-wider mb-4 lg:mb-6 font-display">EventClick</h1>
          
          <p className="max-w-md text-xs lg:text-sm leading-relaxed text-blue-50">
            Streamline your organization's events with real-time attendance verification, transparent activity reporting, and seamless member coordination.
          </p>
        </div>

        {/* Footer Text */}
        <div className="relative z-10 text-center mt-6 lg:mt-8 pb-4">
          <p className="text-[10px] lg:text-xs font-semibold tracking-widest text-blue-100 uppercase">
            TRUST | TRANSPARENCY | VISIBILITY MORE
          </p>
        </div>

        {/* Wavy Cloud Separator (Desktop) */}
        <div className="hidden lg:block absolute -right-0.5 top-0 bottom-0 h-full w-30 z-0 pointer-events-none">
          {/* Multiple layered SVGs for cloud effect */}
          <svg viewBox="0 0 120 1000" preserveAspectRatio="none" className="h-full w-full absolute inset-0">
             <path fill="rgba(255,255,255,0.2)" d="M120,0 L120,1000 L50,1000 C0,950 80,900 50,850 C20,800 80,750 50,700 C20,650 80,600 50,550 C20,500 80,450 50,400 C20,350 80,300 50,250 C20,200 80,150 50,100 C20,50 80,0 120,0 Z" />
             <path fill="rgba(255,255,255,0.5)" d="M120,0 L120,1000 L70,1000 C30,950 90,900 70,850 C50,800 90,750 70,700 C50,650 90,600 70,550 C50,500 90,450 70,400 C50,350 90,300 70,250 C50,200 90,150 70,100 C50,50 90,0 120,0 Z" />
             <path fill="#ffffff" d="M120,0 L120,1000 L90,1000 C60,950 110,900 90,850 C70,800 110,750 90,700 C70,650 110,600 90,550 C70,500 110,450 90,400 C70,350 110,300 90,250 C70,200 110,150 90,100 C70,50 110,0 120,0 Z" />
          </svg>
        </div>
        
        {/* Wavy Cloud Separator (Mobile) */}
        <div className="block lg:hidden absolute -bottom-0.5 left-0 right-0 w-full h-15 z-0 pointer-events-none">
          <svg viewBox="0 0 1000 80" preserveAspectRatio="none" className="w-full h-full absolute inset-0">
             <path fill="rgba(255,255,255,0.2)" d="M0,80 L1000,80 L1000,40 C950,10 900,60 850,40 C800,20 750,60 700,40 C650,20 600,60 550,40 C500,20 450,60 400,40 C350,20 300,60 250,40 C200,20 150,60 100,40 C50,20 0,60 0,80 Z" />
             <path fill="rgba(255,255,255,0.5)" d="M0,80 L1000,80 L1000,55 C950,35 900,70 850,55 C800,40 750,70 700,55 C650,40 600,70 550,55 C500,40 450,70 400,55 C350,40 300,70 250,55 C200,40 150,70 100,55 C50,40 0,70 0,80 Z" />
             <path fill="#ffffff" d="M0,80 L1000,80 L1000,70 C950,55 900,80 850,70 C800,60 750,80 700,70 C650,60 600,80 550,70 C500,60 450,80 400,70 C350,60 300,80 250,70 C200,60 150,80 100,70 C50,60 0,80 0,80 Z" />
          </svg>
        </div>
      </div>

      {/* Right / Bottom Section */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 lg:p-12 z-10 bg-white min-h-[50vh]">
        <div className="w-full max-w-100">
          {children}
        </div>
      </div>
    </div>
  );
};
