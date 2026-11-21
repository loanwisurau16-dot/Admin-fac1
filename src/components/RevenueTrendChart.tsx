import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { OrderRecord } from '../types';

interface RevenueTrendChartProps {
  orders: Record<string, OrderRecord>;
  commissionPercent: number;
}

interface DailyRevenuePoint {
  dateKey: string;
  label: string;
  fullDate: string;
  revenue: number;
  commission: number;
  orders: number;
}

function toLocalDateKey(ts: number): string {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function RevenueTrendChart({
  orders,
  commissionPercent,
}: RevenueTrendChartProps) {
  const { series, total30DayRevenue, total30DayComm, total30DayOrders } =
    useMemo(() => {
      const days: DailyRevenuePoint[] = [];
      const bucketMap: Record<string, DailyRevenuePoint> = {};
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      for (let offset = 29; offset >= 0; offset--) {
        const d = new Date(now);
        d.setDate(now.getDate() - offset);
        const key = toLocalDateKey(d.getTime());
        const point: DailyRevenuePoint = {
          dateKey: key,
          label: d.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          }),
          fullDate: d.toLocaleDateString('en-IN', {
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          revenue: 0,
          commission: 0,
          orders: 0,
        };
        days.push(point);
        bucketMap[key] = point;
      }

      let revSum = 0;
      let commSum = 0;
      let orderSum = 0;

      Object.values(orders).forEach((o) => {
        if (o.status !== 'DELIVERED') return;
        const ts = o.createdAt || o.updatedAt;
        if (!ts) return;
        const bucket = bucketMap[toLocalDateKey(ts)];
        if (!bucket) return;

        const gross = Number(o.totalAmount || 0);
        const subtotal =
          o.subtotalAmount !== undefined ? Number(o.subtotalAmount) : gross;
        const comm = Number(
          (subtotal * (commissionPercent / 100)).toFixed(2)
        );

        bucket.revenue = Number((bucket.revenue + gross).toFixed(2));
        bucket.commission = Number((bucket.commission + comm).toFixed(2));
        bucket.orders += 1;

        revSum += gross;
        commSum += comm;
        orderSum += 1;
      });

      return {
        series: days,
        total30DayRevenue: revSum,
        total30DayComm: commSum,
        total30DayOrders: orderSum,
      };
    }, [orders, commissionPercent]);

  const dailyAvg = total30DayRevenue / 30;

  return (
    <div className="card">
      <div className="card-title">
        <span>
          <i className="fa-solid fa-chart-line" style={{ color: '#22c55e' }}></i>{' '}
          Daily Revenue Trend (Last 30 Days)
        </span>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <span className="badge badge-success">
            30D Revenue: ₹{total30DayRevenue.toFixed(0)}
          </span>
          <span className="badge badge-info">
            30D Profit: ₹{total30DayComm.toFixed(0)}
          </span>
          <span className="badge badge-warning">
            Avg/Day: ₹{dailyAvg.toFixed(0)} ({total30DayOrders} orders)
          </span>
        </div>
      </div>

      <div style={{ width: '100%', height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={series}
            margin={{ top: 10, right: 16, left: 4, bottom: 8 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(148, 163, 184, 0.25)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={{ stroke: '#cbd5e1' }}
              minTickGap={18}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#64748b', fontSize: 11, fontWeight: 700 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => `₹${val}`}
              width={62}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0]?.payload as DailyRevenuePoint;
                if (!point) return null;
                return (
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '0.65rem 0.85rem',
                      boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
                      fontSize: '0.78rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        color: '#0f172a',
                        marginBottom: '4px',
                      }}
                    >
                      {point.fullDate}
                    </div>
                    <div style={{ color: '#059669', fontWeight: 800 }}>
                      Daily Revenue: ₹{point.revenue.toFixed(0)}
                    </div>
                    <div style={{ color: '#0284c7', fontWeight: 800 }}>
                      Admin Commission: ₹{point.commission.toFixed(2)}
                    </div>
                    <div
                      style={{
                        color: '#64748b',
                        fontSize: '0.72rem',
                        marginTop: '3px',
                      }}
                    >
                      Delivered Orders: {point.orders}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              wrapperStyle={{
                fontSize: '0.76rem',
                fontWeight: 700,
                paddingTop: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              name="Daily Revenue (₹)"
              stroke="#16a34a"
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: '#16a34a', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#16a34a', stroke: '#ffffff', strokeWidth: 2 }}
            />
            <Line
              type="monotone"
              dataKey="commission"
              name="Admin Commission (₹)"
              stroke="#0284c7"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4, fill: '#0284c7', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
