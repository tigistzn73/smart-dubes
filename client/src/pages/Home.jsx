import React, { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
  NotebookPen,
  Fingerprint,
  ShieldCheck,
  BellRing,
  CreditCard,
  Gavel,
  Store,
  UserCheck,
  ShieldHalf,
  Wallet,
  ReceiptText,
  MessageSquare,
  AlarmClock,
  CheckCircle2,
  ArrowRight,
  BarChart3,
  Globe,
  Lock,
  Smartphone,
  Banknote,
  ScanLine,
  TrendingUp
} from 'lucide-react';

const FEATURES = [
  {
    icon: NotebookPen,
    accent: 'from-emerald-500/20 to-emerald-500/0 border-emerald-500/30',
    ring: 'text-emerald-500',
    title: { en: 'Digital Dube Ledger', am: 'ዲጂታል የዱቤ ሌጀር' },
    body: {
      en: 'Replace fragile paper notebooks with a secure, searchable and cloud-backed credit ledger that never gets lost or altered.',
      am: 'የሚጠፋ ወይም የሚለወጥ የወረቀት ደብተር በሚተካ ደህንነቱ የተጠበቀ የዱቤ ሌጀር።'
    }
  },
  {
    icon: Fingerprint,
    accent: 'from-amber-500/20 to-amber-500/0 border-amber-500/30',
    ring: 'text-amber-500',
    title: { en: 'Fayda National ID KYC', am: 'የፋይዳ መታወቂያ ማረጋገጫ' },
    body: {
      en: 'Verify every customer against Ethiopia\u2019s Fayda National ID before you extend any credit, so trust is confirmed not assumed.',
      am: 'ዱቤ ከመስጠትዎ በፊት ደንበኛውን በፋይዳ መታወቂያ ያረጋግጡ።'
    }
  },
  {
    icon: ShieldCheck,
    accent: 'from-sky-500/20 to-sky-500/0 border-sky-500/30',
    ring: 'text-sky-500',
    title: { en: 'Smart Credit Limits', am: 'የዱቤ ጣሪያ ቁጥጥር' },
    body: {
      en: 'Assign per-customer credit limits and live balances that stop debt from growing beyond what a shop can safely carry.',
      am: 'ለየደንበኛ የዱቤ ጣሪያ እና የቀሪ ሂሳብ በመመደብ ዕዳ እንዳይጋግር ይከላከሉ።'
    }
  },
  {
    icon: BellRing,
    accent: 'from-orange-500/20 to-orange-500/0 border-orange-500/30',
    ring: 'text-orange-500',
    title: { en: 'Automated SMS Reminders', am: 'ራስ-ሰር የSMS ማሳሰቢያ' },
    body: {
      en: 'Due-date and overdue reminders reach customers over Twilio or Africa\u2019s Talking long before a debt turns into a problem.',
      am: 'የመክፈያ ቀን እና ያለፈበት ማሳሰቢያ በራስ-ሰር ወደ ደንበኛ ይላካል።'
    }
  },
  {
    icon: CreditCard,
    accent: 'from-teal-500/20 to-teal-500/0 border-teal-500/30',
    ring: 'text-teal-500',
    title: { en: 'Multi-Gateway Repayment', am: 'በብዙ መንገድ ክፍያ' },
    body: {
      en: 'Customers settle debt with Telebirr, CBE Birr, Chapa, cash or a receipt upload \u2014 every payment recorded and approved.',
      am: 'ደንበኞች በቴሌብር፣ በሲቢኢ ብር፣ በቻፓ ወይም በጥሬ ገንዘብ ይክፈሉ።'
    }
  },
  {
    icon: Gavel,
    accent: 'from-rose-500/20 to-rose-500/0 border-rose-500/30',
    ring: 'text-rose-500',
    title: { en: 'Court Letter Escalation', am: 'የፍርድ ቤት ደብዳቤ' },
    body: {
      en: 'A structured escalation ladder sends formal warning and court letters automatically when a debt stays unpaid.',
      am: 'ዕዳ ሲቀር ማስጠንቀቂያ እና የፍርድ ቤት ደብዳቤ በራስ-ሰር ይላካል።'
    }
  }
];

