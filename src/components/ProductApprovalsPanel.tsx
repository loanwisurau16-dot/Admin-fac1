import React, { useMemo, useState } from 'react';
import { db } from '../firebase';
import { AdminState, MenuItemRecord } from '../types';
import { buildWhatsAppUrl, sanitizeText } from '../utils/helpers';
import { sanitizeUrlSafe } from '../utils/security';
import { DialogConfig } from './ActionDialogModal';

export type ProductFilterTab =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FLAGGED'
  | 'LOW_STOCK'
  | 'ALL';

interface ProductApprovalsPanelProps {
  activePanel: string;
  state: AdminState;
  adminEmail: string;
  filter: ProductFilterTab;
  onChangeFilter: (filter: ProductFilterTab) => void;
  onVerifyProduct: (storeId: string, itemId: string, approve: boolean) => void;
  onOpenStoreModal: (storeUid: string) => void;
  onOpenScreenshot: (src: string, title: string) => void;
  onToast: (
    msg: string,
    type?: 'success' | 'danger' | 'info' | 'warning'
  ) => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
}

interface EnrichedProductRow {
  key: string;
  storeId: string;
  storeName: string;
  storePhone: string;
  itemId: string;
  item: MenuItemRecord;
  isApproved: boolean;
  isRejected: boolean;
  isPending: boolean;
  stockCount: number | null;
  effectiveThreshold: number;
  isOutOfStock: boolean;
  isLowStock: boolean;
  flags: string[];
  hasFlags: boolean;
}

function getNumericStock(item: MenuItemRecord): number | null {
  const candidates = [item.stockQty, item.stock, item.quantity];
  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) {
        return Math.floor(n);
      }
    }
  }
  return null;
}

function getProductQualityFlags(item: MenuItemRecord): string[] {
  const flags: string[] = [];
  const price = Number(item.price || 0);
  const mrp = Number(item.mrp || 0);
  if (!Number.isFinite(price) || price <= 0) {
    flags.push('Invalid price (<= ₹0)');
  }
  if (mrp > 0 && price > mrp) {
    flags.push('Selling price > MRP');
  }
  if (!sanitizeUrlSafe(item.imageUrl)) {
    flags.push('Missing/invalid image');
  }
  if (!item.name || item.name.trim().length < 2) {
    flags.push('Short/missing name');
  }
  return flags;
}

