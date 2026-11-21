import { AdminState, OrderItem, OrderRecord } from '../types';
import { calculateDistanceKm } from './helpers';

export type SlaBottleneckReason =
  | 'SOS'
  | 'UNASSIGNED_DELAY'
  | 'PREP_DELAY'
  | 'TRANSIT_DELAY';

export interface SlaBottleneckItem {
  orderId: string;
  order: OrderRecord;
  ageMinutes: number;
  reason: SlaBottleneckReason;
  reasonLabel: string;
  severity: 'critical' | 'warning';
  storeName: string;
  storePhone?: string;
  riderName?: string;
  riderPhone?: string;
}

export interface StoreBatchGroup {
  storeId: string;
  storeName: string;
  orderIds: string[];
  totalValue: number;
  oldestAgeMinutes: number;
}

export interface SmartOrderInsights {
  bottlenecks: SlaBottleneckItem[];
  storeBatches: StoreBatchGroup[];
  avgBasketValue: number;
  fulfillmentRate: number;
  codSharePercent: number;
  onlineSharePercent: number;
  peakWindowLabel: string;
  peakWindowCount: number;
  topItemName: string;
  topItemQty: number;
  deliveredTodayCount: number;
  revenueToday: number;
  customerProfiles: Record<
    string,
    {
      totalOrders: number;
      deliveredCount: number;
      cancelCount: number;
      isVip: boolean;
      isHighCancelRisk: boolean;
    }
  >;
}

function normalizeItems(items?: OrderItem[] | Record<string, OrderItem>): OrderItem[] {
  if (!items) return [];
  return Array.isArray(items) ? items : Object.values(items);
}