const SHOWCASE = [
  {
    icon: Store,
    title: { en: 'Merchant Ledger', am: 'የነጋዴ ሌጀር' },
    desc: { en: 'Customers, sales & balances', am: 'ደንበኞች፣ ሽያጭ እና ቀሪ ሂሳብ' },
    pos: '20% 30%',
    wash: 'from-emerald-900/60 via-emerald-950/70'
  },
  {
    icon: Wallet,
    title: { en: 'Customer Portal', am: 'የደንበኛ ፖርታል' },
    desc: { en: 'Balance, history & repayment', am: 'ቀሪ ሂሳብ እና ክፍያ' },
    pos: '70% 40%',
    wash: 'from-sky-900/60 via-sky-950/70'
  },
  {
    icon: ReceiptText,
    title: { en: 'Dube Sales', am: 'የዱቤ ሽያጭ' },
    desc: { en: 'Log items, totals & due dates', am: 'ዕቃ፣ ጠቅላላና ቀን ይመዝግቡ' },
    pos: '35% 65%',
    wash: 'from-yellow-900/60 via-amber-950/70'
  },
  {
    icon: Banknote,
    title: { en: 'Payment Gateways', am: 'የክፍያ መንገዶች' },
    desc: { en: 'Telebirr, CBE Birr & Chapa', am: 'ቴሌብር፣ ሲቢኢ ብር እና ቻፓ' },
    pos: '55% 20%',
    wash: 'from-teal-900/60 via-teal-950/70'
  },
  {
    icon: MessageSquare,
    title: { en: 'SMS Center', am: 'የSMS ማዕከል' },
    desc: { en: 'Reminders & notifications', am: 'ማሳሰቢያዎች' },
    pos: '80% 70%',
    wash: 'from-amber-900/60 via-orange-950/70'
  },
  {
    icon: Gavel,
    title: { en: 'Escalation Desk', am: 'የመውጣት ሂደት' },
    desc: { en: 'Warnings & court letters', am: 'ማስጠንቀቂያ እና ደብዳቤ' },
    pos: '15% 80%',
    wash: 'from-rose-900/60 via-rose-950/70'
  }
];

const ROLES = [
  {
    icon: Store,
    name: { en: 'Merchants', am: 'ነጋዴዎች' },
    tag: 'text-[var(--home-accent)]',
    border: 'border-emerald-500/30',
    points: {
      en: ['Register customers with Fayda ID', 'Log Dube sales in seconds', 'Send reminders & court letters'],
      am: ['ደንበኞችን በፋይዳ ይመዝግቡ', 'ዱቤ በፍጥነት ይመዝግቡ', 'ማሳሰቢያ ይላኩ']
    }
  },
  {
    icon: UserCheck,
    name: { en: 'Customers', am: 'ደንበኞች' },
    tag: 'text-[var(--home-accent2)]',
    border: 'border-amber-500/30',
    points: {
      en: ['See your full balance', 'Track every Dube receipt', 'Repay digitally anytime'],
      am: ['ሙሉ ቀሪ ሂሳብዎን ይመልከቱ', 'ደረሰኞችን ይከታተሉ', 'በዲጂታል ይክፈሉ']
    }
  },
  {
    icon: ShieldHalf,
    name: { en: 'Administrators', am: 'አስተዳዳሪዎች' },
    tag: 'text-[var(--home-accent3)]',
    border: 'border-sky-500/30',
    points: {
      en: ['Approve merchant KYC', 'Monitor payment gateways', 'Read the immutable audit trail'],
      am: ['KYC ያጽድቁ', 'የክፍያ መንገዶችን ይከታተሉ', 'የኦዲት ታሪክ ይመልከቱ']
    }
  }
];

const STEPS = [
  {
    icon: Store,
    title: { en: 'Register your shop', am: 'ሱቅዎን ይመዝግቡ' },
    body: { en: 'A merchant signs up and completes business KYC verification.', am: 'ነጋዴው ተመዝግቦ የKYC ማረጋገጫ ያጠናቅቃል።' }
  },
  {
    icon: ScanLine,
    title: { en: 'Add trusted customers', am: 'የሚታመኑ ደንበኞች' },
    body: { en: 'Register customers with Fayda ID and set a credit limit for each.', am: 'ደንበኞችን በፋይዳ መታወቂያ መዝግበው ጣሪያ ያስቀምጡ።' }
  },
  {
    icon: ReceiptText,
    title: { en: 'Log a Dube sale', am: 'ዱቤ ይመዝግቡ' },
    body: { en: 'Record the items, total amount and due date in a few taps.', am: 'ዕቃ፣ ጠቅላላና ቀን በጥቂት ንክኪ ይመዝግቡ።' }
  },
  {
    icon: TrendingUp,
    title: { en: 'Track & collect', am: 'ይከታተሉ እና ይሰብስቡ' },
    body: { en: 'Customers repay digitally while reminders and escalations run themselves.', am: 'ደንበኞች ይክፈላሉ፤ ማሳሰቢያዎች በራስ-ሰር ይሠራሉ።' }
  }
];

