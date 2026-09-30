import {
  QrCode,
  Smartphone,
  UserX,
  Printer,
  Sliders,
  Store,
  Receipt,
  StickyNote,
  FileText,
  Package,
} from 'lucide-react';

export function LandingQRSystem() {
  const placementExamples = [
    { title: 'Table Tent', desc: 'Dining tables and waiting areas', icon: Store },
    { title: 'Counter Display', desc: 'Front desk or billing checkout', icon: Smartphone },
    { title: 'Receipt', desc: 'Printed at the bottom of customer bills', icon: Receipt },
    { title: 'Sticker', desc: 'Mirrors, door exits, or pickup stations', icon: StickyNote },
    { title: 'Poster', desc: 'Entryways, lobbies, or studio walls', icon: FileText },
    { title: 'Packaging', desc: 'Takeaway bags, boxes, or product parcels', icon: Package },
  ];

  const features = [
    { title: 'Unique Business QR', desc: 'Generated specifically for your business location.', icon: QrCode },
    { title: 'Fast mobile experience', desc: 'Loads instantly without heavy app frameworks.', icon: Smartphone },
    { title: 'No customer login', desc: 'Zero authentication required for leaving reviews.', icon: UserX },
    { title: 'Printable and downloadable', desc: 'High-resolution formats ready for physical print.', icon: Printer },
    { title: 'Business-specific experience tags', desc: 'Reflects your actual service and business offerings.', icon: Sliders },
  ];

  return (
    <section id="qr-system" className="py-20 md:py-28 bg-slate-900/40 relative overflow-hidden border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4 uppercase tracking-wider">
            <QrCode className="w-3.5 h-3.5" />
            QR SYSTEM
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight">
            One QR code. One simple customer journey.
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Each business gets a unique QR experience that can be placed where customers naturally interact with the business.
          </p>
        </div>

        {/* Placement Examples */}
        <div className="mb-14">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center mb-6">
            Where Businesses Place Their QR
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {placementExamples.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl p-4 bg-slate-950/80 border border-slate-800 text-center flex flex-col items-center hover:border-slate-700 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-blue-400 mb-3">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-sm font-bold text-white mb-1">{item.title}</span>
                  <span className="text-[11px] text-slate-400 leading-tight">{item.desc}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5 Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="rounded-2xl p-5 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-slate-700 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h4 className="text-sm font-bold text-white mb-1.5">{feat.title}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