function formatHourRange(hour: number): string {
  const fmt = (h: number) => {
    const normalized = ((h % 24) + 24) % 24;
    const suffix = normalized >= 12 ? 'PM' : 'AM';
    const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${hour12} ${suffix}`;
  };
  return `${fmt(hour)} – ${fmt(hour + 2)}`;
}

export function computeSmartOrderInsights(
  state: AdminState,
  nowMs: number = Date.now()
): SmartOrderInsights {
  const bottlenecks: SlaBottleneckItem[] = [];
  const storeUnassignedMap: Record<
    string,
    { storeName: string; orderIds: string[]; totalValue: number; oldestCreated: number }
  > = {};
  const customerProfiles: SmartOrderInsights['customerProfiles'] = {};

  let deliveredCount = 0;
  let cancelledCount = 0;
  let deliveredValueSum = 0;
  let codCount = 0;
  let onlineCount = 0;
  let deliveredTodayCount = 0;
  let revenueToday = 0;

  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  const hourBuckets = new Array<number>(12).fill(0); // 12 two-hour windows
  const itemQtyMap: Record<string, number> = {};

  Object.entries(state.orders || {}).forEach(([orderId, o]) => {
    const status = (o.status || 'PLACED').toUpperCase();
    const createdAt = Number(o.createdAt || o.updatedAt || nowMs);
    const updatedAt = Number(o.updatedAt || createdAt);
    const ageMinutes = Math.max(0, Math.floor((nowMs - createdAt) / 60_000));
    const store = state.restaurants?.[o.restaurantId || ''];
    const storeName = store?.name || o.restaurantId || 'Store';
    const rider = o.deliveryUid ? state.deliveryPartners?.[o.deliveryUid] : undefined;

    // Customer profiling
    if (o.customerUid) {
      if (!customerProfiles[o.customerUid]) {
        customerProfiles[o.customerUid] = {
          totalOrders: 0,
          deliveredCount: 0,
          cancelCount: 0,
          isVip: false,
          isHighCancelRisk: false,
        };
      }
      const cp = customerProfiles[o.customerUid];
      cp.totalOrders += 1;
      if (status === 'DELIVERED') cp.deliveredCount += 1;
      if (status === 'CANCELLED') cp.cancelCount += 1;
    }

    // Revenue, basket, mix, peak hour analytics
    const totalAmt = Number(o.totalAmount || 0);
    if (status === 'DELIVERED') {
      deliveredCount += 1;
      deliveredValueSum += totalAmt;
      if (createdAt >= todayStartMs) {
        deliveredTodayCount += 1;
        revenueToday += totalAmt;
      }
    } else if (status === 'CANCELLED') {
      cancelledCount += 1;
    }

    if (status !== 'CANCELLED') {
      const mode = (o.paymentMode || 'COD').toUpperCase();
      if (mode === 'COD') codCount += 1;
      else onlineCount += 1;

      const hr = new Date(createdAt).getHours();
      const bucketIdx = Math.min(11, Math.max(0, Math.floor(hr / 2)));
      hourBuckets[bucketIdx] += 1;

      normalizeItems(o.items).forEach((item) => {
        const cleanName = String(item.name || '').trim();
        if (!cleanName) return;
        itemQtyMap[cleanName] = (itemQtyMap[cleanName] || 0) + Number(item.qty || 1);
      });
    }

    // Active SLA Bottleneck & Store Batch checks
    if (status !== 'DELIVERED' && status !== 'CANCELLED') {
      if (o.emergencyAlert) {
        bottlenecks.push({
          orderId,
          order: o,
          ageMinutes,
          reason: 'SOS',
          reasonLabel: 'SOS Emergency Alert',
          severity: 'critical',
          storeName,
          storePhone: store?.phone,
          riderName: rider?.name,
          riderPhone: rider?.phone,
        });
      } else if (!o.deliveryUid && ageMinutes >= 10) {
        bottlenecks.push({
          orderId,
          order: o,
          ageMinutes,
          reason: 'UNASSIGNED_DELAY',
          reasonLabel: 'Unassigned > 10m',
          severity: ageMinutes >= 20 ? 'critical' : 'warning',
          storeName,
          storePhone: store?.phone,
        });
      } else if (
        (status === 'PREPARING' || status === 'PACKING' || status === 'ACCEPTED') &&
        Math.floor((nowMs - updatedAt) / 60_000) >= 18
      ) {
        bottlenecks.push({
          orderId,
          order: o,
          ageMinutes,
          reason: 'PREP_DELAY',
          reasonLabel: 'Store Prep > 18m',
          severity: ageMinutes >= 30 ? 'critical' : 'warning',
          storeName,
          storePhone: store?.phone,
          riderName: rider?.name,
          riderPhone: rider?.phone,
        });
      } else if (
        (status === 'OUT_FOR_DELIVERY' || status === 'PICKED_UP') &&
        Math.floor((nowMs - updatedAt) / 60_000) >= 35
      ) {
        bottlenecks.push({
          orderId,
          order: o,
          ageMinutes,
          reason: 'TRANSIT_DELAY',
          reasonLabel: 'In Transit > 35m',
          severity: 'warning',
          storeName,
          storePhone: store?.phone,
          riderName: rider?.name,
          riderPhone: rider?.phone,
        });
      }

      // Group unassigned active orders by store for 1-click batch dispatch
      if (!o.deliveryUid && o.restaurantId) {
        if (!storeUnassignedMap[o.restaurantId]) {
          storeUnassignedMap[o.restaurantId] = {
            storeName,
            orderIds: [],
            totalValue: 0,
            oldestCreated: createdAt,
          };
        }
        const batch = storeUnassignedMap[o.restaurantId];
        batch.orderIds.push(orderId);
        batch.totalValue += totalAmt;
        if (createdAt < batch.oldestCreated) batch.oldestCreated = createdAt;
      }
    }
  });

  // Finalize customer VIP / high-cancel flags
  Object.values(customerProfiles).forEach((cp) => {
    cp.isVip = cp.deliveredCount >= 5;
    cp.isHighCancelRisk =
      cp.totalOrders >= 3 && cp.cancelCount / cp.totalOrders >= 0.4;
  });

  bottlenecks.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    return b.ageMinutes - a.ageMinutes;
  });

  const storeBatches: StoreBatchGroup[] = Object.entries(storeUnassignedMap)
    .filter(([, b]) => b.orderIds.length >= 2)
    .map(([storeId, b]) => ({
      storeId,
      storeName: b.storeName,
      orderIds: b.orderIds,
      totalValue: b.totalValue,
      oldestAgeMinutes: Math.max(0, Math.floor((nowMs - b.oldestCreated) / 60_000)),
    }))
    .sort((a, b) => b.orderIds.length - a.orderIds.length || b.oldestAgeMinutes - a.oldestAgeMinutes);

  const finalizedOrders = deliveredCount + cancelledCount;
  const fulfillmentRate =
    finalizedOrders > 0 ? Math.round((deliveredCount / finalizedOrders) * 100) : 100;
  const avgBasketValue =
    deliveredCount > 0 ? deliveredValueSum / deliveredCount : 0;

  const paymentTotal = codCount + onlineCount;
  const codSharePercent =
    paymentTotal > 0 ? Math.round((codCount / paymentTotal) * 100) : 0;
  const onlineSharePercent = paymentTotal > 0 ? 100 - codSharePercent : 0;

  let bestBucketIdx = 0;
  let peakWindowCount = 0;
  hourBuckets.forEach((count, idx) => {
    if (count > peakWindowCount) {
      peakWindowCount = count;
      bestBucketIdx = idx;
    }
  });
  const peakWindowLabel =
    peakWindowCount > 0 ? formatHourRange(bestBucketIdx * 2) : 'No orders yet';

  let topItemName = '—';
  let topItemQty = 0;
  Object.entries(itemQtyMap).forEach(([name, qty]) => {
    if (qty > topItemQty) {
      topItemQty = qty;
      topItemName = name;
    }
  });

  return {
    bottlenecks,
    storeBatches,
    avgBasketValue,
    fulfillmentRate,
    codSharePercent,
    onlineSharePercent,
    peakWindowLabel,
    peakWindowCount,
    topItemName,
    topItemQty,
    deliveredTodayCount,
    revenueToday,
    customerProfiles,
  };
}

export function scoreRiderForOrder(params: {
  storeLat: number;
  storeLng: number;
  riderLat?: number;
  riderLng?: number;
  activeLoadCount: number;
  ratingAvg?: number;
  codHeadroomRatio?: number;
}): number {
  const {
    storeLat,
    storeLng,
    riderLat,
    riderLng,
    activeLoadCount,
    ratingAvg = 5,
    codHeadroomRatio = 0,
  } = params;

  const rLat = Number(riderLat);
  const rLng = Number(riderLng);
  const hasGps =
    Number.isFinite(rLat) && Number.isFinite(rLng) && rLat !== 0 && rLng !== 0;

  const distKm = hasGps
    ? calculateDistanceKm(storeLat, storeLng, rLat, rLng)
    : 12;

  // Lower score = better rider candidate
  const loadPenaltyKm = activeLoadCount * 2.5;
  const codPenaltyKm = codHeadroomRatio >= 0.8 ? 1.5 : 0;
  const ratingBonusKm = Math.max(0, ratingAvg - 4) * 0.4;

  return distKm + loadPenaltyKm + codPenaltyKm - ratingBonusKm;
}