const GATEWAYS = ['Telebirr', 'CBE Birr', 'Chapa', 'Cash', 'Receipt Upload'];

export const Home = ({ onGetStarted }) => {
  const { lang, activeTheme } = useTheme();
  const t = (en, am) => (lang === 'EN' ? en : am);
  const scrollToFeatures = (e) => {
    e.preventDefault();
    document.getElementById('home-features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleGetStarted = () => {
    onGetStarted();
  };

  return (
    <div className="home-page w-full bg-[var(--home-bg)] text-[var(--home-text)] flex flex-col overflow-hidden">
      {/* ======================= HERO ======================= */}
      <section className="relative w-full aspect-[16/9] sm:aspect-[21/9] min-h-[50vh] max-h-[80vh] bg-gradient-to-br from-emerald-900/30 via-[var(--home-bg)] to-amber-900/20">
        <div className="home-hero-scrim absolute inset-0" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[var(--home-accent)] text-[11px] font-bold mb-5">
            <Globe className="w-3.5 h-3.5" />
            {t('Digital Dube for Ethiopian Merchants', 'ለኢትዮጵያ ነጋዴዎች ዲጂታል ዱቤ')}
          </div>

          <h1 className="home-heading text-4xl sm:text-6xl font-black tracking-tight bg-clip-text text-transparent">
            Smart Dube
          </h1>
          <p className="mt-3 text-base sm:text-xl font-bold text-[var(--home-soft)]">
            {t('Buy Now, Pay Later & Digital Ledger System', 'ዱቤ እና ዲጂታል ሌጀር ስርዓት')}
          </p>
          <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed text-[var(--home-muted)]">
            {t(
              'Smart Dube turns the trusted neighborhood Dube notebook into a secure digital platform. Verify customers with Fayda ID, set credit limits, log every credit sale, send automatic SMS reminders and collect repayments through Telebirr, CBE Birr and Chapa — all in one place.',
              'ስማርት ዱቤ የአካባቢውን የዱቤ ደብተር ደህንነቱ የተጠበቀ ዲጂታል ስርዓት ይለውጠዋል። ደንበኞችን በፋይዳ ያረጋግጡ፣ ጣሪያ ያስቀምጡ፣ ሽያጭ ይመዝግቡ፣ ማሳሰቢያ ይላኩ እና ክፍያ ይሰብስቡ።'
            )}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleGetStarted}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:via-teal-400 hover:to-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.03] active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('Get Started Free', 'ነጻ ይጀምሩ')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <a
              href="#home-features"
              onClick={scrollToFeatures}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-[var(--home-card-soft)] hover:bg-[var(--home-card)] border border-[var(--home-border)] hover:border-[var(--home-border-strong)] text-[var(--home-soft)] font-bold text-sm transition-all flex items-center justify-center gap-2"
            >
              {t('Explore Features', 'ባህሪያትን ይመልከቱ')}
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {['Fayda KYC', 'Secured', 'Audit Trail', 'SMS Reminders'].map((chip) => (
              <span key={chip} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--home-card)] border border-[var(--home-border)] text-[var(--home-soft)] text-[11px] font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--home-accent)]" />
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ======================= STATS ======================= */}
      <section className="w-full border-y border-[var(--home-border)] bg-[var(--home-bg-alt)]">
        <div className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-5 text-center">
          {[
            { value: '3', label: t('User Roles', 'የተጠቃሚ ሚናዎች') },
            { value: '4+', label: t('Payment Channels', 'የክፍያ መንገዶች') },
            { value: '24/7', label: t('SMS Reminders', 'የSMS ማሳሰቢያ') },
            { value: '100%', label: t('Digital Audit Trail', 'ዲጂታል ኦዲት') }
          ].map((stat) => (
            <div key={stat.label}>
              <p className="home-stat-value text-2xl sm:text-3xl font-black bg-clip-text text-transparent">{stat.value}</p>
              <p className="mt-1 text-[11px] sm:text-xs font-semibold text-[var(--home-muted)] uppercase tracking-wide">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ======================= SCROLLING IMAGE SHOWCASE ======================= */}
      <section className="w-full bg-[var(--home-showcase-bg)] py-12 sm:py-16">
        <div className="max-w-5xl mx-auto px-4 text-center mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--home-showcase-eyebrow)]">
            {t('One Platform, Every Screen', 'አንድ ስርዓት፣ ለሁሉም')}
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--home-showcase-text)]">
            {t('Built for merchants, customers and admins', 'ለነጋዴዎች፣ ለደንበኞች እና ለአስተዳዳሪዎች')}
          </h2>
        </div>

        <div className="home-marquee-mask overflow-hidden">
          <div className="home-marquee flex gap-5 w-max pb-2">
            {[...SHOWCASE, ...SHOWCASE].map((item, index) => {
              const Icon = item.icon;
              const colors = [
                'from-emerald-900/60 via-emerald-950/70',
                'from-sky-900/60 via-sky-950/70',
                'from-yellow-900/60 via-amber-950/70',
                'from-teal-900/60 via-teal-950/70',
                'from-amber-900/60 via-orange-950/70',
                'from-rose-900/60 via-rose-950/70'
              ];
              return (
                <article
                  key={`${item.title.en}-${index}`}
                  className="group relative w-72 shrink-0 rounded-2xl overflow-hidden border border-[var(--home-showcase-border)] hover:border-emerald-500/40 transition-all shadow-lg"
                >
                  <div
                    style={{ background: `linear-gradient(to bottom right, ${colors[index % colors.length]})` }}
                    className="w-full h-44 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-between p-3.5">
                    <div className="flex justify-end">
                      <span className="w-8 h-8 rounded-lg bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-emerald-300" />
                      </span>
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#FFFFFF]">{t(item.title.en, item.title.am)}</h3>
                      <p className="text-[11px] text-[#FFFFFF]/80">{t(item.desc.en, item.desc.am)}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================= FEATURES ======================= */}
      <section id="home-features" className="w-full border-t border-[var(--home-border)] bg-[var(--home-bg-alt)] py-14 sm:py-20 scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--home-accent2)]">
              {t('Everything a Shop Needs', 'ሱቅ የሚፈልገው ሁሉ')}
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--home-text)]">
              {t('Six features that modernize Dube', 'ዱቤን ዘመናዊ የሚያደርጉ ስድስት ባህሪያት')}
            </h2>
            <p className="mt-3 max-w-2xl mx-auto text-sm text-[var(--home-muted)]">
              {t(
                'From customer verification to final collection, every step of the credit journey is covered and auditable.',
                'ከደንበኛ ማረጋገጫ እስከ ስብስብ ድረስ ያለው ሂደት ሙሉ በሙሉ ይሸፈናል።'
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title.en}
                  className={`rounded-2xl border bg-gradient-to-br ${feature.accent} bg-[var(--home-card)] p-5 hover:-translate-y-1 transition-transform duration-300`}
                >
                  <span className="w-11 h-11 rounded-xl bg-[var(--home-bg-alt)] border border-[var(--home-border)] flex items-center justify-center mb-4">
                    <Icon className={`w-5 h-5 ${feature.ring}`} />
                  </span>
                  <h3 className="text-base font-extrabold text-[var(--home-text)]">{t(feature.title.en, feature.title.am)}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--home-muted)]">{t(feature.body.en, feature.body.am)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================= HOW IT WORKS ======================= */}
      <section className="w-full py-14 sm:py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--home-accent)]">
              {t('How It Works', 'እንዴት ይሠራል')}
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--home-text)]">
              {t('From first Dube to final settlement', 'ከመጀመሪያ ዱቤ እስከ መጨረሻ ክፍያ')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title.en} className="relative rounded-2xl border border-[var(--home-border)] bg-[var(--home-card)] p-5">
                  <span className="absolute -top-3 left-5 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-yellow-500 text-[#0B0F19] text-xs font-black flex items-center justify-center shadow-lg">
                    {index + 1}
                  </span>
                  <Icon className="w-6 h-6 text-[var(--home-accent)] mt-2 mb-3" />
                  <h3 className="text-sm font-extrabold text-[var(--home-text)]">{t(step.title.en, step.title.am)}</h3>
                  <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--home-muted)]">{t(step.body.en, step.body.am)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================= ROLES ======================= */}
      <section className="w-full border-y border-[var(--home-border)] bg-[var(--home-bg-alt)] py-14 sm:py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--home-accent3)]">
              {t('Three Roles, One System', 'ሦስት ሚናዎች፣ አንድ ስርዓት')}
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--home-text)]">
              {t('A dedicated workspace for everyone', 'ለሁሉም የተዘጋጀ የራሱ የሥራ ቦታ')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {ROLES.map((role) => {
              const Icon = role.icon;
              return (
                <div key={role.name.en} className={`rounded-2xl border ${role.border} bg-[var(--home-card)] p-6 flex flex-col`}>
                  <span className="w-12 h-12 rounded-xl bg-[var(--home-bg-alt)] border border-[var(--home-border)] flex items-center justify-center mb-4">
                    <Icon className={`w-6 h-6 ${role.tag}`} />
                  </span>
                  <h3 className="text-lg font-extrabold text-[var(--home-text)]">{t(role.name.en, role.name.am)}</h3>
                  <ul className="mt-4 space-y-2.5 flex-1">
                    {role.points[lang === 'EN' ? 'en' : 'am'].map((point) => (
                      <li key={point} className="flex items-start gap-2 text-[13px] text-[var(--home-soft)]">
                        <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${role.tag}`} />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ======================= GATEWAYS ======================= */}
      <section className="w-full py-12">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--home-faint)] mb-5">
            {t('Repayments accepted through', 'ክፍያ የሚቀበልባቸው')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {GATEWAYS.map((gateway) => (
              <span
                key={gateway}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--home-card)] border border-[var(--home-border)] text-[var(--home-soft)] text-xs font-bold"
              >
                <Smartphone className="w-3.5 h-3.5 text-[var(--home-accent)]" />
                {gateway}
              </span>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-5 text-[11px] text-[var(--home-faint)] font-semibold">
            <span className="inline-flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" />{t('Secured', 'የተጠበቀ')}</span>
            <span className="inline-flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" />{t('Real-time Balances', 'ቀጥታ ቀሪ ሂሳብ')}</span>
            <span className="inline-flex items-center gap-1.5"><AlarmClock className="w-3.5 h-3.5" />{t('Due-date Alerts', 'የቀን ማሳሰቢያ')}</span>
          </div>
        </div>
      </section>

      {/* ======================= FINAL CTA ======================= */}
      <section className="w-full px-4 pb-16">
        <div className="max-w-4xl mx-auto rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 via-[var(--home-card)] to-amber-500/10 p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-black text-[var(--home-text)]">
            {t('Ready to digitize your Dube?', 'ዱቤዎን ዲጂታል ለማድረግ ተዘጋጅተዋል?')}
          </h2>
          <p className="mt-3 max-w-xl mx-auto text-sm text-[var(--home-soft)]">
            {t(
              'Join the merchants replacing paper ledgers with transparent, secure and mobile-friendly credit management.',
              'ወረቀት ሌጀርን በግልጽ፣ ደህንነቱ የተጠበቀ እና በሞባይል ተግባራዊ በሆነ የዱቤ አስተዳደር ይተኩ።'
            )}
          </p>
          <button
            onClick={handleGetStarted}
            className="mt-6 px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:via-teal-400 hover:to-emerald-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/30 hover:scale-[1.03] active:scale-95 transition-all inline-flex items-center gap-2 cursor-pointer"
          >
            <span>{t('Create Your Account', 'መለያ ይክፈቱ')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ======================= FOOTER ======================= */}
      <footer className="w-full border-t border-[var(--home-border)] bg-[var(--home-bg-alt)]">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 via-yellow-500 to-rose-500 p-0.5 flex items-center justify-center">
              <span className="w-full h-full bg-[var(--home-bg)] rounded-[6px] flex items-center justify-center text-[10px] font-black text-amber-500">ET</span>
            </div>
            <span className="text-sm font-extrabold text-[var(--home-text)]">Smart Dube</span>
          </div>
          <p className="text-[11px] text-[var(--home-faint)]">
            Copyright &copy; 2022 - 2026 All Rights Reserved - Developed By Tigist Zinabu.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
