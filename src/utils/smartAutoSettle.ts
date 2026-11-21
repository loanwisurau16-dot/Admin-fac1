import {
  AdminState,
  DeliveryPartnerRecord,
  SettlementRecord,
  SmartAutoSettleConfig,
} from '../types';

export type RiderCodGovernanceStatus =
  | 'RESTRICTED'
  | 'FLAGGED'
  | 'OVER_LIMIT'
  | 'COMPLIANT';

export interface RiderCodComplianceAnalysis {
  uid: string;
  partner: DeliveryPartnerRecord;
  netCashInHand: number;
  totalCodCollected: number;
  totalSettled: number;
  maxLimit: number;
  triggerThresholdAmount: number;
  utilizationPct: number;
  excessAmount: number;
  breachCount: number;
  peakCashHeld: number;
  lastCodOrderAt: number;
  lastApprovedSettlementAt: number;
  pendingSettlements: Array<{ id: string; record: SettlementRecord }>;
  pendingAmount: number;
  rejectedSettlementCount: number;
  isCurrentlyOverTrigger: boolean;
  isFrequentExceeder: boolean;
  shouldAutoEnforceNow: boolean;
  governanceStatus: RiderCodGovernanceStatus;
}

export interface SmartAutoSettleReport {
  config: Required<
    Pick<
      SmartAutoSettleConfig,
      | 'enabled'
      | 'mode'
      | 'breachThresholdCount'
      | 'triggerAtPercent'
      | 'autoClearOnSettlementVerify'
    >
  >;
  maxLimit: number;
  triggerThresholdAmount: number;
  riders: RiderCodComplianceAnalysis[];
  restrictedCount: number;
  flaggedCount: number;
  frequentExceederCount: number;
  overLimitCount: number;
  totalExcessCash: number;
  totalFleetCodCash: number;
  latestCodOrderAt: number;
  fleetCodRiskEnabled: boolean;
  fleetCodRiskThreshold: number;
  isFleetCodOverThreshold: boolean;
  isPayoutWithdrawalFrozen: boolean;
  shouldTripFleetFreezeNow: boolean;
  autoActionCandidates: RiderCodComplianceAnalysis[];
}

export function resolveSmartAutoSettleConfig(
  raw?: SmartAutoSettleConfig
): SmartAutoSettleReport['config'] {
  return {
    enabled: raw?.enabled !== false,
    mode: raw?.mode === 'FLAG_ONLY' ? 'FLAG_ONLY' : 'RESTRICT_ASSIGNMENTS',
    breachThresholdCount: Math.max(
      1,
      Math.min(10, Number(raw?.breachThresholdCount || 2))
    ),
    triggerAtPercent: Math.max(
      70,
      Math.min(120, Number(raw?.triggerAtPercent || 100))
    ),
    autoClearOnSettlementVerify: raw?.autoClearOnSettlementVerify !== false,
  };
}

