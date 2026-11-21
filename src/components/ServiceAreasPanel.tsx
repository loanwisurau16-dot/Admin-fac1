/// <reference types="google.maps" />
import React, { useEffect, useMemo, useState } from 'react';
import {
  APILoadingStatus,
  AdvancedMarker,
  Map as GoogleMap,
  MapMouseEvent,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { db } from '../firebase';
import {
  AdminState,
  ServiceAreaConfig,
  ServiceAreaZone,
  StoreRecord,
} from '../types';
import { calculateDistanceKm, sanitizeText } from '../utils/helpers';
import { DialogConfig } from './ActionDialogModal';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const DEFAULT_CENTER = { lat: 26.4524, lng: 89.9723 }; // Gossaigaon Center
const SERVICE_MAP_ID = 'service-areas-controller-map';

interface ServiceAreasPanelProps {
  activePanel: string;
  state: AdminState;
  adminEmail: string;
  onToast: (
    msg: string,
    type?: 'success' | 'danger' | 'info' | 'warning'
  ) => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
}

const PRESET_ZONES: Array<Omit<ServiceAreaZone, 'updatedAt' | 'updatedBy'>> = [
  {
    id: 'zone_gossaigaon_core',
    name: 'Gossaigaon Town Core',
    areaCode: 'GSG-01',
    pinCodes: ['783360'],
    centerLat: 26.4524,
    centerLng: 89.9723,
    radiusKm: 3.0,
    enabled: true,
    deliveryCharge: 20,
    freeDeliveryAbove: 249,
    minOrderAmount: 0,
    etaText: '15–20 mins',
    allowCod: true,
    allowUpi: true,
    priority: 'EXPRESS',
    pauseReason: '',
  },
  {
    id: 'zone_station_hospital',
    name: 'Station & Hospital Road',
    areaCode: 'GSG-02',
    pinCodes: ['783360', '783361'],
    centerLat: 26.4472,
    centerLng: 89.9854,
    radiusKm: 3.5,
    enabled: true,
    deliveryCharge: 25,
    freeDeliveryAbove: 299,
    minOrderAmount: 49,
    etaText: '20–25 mins',
    allowCod: true,
    allowUpi: true,
    priority: 'STANDARD',
    pauseReason: '',
  },
  {
    id: 'zone_sapkata_highway',
    name: 'Sapkata & Highway Belt',
    areaCode: 'GSG-03',
    pinCodes: ['783370', '783360'],
    centerLat: 26.4718,
    centerLng: 89.9565,
    radiusKm: 4.5,
    enabled: false,
    deliveryCharge: 39,
    freeDeliveryAbove: 499,
    minOrderAmount: 99,
    etaText: '30–40 mins',
    allowCod: false,
    allowUpi: true,
    priority: 'EXTENDED',
    pauseReason: 'Extended zone paused until additional riders come online',
  },
];

interface GeofenceCircleLayerProps {
  mapId: string;
  zones: ServiceAreaZone[];
  selectedZoneId: string | null;
  draftZone: {
    lat: number;
    lng: number;
    radiusKm: number;
    enabled: boolean;
  } | null;
  onSelectZone: (zoneId: string) => void;
}

function GeofenceCircleLayer({
  mapId,
  zones,
  selectedZoneId,
  draftZone,
  onSelectZone,
}: GeofenceCircleLayerProps) {
  const map = useMap(mapId);

  // Sync rendered geofence circles on map
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const created: google.maps.Circle[] = [];

    zones.forEach((zone) => {
      const isSelected = zone.id === selectedZoneId;
      const strokeColor = isSelected
        ? '#38bdf8'
        : zone.enabled
          ? '#22c55e'
          : '#ef4444';
      const fillColor = isSelected
        ? '#38bdf8'
        : zone.enabled
          ? '#16a34a'
          : '#ef4444';

      const circle = new google.maps.Circle({
        map,
        center: { lat: zone.centerLat, lng: zone.centerLng },
        radius: Math.max(0.2, Number(zone.radiusKm || 1)) * 1000,
        strokeColor,
        strokeOpacity: isSelected ? 0.95 : 0.7,
        strokeWeight: isSelected ? 2.5 : 1.5,
        fillColor,
        fillOpacity: isSelected ? 0.22 : zone.enabled ? 0.12 : 0.1,
        clickable: true,
        zIndex: isSelected ? 20 : 10,
      });

      circle.addListener('click', () => {
        onSelectZone(zone.id);
      });

      created.push(circle);
    });

    if (draftZone) {
      const previewCircle = new google.maps.Circle({
        map,
        center: { lat: draftZone.lat, lng: draftZone.lng },
        radius: Math.max(0.2, Number(draftZone.radiusKm || 1)) * 1000,
        strokeColor: '#fbbf24',
        strokeOpacity: 0.95,
        strokeWeight: 2,
        fillColor: '#fbbf24',
        fillOpacity: 0.16,
        clickable: false,
        zIndex: 30,
      });
      created.push(previewCircle);
    }

    return () => {
      created.forEach((c) => c.setMap(null));
    };
  }, [map, zones, selectedZoneId, draftZone, onSelectZone]);

  // Smooth pan when selected zone changes
  useEffect(() => {
    if (!map || !selectedZoneId) return;
    const target = zones.find((z) => z.id === selectedZoneId);
    if (!target) return;
    map.panTo({ lat: target.centerLat, lng: target.centerLng });
  }, [map, selectedZoneId, zones]);

  return null;
}

