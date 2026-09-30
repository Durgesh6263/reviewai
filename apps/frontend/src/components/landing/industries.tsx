import {
  UtensilsCrossed,
  Dumbbell,
  Sparkles,
  Stethoscope,
  ShoppingBag,
  Wrench,
  Hotel,
  Briefcase,
  Building2,
} from 'lucide-react';

export function LandingIndustries() {
  const industries = [
    { title: 'Restaurants & Cafés', icon: UtensilsCrossed },
    { title: 'Gyms & Fitness Centers', icon: Dumbbell },
    { title: 'Salons & Spas', icon: Sparkles },
    { title: 'Clinics & Healthcare', icon: Stethoscope },
    { title: 'Retail Stores', icon: ShoppingBag },
    { title: 'Local Services', icon: Wrench },
    { title: 'Hospitality', icon: Hotel },
    { title: 'Professional Services', icon: Briefcase },
  ];

  return (
    <section className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5" />
            WHO IS REVIEWAI FOR?
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            Built for businesses that value customer feedback.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Any customer-facing business can use a QR-based feedback experience to make sharing genuine experiences easier.
          </p>
        </div>

        {/* 8 Industry Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {industries.map((ind) => {
            const Icon = ind.icon;
            return (
              <div
                key={ind.title}
                className="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 text-center flex flex-col items-center justify-center shadow-lg group"
              >
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400 group-hover:text-amber-400 transition-colors mb-3">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-blue-300 transition-colors">
                  {ind.title}
                </h3>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