export const ProductApprovalsPanel: React.FC<ProductApprovalsPanelProps> = ({
  activePanel,
  state,
  adminEmail,
  filter,
  onChangeFilter,
  onVerifyProduct,
  onOpenStoreModal,
  onOpenScreenshot,
  onToast,
  onConfirmDialog,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [storeFilter, setStoreFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const [lowStockThreshold, setLowStockThreshold] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('gb_low_stock_threshold'));
      return Number.isFinite(saved) && saved >= 1 ? saved : 10;
    } catch {
      return 10;
    }
  });
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  // Product Inspection & Quick Edit Modal State
  const [inspectTarget, setInspectTarget] = useState<EnrichedProductRow | null>(
    null
  );
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editMrp, setEditMrp] = useState('');
  const [editStockQty, setEditStockQty] = useState('');
  const [editLowThreshold, setEditLowThreshold] = useState('');
  const [editKeywords, setEditKeywords] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editAvailable, setEditAvailable] = useState(true);
  const [editOnSale, setEditOnSale] = useState(false);
  const [savingInspect, setSavingInspect] = useState(false);

  const handleThresholdChange = (rawVal: string) => {
    const parsed = Math.max(1, Math.min(500, Math.floor(Number(rawVal) || 10)));
    setLowStockThreshold(parsed);
    try {
      localStorage.setItem('gb_low_stock_threshold', String(parsed));
    } catch {
      // ignore storage errors
    }
  };

  const allProducts = useMemo<EnrichedProductRow[]>(() => {
    const list: EnrichedProductRow[] = [];
    Object.entries(state.menus || {}).forEach(([storeId, items]) => {
      const store = state.restaurants[storeId];
      const storeName = store?.name || 'Store';
      const storePhone = store?.phone || '';
      Object.entries(items || {}).forEach(([itemId, item]) => {
        if (!item) return;
        const isApproved = item.adminApproved === true;
        const isRejected = !isApproved && item.approvalStatus === 'REJECTED';
        const isPending = !isApproved && !isRejected;
        const stockCount = getNumericStock(item);
        const itemThr = Number(item.lowStockThreshold);
        const effectiveThreshold =
          Number.isFinite(itemThr) && itemThr > 0 ? itemThr : lowStockThreshold;
        const isOutOfStock =
          item.available === false || (stockCount !== null && stockCount <= 0);
        const isLowStock =
          isOutOfStock ||
          (stockCount !== null && stockCount <= effectiveThreshold);
        const flags = getProductQualityFlags(item);
        list.push({
          key: `${storeId}::${itemId}`,
          storeId,
          storeName,
          storePhone,
          itemId,
          item,
          isApproved,
          isRejected,
          isPending,
          stockCount,
          effectiveThreshold,
          isOutOfStock,
          isLowStock,
          flags,
          hasFlags: flags.length > 0,
        });
      });
    });

    list.sort((a, b) => {
      if (a.isPending !== b.isPending) return a.isPending ? -1 : 1;
      const tA = Math.max(
        a.item.updatedAt || 0,
        a.item.rejectedAt || 0,
        a.item.approvedAt || 0
      );
      const tB = Math.max(
        b.item.updatedAt || 0,
        b.item.rejectedAt || 0,
        b.item.approvedAt || 0
      );
      if (tA !== tB) return tB - tA;
      return (a.item.name || '').localeCompare(b.item.name || '');
    });

    return list;
  }, [state.menus, state.restaurants, lowStockThreshold]);

  const lowStockRows = useMemo(() => {
    return allProducts
      .filter((p) => p.isLowStock && !p.isRejected)
      .sort((a, b) => {
        if (a.isOutOfStock !== b.isOutOfStock) return a.isOutOfStock ? -1 : 1;
        const qA = a.isOutOfStock ? 0 : (a.stockCount ?? 0);
        const qB = b.isOutOfStock ? 0 : (b.stockCount ?? 0);
        if (qA !== qB) return qA - qB;
        return a.storeName.localeCompare(b.storeName);
      });
  }, [allProducts]);

  const lowStockByStore = useMemo(() => {
    const grouped: Record<
      string,
      {
        storeId: string;
        storeName: string;
        storePhone: string;
        items: EnrichedProductRow[];
      }
    > = {};
    lowStockRows.forEach((row) => {
      if (!grouped[row.storeId]) {
        grouped[row.storeId] = {
          storeId: row.storeId,
          storeName: row.storeName,
          storePhone: row.storePhone,
          items: [],
        };
      }
      grouped[row.storeId].items.push(row);
    });
    return Object.values(grouped).sort(
      (a, b) => b.items.length - a.items.length
    );
  }, [lowStockRows]);

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let flagged = 0;
    let lowStock = 0;
    allProducts.forEach((p) => {
      if (p.isPending) pending++;
      else if (p.isApproved) approved++;
      else if (p.isRejected) rejected++;
      if (p.hasFlags) flagged++;
      if (p.isLowStock && !p.isRejected) lowStock++;
    });
    return {
      total: allProducts.length,
      pending,
      approved,
      rejected,
      flagged,
      lowStock,
    };
  }, [allProducts]);

  const storeOptions = useMemo(() => {
    const map = new Map<string, string>();
    allProducts.forEach((p) => map.set(p.storeId, p.storeName));
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allProducts]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    allProducts.forEach((p) => {
      const cat = (p.item.category || '').trim();
      if (cat) set.add(cat);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allProducts.filter((p) => {
      if (filter === 'PENDING' && !p.isPending) return false;
      if (filter === 'APPROVED' && !p.isApproved) return false;
      if (filter === 'REJECTED' && !p.isRejected) return false;
      if (filter === 'FLAGGED' && !p.hasFlags) return false;
      if (filter === 'LOW_STOCK' && (!p.isLowStock || p.isRejected)) return false;
      if (storeFilter !== 'ALL' && p.storeId !== storeFilter) return false;
      if (
        categoryFilter !== 'ALL' &&
        (p.item.category || '').trim() !== categoryFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        (p.item.name || '').toLowerCase().includes(q) ||
        p.storeName.toLowerCase().includes(q) ||
        (p.item.category || '').toLowerCase().includes(q) ||
        (p.item.searchKeywords || '').toLowerCase().includes(q) ||
        (p.item.description || '').toLowerCase().includes(q) ||
        (p.item.rejectionReason || '').toLowerCase().includes(q)
      );
    });
  }, [allProducts, filter, storeFilter, categoryFilter, searchQuery]);

  const productByKey = useMemo(() => {
    const map: Record<string, EnrichedProductRow> = {};
    allProducts.forEach((p) => {
      map[p.key] = p;
    });
    return map;
  }, [allProducts]);

  const validSelectedKeys = useMemo(
    () => selectedKeys.filter((k) => Boolean(productByKey[k])),
    [selectedKeys, productByKey]
  );

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => validSelectedKeys.includes(p.key));

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredSet = new Set(filteredProducts.map((p) => p.key));
      setSelectedKeys((prev) => prev.filter((k) => !filteredSet.has(k)));
    } else {
      const merged = new Set(validSelectedKeys);
      filteredProducts.forEach((p) => merged.add(p.key));
      setSelectedKeys(Array.from(merged));
    }
  };

  const openInspector = (row: EnrichedProductRow) => {
    setInspectTarget(row);
    setEditName(row.item.name || '');
    setEditCategory(row.item.category || '');
    setEditPrice(String(row.item.price ?? 0));
    setEditMrp(row.item.mrp !== undefined ? String(row.item.mrp) : '');
    setEditStockQty(row.stockCount !== null ? String(row.stockCount) : '');
    setEditLowThreshold(
      row.item.lowStockThreshold !== undefined
        ? String(row.item.lowStockThreshold)
        : ''
    );
    setEditKeywords(row.item.searchKeywords || '');
    setEditDescription(row.item.description || '');
    setEditImageUrl(row.item.imageUrl || '');
    setEditAvailable(row.item.available !== false);
    setEditOnSale(Boolean(row.item.isOnSale));
  };

  const handleSaveInspect = async (
    mode: 'SAVE_APPROVE' | 'SAVE_ONLY' | 'RESET_PENDING'
  ) => {
    if (!inspectTarget) return;
    const cleanName = sanitizeText(editName).trim();
    const numPrice = Number(editPrice);
    const numMrp = editMrp.trim() ? Number(editMrp) : 0;

    if (!cleanName) {
      onToast('Product name cannot be empty.', 'warning');
      return;
    }
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      onToast('Selling price must be greater than ₹0.', 'warning');
      return;
    }

    const discountPercent =
      numMrp > numPrice
        ? Math.round(((numMrp - numPrice) / numMrp) * 100)
        : 0;

    const now = Date.now();
    const parsedStock =
      editStockQty.trim() !== '' && Number.isFinite(Number(editStockQty))
        ? Math.max(0, Math.floor(Number(editStockQty)))
        : undefined;
    const parsedLowThreshold =
      editLowThreshold.trim() !== '' && Number.isFinite(Number(editLowThreshold))
        ? Math.max(1, Math.floor(Number(editLowThreshold)))
        : undefined;

    const updates: Partial<MenuItemRecord> = {
      name: cleanName,
      category: sanitizeText(editCategory).trim() || 'Auto',
      price: numPrice,
      mrp: numMrp > 0 ? numMrp : numPrice,
      discountPercent,
      isOnSale: editOnSale || discountPercent > 0,
      available: parsedStock !== undefined ? editAvailable && parsedStock > 0 : editAvailable,
      searchKeywords: sanitizeText(editKeywords).trim(),
      description: sanitizeText(editDescription).trim(),
      imageUrl: sanitizeUrlSafe(editImageUrl),
      updatedAt: now,
    };
    if (parsedStock !== undefined) {
      updates.stockQty = parsedStock;
    }
    if (parsedLowThreshold !== undefined) {
      updates.lowStockThreshold = parsedLowThreshold;
    }

    if (mode === 'SAVE_APPROVE') {
      updates.adminApproved = true;
      updates.approvalStatus = 'APPROVED';
      updates.rejectionReason = '';
      updates.approvedAt = now;
      updates.approvedBy = adminEmail;
    } else if (mode === 'RESET_PENDING') {
      updates.adminApproved = false;
      updates.approvalStatus = 'PENDING';
      updates.rejectionReason = '';
    }

    setSavingInspect(true);
    try {
      await db
        .ref(`menus/${inspectTarget.storeId}/${inspectTarget.itemId}`)
        .update(updates);
      setInspectTarget(null);
      onToast(
        mode === 'SAVE_APPROVE'
          ? 'Product updated, approved & live!'
          : mode === 'RESET_PENDING'
            ? 'Product moved back to Pending Review.'
            : 'Product details updated.',
        'success'
      );
    } finally {
      setSavingInspect(false);
    }
  };

  const handleResetToPending = async (storeId: string, itemId: string) => {
    await db.ref(`menus/${storeId}/${itemId}`).update({
      adminApproved: false,
      approvalStatus: 'PENDING',
      rejectionReason: '',
      updatedAt: Date.now(),
    });
    onToast('Moved back to Pending Verification.', 'info');
  };

  const handleApproveAllPending = () => {
    const pendingList = allProducts.filter((p) => p.isPending);
    if (pendingList.length === 0) {
      onToast('No pending products to approve!', 'info');
      return;
    }
    const flaggedCount = pendingList.filter((p) => p.hasFlags).length;
    onConfirmDialog({
      mode: 'confirm',
      title: `Approve ${pendingList.length} Pending Product(s)?`,
      message:
        flaggedCount > 0
          ? `${flaggedCount} pending product(s) have quality flags (missing image or price > MRP). Approve all ${pendingList.length} pending items anyway?`
          : `Approve all ${pendingList.length} pending store products and make them live for customers?`,
      confirmLabel: `Approve All (${pendingList.length})`,
      confirmVariant: flaggedCount > 0 ? 'warning' : 'primary',
      onConfirm: async () => {
        const updates: Record<string, unknown> = {};
        const now = Date.now();
        pendingList.forEach(({ storeId, itemId }) => {
          updates[`menus/${storeId}/${itemId}/adminApproved`] = true;
          updates[`menus/${storeId}/${itemId}/approvalStatus`] = 'APPROVED';
          updates[`menus/${storeId}/${itemId}/rejectionReason`] = '';
          updates[`menus/${storeId}/${itemId}/approvedAt`] = now;
          updates[`menus/${storeId}/${itemId}/approvedBy`] = adminEmail;
          updates[`menus/${storeId}/${itemId}/updatedAt`] = now;
        });
        await db.ref().update(updates);
        onToast(
          `${pendingList.length} pending products approved & live!`,
          'success'
        );
      },
    });
  };

  const handleBulkApproveSelected = () => {
    if (validSelectedKeys.length === 0) return;
    const rows = validSelectedKeys
      .map((k) => productByKey[k])
      .filter((r): r is EnrichedProductRow => Boolean(r));
    onConfirmDialog({
      mode: 'confirm',
      title: `Bulk Approve ${rows.length} Product(s)`,
      message: `Approve ${rows.length} selected product(s) and publish them to live customer catalogs?`,
      confirmLabel: 'Approve Selected',
      confirmVariant: 'primary',
      onConfirm: async () => {
        const updates: Record<string, unknown> = {};
        const now = Date.now();
        rows.forEach(({ storeId, itemId }) => {
          updates[`menus/${storeId}/${itemId}/adminApproved`] = true;
          updates[`menus/${storeId}/${itemId}/approvalStatus`] = 'APPROVED';
          updates[`menus/${storeId}/${itemId}/rejectionReason`] = '';
          updates[`menus/${storeId}/${itemId}/approvedAt`] = now;
          updates[`menus/${storeId}/${itemId}/approvedBy`] = adminEmail;
          updates[`menus/${storeId}/${itemId}/updatedAt`] = now;
        });
        await db.ref().update(updates);
        setSelectedKeys([]);
        onToast(`${rows.length} selected product(s) approved & live!`, 'success');
      },
    });
  };

  const handleBulkRejectSelected = () => {
    if (validSelectedKeys.length === 0) return;
    const rows = validSelectedKeys
      .map((k) => productByKey[k])
      .filter((r): r is EnrichedProductRow => Boolean(r));
    onConfirmDialog({
      mode: 'prompt',
      title: `Bulk Reject ${rows.length} Product(s)`,
      message: `Enter rejection reason for ${rows.length} selected product(s):`,
      defaultValue: 'Invalid price / image or incomplete details',
      placeholder: 'Rejection reason...',
      confirmLabel: 'Reject Selected',
      confirmVariant: 'danger',
      onConfirm: async (reason) => {
        const updates: Record<string, unknown> = {};
        const now = Date.now();
        const cleanReason = sanitizeText(reason || '');
        rows.forEach(({ storeId, itemId }) => {
          updates[`menus/${storeId}/${itemId}/adminApproved`] = false;
          updates[`menus/${storeId}/${itemId}/approvalStatus`] = 'REJECTED';
          updates[`menus/${storeId}/${itemId}/rejectionReason`] = cleanReason;
          updates[`menus/${storeId}/${itemId}/rejectedAt`] = now;
          updates[`menus/${storeId}/${itemId}/rejectedBy`] = adminEmail;
          updates[`menus/${storeId}/${itemId}/updatedAt`] = now;
        });
        await db.ref().update(updates);
        setSelectedKeys([]);
        onToast(`${rows.length} selected product(s) rejected.`, 'danger');
      },
    });
  };

  const handleBulkResetPending = async () => {
    if (validSelectedKeys.length === 0) return;
    const rows = validSelectedKeys
      .map((k) => productByKey[k])
      .filter((r): r is EnrichedProductRow => Boolean(r));
    const updates: Record<string, unknown> = {};
    const now = Date.now();
    rows.forEach(({ storeId, itemId }) => {
      updates[`menus/${storeId}/${itemId}/adminApproved`] = false;
      updates[`menus/${storeId}/${itemId}/approvalStatus`] = 'PENDING';
      updates[`menus/${storeId}/${itemId}/rejectionReason`] = '';
      updates[`menus/${storeId}/${itemId}/updatedAt`] = now;
    });
    await db.ref().update(updates);
    setSelectedKeys([]);
    onToast(`${rows.length} product(s) moved to Pending Review.`, 'info');
  };

  return (
    <section
      id="panel-product-approvals"
      className={`panel-section ${activePanel === 'product-approvals' ? 'active' : ''}`}
    >
      {/* KPI OVERVIEW STRIP */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-info">
            <h4>Pending Verification</h4>
            <div
              className="stat-value"
              style={{
                color: counts.pending > 0 ? 'var(--warning)' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {counts.pending}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: 'var(--warning)',
              background: 'rgba(245, 158, 11, 0.12)',
            }}
          >
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Approved &amp; Live</h4>
            <div
              className="stat-value"
              style={{
                color: '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {counts.approved}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#059669',
              background: 'rgba(16, 185, 129, 0.12)',
            }}
          >
            <i className="fa-solid fa-circle-check"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Rejected Items</h4>
            <div
              className="stat-value"
              style={{
                color: counts.rejected > 0 ? '#dc2626' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {counts.rejected}
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
            <h4>Quality Flagged</h4>
            <div
              className="stat-value"
              style={{
                color: counts.flagged > 0 ? '#d97706' : '#0284c7',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {counts.flagged}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: '#0284c7',
              background: 'rgba(2, 132, 199, 0.12)',
            }}
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-info">
            <h4>Low-Stock Alerts</h4>
            <div
              className="stat-value"
              style={{
                color: counts.lowStock > 0 ? '#dc2626' : '#059669',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {counts.lowStock}
            </div>
          </div>
          <div
            className="stat-icon"
            style={{
              color: counts.lowStock > 0 ? '#dc2626' : '#059669',
              background:
                counts.lowStock > 0
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'rgba(16, 185, 129, 0.12)',
            }}
          >
            <i className="fa-solid fa-boxes-stacked"></i>
          </div>
        </div>
      </div>

      {/* LOW-STOCK RADAR CARD */}
      <div className="card low-stock-radar-card">
        <div className="card-title" style={{ marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <i
              className="fa-solid fa-boxes-stacked"
              style={{ color: '#d97706' }}
            ></i>
            <span>Low-Stock Radar</span>
            {lowStockRows.length > 0 ? (
              <span className="badge badge-danger">
                {lowStockRows.length} Alert(s)
              </span>
            ) : (
              <span className="badge badge-success">Inventory Healthy</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <label
              htmlFor="low-stock-threshold-input"
              style={{
                fontSize: '0.74rem',
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}
            >
              Alert Below (units):
            </label>
            <input
              id="low-stock-threshold-input"
              type="number"
              min={1}
              max={500}
              className="form-input"
              style={{ width: '74px', padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
              value={lowStockThreshold}
              onChange={(e) => handleThresholdChange(e.target.value)}
            />
            {lowStockRows.length > 0 && (
              <button
                type="button"
                className={`btn btn-sm ${filter === 'LOW_STOCK' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() =>
                  onChangeFilter(filter === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')
                }
              >
                <i className="fa-solid fa-filter"></i>{' '}
                {filter === 'LOW_STOCK' ? 'Showing Low Stock' : 'Filter Table'}
              </button>
            )}
          </div>
        </div>

        {lowStockRows.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '0.9rem',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
            }}
          >
            ✅ No out-of-stock or low-stock items detected (threshold ≤ {lowStockThreshold} units).
          </div>
        ) : (
          <>
            {/* STORE OWNER BULK WHATSAPP ALERT BUTTONS */}
            <div className="low-stock-store-strip">
              {lowStockByStore.map((group) => {
                const summaryLines = group.items
                  .slice(0, 8)
                  .map(
                    (it) =>
                      `• ${it.item.name} (${it.isOutOfStock ? 'OUT OF STOCK' : `${it.stockCount} left`})`
                  )
                  .join('\n');
                const moreLine =
                  group.items.length > 8
                    ? `\n...and ${group.items.length - 8} more item(s).`
                    : '';
                const waUrl = buildWhatsAppUrl(
                  group.storePhone,
                  `Hello ${group.storeName}, this is Gossaigaon Bazar Admin. Following item(s) have low/zero stock:\n${summaryLines}${moreLine}\nPlease restock and update your inventory!`
                );

                return waUrl ? (
                  <a
                    key={group.storeId}
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="low-stock-store-btn"
                    title={`Message ${group.storeName} (${group.storePhone}) about ${group.items.length} low-stock item(s)`}
                  >
                    <i className="fa-brands fa-whatsapp"></i>
                    <span>
                      Alert {group.storeName} ({group.items.length})
                    </span>
                  </a>
                ) : (
                  <button
                    key={group.storeId}
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => onOpenStoreModal(group.storeId)}
                    title="Store phone missing — open Store modal to add contact"
                  >
                    <i className="fa-solid fa-phone-slash"></i> {group.storeName} ({group.items.length}) • Add Phone
                  </button>
                );
              })}
            </div>

            {/* LOW-STOCK ITEM LIST */}
            <div className="low-stock-list">
              {(showAllLowStock ? lowStockRows : lowStockRows.slice(0, 6)).map(
                (row) => {
                  const pct = row.isOutOfStock
                    ? 0
                    : Math.min(
                        100,
                        Math.max(
                          6,
                          Math.round(
                            ((row.stockCount ?? 0) /
                              Math.max(1, row.effectiveThreshold)) *
                              100
                          )
                        )
                      );
                  const singleWaUrl = buildWhatsAppUrl(
                    row.storePhone,
                    `Hello ${row.storeName}, your item "${row.item.name}" on Gossaigaon Bazar is ${row.isOutOfStock ? 'OUT OF STOCK' : `running low (${row.stockCount} left)`}. Please restock soon!`
                  );

                  return (
                    <div
                      key={row.key}
                      className={`low-stock-row ${row.isOutOfStock ? 'critical' : 'warning'}`}
                    >
                      <div className="low-stock-row-main">
                        <span
                          className={`badge ${row.isOutOfStock ? 'badge-danger' : 'badge-warning'}`}
                          style={{ fontSize: '0.64rem', minWidth: '88px', textAlign: 'center' }}
                        >
                          {row.isOutOfStock
                            ? 'OUT OF STOCK'
                            : `LOW: ${row.stockCount} left`}
                        </span>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.84rem' }}>
                            {row.item.name}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            🏪 {row.storeName} • ₹{Number(row.item.price || 0).toFixed(0)}
                            {row.storePhone ? ` • 📱 ${row.storePhone}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="low-stock-meter-col">
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            marginBottom: '4px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <span style={{ color: row.isOutOfStock ? '#dc2626' : '#b45309' }}>
                            {row.isOutOfStock
                              ? '0 units remaining'
                              : `${row.stockCount} units left`}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Alert ≤ {row.effectiveThreshold}
                          </span>
                        </div>
                        <div
                          className="risk-radar-bar-track"
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                        >
                          <div
                            className="risk-radar-bar-fill"
                            style={{
                              width: `${row.isOutOfStock ? 4 : pct}%`,
                              background: row.isOutOfStock ? '#ef4444' : '#f59e0b',
                            }}
                          />
                        </div>
                      </div>

                      <div className="low-stock-actions">
                        {singleWaUrl ? (
                          <a
                            href={singleWaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="whatsapp-icon-link"
                            style={{ width: 'auto', padding: '0 10px', gap: '5px', fontSize: '0.72rem', fontWeight: 800 }}
                            title={`Message ${row.storeName} owner on WhatsApp`}
                          >
                            <i className="fa-brands fa-whatsapp"></i>
                            <span>WhatsApp Store</span>
                          </a>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => onOpenStoreModal(row.storeId)}
                          >
                            Add Store Phone
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => openInspector(row)}
                          title="Edit stock quantity & availability"
                        >
                          <i className="fa-solid fa-pen-to-square"></i> Update Stock
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {lowStockRows.length > 6 && (
              <div style={{ marginTop: '0.65rem', textAlign: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowAllLowStock((v) => !v)}
                >
                  {showAllLowStock
                    ? 'Show Top 6'
                    : `Show All ${lowStockRows.length} Low-Stock Items`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* MAIN APPROVAL QUEUE CARD */}
      <div className="card">
        <div className="card-title">
          <span>
            <i
              className="fa-solid fa-circle-check"
              style={{ color: 'var(--primary)' }}
            ></i>{' '}
            Product Verification &amp; Approval Queue
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={handleApproveAllPending}
              disabled={counts.pending === 0}
            >
              <i className="fa-solid fa-check-double"></i> Approve All Pending (
              {counts.pending})
            </button>
          </div>
        </div>

        {/* FILTER & SEARCH BAR */}
        <div className="filters-bar">
          {(
            [
              ['PENDING', `Pending (${counts.pending})`],
              ['APPROVED', `Approved (${counts.approved})`],
              ['REJECTED', `Rejected (${counts.rejected})`],
              ['FLAGGED', `Quality Flags (${counts.flagged})`],
              ['LOW_STOCK', `Low Stock (${counts.lowStock})`],
              ['ALL', `All (${counts.total})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => onChangeFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          className="filters-bar"
          style={{ marginTop: '-0.35rem', gap: '10px' }}
        >
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: '260px', padding: '0.45rem 0.85rem' }}
            placeholder="Search product, store, keywords..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: '210px', padding: '0.45rem 0.75rem' }}
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            aria-label="Filter by store"
          >
            <option value="ALL">All Stores ({storeOptions.length})</option>
            {storeOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ maxWidth: '200px', padding: '0.45rem 0.75rem' }}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="ALL">
              All Categories ({categoryOptions.length})
            </option>
            {categoryOptions.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {(searchQuery || storeFilter !== 'ALL' || categoryFilter !== 'ALL') && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                setSearchQuery('');
                setStoreFilter('ALL');
                setCategoryFilter('ALL');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* INLINE BULK MODERATION TOOLBAR */}
        {validSelectedKeys.length > 0 && (
          <div className="prod-bulk-bar" role="region" aria-label="Bulk product actions">
            <span
              style={{
                fontSize: '0.8rem',
                fontWeight: 800,
                color: '#0369a1',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <i className="fa-solid fa-check-double"></i>{' '}
              {validSelectedKeys.length} product(s) selected
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-success btn-sm"
                onClick={handleBulkApproveSelected}
              >
                <i className="fa-solid fa-check"></i> Approve Selected
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleBulkRejectSelected}
              >
                <i className="fa-solid fa-xmark"></i> Reject Selected
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => void handleBulkResetPending()}
              >
                <i className="fa-solid fa-rotate-left"></i> Reset Pending
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedKeys([])}
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* PRODUCTS TABLE */}
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAllFiltered}
                    aria-label="Select all visible products"
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--primary)',
                      cursor: 'pointer',
                    }}
                  />
                </th>
                <th>Product</th>
                <th>Store</th>
                <th style={{ textAlign: 'right' }}>Price / MRP</th>
                <th>Details &amp; Quality Checks</th>
                <th>Status</th>
                <th>Verify Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      textAlign: 'center',
                      padding: '2rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <div style={{ marginBottom: '0.6rem' }}>
                      No products match the current filter criteria.
                    </div>
                    {filter !== 'ALL' && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          onChangeFilter('ALL');
                          setSearchQuery('');
                          setStoreFilter('ALL');
                          setCategoryFilter('ALL');
                        }}
                      >
                        View All Products
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProducts.map((row) => {
                  const {
                    key,
                    storeId,
                    storeName,
                    itemId,
                    item,
                    isApproved,
                    isRejected,
                    flags,
                  } = row;
                  const safeImg = sanitizeUrlSafe(item.imageUrl);
                  const showImg = Boolean(safeImg && !brokenImages[key]);
                  const price = Number(item.price || 0);
                  const mrp = Number(item.mrp || 0);
                  const discountPct =
                    mrp > price && price > 0
                      ? Math.round(((mrp - price) / mrp) * 100)
                      : 0;
                  const statusTs = isApproved
                    ? item.approvedAt
                    : isRejected
                      ? item.rejectedAt
                      : item.updatedAt;

                  return (
                    <tr key={key}>
                      <td>
                        <input
                          type="checkbox"
                          checked={validSelectedKeys.includes(key)}
                          onChange={() => toggleSelectKey(key)}
                          aria-label={`Select ${item.name}`}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: 'var(--primary)',
                            cursor: 'pointer',
                          }}
                        />
                      </td>
                      <td>
                        <div className="prod-cell">
                          {showImg ? (
                            <img
                              src={safeImg}
                              alt={item.name || 'Product'}
                              referrerPolicy="no-referrer"
                              className="prod-thumb"
                              onClick={() =>
                                onOpenScreenshot(
                                  safeImg,
                                  `${item.name} • ${storeName}`
                                )
                              }
                              onError={() =>
                                setBrokenImages((prev) => ({
                                  ...prev,
                                  [key]: true,
                                }))
                              }
                            />
                          ) : (
                            <div
                              className="prod-thumb-fallback"
                              aria-label="No product image"
                            >
                              <i className="fa-solid fa-box-open"></i>
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 800 }}>
                              {item.name || 'Unnamed Product'}{' '}
                              {item.isOnSale && (
                                <span
                                  className="badge badge-danger"
                                  style={{ fontSize: '0.62rem' }}
                                >
                                  SALE
                                </span>
                              )}
                            </div>
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: 'var(--text-muted)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                flexWrap: 'wrap',
                              }}
                            >
                              <span>
                                {item.category || 'Auto'} ·{' '}
                                {row.isOutOfStock ? (
                                  <span style={{ color: '#dc2626', fontWeight: 700 }}>
                                    Out of stock
                                  </span>
                                ) : row.isLowStock ? (
                                  <span style={{ color: '#b45309', fontWeight: 700 }}>
                                    Low stock ({row.stockCount} left)
                                  </span>
                                ) : row.stockCount !== null ? (
                                  `In stock (${row.stockCount})`
                                ) : (
                                  'In stock'
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{storeName}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{
                              padding: '1px 7px',
                              fontSize: '0.66rem',
                            }}
                            onClick={() => onOpenStoreModal(storeId)}
                          >
                            Open Store
                          </button>
                          {(() => {
                            const rowWaUrl = buildWhatsAppUrl(
                              row.storePhone,
                              `Hello ${storeName}, checking stock status for "${item.name}" on Gossaigaon Bazar${row.isOutOfStock ? ' (currently marked Out of Stock)' : row.isLowStock ? ` (${row.stockCount} left)` : ''}.`
                            );
                            if (!rowWaUrl) return null;
                            return (
                              <a
                                href={rowWaUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="whatsapp-icon-link"
                                style={{ width: '22px', height: '22px', fontSize: '0.75rem' }}
                                title={`Message ${storeName} owner on WhatsApp`}
                              >
                                <i className="fa-brands fa-whatsapp"></i>
                              </a>
                            );
                          })()}
                        </div>
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <strong style={{ color: 'var(--primary)' }}>
                          ₹{price.toFixed(0)}
                        </strong>
                        {mrp > price && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span style={{ textDecoration: 'line-through' }}>
                              ₹{mrp.toFixed(0)}
                            </span>{' '}
                            <span style={{ color: '#0284c7' }}>
                              -{discountPct}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div
                          style={{
                            fontSize: '0.74rem',
                            color: '#334155',
                            maxWidth: '240px',
                          }}
                        >
                          {(item.description || '').slice(0, 65) ||
                            'No description provided'}
                        </div>
                        {item.searchKeywords && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#0284c7',
                              marginTop: '2px',
                            }}
                          >
                            KW: {item.searchKeywords}
                          </div>
                        )}
                        {flags.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              flexWrap: 'wrap',
                              marginTop: '4px',
                            }}
                          >
                            {flags.map((f) => (
                              <span
                                key={f}
                                className="badge badge-warning"
                                style={{ fontSize: '0.62rem' }}
                              >
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                        {isRejected && item.rejectionReason && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#dc2626',
                              marginTop: '4px',
                              fontWeight: 700,
                            }}
                          >
                            Reason: {item.rejectionReason}
                          </div>
                        )}
                      </td>
                      <td>
                        {isApproved ? (
                          <span className="badge badge-success">
                            Approved &amp; Live
                          </span>
                        ) : isRejected ? (
                          <span className="badge badge-danger">Rejected</span>
                        ) : (
                          <span className="badge badge-warning">
                            Pending Verify
                          </span>
                        )}
                        {statusTs ? (
                          <div
                            style={{
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                              marginTop: '3px',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {new Date(statusTs).toLocaleDateString()}
                          </div>
                        ) : null}
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
                            className="btn btn-outline btn-sm"
                            onClick={() => openInspector(row)}
                            title="Inspect & Edit before approval"
                          >
                            <i className="fa-solid fa-pen-to-square"></i> Inspect
                          </button>
                          {!isApproved && (
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() =>
                                onVerifyProduct(storeId, itemId, true)
                              }
                            >
                              <i className="fa-solid fa-check"></i> Approve
                            </button>
                          )}
                          {!isRejected && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() =>
                                onVerifyProduct(storeId, itemId, false)
                              }
                            >
                              <i className="fa-solid fa-xmark"></i> Reject
                            </button>
                          )}
                          {(isApproved || isRejected) && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                void handleResetToPending(storeId, itemId)
                              }
                              title="Move back to Pending Review"
                            >
                              <i className="fa-solid fa-rotate-left"></i>
                            </button>
                          )}
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

      {/* PRODUCT INSPECTOR & QUICK-EDIT MODAL */}
      {inspectTarget && (
        <div
          className="modal-overlay open"
          style={{ zIndex: 9200 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-prod-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setInspectTarget(null);
          }}
        >
          <div className="modal-card" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <span className="modal-title" id="inspect-prod-title">
                Inspect &amp; Moderate Product · {inspectTarget.storeName}
              </span>
              <button
                type="button"
                className="modal-close"
                onClick={() => setInspectTarget(null)}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="prod-inspect-preview">
              {sanitizeUrlSafe(editImageUrl) ? (
                <img
                  src={sanitizeUrlSafe(editImageUrl)}
                  alt={editName || 'Product preview'}
                  referrerPolicy="no-referrer"
                  className="prod-inspect-img"
                />
              ) : (
                <div className="prod-inspect-img-fallback">
                  <i className="fa-solid fa-image"></i>
                  <span>No valid image URL</span>
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    marginBottom: '6px',
                  }}
                >
                  Quality Readiness
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '0.75rem',
                  }}
                >
                  <span
                    style={{
                      color:
                        Number(editPrice) > 0 ? '#059669' : '#dc2626',
                    }}
                  >
                    {Number(editPrice) > 0 ? '✓' : '✕'} Selling price &gt; ₹0
                  </span>
                  <span
                    style={{
                      color:
                        !editMrp || Number(editPrice) <= Number(editMrp)
                          ? '#059669'
                          : '#d97706',
                    }}
                  >
                    {!editMrp || Number(editPrice) <= Number(editMrp)
                      ? '✓'
                      : '!'}{' '}
                    Selling price ≤ MRP
                  </span>
                  <span
                    style={{
                      color: sanitizeUrlSafe(editImageUrl)
                        ? '#059669'
                        : '#d97706',
                    }}
                  >
                    {sanitizeUrlSafe(editImageUrl) ? '✓' : '!'} Valid product
                    image URL
                  </span>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="inspect-prod-name">Product Name</label>
              <input
                id="inspect-prod-name"
                type="text"
                className="form-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: '10px',
              }}
            >
              <div className="form-group">
                <label htmlFor="inspect-prod-price">Selling Price (₹)</label>
                <input
                  id="inspect-prod-price"
                  type="number"
                  min={1}
                  className="form-input"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="inspect-prod-mrp">MRP (₹)</label>
                <input
                  id="inspect-prod-mrp"
                  type="number"
                  min={0}
                  className="form-input"
                  value={editMrp}
                  onChange={(e) => setEditMrp(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="inspect-prod-cat">Category</label>
                <input
                  id="inspect-prod-cat"
                  type="text"
                  className="form-input"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
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
                <label htmlFor="inspect-prod-stock">Stock Qty (optional)</label>
                <input
                  id="inspect-prod-stock"
                  type="number"
                  min={0}
                  placeholder="e.g. 25"
                  className="form-input"
                  value={editStockQty}
                  onChange={(e) => setEditStockQty(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="inspect-prod-threshold">Low-Stock Alert Threshold</label>
                <input
                  id="inspect-prod-threshold"
                  type="number"
                  min={1}
                  placeholder={`Default (${lowStockThreshold})`}
                  className="form-input"
                  value={editLowThreshold}
                  onChange={(e) => setEditLowThreshold(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="inspect-prod-img">Product Image URL</label>
              <input
                id="inspect-prod-img"
                type="url"
                className="form-input"
                placeholder="https://..."
                value={editImageUrl}
                onChange={(e) => setEditImageUrl(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="inspect-prod-kw">Search Keywords</label>
              <input
                id="inspect-prod-kw"
                type="text"
                className="form-input"
                placeholder="rice, basmati, dal..."
                value={editKeywords}
                onChange={(e) => setEditKeywords(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="inspect-prod-desc">Description</label>
              <textarea
                id="inspect-prod-desc"
                rows={2}
                className="form-input"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '1rem',
              }}
            >
              <div className="toggle-row" style={{ marginBottom: 0 }}>
                <label htmlFor="inspect-prod-avail">In Stock</label>
                <input
                  id="inspect-prod-avail"
                  type="checkbox"
                  checked={editAvailable}
                  onChange={(e) => setEditAvailable(e.target.checked)}
                />
              </div>
              <div className="toggle-row" style={{ marginBottom: 0 }}>
                <label htmlFor="inspect-prod-sale">Featured Sale</label>
                <input
                  id="inspect-prod-sale"
                  type="checkbox"
                  checked={editOnSale}
                  onChange={(e) => setEditOnSale(e.target.checked)}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={savingInspect}
                  onClick={() => {
                    const { storeId, itemId } = inspectTarget;
                    setInspectTarget(null);
                    onVerifyProduct(storeId, itemId, false);
                  }}
                >
                  <i className="fa-solid fa-xmark"></i> Reject
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={savingInspect}
                  onClick={() => void handleSaveInspect('RESET_PENDING')}
                >
                  Move to Pending
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={savingInspect}
                  onClick={() => void handleSaveInspect('SAVE_ONLY')}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  disabled={savingInspect}
                  onClick={() => void handleSaveInspect('SAVE_APPROVE')}
                >
                  <i className="fa-solid fa-check"></i> Save &amp; Approve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
