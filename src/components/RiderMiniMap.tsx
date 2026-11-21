/// <reference types="google.maps" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const AUTO_REFRESH_SECONDS = 5;

export function DeliveryFleetMapsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!MAPS_API_KEY) {
    return <>{children}</>;
  }

  return (
    <APIProvider
      apiKey={MAPS_API_KEY}
      libraries={['marker']}
      language="en"
      region="IN"
    >
      {children}
    </APIProvider>
  );
}

interface FleetMiniMapControllerProps {
  mapId: string;
  riderPos: google.maps.LatLngLiteral;
  storePos: google.maps.LatLngLiteral;
  refreshNonce: number;
}

function FleetMiniMapController({
  mapId,
  riderPos,
  storePos,
  refreshNonce,
}: FleetMiniMapControllerProps) {
  const map = useMap(mapId);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const nearSameSpot =
      Math.abs(riderPos.lat - storePos.lat) < 0.00025 &&
      Math.abs(riderPos.lng - storePos.lng) < 0.00025;

    if (nearSameSpot) {
      map.setCenter(riderPos);
      map.setZoom(16);
    } else {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(riderPos);
      bounds.extend(storePos);
      map.fitBounds(bounds, { top: 24, right: 24, bottom: 24, left: 24 });
    }

    const lineSymbol: google.maps.Symbol = {
      path: 'M 0,-1 0,1',
      strokeOpacity: 0.9,
      scale: 2,
    };

    const connector = new google.maps.Polyline({
      path: [storePos, riderPos],
      geodesic: true,
      strokeColor: '#38bdf8',
      strokeOpacity: 0,
      icons: [
        {
          icon: lineSymbol,
          offset: '0',
          repeat: '10px',
        },
      ],
      map,
    });

    return () => {
      connector.setMap(null);
    };
  }, [map, riderPos.lat, riderPos.lng, storePos.lat, storePos.lng, refreshNonce]);

  return null;
}

export interface RiderMiniMapProps {
  riderUid: string;
  riderName: string;
  riderLat: number;
  riderLng: number;
  storeName: string;
  storeLat: number;
  storeLng: number;
  distanceKm: number;
  isActiveOrderStore?: boolean;
  lastUpdated?: number;
  onManualRefresh?: () => Promise<void> | void;
}

function formatGpsAge(timestamp: number | undefined, now: number): {
  label: string;
  isStale: boolean;
} {
  if (!timestamp || !Number.isFinite(timestamp)) {
    return { label: 'Live GPS', isStale: false };
  }
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 3) return { label: 'Just now', isStale: false };
  if (diffSec < 60) return { label: `${diffSec}s ago`, isStale: diffSec > 30 };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { label: `${diffMin}m ago`, isStale: true };
  return {
    label: new Date(timestamp).toLocaleTimeString(),
    isStale: true,
  };
}

