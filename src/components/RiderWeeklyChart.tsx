import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OrderRecord } from '../types';

interface RiderWeeklyChartProps {
  riderUid: string;
  orders: Record<string, OrderRecord>;
  baseFee: number;
}

type ChartViewMode = 'both' | 'earnings' | 'trips';

interface WeeklyDayPoint {
  dateKey: string;
  dayLabel: string;
  shortDate: string;
  fullDate: string;
  isToday: boolean;
  isFuture: boolean;
  earnings: number;
  trips: number;
  cumulativeEarnings: number | null;
}

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function RiderWeeklyChart({
  riderUid,
  orders,
  baseFee,
}: RiderWeeklyChartProps) {
  const [viewMode, setViewMode] = useState<ChartViewMode>('both');

  const {
    days,
    weekRangeLabel,
    currWeekEarnings,
    currWeekTrips,
    prevWeekEarnings,
    prevWeekTrips,
    earningsGrowthPct,
    avgPerTrip,
    peakDay,
  } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    const mondayMs = monday.getTime();

    const prevMonday = new Date(monday);
    prevMonday.setDate(monday.getDate() - 7);
    const prevMondayMs = prevMonday.getTime();

    const buckets: WeeklyDayPoint[] = [];
    const bucketMap: Record<string, WeeklyDayPoint> = {};

    for (let offset = 0; offset < 7; offset++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + offset);
      const ms = d.getTime();
      const key = toLocalDateKey(ms);
      const point: WeeklyDayPoint = {
        dateKey: key,
        dayLabel: d.toLocaleDateString('en-IN', { weekday: 'short' }),
        shortDate: d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        }),
        fullDate: d.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        isToday: ms === todayMs,
        isFuture: ms > todayMs,
        earnings: 0,
        trips: 0,
        cumulativeEarnings: null,
      };
      buckets.push(point);
      bucketMap[key] = point;
    }

    let currEarn = 0;
    let currTripsCount = 0;
    let prevEarn = 0;
    let prevTripsCount = 0;

    Object.values(orders).forEach((o) => {
      if (o.deliveryUid !== riderUid || o.status !== 'DELIVERED') return;
      const ts = Number(o.updatedAt || o.createdAt || 0);
      if (!ts) return;

      const fee =
        o.deliveryCharge !== undefined && Number(o.deliveryCharge) > 0
          ? Number(o.deliveryCharge)
          : baseFee;

      const bucket = bucketMap[toLocalDateKey(ts)];
      if (bucket) {
        bucket.earnings = Number((bucket.earnings + fee).toFixed(2));
        bucket.trips += 1;
        currEarn += fee;
        currTripsCount += 1;
      } else if (ts >= prevMondayMs && ts < mondayMs) {
        prevEarn += fee;
        prevTripsCount += 1;
      }
    });

    let runningTotal = 0;
    let bestDay: WeeklyDayPoint | null = null;
    buckets.forEach((b) => {
      runningTotal = Number((runningTotal + b.earnings).toFixed(2));
      if (!b.isFuture || b.earnings > 0) {
        b.cumulativeEarnings = runningTotal;
      }
      if (!bestDay || b.earnings > bestDay.earnings || (b.earnings === bestDay.earnings && b.trips > bestDay.trips)) {
        bestDay = b;
      }
    });

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const rangeText = `${monday.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })} – ${sunday.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
    })}`;

    const growthPct =
      prevEarn > 0
        ? Math.round(((currEarn - prevEarn) / prevEarn) * 100)
        : null;

    return {
      days: buckets,
      weekRangeLabel: rangeText,
      currWeekEarnings: currEarn,
      currWeekTrips: currTripsCount,
      prevWeekEarnings: prevEarn,
      prevWeekTrips: prevTripsCount,
      earningsGrowthPct: growthPct,
      avgPerTrip: currTripsCount > 0 ? currEarn / currTripsCount : 0,
      peakDay: bestDay as WeeklyDayPoint | null,
    };
  }, [orders, riderUid, baseFee]);

  const tripsDelta = currWeekTrips - prevWeekTrips;

  return (
    <div className="rider-weekly-chart-box">
      <div className="rider-weekly-chart-header">
        <div>
          <div className="rider-weekly-chart-title">
            <i
              className="fa-solid fa-chart-column"
              style={{ color: '#0284c7' }}
            ></i>
            <span>Current Week Performance</span>
          </div>
          <div className="rider-weekly-chart-subtitle">
            {weekRangeLabel} · Earnings growth &amp; completed trips
          </div>
        </div>

        <div
          className="rider-chart-segmented"
          role="tablist"
          aria-label="Rider weekly chart metric"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'both'}
            className={`rider-chart-seg-btn ${viewMode === 'both' ? 'active' : ''}`}
            onClick={() => setViewMode('both')}
          >
            Both
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'earnings'}
            className={`rider-chart-seg-btn ${viewMode === 'earnings' ? 'active' : ''}`}
            onClick={() => setViewMode('earnings')}
          >
            Earnings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'trips'}
            className={`rider-chart-seg-btn ${viewMode === 'trips' ? 'active' : ''}`}
            onClick={() => setViewMode('trips')}
          >
            Trips
          </button>
        </div>
      </div>

      {/* COMPACT WEEKLY SUMMARY METRICS */}
      <div className="rider-weekly-summary-row">
        <div className="rider-weekly-metric">
          <small>Week Earnings</small>
          <div className="rider-weekly-metric-val">
            <strong>₹{currWeekEarnings.toFixed(0)}</strong>
            <span
              className={`rider-growth-text ${
                earningsGrowthPct === null
                  ? currWeekEarnings > 0
                    ? 'positive'
                    : 'neutral'
                  : earningsGrowthPct >= 0
                  ? 'positive'
                  : 'negative'
              }`}
            >
              {earningsGrowthPct !== null ? (
                <>
                  {earningsGrowthPct >= 0 ? '▲' : '▼'}{' '}
                  {Math.abs(earningsGrowthPct)}% vs last wk
                </>
              ) : currWeekEarnings > 0 ? (
                '▲ New activity'
              ) : (
                `₹${prevWeekEarnings.toFixed(0)} last wk`
              )}
            </span>
          </div>
        </div>

        <div className="rider-weekly-metric">
          <small>Completed Trips</small>
          <div className="rider-weekly-metric-val">
            <strong>{currWeekTrips}</strong>
            <span
              className={`rider-growth-text ${
                tripsDelta > 0
                  ? 'positive'
                  : tripsDelta < 0
                  ? 'negative'
                  : 'neutral'
              }`}
            >
              {tripsDelta > 0
                ? `+${tripsDelta} vs last wk`
                : tripsDelta < 0
                ? `${tripsDelta} vs last wk`
                : `${prevWeekTrips} last wk`}
            </span>
          </div>
        </div>

        <div className="rider-weekly-metric">
          <small>Avg Fee · Peak Day</small>
          <div className="rider-weekly-metric-val">
            <strong>
              {currWeekTrips > 0 ? `₹${avgPerTrip.toFixed(0)}/trip` : '₹0/trip'}
            </strong>
            <span className="rider-growth-text neutral">
              {peakDay && peakDay.earnings > 0
                ? `${peakDay.dayLabel}: ₹${peakDay.earnings.toFixed(0)}`
                : 'No peak yet'}
            </span>
          </div>
        </div>
      </div>

      {/* MINI BAR CHART */}
      <div className="rider-weekly-canvas">
        <ResponsiveContainer width="100%" height={165}>
          <ComposedChart
            data={days}
            margin={{ top: 8, right: 6, left: -12, bottom: 0 }}
            barGap={3}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148, 163, 184, 0.28)"
              vertical={false}
            />
            <XAxis
              dataKey="dayLabel"
              tick={({ x, y, payload }) => {
                const match = days.find((d) => d.dayLabel === payload.value);
                const isToday = Boolean(match?.isToday);
                return (
                  <text
                    x={x}
                    y={Number(y) + 12}
                    textAnchor="middle"
                    fill={isToday ? '#0f172a' : '#64748b'}
                    fontSize={11}
                    fontWeight={isToday ? 800 : 700}
                  >
                    {isToday ? `${payload.value}*` : payload.value}
                  </text>
                );
              }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
            />
            {(viewMode === 'both' || viewMode === 'earnings') && (
              <YAxis
                yAxisId="earnings"
                orientation="left"
                tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${v}`}
                width={48}
                allowDecimals={false}
              />
            )}
            {(viewMode === 'both' || viewMode === 'trips') && (
              <YAxis
                yAxisId="trips"
                orientation={viewMode === 'trips' ? 'left' : 'right'}
                tick={{ fill: '#0284c7', fontSize: 10, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                width={28}
                allowDecimals={false}
              />
            )}
            {viewMode === 'earnings' && (
              <YAxis
                yAxisId="cumulative"
                orientation="right"
                tick={{ fill: '#d97706', fontSize: 10, fontWeight: 700 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `₹${v}`}
                width={44}
                allowDecimals={false}
              />
            )}

            <Tooltip
              cursor={{ fill: 'rgba(148, 163, 184, 0.12)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const pt = payload[0]?.payload as WeeklyDayPoint;
                if (!pt) return null;
                return (
                  <div className="rider-chart-tooltip">
                    <div className="rider-chart-tooltip-date">
                      {pt.fullDate}
                      {pt.isToday ? ' (Today)' : ''}
                    </div>
                    <div style={{ color: '#16a34a', fontWeight: 800 }}>
                      Earnings: ₹{pt.earnings.toFixed(0)}
                    </div>
                    <div style={{ color: '#0284c7', fontWeight: 800 }}>
                      Completed Trips: {pt.trips}
                    </div>
                    {pt.cumulativeEarnings !== null && (
                      <div
                        style={{
                          color: '#b45309',
                          fontWeight: 700,
                          marginTop: '2px',
                          borderTop: '1px solid #e2e8f0',
                          paddingTop: '3px',
                        }}
                      >
                        Cumulative Week: ₹{pt.cumulativeEarnings.toFixed(0)}
                      </div>
                    )}
                  </div>
                );
              }}
            />

            {(viewMode === 'both' || viewMode === 'earnings') && (
              <Bar
                yAxisId="earnings"
                dataKey="earnings"
                name="Earnings (₹)"
                fill="#16a34a"
                radius={[4, 4, 0, 0]}
                maxBarSize={viewMode === 'both' ? 16 : 24}
              />
            )}
            {(viewMode === 'both' || viewMode === 'trips') && (
              <Bar
                yAxisId="trips"
                dataKey="trips"
                name="Completed Trips"
                fill="#0284c7"
                radius={[4, 4, 0, 0]}
                maxBarSize={viewMode === 'both' ? 16 : 24}
              />
            )}
            {viewMode === 'earnings' && (
              <Line
                yAxisId="cumulative"
                type="monotone"
                dataKey="cumulativeEarnings"
                name="Cumulative Earnings (₹)"
                stroke="#d97706"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#d97706', strokeWidth: 0 }}
                activeDot={{ r: 4, fill: '#d97706', stroke: '#fff', strokeWidth: 1.5 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* LEGEND / FOOTER NOTE */}
      <div className="rider-weekly-chart-footer">
        <div className="rider-weekly-legend">
          {(viewMode === 'both' || viewMode === 'earnings') && (
            <span>
              <i
                className="rider-legend-swatch"
                style={{ background: '#16a34a' }}
              ></i>
              Daily Earnings (₹)
            </span>
          )}
          {(viewMode === 'both' || viewMode === 'trips') && (
            <span>
              <i
                className="rider-legend-swatch"
                style={{ background: '#0284c7' }}
              ></i>
              Completed Trips
            </span>
          )}
          {viewMode === 'earnings' && (
            <span>
              <i
                className="rider-legend-swatch"
                style={{ background: '#d97706' }}
              ></i>
              Cumulative Week Growth
            </span>
          )}
        </div>
        <span className="rider-weekly-empty-hint">
          {currWeekTrips === 0
            ? 'No completed deliveries recorded this week yet.'
            : '* marks today (Mon–Sun window)'}
        </span>
      </div>
    </div>
  );
}
