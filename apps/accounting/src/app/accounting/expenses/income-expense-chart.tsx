import { computeIncomeExpenseChart, type YearFinancials } from "@/lib/expenseChart";

const SERIES_COLORS = {
  contributions: "#aebf92",
  operating: "#d67f48",
  capital: "#643312",
} as const;

const LINE_COLOR = "#8c491a";
const TICK_COLOR = "#82796a";

/**
 * The "Income vs. expenses by year" combo chart — plain server-rendered SVG.
 * Geometry and math come from @/lib/expenseChart (ported from the design
 * prototype); hover tooltips are native <title> elements on every bar
 * segment and line point.
 */
export function IncomeExpenseChart({ data }: { data: YearFinancials[] }) {
  const chart = computeIncomeExpenseChart(data);

  return (
    <>
      <div className="mt-2.5 mb-4 flex flex-wrap gap-4">
        <span className="flex items-center gap-[7px] text-[13px]">
          <span className="h-[13px] w-[13px] rounded" style={{ background: SERIES_COLORS.contributions }} />
          Contributions in
        </span>
        <span className="flex items-center gap-[7px] text-[13px]">
          <span className="h-[13px] w-[13px] rounded" style={{ background: SERIES_COLORS.operating }} />
          Operating expenses
        </span>
        <span className="flex items-center gap-[7px] text-[13px]">
          <span className="h-[13px] w-[13px] rounded" style={{ background: SERIES_COLORS.capital }} />
          Capital investment
        </span>
        <span className="flex items-center gap-[7px] text-[13px]">
          <span className="h-[3px] w-[18px] rounded-sm" style={{ background: LINE_COLOR }} />
          Cumulative change
        </span>
      </div>

      <svg viewBox="0 0 660 240" width="100%" style={{ height: "auto", overflow: "visible", display: "block" }}>
        {chart.gridTicks.map((tick, i) => (
          <g key={`tick-${i}`}>
            <line x1={54} y1={tick.y} x2={598} y2={tick.y} stroke="var(--color-divider)" strokeWidth={1} />
            <text x={46} y={tick.y} fontSize={11} fill={TICK_COLOR} textAnchor="end" dominantBaseline="middle">
              {tick.leftLabel}
            </text>
            <text x={606} y={tick.y} fontSize={11} fill={LINE_COLOR} textAnchor="start" dominantBaseline="middle">
              {tick.rightLabel}
            </text>
          </g>
        ))}
        {chart.bars.map((bar, i) => (
          <rect
            key={`bar-${i}`}
            className="iebar"
            x={bar.x}
            y={bar.y}
            width={bar.w}
            height={bar.h}
            rx={Math.min(5, bar.w / 2, bar.h / 2)}
            fill={SERIES_COLORS[bar.kind]}
          >
            <title>{bar.title}</title>
          </rect>
        ))}
        <polyline
          points={chart.linePoints}
          fill="none"
          stroke={LINE_COLOR}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
        {chart.dots.map((dot, i) => (
          <g key={`dot-${i}`}>
            <circle cx={dot.cx} cy={dot.cy} r={11} fill="transparent" style={{ cursor: "default" }}>
              <title>{dot.title}</title>
            </circle>
            <circle cx={dot.cx} cy={dot.cy} r={chart.dotR} fill={LINE_COLOR} style={{ pointerEvents: "none" }} />
          </g>
        ))}
        {chart.yearLabels.map((label) => (
          <text
            key={label.label}
            x={label.x}
            y={210}
            fontSize={13}
            fontWeight={600}
            fill={TICK_COLOR}
            textAnchor="middle"
          >
            {label.label}
          </text>
        ))}
      </svg>

      <p className="text-muted mt-2.5 mb-0 text-[11px]">
        Left axis: annual dollars (bars). Right axis: cumulative net change across the years shown
        (line). Hover any bar or point for the exact figure.
      </p>
    </>
  );
}