function useMiniMapRefreshTimer(
  riderLat: number,
  riderLng: number,
  lastUpdated?: number,
  onManualRefresh?: () => Promise<void> | void
) {
  const [now, setNow] = useState(() => Date.now());
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | undefined>(
    lastUpdated
  );
  const onRefreshRef = useRef(onManualRefresh);
  onRefreshRef.current = onManualRefresh;
  const isRefreshingRef = useRef(false);

  // Sync local timestamp & reset countdown whenever fresh coordinates/timestamp arrive
  useEffect(() => {
    if (lastUpdated) {
      setLastSyncedAt(lastUpdated);
    }
    setCountdown(AUTO_REFRESH_SECONDS);
    setNow(Date.now());
  }, [riderLat, riderLng, lastUpdated]);

  const triggerRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      if (onRefreshRef.current) {
        await onRefreshRef.current();
      }
      setRefreshNonce((n) => n + 1);
    } finally {
      setNow(Date.now());
      setCountdown(AUTO_REFRESH_SECONDS);
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      setCountdown((prev) => {
        if (prev <= 1) {
          void triggerRefresh();
          return AUTO_REFRESH_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [triggerRefresh]);

  const effectiveTimestamp = lastUpdated || lastSyncedAt;
  const age = formatGpsAge(effectiveTimestamp, now);

  return {
    ageLabel: age.label,
    isStale: age.isStale,
    countdown,
    isRefreshing,
    refreshNonce,
    triggerRefresh,
    effectiveTimestamp,
  };
}

interface MiniMapTimerBarProps {
  riderName: string;
  ageLabel: string;
  isStale: boolean;
  countdown: number;
  isRefreshing: boolean;
  effectiveTimestamp?: number;
  onRefresh: () => void;
}

function MiniMapTimerBar({
  riderName,
  ageLabel,
  isStale,
  countdown,
  isRefreshing,
  effectiveTimestamp,
  onRefresh,
}: MiniMapTimerBarProps) {
  return (
    <div className="fleet-minimap-timerbar">
      <span
        className={`fleet-timer-status ${isStale ? 'stale' : ''}`}
        title={
          effectiveTimestamp
            ? `Last GPS update: ${new Date(effectiveTimestamp).toLocaleTimeString()}`
            : 'Auto-refreshing every 5s'
        }
      >
        <i className="fa-regular fa-clock"></i>
        <span>{ageLabel}</span>
        <span className="fleet-timer-countdown">
          ({isRefreshing ? 'syncing...' : `${countdown}s`})
        </span>
      </span>

      <button
        type="button"
        className="fleet-refresh-btn"
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Refresh rider GPS now"
        aria-label={`Refresh GPS for ${riderName}`}
      >
        <i
          className={`fa-solid fa-arrows-rotate ${isRefreshing ? 'fa-spin' : ''}`}
        ></i>{' '}
        Refresh
      </button>
    </div>
  );
}

function RiderMiniMapCanvas({
  riderUid,
  riderName,
  riderLat,
  riderLng,
  storeName,
  storeLat,
  storeLng,
  distanceKm,
  isActiveOrderStore,
  lastUpdated,
  onManualRefresh,
}: RiderMiniMapProps) {
  const loadingStatus = useApiLoadingStatus();
  const {
    ageLabel,
    isStale,
    countdown,
    isRefreshing,
    refreshNonce,
    triggerRefresh,
    effectiveTimestamp,
  } = useMiniMapRefreshTimer(riderLat, riderLng, lastUpdated, onManualRefresh);

  const riderPos = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: riderLat, lng: riderLng }),
    [riderLat, riderLng]
  );
  const storePos = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: storeLat, lng: storeLng }),
    [storeLat, storeLng]
  );
  const mapInstanceId = `fleet-mini-map-${riderUid}`;

  useEffect(() => {
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus]);

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="fleet-minimap-fallback">
        <div className="fleet-minimap-fallback-row">
          <i className="fa-solid fa-map-location-dot"></i>
          <span>Map preview unavailable</span>
        </div>
        <MiniMapTimerBar
          riderName={riderName}
          ageLabel={ageLabel}
          isStale={isStale}
          countdown={countdown}
          isRefreshing={isRefreshing}
          effectiveTimestamp={effectiveTimestamp}
          onRefresh={() => void triggerRefresh()}
        />
      </div>
    );
  }

  return (
    <div className="fleet-minimap-card">
      <div className="fleet-minimap-topbar">
        <span className="fleet-minimap-store" title={storeName}>
          {isActiveOrderStore ? '📦' : '🏪'} {storeName}
        </span>
        <span className="fleet-minimap-dist">
          {Number.isFinite(distanceKm) ? `${distanceKm.toFixed(1)} km` : 'Live'}
        </span>
      </div>

      <div className="fleet-minimap-viewport">
        <GoogleMap
          id={mapInstanceId}
          mapId="DEMO_MAP_ID"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          defaultCenter={riderPos}
          defaultZoom={14}
          disableDefaultUI={true}
          clickableIcons={false}
          gestureHandling="cooperative"
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker
            position={storePos}
            title={`Store: ${storeName}`}
            zIndex={10}
          >
            <div className="fleet-pin fleet-pin-store">
              <span aria-hidden="true">🏪</span>
            </div>
          </AdvancedMarker>

          <AdvancedMarker
            position={riderPos}
            title={`Rider: ${riderName} (Live GPS)`}
            zIndex={20}
          >
            <div className="fleet-pin fleet-pin-rider">
              <span aria-hidden="true">🛵</span>
            </div>
          </AdvancedMarker>

          <FleetMiniMapController
            mapId={mapInstanceId}
            riderPos={riderPos}
            storePos={storePos}
            refreshNonce={refreshNonce}
          />
        </GoogleMap>
      </div>

      <div className="fleet-minimap-legend">
        <span>
          <span className="legend-dot legend-dot-rider" /> Rider GPS
        </span>
        <span>
          <span className="legend-dot legend-dot-store" /> Store
        </span>
      </div>

      <MiniMapTimerBar
        riderName={riderName}
        ageLabel={ageLabel}
        isStale={isStale}
        countdown={countdown}
        isRefreshing={isRefreshing}
        effectiveTimestamp={effectiveTimestamp}
        onRefresh={() => void triggerRefresh()}
      />
    </div>
  );
}

function RiderMiniMapFallback(props: RiderMiniMapProps) {
  const {
    ageLabel,
    isStale,
    countdown,
    isRefreshing,
    triggerRefresh,
    effectiveTimestamp,
  } = useMiniMapRefreshTimer(
    props.riderLat,
    props.riderLng,
    props.lastUpdated,
    props.onManualRefresh
  );

  return (
    <div className="fleet-minimap-fallback">
      <div className="fleet-minimap-fallback-row">
        <i className="fa-solid fa-location-crosshairs"></i>
        <span>
          {Number.isFinite(props.distanceKm)
            ? `${props.distanceKm.toFixed(1)} km from ${props.storeName}`
            : `Near ${props.storeName}`}
        </span>
      </div>
      <MiniMapTimerBar
        riderName={props.riderName}
        ageLabel={ageLabel}
        isStale={isStale}
        countdown={countdown}
        isRefreshing={isRefreshing}
        effectiveTimestamp={effectiveTimestamp}
        onRefresh={() => void triggerRefresh()}
      />
    </div>
  );
}

export function RiderMiniMap(props: RiderMiniMapProps) {
  if (!MAPS_API_KEY) {
    return <RiderMiniMapFallback {...props} />;
  }

  return <RiderMiniMapCanvas {...props} />;
}
