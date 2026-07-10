import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import { RidgelineMark } from "@mfr/ui";

// The hero photo is provided by the family; until it lands in public/,
// the lake-gradient treatment stands on its own.
const HERO_PHOTO = "/lake-house.jpg";
const hasPhoto = existsSync(path.join(process.cwd(), "public", "lake-house.jpg"));

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
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
      strokeWidth="1.75"
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

const apps = [
  {
    name: "Reservations",
    href: "https://reservations.millerfamilyreunions.org/reservations",
    description: "See the calendar and book your stay at the house.",
    Icon: CalendarIcon,
  },
  {
    name: "Accounting",
    href: "https://accounting.millerfamilyreunions.org/accounting",
    description: "Shares, contributions, and who's paid what.",
    Icon: LedgerIcon,
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Hero: headline beside the family snapshot */}
      <section className="bg-gradient-to-b from-lake-950 via-lake-900 to-lake-800">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-4 py-16 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <p className="text-xs font-medium tracking-[0.25em] text-lake-200 uppercase">
              Lake Lure, North Carolina
            </p>
            <h1 className="font-display mt-3 text-4xl font-semibold text-sand-50 sm:text-5xl">
              Our place on the lake.
            </h1>
            <p className="mt-4 max-w-md text-base text-lake-100">
              Everything for the Miller family&rsquo;s lake house — plan your
              stay and keep the books straight.
            </p>
          </div>
          {hasPhoto && (
            <figure className="w-full max-w-sm shrink-0 rotate-1 rounded-md bg-white p-3 shadow-xl shadow-lake-950/40 transition-transform hover:rotate-0 lg:max-w-md">
              <Image
                src={HERO_PHOTO}
                alt="The Miller family gathered on the dock at Lake Lure"
                width={1600}
                height={1200}
                priority
                sizes="(min-width: 1024px) 28rem, 24rem"
                className="rounded-sm"
              />
              <figcaption className="pt-2 pb-1 text-center text-xs text-stone-500">
                The whole crew, on the dock
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* Ridgeline divider — the portal's mark, quietly repeated */}
      <div className="flex justify-center bg-sand-50 pt-10">
        <RidgelineMark className="h-8 w-8 text-lake-300" />
      </div>

      {/* App cards */}
      <section className="bg-sand-50 px-4 pt-8 pb-16">
        <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
          {apps.map(({ name, href, description, Icon }) => (
            <a
              key={name}
              href={href}
              className="group rounded-xl border border-sand-200 bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-lake-300 hover:shadow-md hover:shadow-lake-900/5"
            >
              <Icon className="h-8 w-8 text-lake-600" />
              <h2 className="font-display mt-4 text-xl font-semibold text-stone-900">
                {name}
              </h2>
              <p className="mt-1.5 text-sm text-stone-600">{description}</p>
              <span className="mt-4 inline-block text-sm font-medium text-lake-700 group-hover:text-lake-600">
                Open {name} &rarr;
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