interface AreaCoverageMapProps {
  zones: ServiceAreaZone[];
  stores: Array<[string, StoreRecord]>;
  selectedZoneId: string | null;
  pickMode: boolean;
  draftCenter: { lat: number; lng: number };
  draftRadiusKm: number;
  draftEnabled: boolean;
  testerPoint: { lat: number; lng: number } | null;
  onMapPick: (lat: number, lng: number) => void;
  onSelectZone: (zoneId: string) => void;
}

function AreaCoverageMap({
  zones,
  stores,
  selectedZoneId,
  pickMode,
  draftCenter,
  draftRadiusKm,
  draftEnabled,
  testerPoint,
  onMapPick,
  onSelectZone,
}: AreaCoverageMapProps) {
  const loadingStatus = useApiLoadingStatus();

  useEffect(() => {
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus]);

  const handleMapClick = (e: MapMouseEvent) => {
    if (!pickMode || !e.detail?.latLng) return;
    onMapPick(
      Number(e.detail.latLng.lat.toFixed(6)),
      Number(e.detail.latLng.lng.toFixed(6))
    );
  };

  if (
    !MAPS_API_KEY ||
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <div className="service-map-fallback">
        <i
          className="fa-solid fa-map-location-dot"
          style={{ fontSize: '2rem', color: '#0284c7' }}
        ></i>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>
          Interactive Map Preview Unavailable
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          All area coordinates, radius calculations, PIN-code checks, and live
          zone controls continue to operate normally.
        </div>
      </div>
    );
  }

  return (
    <div className="service-map-wrapper">
      <GoogleMap
        id={SERVICE_MAP_ID}
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        defaultCenter={DEFAULT_CENTER}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI={false}
        clickableIcons={false}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Zone Centers */}
        {zones.map((z) => (
          <AdvancedMarker
            key={z.id}
            position={{ lat: z.centerLat, lng: z.centerLng }}
            title={`${z.name} (${z.radiusKm} km • ${z.enabled ? 'Active' : 'Paused'})`}
            zIndex={z.id === selectedZoneId ? 40 : 20}
            onClick={() => onSelectZone(z.id)}
          >
            <div
              className={`zone-map-pin ${
                z.id === selectedZoneId
                  ? 'selected'
                  : z.enabled
                    ? 'active'
                    : 'paused'
              }`}
            >
              <span>{z.areaCode || 'AREA'}</span>
            </div>
          </AdvancedMarker>
        ))}

        {/* Draft / Editing Marker Preview */}
        <AdvancedMarker
          position={draftCenter}
          title="Zone Editor Pin"
          zIndex={50}
        >
          <div className="zone-draft-pin" aria-label="Editing center pin">
            <i className="fa-solid fa-crosshairs"></i>
          </div>
        </AdvancedMarker>

        {/* Registered Store Pins */}
        {stores.map(([uid, s]) => {
          const lat = Number(s.lat);
          const lng = Number(s.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) {
            return null;
          }
          return (
            <AdvancedMarker
              key={`store-${uid}`}
              position={{ lat, lng }}
              title={`Store: ${s.name || 'Store'}`}
              zIndex={15}
            >
              <div className="fleet-pin fleet-pin-store" style={{ width: '22px', height: '22px', fontSize: '0.7rem' }}>
                <span aria-hidden="true">🏪</span>
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Coverage Test Point Marker */}
        {testerPoint && (
          <AdvancedMarker
            position={testerPoint}
            title="Coverage Check Location"
            zIndex={60}
          >
            <div
              className="fleet-pin"
              style={{
                background: '#a855f7',
                width: '24px',
                height: '24px',
                fontSize: '0.75rem',
              }}
            >
              <span aria-hidden="true">📍</span>
            </div>
          </AdvancedMarker>
        )}

        <GeofenceCircleLayer
          mapId={SERVICE_MAP_ID}
          zones={zones}
          selectedZoneId={selectedZoneId}
          draftZone={{
            lat: draftCenter.lat,
            lng: draftCenter.lng,
            radiusKm: draftRadiusKm,
            enabled: draftEnabled,
          }}
          onSelectZone={onSelectZone}
        />
      </GoogleMap>
    </div>
  );
}

export const ServiceAreasPanel: React.FC<ServiceAreasPanelProps> = ({
  activePanel,
  state,
  adminEmail,
  onToast,
  onConfirmDialog,
}) => {
  const zones = useMemo<ServiceAreaZone[]>(() => {
    return Object.entries(state.serviceAreas || {})
      .map(([id, z]) => ({ ...z, id: z.id || id }))
      .sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [state.serviceAreas]);

  const areaConfig: ServiceAreaConfig = state.serviceAreaConfig || {};

  // Policy State
  const [restrictOrders, setRestrictOrders] = useState(
    areaConfig.restrictOrdersToSelectedAreas === true
  );
  const [outsideMessage, setOutsideMessage] = useState(
    areaConfig.outsideAreaMessage ||
      'Delivery is currently unavailable in your selected location. Choose a serviceable Gossaigaon Bazar zone.'
  );
  const [fallbackCharge, setFallbackCharge] = useState(
    Number(areaConfig.defaultFallbackCharge ?? 35)
  );
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    setRestrictOrders(areaConfig.restrictOrdersToSelectedAreas === true);
    setOutsideMessage(
      areaConfig.outsideAreaMessage ||
        'Delivery is currently unavailable in your selected location. Choose a serviceable Gossaigaon Bazar zone.'
    );
    setFallbackCharge(Number(areaConfig.defaultFallbackCharge ?? 35));
  }, [
    areaConfig.restrictOrdersToSelectedAreas,
    areaConfig.outsideAreaMessage,
    areaConfig.defaultFallbackCharge,
  ]);

  // Editor & Selection State
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState(true);
  const [savingZone, setSavingZone] = useState(false);

  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formPins, setFormPins] = useState('783360');
  const [formLat, setFormLat] = useState(String(DEFAULT_CENTER.lat));
  const [formLng, setFormLng] = useState(String(DEFAULT_CENTER.lng));
  const [formRadiusKm, setFormRadiusKm] = useState(3.0);
  const [formDeliveryFee, setFormDeliveryFee] = useState(25);
  const [formFreeAbove, setFormFreeAbove] = useState(299);
  const [formMinOrder, setFormMinOrder] = useState(0);
  const [formEta, setFormEta] = useState('15–20 mins');
  const [formPriority, setFormPriority] = useState<
    'EXPRESS' | 'STANDARD' | 'EXTENDED'
  >('EXPRESS');
  const [formAllowCod, setFormAllowCod] = useState(true);
  const [formAllowUpi, setFormAllowUpi] = useState(true);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formPauseReason, setFormPauseReason] = useState('');

  // Filters & Coverage Tester
  const [zoneStatusFilter, setZoneStatusFilter] = useState<
    'ALL' | 'ACTIVE' | 'PAUSED'
  >('ALL');
  const [zoneSearch, setZoneSearch] = useState('');
  const [testLat, setTestLat] = useState(String(DEFAULT_CENTER.lat));
  const [testLng, setTestLng] = useState(String(DEFAULT_CENTER.lng));
  const [testPin, setTestPin] = useState('');

  const storesList = useMemo(
    () => Object.entries(state.restaurants || {}),
    [state.restaurants]
  );

  const loadZoneIntoEditor = (zone: ServiceAreaZone) => {
    setSelectedZoneId(zone.id);
    setEditingId(zone.id);
    setFormName(zone.name);
    setFormCode(zone.areaCode || '');
    setFormPins((zone.pinCodes || []).join(', '));
    setFormLat(String(zone.centerLat));
    setFormLng(String(zone.centerLng));
    setFormRadiusKm(Number(zone.radiusKm || 3));
    setFormDeliveryFee(Number(zone.deliveryCharge ?? 25));
    setFormFreeAbove(Number(zone.freeDeliveryAbove ?? 299));
    setFormMinOrder(Number(zone.minOrderAmount ?? 0));
    setFormEta(zone.etaText || '15–20 mins');
    setFormPriority(zone.priority || 'STANDARD');
    setFormAllowCod(zone.allowCod !== false);
    setFormAllowUpi(zone.allowUpi !== false);
    setFormEnabled(zone.enabled !== false);
    setFormPauseReason(zone.pauseReason || '');
  };

  const resetEditor = () => {
    setEditingId(null);
    setSelectedZoneId(null);
    setFormName('');
    setFormCode('');
    setFormPins('783360');
    setFormLat(String(DEFAULT_CENTER.lat));
    setFormLng(String(DEFAULT_CENTER.lng));
    setFormRadiusKm(3.0);
    setFormDeliveryFee(25);
    setFormFreeAbove(299);
    setFormMinOrder(0);
    setFormEta('15–20 mins');
    setFormPriority('EXPRESS');
    setFormAllowCod(true);
    setFormAllowUpi(true);
    setFormEnabled(true);
    setFormPauseReason('');
  };

  // KPI Metrics
  const kpis = useMemo(() => {
    const activeZones = zones.filter((z) => z.enabled);
    const pausedZones = zones.filter((z) => !z.enabled);
    let coveredStores = 0;

    storesList.forEach(([, s]) => {
      const sLat = Number(s.lat);
      const sLng = Number(s.lng);
      if (!Number.isFinite(sLat) || !Number.isFinite(sLng) || sLat === 0) return;
      const inAnyActive = activeZones.some(
        (z) =>
          calculateDistanceKm(sLat, sLng, z.centerLat, z.centerLng) <=
          Number(z.radiusKm || 0)
      );
      if (inAnyActive) coveredStores++;
    });

    return {
      total: zones.length,
      activeCount: activeZones.length,
      pausedCount: pausedZones.length,
      coveredStores,
      totalStores: storesList.length,
    };
  }, [zones, storesList]);

  // Coverage Evaluation Result for Coordinate / PIN Tester
  const coverageResult = useMemo(() => {
    const lat = Number(testLat);
    const lng = Number(testLng);
    const pin = testPin.trim();
    const validCoords =
      Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;

    if (!validCoords && !pin) {
      return null;
    }

    const matches = zones
      .map((z) => {
        const dist = validCoords
          ? calculateDistanceKm(lat, lng, z.centerLat, z.centerLng)
          : Infinity;
        const pinMatched = pin ? z.pinCodes?.includes(pin) : false;
        const radiusMatched = validCoords && dist <= Number(z.radiusKm || 0);
        return {
          zone: z,
          dist,
          pinMatched,
          radiusMatched,
          matched: pinMatched || radiusMatched,
        };
      })
      .filter((m) => m.matched)
      .sort((a, b) => {
        if (a.zone.enabled !== b.zone.enabled) return a.zone.enabled ? -1 : 1;
        return a.dist - b.dist;
      });

    return {
      validCoords,
      lat,
      lng,
      activeMatch: matches.find((m) => m.zone.enabled) || null,
      pausedMatch: matches.find((m) => !m.zone.enabled) || null,
    };
  }, [zones, testLat, testLng, testPin]);

  const filteredZones = useMemo(() => {
    const q = zoneSearch.trim().toLowerCase();
    return zones.filter((z) => {
      if (zoneStatusFilter === 'ACTIVE' && !z.enabled) return false;
      if (zoneStatusFilter === 'PAUSED' && z.enabled) return false;
      if (!q) return true;
      return (
        z.name.toLowerCase().includes(q) ||
        (z.areaCode || '').toLowerCase().includes(q) ||
        (z.pinCodes || []).some((p) => p.includes(q))
      );
    });
  }, [zones, zoneStatusFilter, zoneSearch]);

  const handleSaveGlobalPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      const payload: ServiceAreaConfig = {
        restrictOrdersToSelectedAreas: restrictOrders,
        outsideAreaMessage: sanitizeText(outsideMessage).trim(),
        defaultFallbackCharge: Math.max(0, Number(fallbackCharge || 0)),
        updatedAt: Date.now(),
        updatedBy: adminEmail,
      };
      await db.ref('admin/serviceAreaConfig').update(payload);
      onToast('Service Area global delivery policy updated live!', 'success');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = sanitizeText(formName).trim();
    const lat = Number(formLat);
    const lng = Number(formLng);
    const radiusKm = Number(formRadiusKm);

    if (!cleanName) {
      onToast('Please enter a Service Area Name.', 'warning');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) {
      onToast('Enter valid latitude & longitude coordinates.', 'warning');
      return;
    }
    if (!Number.isFinite(radiusKm) || radiusKm < 0.2 || radiusKm > 50) {
      onToast('Service radius must be between 0.2 km and 50 km.', 'warning');
      return;
    }

    const parsedPins = formPins
      .split(',')
      .map((p) => p.replace(/\D/g, '').trim())
      .filter((p) => p.length >= 4);

    const id =
      editingId ||
      `zone_${cleanName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')}_${Date.now().toString().slice(-4)}`;

    const payload: ServiceAreaZone = {
      id,
      name: cleanName,
      areaCode:
        sanitizeText(formCode).trim().toUpperCase() ||
        `AREA-${String(zones.length + 1).padStart(2, '0')}`,
      pinCodes: parsedPins,
      centerLat: lat,
      centerLng: lng,
      radiusKm,
      enabled: formEnabled,
      deliveryCharge: Math.max(0, Number(formDeliveryFee || 0)),
      freeDeliveryAbove: Math.max(0, Number(formFreeAbove || 0)),
      minOrderAmount: Math.max(0, Number(formMinOrder || 0)),
      etaText: sanitizeText(formEta).trim() || '20 mins',
      allowCod: formAllowCod,
      allowUpi: formAllowUpi,
      priority: formPriority,
      pauseReason: formEnabled ? '' : sanitizeText(formPauseReason).trim(),
      updatedAt: Date.now(),
      updatedBy: adminEmail,
    };

    setSavingZone(true);
    try {
      await db.ref(`admin/serviceAreas/${id}`).set(payload);
      setSelectedZoneId(id);
      setEditingId(id);
      onToast(
        editingId
          ? `Service Area "${cleanName}" updated live!`
          : `New Service Area "${cleanName}" created!`,
        'success'
      );
    } finally {
      setSavingZone(false);
    }
  };

  const handleToggleZoneEnabled = (zone: ServiceAreaZone) => {
    if (zone.enabled) {
      onConfirmDialog({
        mode: 'prompt',
        title: `Pause Service in ${zone.name}?`,
        message: 'Enter reason shown or logged when service is paused in this area:',
        defaultValue:
          zone.pauseReason || 'High order load / rider shortage in this area',
        confirmLabel: 'Pause Service Area',
        confirmVariant: 'warning',
        onConfirm: async (reason) => {
          await db.ref(`admin/serviceAreas/${zone.id}`).update({
            enabled: false,
            pauseReason: sanitizeText(reason || ''),
            updatedAt: Date.now(),
            updatedBy: adminEmail,
          });
          onToast(`Service paused in ${zone.name}.`, 'warning');
        },
      });
    } else {
      void db
        .ref(`admin/serviceAreas/${zone.id}`)
        .update({
          enabled: true,
          pauseReason: '',
          updatedAt: Date.now(),
          updatedBy: adminEmail,
        })
        .then(() => onToast(`Service resumed in ${zone.name}!`, 'success'));
    }
  };

  const handleDeleteZone = (zone: ServiceAreaZone) => {
    onConfirmDialog({
      mode: 'confirm',
      title: `Delete Service Area "${zone.name}"?`,
      message: `Remove "${zone.name}" (${zone.areaCode}) permanently from the active service controller?`,
      confirmLabel: 'Delete Area',
      confirmVariant: 'danger',
      onConfirm: async () => {
        await db.ref(`admin/serviceAreas/${zone.id}`).remove();
        if (editingId === zone.id) resetEditor();
        onToast(`Deleted service area "${zone.name}".`, 'info');
      },
    });
  };

  const handleSeedStarterZones = () => {
    onConfirmDialog({
      mode: 'confirm',
      title: 'Load Starter Gossaigaon Service Zones?',
      message:
        'Add 3 pre-configured Gossaigaon service zones (Town Core, Station & Hospital Road, Sapkata Highway Belt) so you can customize or toggle them immediately?',
      confirmLabel: 'Load Starter Zones',
      confirmVariant: 'primary',
      onConfirm: async () => {
        const updates: Record<string, unknown> = {};
        const now = Date.now();
        PRESET_ZONES.forEach((z) => {
          updates[`admin/serviceAreas/${z.id}`] = {
            ...z,
            updatedAt: now,
            updatedBy: adminEmail,
          };
        });
        await db.ref().update(updates);
        onToast('Loaded 3 Gossaigaon service areas!', 'success');
      },
    });
  };

  const parsedDraftLat = Number(formLat) || DEFAULT_CENTER.lat;
  const parsedDraftLng = Number(formLng) || DEFAULT_CENTER.lng;

  return (
    <section
      id="panel-service-areas"
      className={`panel-section ${activePanel === 'service-areas' ? 'active' : ''}`}
    >
      {/* KPI OVERVIEW STRIP */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <h4>Active Service Areas</h4>
            <div
              className="stat-value"
              style={{ color: '#059669', fontVariantNumeric: 'tabular-nums' }}
            >
              {kpis.activeCount} / {kpis.total}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#059669',
              background: 'rgba(16, 185, 129, 0.12)',
            }}
          >
            <i className="fa-solid fa-map-location-dot"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Paused / Blocked Areas</h4>
            <div
              className="stat-value"
              style={{
                color: kpis.pausedCount > 0 ? '#dc2626' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kpis.pausedCount}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#dc2626',
              background: 'rgba(239, 68, 68, 0.12)',
            }}
          >
            <i className="fa-solid fa-ban"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Stores in Active Zones</h4>
            <div
              className="stat-value"
              style={{ color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}
            >
              {kpis.coveredStores} / {kpis.totalStores}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#0284c7',
              background: 'rgba(2, 132, 199, 0.12)',
            }}
          >
            <i className="fa-solid fa-store"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Geofence Enforcement</h4>
            <div
              className="stat-value"
              style={{
                fontSize: '1.15rem',
                color: areaConfig.restrictOrdersToSelectedAreas
                  ? '#d97706'
                  : '#059669',
              }}
            >
              {areaConfig.restrictOrdersToSelectedAreas
                ? 'Selected Zones Only'
                : 'Open + Fallback'}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#d97706',
              background: 'rgba(245, 158, 11, 0.12)',
            }}
          >
            <i className="fa-solid fa-shield-halved"></i>
          </div>
        </div>
      </div>

      {/* GLOBAL SELECTED AREA ENFORCEMENT POLICY */}
      <form className="card" onSubmit={handleSaveGlobalPolicy}>
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-sliders"
              style={{ color: '#0284c7' }}
            ></i>{' '}
            Selected Area Delivery Policy
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleSeedStarterZones}
            >
              <i className="fa-solid fa-wand-magic-sparkles"></i> Load Starter
              Zones
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={savingPolicy}
            >
              <i className="fa-solid fa-floppy-disk"></i>{' '}
              {savingPolicy ? 'Saving...' : 'Save Area Policy'}
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          <div className="toggle-row" style={{ marginBottom: 0 }}>
            <label htmlFor="area-restrict-toggle">
              Restrict Orders to Active Selected Areas Only
            </label>
            <input
              id="area-restrict-toggle"
              type="checkbox"
              checked={restrictOrders}
              onChange={(e) => setRestrictOrders(e.target.checked)}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="area-fallback-fee">
              Outside Zone Fallback Fee (₹, when open)
            </label>
            <input
              id="area-fallback-fee"
              type="number"
              min={0}
              max={500}
              className="form-input"
              value={fallbackCharge}
              onChange={(e) => setFallbackCharge(Number(e.target.value))}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="area-outside-msg">
              Outside / Paused Area Customer Notice
            </label>
            <input
              id="area-outside-msg"
              type="text"
              className="form-input"
              value={outsideMessage}
              onChange={(e) => setOutsideMessage(e.target.value)}
            />
          </div>
        </div>
      </form>

      {/* INTERACTIVE MAP + ZONE CONTROLLER SPLIT */}
      <div className="service-area-split">
        {/* LEFT: MAP VIEWPORT + LIVE COVERAGE CHECKER */}
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-title">
            <span>
              <i
                className="fa-solid fa-location-crosshairs"
                style={{ color: '#22c55e' }}
              ></i>{' '}
              Selected Area Geofence Map
            </span>
            <button
              type="button"
              className={`btn btn-sm ${pickMode ? 'btn-info' : 'btn-outline'}`}
              onClick={() => setPickMode((p) => !p)}
            >
              <i className="fa-solid fa-hand-pointer"></i>{' '}
              {pickMode ? 'Click Map: Picks Zone Center' : 'Map Click: Locked'}
            </button>
          </div>

          {activePanel === 'service-areas' ? (
            <AreaCoverageMap
              zones={zones}
              stores={storesList}
              selectedZoneId={selectedZoneId}
              pickMode={pickMode}
              draftCenter={{ lat: parsedDraftLat, lng: parsedDraftLng }}
              draftRadiusKm={formRadiusKm}
              draftEnabled={formEnabled}
              testerPoint={
                coverageResult?.validCoords
                  ? { lat: coverageResult.lat, lng: coverageResult.lng }
                  : null
              }
              onMapPick={(lat, lng) => {
                setFormLat(String(lat));
                setFormLng(String(lng));
                onToast(`Picked coordinates: ${lat}, ${lng}`, 'info');
              }}
              onSelectZone={(id) => {
                const found = zones.find((z) => z.id === id);
                if (found) loadZoneIntoEditor(found);
              }}
            />
          ) : (
            <div className="service-map-wrapper" />
          )}

          <div className="service-map-legend">
            <span>
              <span className="legend-dot legend-dot-rider" /> Active Zone
            </span>
            <span>
              <span
                className="legend-dot"
                style={{ background: '#ef4444' }}
              />{' '}
              Paused Zone
            </span>
            <span>
              <span
                className="legend-dot"
                style={{ background: '#38bdf8' }}
              />{' '}
              Selected
            </span>
            <span>
              <span className="legend-dot legend-dot-store" /> Store
            </span>
          </div>

          {/* LIVE COVERAGE SIMULATOR */}
          <div className="coverage-tester-box">
            <div
              style={{
                fontWeight: 800,
                fontSize: '0.84rem',
                marginBottom: '8px',
                color: '#0f172a',
              }}
            >
              <i className="fa-solid fa-radar" style={{ color: '#a855f7' }}></i>{' '}
              Live Coordinate / PIN Coverage Simulator
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '8px',
                marginBottom: '8px',
              }}
            >
              <input
                type="text"
                className="form-input"
                placeholder="Lat (26.4524)"
                value={testLat}
                onChange={(e) => setTestLat(e.target.value)}
                aria-label="Test latitude"
              />
              <input
                type="text"
                className="form-input"
                placeholder="Lng (89.9723)"
                value={testLng}
                onChange={(e) => setTestLng(e.target.value)}
                aria-label="Test longitude"
              />
              <input
                type="text"
                className="form-input"
                placeholder="PIN (783360)"
                value={testPin}
                onChange={(e) =>
                  setTestPin(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                aria-label="Test PIN code"
              />
            </div>
            {coverageResult && (
              <div
                style={{
                  fontSize: '0.78rem',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {coverageResult.activeMatch ? (
                  <div style={{ color: '#059669', fontWeight: 700 }}>
                    ✓ SERVICEABLE · Zone: {coverageResult.activeMatch.zone.name}{' '}
                    ({coverageResult.activeMatch.zone.areaCode}) · Fee: ₹
                    {coverageResult.activeMatch.zone.deliveryCharge} · ETA:{' '}
                    {coverageResult.activeMatch.zone.etaText} · COD:{' '}
                    {coverageResult.activeMatch.zone.allowCod ? 'Yes' : 'No'}
                  </div>
                ) : coverageResult.pausedMatch ? (
                  <div style={{ color: '#dc2626', fontWeight: 700 }}>
                    ✕ PAUSED IN ZONE · {coverageResult.pausedMatch.zone.name}:{' '}
                    {coverageResult.pausedMatch.zone.pauseReason ||
                      'Temporarily disabled'}
                  </div>
                ) : (
                  <div style={{ color: '#b45309', fontWeight: 700 }}>
                    ! OUTSIDE ACTIVE ZONES ·{' '}
                    {areaConfig.restrictOrdersToSelectedAreas
                      ? 'Checkout blocked by policy'
                      : `Fallback delivery fee ₹${fallbackCharge}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: CREATE / EDIT SELECTED AREA CONTROLLER FORM */}
        <form
          className="card"
          style={{ marginBottom: 0 }}
          onSubmit={handleSaveZone}
        >
          <div className="card-title">
            <span>
              <i
                className="fa-solid fa-pen-ruler"
                style={{ color: '#d97706' }}
              ></i>{' '}
              {editingId ? `Edit Zone: ${formName}` : 'Add Selected Service Area'}
            </span>
            {editingId && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={resetEditor}
              >
                + New Zone
              </button>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr',
              gap: '10px',
            }}
          >
            <div className="form-group">
              <label htmlFor="zone-name">Area / Locality Name</label>
              <input
                id="zone-name"
                type="text"
                className="form-input"
                placeholder="e.g. Gossaigaon Town Core"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-code">Zone Code</label>
              <input
                id="zone-code"
                type="text"
                className="form-input"
                style={{ textTransform: 'uppercase' }}
                placeholder="GSG-01"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            <div className="form-group">
              <label htmlFor="zone-pins">Service PIN Codes (comma sep)</label>
              <input
                id="zone-pins"
                type="text"
                className="form-input"
                placeholder="783360, 783361"
                value={formPins}
                onChange={(e) => setFormPins(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-tier">Service Tier</label>
              <select
                id="zone-tier"
                className="form-select"
                value={formPriority}
                onChange={(e) =>
                  setFormPriority(
                    e.target.value as 'EXPRESS' | 'STANDARD' | 'EXTENDED'
                  )
                }
              >
                <option value="EXPRESS">EXPRESS (Fast Dispatch)</option>
                <option value="STANDARD">STANDARD (City)</option>
                <option value="EXTENDED">EXTENDED (Outskirts)</option>
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '10px',
            }}
          >
            <div className="form-group">
              <label htmlFor="zone-lat">Center Lat</label>
              <input
                id="zone-lat"
                type="number"
                step="0.000001"
                className="form-input"
                value={formLat}
                onChange={(e) => setFormLat(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-lng">Center Lng</label>
              <input
                id="zone-lng"
                type="number"
                step="0.000001"
                className="form-input"
                value={formLng}
                onChange={(e) => setFormLng(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-radius">Radius (km): {formRadiusKm}</label>
              <input
                id="zone-radius"
                type="number"
                step="0.5"
                min={0.5}
                max={30}
                className="form-input"
                value={formRadiusKm}
                onChange={(e) => setFormRadiusKm(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '10px',
            }}
          >
            <div className="form-group">
              <label htmlFor="zone-fee">Fee (₹)</label>
              <input
                id="zone-fee"
                type="number"
                min={0}
                className="form-input"
                value={formDeliveryFee}
                onChange={(e) => setFormDeliveryFee(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-free">Free ≥ (₹)</label>
              <input
                id="zone-free"
                type="number"
                min={0}
                className="form-input"
                value={formFreeAbove}
                onChange={(e) => setFormFreeAbove(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-min">Min Order (₹)</label>
              <input
                id="zone-min"
                type="number"
                min={0}
                className="form-input"
                value={formMinOrder}
                onChange={(e) => setFormMinOrder(Number(e.target.value))}
              />
            </div>
            <div className="form-group">
              <label htmlFor="zone-eta">ETA Text</label>
              <input
                id="zone-eta"
                type="text"
                className="form-input"
                value={formEta}
                onChange={(e) => setFormEta(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginBottom: '0.85rem',
            }}
          >
            <div className="toggle-row" style={{ marginBottom: 0 }}>
              <label htmlFor="zone-enabled-chk">Service Active</label>
              <input
                id="zone-enabled-chk"
                type="checkbox"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
              />
            </div>
            <div className="toggle-row" style={{ marginBottom: 0 }}>
              <label htmlFor="zone-cod-chk">Allow COD</label>
              <input
                id="zone-cod-chk"
                type="checkbox"
                checked={formAllowCod}
                onChange={(e) => setFormAllowCod(e.target.checked)}
              />
            </div>
            <div className="toggle-row" style={{ marginBottom: 0 }}>
              <label htmlFor="zone-upi-chk">Allow UPI</label>
              <input
                id="zone-upi-chk"
                type="checkbox"
                checked={formAllowUpi}
                onChange={(e) => setFormAllowUpi(e.target.checked)}
              />
            </div>
          </div>

          {!formEnabled && (
            <div className="form-group">
              <label htmlFor="zone-pause-reason">
                Service Pause Notice (shown when disabled)
              </label>
              <input
                id="zone-pause-reason"
                type="text"
                className="form-input"
                placeholder="e.g. Heavy rain / temporary rider shortage"
                value={formPauseReason}
                onChange={(e) => setFormPauseReason(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={savingZone}
          >
            <i className="fa-solid fa-location-dot"></i>{' '}
            {savingZone
              ? 'Syncing Area...'
              : editingId
                ? 'Update Selected Service Area'
                : 'Create Selected Service Area'}
          </button>
        </form>
      </div>

      {/* ALL SELECTED AREAS TABLE */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-layer-group"
              style={{ color: '#0284c7' }}
            ></i>{' '}
            Configured Service Areas ({zones.length})
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-input"
              style={{ maxWidth: '220px', padding: '0.45rem 0.85rem' }}
              placeholder="Search area name, code, PIN..."
              value={zoneSearch}
              onChange={(e) => setZoneSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="filters-bar">
          {(
            [
              ['ALL', `All Areas (${zones.length})`],
              ['ACTIVE', `Active (${kpis.activeCount})`],
              ['PAUSED', `Paused (${kpis.pausedCount})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${zoneStatusFilter === key ? 'active' : ''}`}
              onClick={() => setZoneStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Area &amp; Tier</th>
                <th>PIN Codes &amp; Radius</th>
                <th>Fee / Min / ETA</th>
                <th>Payments</th>
                <th>Stores Covered</th>
                <th>Service Status</th>
                <th>Controller Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredZones.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {zones.length === 0 ? (
                      <div>
                        <div style={{ marginBottom: '0.75rem' }}>
                          No service areas configured yet. Create a zone on the
                          map or load starter Gossaigaon areas.
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={handleSeedStarterZones}
                        >
                          Load Starter Gossaigaon Zones
                        </button>
                      </div>
                    ) : (
                      'No service areas match this filter.'
                    )}
                  </td>
                </tr>
              ) : (
                filteredZones.map((zone) => {
                  const coveredStoresCount = storesList.filter(([, s]) => {
                    const sLat = Number(s.lat);
                    const sLng = Number(s.lng);
                    if (!Number.isFinite(sLat) || !Number.isFinite(sLng) || sLat === 0)
                      return false;
                    return (
                      calculateDistanceKm(
                        sLat,
                        sLng,
                        zone.centerLat,
                        zone.centerLng
                      ) <= Number(zone.radiusKm || 0)
                    );
                  }).length;

                  return (
                    <tr
                      key={zone.id}
                      style={
                        selectedZoneId === zone.id
                          ? { background: 'rgba(56, 189, 248, 0.08)' }
                          : undefined
                      }
                    >
                      <td>
                        <strong>{zone.name}</strong>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {zone.areaCode} · {zone.priority}
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ fontWeight: 700, color: '#0284c7' }}>
                          {zone.radiusKm} km radius
                        </div>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          PINs:{' '}
                          {zone.pinCodes?.length
                            ? zone.pinCodes.join(', ')
                            : 'GPS Radius Only'}
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <strong>₹{zone.deliveryCharge}</strong>{' '}
                        <small style={{ color: 'var(--text-muted)' }}>
                          (Free ≥ ₹{zone.freeDeliveryAbove})
                        </small>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          Min: ₹{zone.minOrderAmount} · {zone.etaText}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                          {zone.allowCod ? 'COD: ON' : 'COD: OFF'} ·{' '}
                          {zone.allowUpi ? 'UPI: ON' : 'UPI: OFF'}
                        </div>
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <strong>{coveredStoresCount}</strong> store(s)
                      </td>
                      <td>
                        {zone.enabled ? (
                          <span className="badge badge-success">Active</span>
                        ) : (
                          <div>
                            <span className="badge badge-danger">Paused</span>
                            {zone.pauseReason && (
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  color: '#dc2626',
                                  marginTop: '3px',
                                  maxWidth: '160px',
                                }}
                              >
                                {zone.pauseReason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap',
                          }}
                        >
                          <button
                            type="button"
                            className={`btn btn-sm ${zone.enabled ? 'btn-warning' : 'btn-success'}`}
                            onClick={() => handleToggleZoneEnabled(zone)}
                          >
                            {zone.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => loadZoneIntoEditor(zone)}
                            title="Focus & Edit Zone"
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDeleteZone(zone)}
                            title="Delete Zone"
                          >
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