export function analyzeRiderCodCompliance(state: AdminState): SmartAutoSettleReport {
  const config = resolveSmartAutoSettleConfig(state.smartAutoSettleConfig);
  const maxLimit = Math.max(100, Number(state.settings?.maxRiderCashLimit || 3000));
  const triggerThresholdAmount = Math.round(
    maxLimit * (config.triggerAtPercent / 100)
  );

  // Pre-index COD delivered orders and settlements by riderUid
  const codOrdersByRider: Record<
    string,
    Array<{ amount: number; ts: number }>
  > = {};
  Object.values(state.orders).forEach((o) => {
    if (
      o.deliveryUid &&
      o.status === 'DELIVERED' &&
      o.paymentMode !== 'UPI' &&
      o.paymentMode !== 'WALLET'
    ) {
      if (!codOrdersByRider[o.deliveryUid]) {
        codOrdersByRider[o.deliveryUid] = [];
      }
      codOrdersByRider[o.deliveryUid].push({
        amount: Number(o.totalAmount || 0),
        ts: Number(o.updatedAt || o.createdAt || 0),
      });
    }
  });

  const settlementsByRider: Record<
    string,
    Array<{ id: string; record: SettlementRecord }>
  > = {};
  Object.entries(state.settlements).forEach(([id, s]) => {
    if (!s.riderUid) return;
    if (!settlementsByRider[s.riderUid]) settlementsByRider[s.riderUid] = [];
    settlementsByRider[s.riderUid].push({ id, record: s });
  });

  const riders: RiderCodComplianceAnalysis[] = Object.entries(
    state.deliveryPartners
  ).map(([uid, partner]) => {
    const codEvents = codOrdersByRider[uid] || [];
    const riderSettlements = settlementsByRider[uid] || [];

    const totalCodCollected = codEvents.reduce((sum, ev) => sum + ev.amount, 0);
    let totalSettled = 0;
    let lastApprovedSettlementAt = 0;
    let rejectedSettlementCount = 0;
    const pendingSettlements: Array<{ id: string; record: SettlementRecord }> = [];

    const ledgerEvents: Array<{ delta: number; ts: number }> = codEvents.map(
      (ev) => ({
        delta: ev.amount,
        ts: ev.ts,
      })
    );

    riderSettlements.forEach((item) => {
      const st = item.record;
      if (st.status === 'APPROVED') {
        const amt = Number(st.amount || 0);
        totalSettled += amt;
        const ts = Number(st.verifiedAt || st.createdAt || 0);
        if (ts > lastApprovedSettlementAt) lastApprovedSettlementAt = ts;
        ledgerEvents.push({ delta: -amt, ts });
      } else if (st.status === 'PENDING') {
        pendingSettlements.push(item);
      } else if (st.status === 'REJECTED') {
        rejectedSettlementCount++;
      }
    });

    pendingSettlements.sort(
      (a, b) => Number(b.record.createdAt || 0) - Number(a.record.createdAt || 0)
    );

    // Replay chronological COD cash balance to detect distinct limit breach episodes
    ledgerEvents.sort((a, b) => a.ts - b.ts);
    let runningBalance = 0;
    let peakCashHeld = 0;
    let replayBreaches = 0;
    let inBreachEpisode = false;

    ledgerEvents.forEach((ev) => {
      runningBalance = Math.max(0, runningBalance + ev.delta);
      if (runningBalance > peakCashHeld) {
        peakCashHeld = runningBalance;
      }
      if (!inBreachEpisode && runningBalance >= triggerThresholdAmount) {
        replayBreaches++;
        inBreachEpisode = true;
      } else if (inBreachEpisode && runningBalance < triggerThresholdAmount) {
        inBreachEpisode = false;
      }
    });

    const netCashInHand = Math.max(0, totalCodCollected - totalSettled);
    const lastCodOrderAt = codEvents.reduce(
      (maxTs, ev) => Math.max(maxTs, ev.ts),
      0
    );
    const breachCount = Math.max(
      replayBreaches,
      Number(partner.codLimitBreaches || 0),
      netCashInHand >= triggerThresholdAmount ? 1 : 0
    );

    const utilizationPct = Math.round((netCashInHand / maxLimit) * 100);
    const excessAmount = Math.max(0, netCashInHand - maxLimit);
    const pendingAmount = pendingSettlements.reduce(
      (sum, item) => sum + Number(item.record.amount || 0),
      0
    );

    const isCurrentlyOverTrigger = netCashInHand >= triggerThresholdAmount;
    const isFrequentExceeder = breachCount >= config.breachThresholdCount;

    // Avoid re-flagging immediately if admin manually cleared and no newer COD order occurred
    const clearedBeforeLatestCod =
      !partner.codAutoClearedAt || lastCodOrderAt > partner.codAutoClearedAt;

    const needsFlagUpdate = !partner.codReviewFlagged;
    const needsRestrictionUpdate =
      config.mode === 'RESTRICT_ASSIGNMENTS' && !partner.codAssignmentRestricted;

    const shouldAutoEnforceNow =
      config.enabled &&
      isCurrentlyOverTrigger &&
      isFrequentExceeder &&
      clearedBeforeLatestCod &&
      (needsFlagUpdate || needsRestrictionUpdate);

    let governanceStatus: RiderCodGovernanceStatus = 'COMPLIANT';
    if (partner.codAssignmentRestricted) {
      governanceStatus = 'RESTRICTED';
    } else if (partner.codReviewFlagged) {
      governanceStatus = 'FLAGGED';
    } else if (isCurrentlyOverTrigger) {
      governanceStatus = 'OVER_LIMIT';
    }

    return {
      uid,
      partner,
      netCashInHand,
      totalCodCollected,
      totalSettled,
      maxLimit,
      triggerThresholdAmount,
      utilizationPct,
      excessAmount,
      breachCount,
      peakCashHeld: Math.max(peakCashHeld, netCashInHand),
      lastCodOrderAt,
      lastApprovedSettlementAt,
      pendingSettlements,
      pendingAmount,
      rejectedSettlementCount,
      isCurrentlyOverTrigger,
      isFrequentExceeder,
      shouldAutoEnforceNow,
      governanceStatus,
    };
  });

  // Sort high-risk / restricted / over-limit riders to top
  const statusWeight: Record<RiderCodGovernanceStatus, number> = {
    RESTRICTED: 4,
    FLAGGED: 3,
    OVER_LIMIT: 2,
    COMPLIANT: 1,
  };
  riders.sort((a, b) => {
    const sw = statusWeight[b.governanceStatus] - statusWeight[a.governanceStatus];
    if (sw !== 0) return sw;
    if (b.breachCount !== a.breachCount) return b.breachCount - a.breachCount;
    return b.netCashInHand - a.netCashInHand;
  });

  const totalFleetCodCash = riders.reduce((sum, r) => sum + r.netCashInHand, 0);
  const latestCodOrderAt = riders.reduce(
    (maxTs, r) => Math.max(maxTs, r.lastCodOrderAt),
    0
  );
  const fleetCodRiskEnabled =
    state.settings?.autoPausePayoutsOnFleetCodRisk === true;
  const fleetCodRiskThreshold = Math.max(
    500,
    Number(state.settings?.fleetCodRiskThreshold || 15000)
  );
  const isFleetCodOverThreshold = totalFleetCodCash > fleetCodRiskThreshold;
  const persistedFreezeActive =
    state.settings?.fleetCodPayoutFreezeActive === true;
  const intervenedAt = Number(state.settings?.fleetCodFreezeIntervenedAt || 0);
  const breachedSinceIntervention =
    isFleetCodOverThreshold &&
    (!intervenedAt || latestCodOrderAt > intervenedAt);
  const isPayoutWithdrawalFrozen =
    fleetCodRiskEnabled && (persistedFreezeActive || breachedSinceIntervention);
  const shouldTripFleetFreezeNow =
    fleetCodRiskEnabled && !persistedFreezeActive && breachedSinceIntervention;

  return {
    config,
    maxLimit,
    triggerThresholdAmount,
    riders,
    restrictedCount: riders.filter((r) => r.partner.codAssignmentRestricted).length,
    flaggedCount: riders.filter(
      (r) => r.partner.codReviewFlagged || r.partner.codAssignmentRestricted
    ).length,
    frequentExceederCount: riders.filter((r) => r.isFrequentExceeder).length,
    overLimitCount: riders.filter((r) => r.isCurrentlyOverTrigger).length,
    totalExcessCash: riders.reduce((sum, r) => sum + r.excessAmount, 0),
    totalFleetCodCash,
    latestCodOrderAt,
    fleetCodRiskEnabled,
    fleetCodRiskThreshold,
    isFleetCodOverThreshold,
    isPayoutWithdrawalFrozen,
    shouldTripFleetFreezeNow,
    autoActionCandidates: riders.filter((r) => r.shouldAutoEnforceNow),
  };
}
