import { describe, expect, it } from "bun:test";
import { AppError } from "../../lib/errors";
import {
  buildSeries,
  changePercent,
  granularityFor,
  kpi,
  moneyKpi,
  percentOf,
  periodLabel,
  resolveReportRange,
  seriesBuckets,
} from "./range";

describe("resolveReportRange", () => {
  it("defaults to the last N days ending today and derives the previous period", () => {
    const range = resolveReportRange({}, 7, "2026-09-26");
    expect(range).toMatchObject({
      from: "2026-09-20",
      to: "2026-09-26",
      previousFrom: "2026-09-13",
      previousTo: "2026-09-19",
      granularity: "day",
      days: 7,
      timezone: "Asia/Dhaka",
    });
  });

  it("fills a missing bound from the other one", () => {
    expect(resolveReportRange({ to: "2026-03-10" }, 30, "2026-09-26")).toMatchObject({ from: "2026-02-09", to: "2026-03-10" });
    expect(resolveReportRange({ from: "2026-09-01" }, 30, "2026-09-26")).toMatchObject({ from: "2026-09-01", to: "2026-09-26" });
  });

  it("crosses month and leap-year boundaries for the previous period", () => {
    const range = resolveReportRange({ from: "2028-03-01", to: "2028-03-31" }, 7);
    expect(range.previousTo).toBe("2028-02-29");
    expect(range.previousFrom).toBe("2028-01-30");
    expect(range.days).toBe(31);
  });

  it("switches to month buckets above 92 days and rejects more than 366 days", () => {
    expect(resolveReportRange({ from: "2026-01-01", to: "2026-04-02" }, 7).granularity).toBe("day"); // 92 days
    expect(resolveReportRange({ from: "2026-01-01", to: "2026-04-03" }, 7).granularity).toBe("month"); // 93 days
    expect(resolveReportRange({ from: "2026-01-01", to: "2027-01-01" }, 7).days).toBe(366);
    expect(() => resolveReportRange({ from: "2026-01-01", to: "2027-01-02" }, 7)).toThrow(AppError);
    expect(() => resolveReportRange({ from: "2026-02-02", to: "2026-02-01" }, 7)).toThrow(AppError);
  });
});

describe("series helpers", () => {
  it("labels days and months", () => {
    expect(periodLabel("2026-09-05", "day")).toBe("Sep 5");
    expect(periodLabel("2026-09", "month")).toBe("Sep 2026");
    expect(granularityFor(92)).toBe("day");
    expect(granularityFor(93)).toBe("month");
  });

  it("emits every bucket, including partial edge months", () => {
    const buckets = seriesBuckets({ from: "2025-12-15", to: "2026-03-02", granularity: "month" });
    expect(buckets.map((bucket) => bucket.period)).toEqual(["2025-12", "2026-01", "2026-02", "2026-03"]);
    expect(seriesBuckets({ from: "2026-02-27", to: "2026-03-01", granularity: "day" }).map((b) => b.label)).toEqual([
      "Feb 27",
      "Feb 28",
      "Mar 1",
    ]);
  });

  it("zero-fills and sums daily rows into month buckets", () => {
    const series = buildSeries(
      { from: "2026-01-30", to: "2026-03-01", granularity: "month" },
      [
        { date: "2026-01-30", values: { revenue: 100, orders: 1 } },
        { date: "2026-01-31", values: { revenue: 50, orders: 2 } },
        { date: "2026-03-01", values: { revenue: 7, orders: 1 } },
      ],
      () => ({ revenue: 0, orders: 0 }),
    );
    expect(series).toEqual([
      { period: "2026-01", label: "Jan 2026", revenue: 150, orders: 3 },
      { period: "2026-02", label: "Feb 2026", revenue: 0, orders: 0 },
      { period: "2026-03", label: "Mar 2026", revenue: 7, orders: 1 },
    ]);
  });
});

describe("KPI and percentage math", () => {
  it("returns null change without a baseline and uses |previous| for negative baselines", () => {
    expect(kpi(10, 0)).toEqual({ value: 10, previous: 0, changePercent: null });
    expect(changePercent(150, 100)).toBe(50);
    expect(changePercent(50, 150)).toBe(-66.67);
    expect(changePercent(344.5, -740)).toBe(146.55);
  });

  it("is exact on money held in paisa", () => {
    expect(moneyKpi(206_500, 46_000)).toEqual({ value: 2065, previous: 460, changePercent: 348.91 });
  });

  it("never divides by zero", () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(795, 2065)).toBe(38.5);
    expect(percentOf(-740, 460)).toBe(-160.87);
  });
});
