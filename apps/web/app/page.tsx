import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { RidgelineMark } from "@mfr/ui";

// The hero photo is provided by the family; until it lands in public/,
// the layout stands on its own without the framed snapshot.
const HERO_PHOTO = "/lake-house.jpg";
const hasPhoto = existsSync(path.join(process.cwd(), "public", "lake-house.jpg"));

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 14h3M13 14h3M8 17.5h3" />
    </svg>
  );
}

function LedgerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 3h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M8 3v18" />
      <path d="M11.5 8h4M11.5 12h4M11.5 16h2.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

const RESERVATIONS_URL = "https://reservations.millerfamilyreunions.org/reservations";
const ACCOUNTING_URL = "https://accounting.millerfamilyreunions.org/accounting";

const apps = [
  {
    name: "Reservations",
    href: RESERVATIONS_URL,
    description: "See the calendar and book your stay at the house.",
    Icon: CalendarIcon,
    chipBg: "var(--color-accent-100)",
    chipColor: "var(--color-accent-700)",
    ctaColor: "var(--color-accent-700)",
  },
  {
    name: "Accounting",
    href: ACCOUNTING_URL,
    description: "Shares, contributions, and who's paid what.",
    Icon: LedgerIcon,
    chipBg: "var(--color-accent-2-100)",
    chipColor: "var(--color-accent-2-700)",
    ctaColor: "var(--color-accent-2-700)",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col overflow-x-hidden">
      {/* Hero: headline beside the framed family snapshot */}
      <section className="mx-auto w-full max-w-5xl px-7 pt-8 pb-5">
        <div
          className="flex flex-wrap items-center gap-11"
          style={{ animation: "fadeup .5s ease both" }}
        >
          <div className="min-w-[300px] flex-[1_1_350px]">
            <div
              className="text-xs font-bold tracking-[0.22em] uppercase"
              style={{ color: "var(--color-accent-700)" }}
            >
              Lake Lure, North Carolina
            </div>
            <h1
              className="mt-3.5"
              style={{ fontSize: "clamp(46px, 6.4vw, 70px)", lineHeight: 1.02 }}
            >
              Our place
              <br />
              on the lake.
            </h1>
            <p
              className="mt-5 max-w-[420px] text-lg leading-relaxed"
              style={{ color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}
            >
              Everything for the Miller family&rsquo;s lake house — plan your stay
              and keep the books straight, all in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={RESERVATIONS_URL}
                className="btn btn-primary px-5 py-3 font-bold"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Plan a stay
              </a>
              <a
                href={ACCOUNTING_URL}
                className="btn btn-secondary px-5 py-3 font-bold"
                style={{ fontFamily: "var(--font-body)" }}
              >
                Open the ledger
              </a>
            </div>
          </div>

          {hasPhoto && (
            <div className="relative flex min-w-[280px] flex-[0_1_400px] justify-center">
              <div
                className="absolute rounded-full"
                style={{
                  width: 340,
                  height: 340,
                  background: "var(--color-accent-2-200)",
                  top: -30,
                  right: -10,
                }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  width: 120,
                  height: 120,
                  background: "var(--color-accent-200)",
                  bottom: -24,
                  left: -6,
                }}
              />
              <figure
                className="relative z-[1] bg-white p-3.5"
                style={{
                  borderRadius: "var(--radius-md)",
                  boxShadow: "var(--shadow-lg)",
                  transform: "rotate(1.6deg)",
                  width: "min(400px, 86vw)",
                }}
              >
                <div
                  className="washed overflow-hidden"
                  style={{ borderRadius: "calc(var(--radius-md) - 6px)" }}
                >
                  <Image
                    src={HERO_PHOTO}
                    alt="The Miller family gathered on the dock at Lake Lure"
                    width={1600}
                    height={1200}
                    priority
                    sizes="(min-width: 1024px) 28rem, 24rem"
                  />
                </div>
                <figcaption
                  className="px-1 pt-3 pb-1 text-center text-xs"
                  style={{ color: "var(--color-neutral-600)" }}
                >
                  The whole crew, on the dock
                </figcaption>
              </figure>
            </div>
          )}
        </div>
      </section>

      {/* Ridgeline divider — the portal's mark, quietly repeated */}
      <div className="flex flex-col items-center gap-2.5 pt-11 pb-2">
        <RidgelineMark
          className="h-10 w-10"
          style={{ color: "var(--color-accent-2)" }}
        />
      </div>

      {/* App cards */}
      <section id="apps" className="mx-auto w-full max-w-[900px] px-7 pt-3 pb-5">
        <h2
          className="text-center text-[15px] font-bold tracking-[0.02em]"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-neutral-700)",
          }}
        >
          Two things to do here
        </h2>
        <div className="mt-5 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
          {apps.map(({ name, href, description, Icon, chipBg, chipColor, ctaColor }) => (
            <a
              key={name}
              href={href}
              className="appcard card elev-sm bg-white p-7 text-inherit no-underline"
              style={{ gap: 0 }}
            >
              <span
                className="flex h-14 w-14 items-center justify-center rounded-full"
                style={{ background: chipBg, color: chipColor }}
              >
                <Icon className="h-7 w-7" />
              </span>
              <h3 className="mt-5 text-2xl">{name}</h3>
              <p
                className="mt-2 text-[15px] leading-relaxed"
                style={{ color: "color-mix(in srgb, var(--color-text) 70%, transparent)" }}
              >
                {description}
              </p>
              <span
                className="appcta mt-5 inline-flex items-center gap-[7px] font-bold"
                style={{ color: ctaColor }}
              >
                Open {name}
                <ArrowIcon />
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
