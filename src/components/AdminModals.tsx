import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import {
  AdminState,
  MenuItemRecord,
  OrderItem,
} from '../types';
import {
  calculateDistanceKm,
  copyTextToClipboard,
  sanitizeText,
} from '../utils/helpers';
import { DialogConfig } from './ActionDialogModal';
import { RiderWeeklyChart } from './RiderWeeklyChart';

export interface DisbursalTarget {
  type: 'RIDER' | 'STORE' | 'DIRECT_STORE';
  targetId: string;
  name: string;
  phone: string;
  upiId: string;
  amount: number;
}

interface AdminModalsProps {
  state: AdminState;
  screenshotModal: { src: string; title: string } | null;
  onCloseScreenshot: () => void;
  disbursalTarget: DisbursalTarget | null;
  onCloseDisbursal: () => void;
  assignOrderId: string | null;
  onCloseAssign: () => void;
  bulkAssignOrderIds: string[] | null;
  onCloseBulkAssign: () => void;
  onBulkAssigned: () => void;
  detailOrderId: string | null;
  onCloseDetailOrder: () => void;
  onOpenScreenshot: (src: string, title: string) => void;
  onCancelOrder: (orderId: string) => void;
  manageCustomerUid: string | null;
  onCloseManageCustomer: () => void;
  manageRiderUid: string | null;
  onCloseManageRider: () => void;
  manageStoreUid: string | null;
  onCloseManageStore: () => void;
  onVerifyProduct: (storeId: string, itemId: string, approve: boolean) => void;
  getRiderCashMetrics: (riderUid: string) => {
    netCashInHand: number;
    totalSettled: number;
    totalCodCollected: number;
  };
  getStorePayoutMetrics: (storeUid: string) => {
    grossSales: number;
    adminCut: number;
    netStoreShare: number;
    totalPaidToStore: number;
    orderCount: number;
    unpaidBalance: number;
  };
  onToast: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
  adminEmail?: string;
  isPayoutWithdrawalFrozen?: boolean;
}

export const AdminModals: React.FC<AdminModalsProps> = ({
  state,
  screenshotModal,
  onCloseScreenshot,
  disbursalTarget,
  onCloseDisbursal,
  assignOrderId,
  onCloseAssign,
  bulkAssignOrderIds,
  onCloseBulkAssign,
  onBulkAssigned,
  detailOrderId,
  onCloseDetailOrder,
  onOpenScreenshot,
  onCancelOrder,
  manageCustomerUid,
  onCloseManageCustomer,
  manageRiderUid,
  onCloseManageRider,
  manageStoreUid,
  onCloseManageStore,
  onVerifyProduct,
  getRiderCashMetrics,
  getStorePayoutMetrics,
  onToast,
  onConfirmDialog,
  adminEmail,
  isPayoutWithdrawalFrozen = false,
}) => {
  // Disbursal Modal state
  const [disbursalMode, setDisbursalMode] = useState<'UPI' | 'CASH'>('UPI');
  const [disbursalUtr, setDisbursalUtr] = useState('');

  useEffect(() => {
    if (disbursalTarget) {
      setDisbursalMode('UPI');
      setDisbursalUtr('');
    }
  }, [disbursalTarget]);

  // Assign Rider Modal state
  const [selectedRiderUid, setSelectedRiderUid] = useState('');
  useEffect(() => {
    if (assignOrderId) {
      setSelectedRiderUid(state.orders[assignOrderId]?.deliveryUid || '');
    }
  }, [assignOrderId, state.orders]);

  // Bulk Assign Rider Modal state
  const [bulkRiderUid, setBulkRiderUid] = useState('');
  useEffect(() => {
    if (bulkAssignOrderIds && bulkAssignOrderIds.length > 0) {
      setBulkRiderUid('');
    }
  }, [bulkAssignOrderIds]);

  // Order Detail Override & Order Notes state
  const [overrideStatus, setOverrideStatus] = useState('PLACED');
  const [orderNoteDraft, setOrderNoteDraft] = useState('');
  const [savingOrderNote, setSavingOrderNote] = useState(false);

  useEffect(() => {
    if (detailOrderId && state.orders[detailOrderId]) {
      setOverrideStatus(state.orders[detailOrderId].status || 'PLACED');
    }
  }, [detailOrderId, state.orders]);

  useEffect(() => {
    if (detailOrderId && state.orders[detailOrderId]) {
      setOrderNoteDraft(state.orders[detailOrderId].orderNotes || '');
    } else {
      setOrderNoteDraft('');
    }
    // Sync draft only when opening a different order detail modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOrderId]);

  // Customer Manage Form state (only initializes when opening a different customer)
  const [custForm, setCustForm] = useState({
    name: '',
    phone: '',
    address: '',
    adminNote: '',
    blocked: false,
  });
  const [walletAdjAmt, setWalletAdjAmt] = useState('');
  const [walletAdjReason, setWalletAdjReason] = useState('');

  useEffect(() => {
    if (manageCustomerUid && state.customers[manageCustomerUid]) {
      const c = state.customers[manageCustomerUid];
      setCustForm({
        name: c.name || '',
        phone: c.phone || '',
        address: c.address || '',
        adminNote: c.adminNote || '',
        blocked: c.blocked === true,
      });
      setWalletAdjAmt('');
      setWalletAdjReason('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageCustomerUid]);

  // Rider Manage Form state
  const [riderForm, setRiderForm] = useState({
    name: '',
    phone: '',
    vehicle: '',
    upiId: '',
    adminNote: '',
    approved: false,
    online: false,
    suspended: false,
  });

  useEffect(() => {
    if (manageRiderUid && state.deliveryPartners[manageRiderUid]) {
      const d = state.deliveryPartners[manageRiderUid];
      setRiderForm({
        name: d.name || '',
        phone: d.phone || '',
        vehicle: d.vehicle || '',
        upiId: d.upiId || '',
        adminNote: d.adminNote || '',
        approved: d.approved === true,
        online: d.online === true,
        suspended: d.suspended === true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageRiderUid]);

  // Store Manage Form state
  const [storeForm, setStoreForm] = useState({
    name: '',
    phone: '',
    cuisine: '',
    upiId: '',
    hours: '',
    imageUrl: '',
    lat: 26.4524,
    lng: 89.9723,
    address: '',
    adminNote: '',
    approved: false,
    isOpen: true,
    suspended: false,
  });

  useEffect(() => {
    if (manageStoreUid && state.restaurants[manageStoreUid]) {
      const s = state.restaurants[manageStoreUid];
      setStoreForm({
        name: s.name || '',
        phone: s.phone || '',
        cuisine: s.cuisine || '',
        upiId: s.upiId || '',
        hours: s.hours || '',
        imageUrl: s.imageUrl || '',
        lat: s.lat || 26.4524,
        lng: s.lng || 89.9723,
        address: s.address || '',
        adminNote: s.adminNote || '',
        approved: s.approved === true,
        isOpen: s.isOpen !== false,
        suspended: s.suspended === true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageStoreUid]);

  // Admin Product Modal state
  const [productModalState, setProductModalState] = useState<{
    storeId: string;
    itemId: string;
  } | null>(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    price: '',
    mrp: '',
    stockQty: '',
    category: '',
    searchKeywords: '',
    description: '',
    imageUrl: '',
    available: true,
    adminApproved: true,
  });

  const openProductModal = (storeId: string, itemId = '') => {
    setProductModalState({ storeId, itemId });
    const existing: MenuItemRecord | undefined =
      itemId && state.menus[storeId] ? state.menus[storeId][itemId] : undefined;
    if (existing) {
      const existingStock =
        existing.stockQty ?? existing.stock ?? existing.quantity;
      setProdForm({
        name: existing.name || '',
        price: String(existing.price || ''),
        mrp: existing.mrp ? String(existing.mrp) : '',
        stockQty:
          existingStock !== undefined && existingStock !== null
            ? String(existingStock)
            : '',
        category: existing.category || '',
        searchKeywords: existing.searchKeywords || '',
        description: existing.description || '',
        imageUrl: existing.imageUrl || '',
        available: existing.available !== false,
        adminApproved: existing.adminApproved === true,
      });
    } else {
      setProdForm({
        name: '',
        price: '',
        mrp: '',
        stockQty: '',
        category: '',
        searchKeywords: '',
        description: '',
        imageUrl: '',
        available: true,
        adminApproved: true,
      });
    }
    window.history.pushState({ modal: 'adminProd' }, '');
  };

  const confirmDisbursalSuccess = () => {
    if (!disbursalTarget) return;
    if (isPayoutWithdrawalFrozen) {
      onToast(
        '🚨 Payouts & Withdrawals are frozen due to Fleet COD Risk Threshold! Perform Admin Intervention first.',
        'danger'
      );
      return;
    }
    let utr = disbursalUtr.trim();
    if (disbursalMode === 'UPI') {
      if (!/^\d{12}$/.test(utr)) {
        onToast('⚠️ Exact 12-Digit UTR Number enter karein!', 'danger');
        return;
      }
    } else {
      utr = utr
        ? `CASH_PAID_${utr}`
        : `OFFICE_CASH_${Date.now().toString().slice(-6)}`;
    }

    const { type, targetId, amount } = disbursalTarget;
    if (type === 'RIDER') {
      db.ref(`riderPayouts/${targetId}`)
        .update({
          status: 'PAID',
          adminRef: utr,
          mode: disbursalMode,
          updatedAt: Date.now(),
        })
        .then(() => {
          onCloseDisbursal();
          onToast(`🎉 ₹${amount.toFixed(0)} Rider Payout settled!`, 'success');
        });
    } else if (type === 'STORE') {
      db.ref(`storePayouts/${targetId}`)
        .update({
          status: 'PAID',
          adminRef: utr,
          mode: disbursalMode,
          updatedAt: Date.now(),
        })
        .then(() => {
          onCloseDisbursal();
          onToast(`🎉 ₹${amount.toFixed(0)} Store Payout settled!`, 'success');
        });
    } else if (type === 'DIRECT_STORE') {
      const store = state.restaurants[targetId] || {};
      db.ref('storePayouts')
        .push({
          storeId: targetId,
          storeName: store.name || 'Store',
          storePhone: store.phone || '',
          storeUpiId: store.upiId || 'CASH',
          amount: Number(amount.toFixed(2)),
          status: 'PAID',
          adminRef: utr,
          mode: disbursalMode,
          createdAt: Date.now(),
        })
        .then(() => {
          onCloseDisbursal();
          onToast(`🎉 ₹${amount.toFixed(0)} direct payout settled!`, 'success');
        });
    }
  };

  const confirmDeliveryAssignment = () => {
    if (!assignOrderId || !selectedRiderUid) return;
    const rider = state.deliveryPartners[selectedRiderUid];
    if (rider?.codAssignmentRestricted) {
      onToast(
        `🚫 ${rider.name || 'Rider'} is restricted from new order assignments until their COD settlement is verified.`,
        'danger'
      );
      return;
    }
    db.ref(`orders/${assignOrderId}`)
      .update({
        deliveryUid: selectedRiderUid,
        riderLat: rider?.lat || null,
        riderLng: rider?.lng || null,
        assignedAt: Date.now(),
        riderAccepted: null,
        updatedAt: Date.now(),
      })
      .then(() => {
        onCloseAssign();
        onToast('Rider assigned!', 'success');
      });
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageCustomerUid) return;
    db.ref(`customers/${manageCustomerUid}`)
      .update({
        name: sanitizeText(custForm.name.trim()),
        phone: custForm.phone.trim(),
        address: sanitizeText(custForm.address.trim()),
        adminNote: sanitizeText(custForm.adminNote.trim()),
        blocked: custForm.blocked,
        updatedAt: Date.now(),
      })
      .then(() => {
        onCloseManageCustomer();
        onToast('Customer account updated!', 'success');
      });
  };

  const handleAdjustWallet = (mode: 'CREDIT' | 'DEBIT') => {
    if (!manageCustomerUid) return;
    const amt = Number(walletAdjAmt || 0);
    const reason =
      sanitizeText(walletAdjReason.trim()) ||
      (mode === 'CREDIT' ? 'Admin Bonus / Refund' : 'Admin Adjustment');
    if (amt <= 0) {
      onToast('Enter valid amount!', 'danger');
      return;
    }
    db.ref(`customers/${manageCustomerUid}/walletBalance`)
      .transaction((bal: number | null) => {
        const cur = Number(bal || 0);
        return mode === 'CREDIT' ? cur + amt : Math.max(0, cur - amt);
      })
      .then(() => {
        db.ref(`walletTransactions/${manageCustomerUid}`).push({
          type: mode,
          amount: amt,
          note: reason,
          createdAt: Date.now(),
        });
        setWalletAdjAmt('');
        setWalletAdjReason('');
        onToast(
          `✅ Wallet ${mode === 'CREDIT' ? 'Credited' : 'Debited'} ₹${amt}!`,
          'success'
        );
      });
  };

  const handleSaveRider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageRiderUid) return;
    db.ref(`deliveryPartners/${manageRiderUid}`)
      .update({
        name: sanitizeText(riderForm.name.trim()),
        phone: riderForm.phone.trim(),
        vehicle: sanitizeText(riderForm.vehicle.trim()),
        upiId: riderForm.upiId.trim(),
        adminNote: sanitizeText(riderForm.adminNote.trim()),
        approved: riderForm.approved,
        online: riderForm.suspended ? false : riderForm.online,
        suspended: riderForm.suspended,
      })
      .then(() => {
        onCloseManageRider();
        onToast('Rider profile updated!', 'success');
      });
  };

  const handleSaveStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manageStoreUid) return;
    const lat = Number(storeForm.lat || 26.4524);
    const lng = Number(storeForm.lng || 89.9723);
    db.ref(`restaurants/${manageStoreUid}`)
      .update({
        name: sanitizeText(storeForm.name.trim()),
        phone: storeForm.phone.trim(),
        cuisine: sanitizeText(storeForm.cuisine.trim()),
        upiId: storeForm.upiId.trim(),
        hours: sanitizeText(storeForm.hours.trim()),
        imageUrl: storeForm.imageUrl.trim(),
        lat,
        lng,
        locationLink: `https://www.google.com/maps?q=${lat},${lng}`,
        address: sanitizeText(storeForm.address.trim()),
        adminNote: sanitizeText(storeForm.adminNote.trim()),
        approved: storeForm.approved,
        isOpen: storeForm.isOpen,
        suspended: storeForm.suspended,
      })
      .then(() => onToast('Store profile updated by Admin!', 'success'));
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productModalState) return;
    const { storeId, itemId } = productModalState;
    const price = Number(prodForm.price);
    const mrp = Number(prodForm.mrp || 0);
    const approved = prodForm.adminApproved;
    const parsedStock =
      prodForm.stockQty.trim() !== '' &&
      Number.isFinite(Number(prodForm.stockQty))
        ? Math.max(0, Math.floor(Number(prodForm.stockQty)))
        : undefined;
    const payload: MenuItemRecord = {
      name: sanitizeText(prodForm.name.trim()),
      price,
      mrp: mrp > price ? mrp : 0,
      discountPercent: mrp > price ? Math.round(((mrp - price) / mrp) * 100) : 0,
      category: sanitizeText(prodForm.category.trim().toUpperCase()),
      searchKeywords: sanitizeText(prodForm.searchKeywords.trim()),
      description: sanitizeText(prodForm.description.trim()),
      imageUrl:
        prodForm.imageUrl.trim() ||
        'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&auto=format&fit=crop&q=60',
      available:
        parsedStock !== undefined
          ? prodForm.available && parsedStock > 0
          : prodForm.available,
      adminApproved: approved,
      approvalStatus: approved ? 'APPROVED' : 'PENDING',
    };
    if (parsedStock !== undefined) {
      payload.stockQty = parsedStock;
    }
    if (itemId) {
      db.ref(`menus/${storeId}/${itemId}`)
        .update(payload)
        .then(() => {
          setProductModalState(null);
          onToast('Product updated!', 'success');
        });
    } else {
      db.ref(`menus/${storeId}`)
        .push(payload)
        .then(() => {
          setProductModalState(null);
          onToast('Product added!', 'success');
        });
    }
  };

  const handleDeleteProduct = (storeId: string, itemId: string) => {
    onConfirmDialog({
      mode: 'confirm',
      title: 'Delete Store Product?',
      message: 'Are you sure you want to permanently delete this product?',
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
      onConfirm: () => {
        db.ref(`menus/${storeId}/${itemId}`)
          .remove()
          .then(() => onToast('Product deleted.', 'danger'));
      },
    });
  };

  return (
    <>
      {/* SCREENSHOT VIEWER MODAL */}
      {screenshotModal && (
        <div
          className="modal-backdrop open"
          onClick={onCloseScreenshot}
          style={{ zIndex: 650 }}
        >
          <div
            className="modal-box"
            style={{ textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900 }}>Payment Screenshot Proof</h3>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseScreenshot}
                style={{ fontSize: '1.3rem', cursor: 'pointer' }}
              ></i>
            </div>
            <div
              style={{
                fontSize: '0.82rem',
                color: '#0284c7',
                fontWeight: 800,
                marginBottom: '0.75rem',
              }}
            >
              {screenshotModal.title}
            </div>
            <img
              src={screenshotModal.src}
              style={{
                maxWidth: '100%',
                maxHeight: '65vh',
                borderRadius: '14px',
                border: '1px solid var(--border)',
                objectFit: 'contain',
              }}
              alt="Payment Screenshot"
            />
            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={onCloseScreenshot}
                style={{ width: '100%' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN UPI PAYOUT DISBURSAL MODAL */}
      {disbursalTarget && (
        <div className="modal-backdrop open" onClick={onCloseDisbursal}>
          <div
            className="modal-box"
            style={{ textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  className={`badge ${disbursalTarget.type === 'RIDER' ? 'badge-info' : 'badge-warning'}`}
                  style={
                    disbursalTarget.type !== 'RIDER'
                      ? {
                          fontSize: '0.72rem',
                          background: 'rgba(147, 51, 234, 0.12)',
                          color: '#7e22ce',
                        }
                      : { fontSize: '0.72rem' }
                  }
                >
                  {disbursalTarget.type === 'RIDER'
                    ? '🛵 RIDER EARNINGS'
                    : '🏪 STORE PAYOUT'}
                </span>
                <h3 style={{ fontWeight: 900, fontSize: '1.15rem', color: '#0f172a' }}>
                  Disburse Payout
                </h3>
              </div>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseDisbursal}
                style={{
                  fontSize: '1.3rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                }}
              ></i>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                padding: '0.85rem',
                marginBottom: '0.85rem',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <div>
                  <strong style={{ fontSize: '1rem', color: '#0f172a' }}>
                    {disbursalTarget.name || 'Recipient'}
                  </strong>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginTop: '2px',
                    }}
                  >
                    {disbursalTarget.phone || 'No Phone'}
                  </div>
                </div>
                <span
                  style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 800 }}
                >
                  <i className="fa-solid fa-circle-check"></i> KYC Verified
                </span>
              </div>
            </div>

            <div
              style={{
                background:
                  'linear-gradient(135deg, rgba(22, 163, 74, 0.1), #f0fdf4)',
                border: '1.5px solid var(--primary)',
                borderRadius: '16px',
                padding: '1rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    display: 'block',
                  }}
                >
                  Total Payout Amount
                </span>
                <div
                  style={{
                    fontSize: '2rem',
                    fontWeight: 900,
                    color: 'var(--primary)',
                  }}
                >
                  ₹{Number(disbursalTarget.amount || 0).toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  if (await copyTextToClipboard(String(disbursalTarget.amount))) {
                    onToast('Payout Amount copied!', 'info');
                  }
                }}
                style={{ color: 'var(--primary)', borderColor: 'var(--primary)' }}
              >
                <i className="fa-regular fa-copy"></i> Copy ₹
              </button>
            </div>

            <div
              style={{
                background: 'rgba(2, 132, 199, 0.06)',
                border: '1px dashed #0284c7',
                borderRadius: '14px',
                padding: '0.75rem 0.9rem',
                marginBottom: '1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <span
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    fontWeight: 800,
                    display: 'block',
                  }}
                >
                  Receiving UPI ID
                </span>
                <code
                  style={{
                    fontSize: '0.92rem',
                    color: '#0284c7',
                    fontWeight: 800,
                  }}
                >
                  {disbursalTarget.upiId || 'Not Set (Pay Cash)'}
                </code>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  if (!disbursalTarget.upiId) {
                    onToast('No UPI ID!', 'warning');
                    return;
                  }
                  if (await copyTextToClipboard(disbursalTarget.upiId)) {
                    onToast('UPI ID copied!', 'info');
                  }
                }}
                style={{ color: '#0284c7', borderColor: '#0284c7' }}
              >
                <i className="fa-regular fa-copy"></i> Copy UPI
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${disbursalMode === 'UPI' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => setDisbursalMode('UPI')}
              >
                <i className="fa-solid fa-qrcode"></i> Instant UPI QR
              </button>
              <button
                type="button"
                className={`btn btn-sm ${disbursalMode === 'CASH' ? 'btn-primary' : 'btn-outline'}`}
                style={{ flex: 1 }}
                onClick={() => setDisbursalMode('CASH')}
              >
                <i className="fa-solid fa-hand-holding-dollar"></i> Office Cash
              </button>
            </div>

            {disbursalMode === 'UPI' ? (
              <div>
                {(() => {
                  const upiString = `upi://pay?pa=${encodeURIComponent(disbursalTarget.upiId || 'recipient@upi')}&pn=${encodeURIComponent(disbursalTarget.name || 'Partner')}&am=${Number(disbursalTarget.amount || 0).toFixed(2)}&cu=INR`;
                  return (
                    <>
                      <div
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--border)',
                          padding: '10px',
                          borderRadius: '16px',
                          width: '160px',
                          height: '160px',
                          margin: '0 auto 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiString)}`}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          alt="UPI QR"
                        />
                      </div>
                      <a
                        href={upiString}
                        className="btn btn-success"
                        style={{
                          width: '100%',
                          marginBottom: '1rem',
                          textDecoration: 'none',
                        }}
                      >
                        <i className="fa-solid fa-mobile-screen-button"></i> Open
                        &amp; Pay in UPI App
                      </a>
                    </>
                  );
                })()}
                <div
                  className="form-group"
                  style={{ textAlign: 'left', marginBottom: '1rem' }}
                >
                  <label>
                    Enter 12-Digit Bank UTR / Reference No.{' '}
                    <span style={{ color: 'red' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 412893471923"
                    maxLength={12}
                    value={disbursalUtr}
                    onChange={(e) => setDisbursalUtr(e.target.value)}
                    style={{
                      fontWeight: 800,
                      letterSpacing: '1.5px',
                      textAlign: 'center',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px dashed var(--warning)',
                  borderRadius: '14px',
                  padding: '1rem',
                  textAlign: 'left',
                  marginBottom: '1rem',
                }}
              >
                <span
                  style={{
                    color: 'var(--warning)',
                    fontSize: '0.8rem',
                    fontWeight: 800,
                    display: 'block',
                    marginBottom: '4px',
                  }}
                >
                  <i className="fa-solid fa-hand-holding-dollar"></i> Physical
                  Cash Handover
                </span>
                <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                  Exact cash amount recipient ko haath me de kar confirm button
                  dabayein.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ flex: 1 }}
                onClick={onCloseDisbursal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1.4 }}
                onClick={confirmDisbursalSuccess}
              >
                <i className="fa-solid fa-circle-check"></i> Confirm Paid &amp;
                Settle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN RIDER MODAL */}
      {assignOrderId && state.orders[assignOrderId] && (
        <div className="modal-backdrop open" onClick={onCloseAssign}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const order = state.orders[assignOrderId];
              const store = state.restaurants[order.restaurantId || ''] || {};
              const storeLat = Number(store.lat) || 26.4524;
              const storeLng = Number(store.lng) || 89.9723;
              const sortedRiders = Object.entries(state.deliveryPartners)
                .map(([uid, partner]) => {
                  const rLat = Number(partner.lat);
                  const rLng = Number(partner.lng);
                  const dist =
                    Number.isFinite(rLat) &&
                    Number.isFinite(rLng) &&
                    rLat !== 0 &&
                    rLng !== 0
                      ? calculateDistanceKm(storeLat, storeLng, rLat, rLng)
                      : Infinity;
                  return { uid, partner, dist };
                })
                .sort((a, b) => a.dist - b.dist);

              return (
                <>
                  <h3 style={{ marginBottom: '0.5rem' }}>
                    Assign / Reassign Delivery Rider
                  </h3>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.85rem',
                    }}
                  >
                    Order: #{assignOrderId.slice(-6)} ({store.name || 'Store'})
                  </p>
                  {order.rejectedByRiders &&
                    Object.keys(order.rejectedByRiders).length > 0 && (
                      <div
                        style={{
                          background: '#fffbeb',
                          border: '1px solid #fcd34d',
                          borderRadius: '10px',
                          padding: '0.65rem 0.85rem',
                          fontSize: '0.76rem',
                          color: '#92400e',
                          marginBottom: '1rem',
                        }}
                      >
                        <strong>⚠️ Previously Passed By:</strong>
                        <br />
                        {Object.entries(order.rejectedByRiders).map(([uid, log]) => (
                          <div key={uid}>
                            • {log.riderName || 'Rider'}:{' '}
                            {log.reason || 'Declined'}
                          </div>
                        ))}
                      </div>
                    )}
                  <div className="form-group">
                    <label>
                      Select Delivery Partner (Sorted Nearest to Store)
                    </label>
                    <select
                      className="form-input"
                      value={selectedRiderUid}
                      onChange={(e) => setSelectedRiderUid(e.target.value)}
                    >
                      <option value="">-- Choose Rider --</option>
                      {sortedRiders.map(({ uid, partner, dist }) => {
                        const onlineTag = partner.online
                          ? '🟢 Online'
                          : '🔴 Offline';
                        const distTag = Number.isFinite(dist)
                          ? ` • ${dist.toFixed(1)} km from store`
                          : '';
                        const hasPassed =
                          order.rejectedByRiders && order.rejectedByRiders[uid]
                            ? ' [⚠️ PASSED]'
                            : '';
                        const codTag = partner.codAssignmentRestricted
                          ? ' [🚫 COD RESTRICTED]'
                          : partner.codReviewFlagged
                            ? ' [🚩 COD REVIEW]'
                            : '';
                        return (
                          <option key={uid} value={uid}>
                            {partner.name || 'Rider'} ({onlineTag}
                            {distTag}){hasPassed}
                            {codTag}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {selectedRiderUid &&
                    state.deliveryPartners[selectedRiderUid]
                      ?.codAssignmentRestricted && (
                      <div
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fca5a5',
                          borderRadius: '10px',
                          padding: '0.7rem 0.85rem',
                          fontSize: '0.78rem',
                          color: '#991b1b',
                          marginBottom: '1rem',
                        }}
                      >
                        <strong>
                          🚫 New Assignments Restricted (Smart Auto-Settle)
                        </strong>
                        <div style={{ marginTop: '3px' }}>
                          {state.deliveryPartners[selectedRiderUid]
                            .codRestrictionReason ||
                            `Held Cash: ₹${getRiderCashMetrics(selectedRiderUid).netCashInHand.toFixed(0)}. Verify a settlement in Rider COD Cash first.`}
                        </div>
                      </div>
                    )}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={onCloseAssign}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(
                        selectedRiderUid &&
                          state.deliveryPartners[selectedRiderUid]
                            ?.codAssignmentRestricted
                      )}
                      onClick={confirmDeliveryAssignment}
                    >
                      Confirm Assign
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* BULK ASSIGN RIDER MODAL */}
      {bulkAssignOrderIds && bulkAssignOrderIds.length > 0 && (
        <div className="modal-backdrop open" onClick={onCloseBulkAssign}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const eligibleIds = bulkAssignOrderIds.filter((id) => {
                const o = state.orders[id];
                return o && o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
              });
              const skippedCount = bulkAssignOrderIds.length - eligibleIds.length;
              const sortedRiders = Object.entries(state.deliveryPartners).sort(
                ([, a], [, b]) => Number(Boolean(b.online)) - Number(Boolean(a.online))
              );

              const handleConfirmBulkAssign = () => {
                if (!bulkRiderUid) {
                  onToast('Please choose a delivery rider.', 'warning');
                  return;
                }
                if (eligibleIds.length === 0) {
                  onToast(
                    'All selected orders are already Delivered or Cancelled.',
                    'warning'
                  );
                  return;
                }
                const rider = state.deliveryPartners[bulkRiderUid];
                if (rider?.codAssignmentRestricted) {
                  onToast(
                    `🚫 ${rider.name || 'Rider'} is restricted from new order assignments until their COD settlement is verified.`,
                    'danger'
                  );
                  return;
                }
                const now = Date.now();
                const updates: Record<string, unknown> = {};
                eligibleIds.forEach((orderId) => {
                  updates[`orders/${orderId}/deliveryUid`] = bulkRiderUid;
                  updates[`orders/${orderId}/riderLat`] = rider?.lat || null;
                  updates[`orders/${orderId}/riderLng`] = rider?.lng || null;
                  updates[`orders/${orderId}/assignedAt`] = now;
                  updates[`orders/${orderId}/riderAccepted`] = null;
                  updates[`orders/${orderId}/updatedAt`] = now;
                });

                db.ref()
                  .update(updates)
                  .then(() => {
                    onCloseBulkAssign();
                    onBulkAssigned();
                    onToast(
                      `🛵 Assigned ${eligibleIds.length} order(s) to ${rider?.name || 'Rider'}!${skippedCount > 0 ? ` (${skippedCount} completed/cancelled skipped)` : ''}`,
                      'success'
                    );
                  });
              };

              return (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <h3 style={{ fontWeight: 900 }}>
                      <i
                        className="fa-solid fa-motorcycle"
                        style={{ color: 'var(--primary)' }}
                      ></i>{' '}
                      Bulk Assign to Rider
                    </h3>
                    <i
                      className="fa-solid fa-xmark"
                      onClick={onCloseBulkAssign}
                      style={{ fontSize: '1.2rem', cursor: 'pointer' }}
                    ></i>
                  </div>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.85rem',
                    }}
                  >
                    Selected: <strong style={{ color: '#0f172a' }}>{bulkAssignOrderIds.length}</strong> order(s) • Eligible for dispatch:{' '}
                    <strong style={{ color: 'var(--primary)' }}>{eligibleIds.length}</strong>
                  </p>
                  {skippedCount > 0 && (
                    <div
                      style={{
                        background: '#fffbeb',
                        border: '1px solid #fcd34d',
                        borderRadius: '10px',
                        padding: '0.6rem 0.85rem',
                        fontSize: '0.78rem',
                        color: '#92400e',
                        marginBottom: '1rem',
                      }}
                    >
                      ⚠️ {skippedCount} selected order(s) are already Delivered or Cancelled and will be skipped.
                    </div>
                  )}
                  <div className="form-group">
                    <label>Select Delivery Partner</label>
                    <select
                      className="form-input"
                      value={bulkRiderUid}
                      onChange={(e) => setBulkRiderUid(e.target.value)}
                    >
                      <option value="">-- Choose Rider --</option>
                      {sortedRiders.map(([uid, partner]) => {
                        const onlineTag = partner.online
                          ? '🟢 Online'
                          : '🔴 Offline';
                        const suspendedTag = partner.suspended
                          ? ' [Suspended]'
                          : '';
                        const codTag = partner.codAssignmentRestricted
                          ? ' [🚫 COD RESTRICTED]'
                          : partner.codReviewFlagged
                            ? ' [🚩 COD REVIEW]'
                            : '';
                        return (
                          <option key={uid} value={uid}>
                            {partner.name || 'Rider'} ({onlineTag} •{' '}
                            {partner.vehicle || 'Bike'}){suspendedTag}
                            {codTag}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  {bulkRiderUid &&
                    state.deliveryPartners[bulkRiderUid]
                      ?.codAssignmentRestricted && (
                      <div
                        style={{
                          background: '#fef2f2',
                          border: '1px solid #fca5a5',
                          borderRadius: '10px',
                          padding: '0.7rem 0.85rem',
                          fontSize: '0.78rem',
                          color: '#991b1b',
                          marginBottom: '1rem',
                        }}
                      >
                        <strong>
                          🚫 New Assignments Restricted (Smart Auto-Settle)
                        </strong>
                        <div style={{ marginTop: '3px' }}>
                          {state.deliveryPartners[bulkRiderUid]
                            .codRestrictionReason ||
                            'Verify a COD cash settlement for this rider before bulk assigning orders.'}
                        </div>
                      </div>
                    )}
                  <div
                    style={{
                      display: 'flex',
                      gap: '10px',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={onCloseBulkAssign}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={Boolean(
                        bulkRiderUid &&
                          state.deliveryPartners[bulkRiderUid]
                            ?.codAssignmentRestricted
                      )}
                      onClick={handleConfirmBulkAssign}
                    >
                      <i className="fa-solid fa-check"></i> Assign {eligibleIds.length} Order(s)
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* FULL ORDER DETAIL MODAL */}
      {detailOrderId && state.orders[detailOrderId] && (
        <div className="modal-backdrop open" onClick={onCloseDetailOrder}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900 }}>
                Order Full Details &amp; Admin Override
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseDetailOrder}
                style={{ fontSize: '1.3rem', cursor: 'pointer' }}
              ></i>
            </div>
            {(() => {
              const o = state.orders[detailOrderId];
              const store = state.restaurants[o.restaurantId || ''] || {};
              const rider = o.deliveryUid
                ? state.deliveryPartners[o.deliveryUid] || null
                : null;
              const cust = o.customerUid
                ? state.customers[o.customerUid] || {}
                : {};
              const rawItems: OrderItem[] = Array.isArray(o.items)
                ? o.items
                : Object.values(o.items || {});
              const mapUrl =
                o.customerLat && o.customerLng
                  ? `https://www.google.com/maps?q=${o.customerLat},${o.customerLng}`
                  : o.locationLink || '';
              const liveRiderLat = o.riderLat || rider?.lat || null;
              const liveRiderLng = o.riderLng || rider?.lng || null;
              const riderMapUrl =
                liveRiderLat && liveRiderLng
                  ? `https://www.google.com/maps?q=${liveRiderLat},${liveRiderLng}`
                  : '';

              return (
                <>
                  {o.isSpamSuspect && (
                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid var(--danger)',
                        borderRadius: '12px',
                        padding: '0.75rem',
                        marginBottom: '1rem',
                        color: '#991b1b',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                      }}
                    >
                      🚨 AUTO-SPAM DETECTED:{' '}
                      {o.spamReason || 'Suspicious pattern'}
                    </div>
                  )}
                  <div className="detail-kv-grid">
                    <div className="detail-kv">
                      <small>Order ID</small>
                      <strong>#{detailOrderId.slice(-8)}</strong>
                    </div>
                    <div className="detail-kv">
                      <small>Store</small>
                      <strong>{store.name || o.restaurantId}</strong>
                    </div>
                    <div className="detail-kv">
                      <small>Customer</small>
                      <strong>
                        {cust.name || 'Customer'} • {o.phone || ''}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Delivery PIN / Pickup</small>
                      <strong>
                        PIN: {o.deliveryOtp || '-'} | Pickup: {o.pickupOtp || '-'}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Payment &amp; UTR</small>
                      <strong>
                        {o.paymentMode || 'COD'} ({o.paymentStatus || ''}){' '}
                        {o.transactionId ? `UTR: ${o.transactionId}` : ''}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Assigned Rider &amp; Live GPS</small>
                      <strong>
                        {rider
                          ? `${rider.name} (${rider.phone || ''})`
                          : 'Unassigned'}
                      </strong>
                      {riderMapUrl && (
                        <div style={{ marginTop: '3px' }}>
                          <a
                            href={riderMapUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              color: '#059669',
                              fontSize: '0.76rem',
                              fontWeight: 800,
                            }}
                          >
                            🛵 Track Rider Live Map
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {o.paymentScreenshot && (
                    <div style={{ marginBottom: '1rem' }}>
                      <button
                        type="button"
                        className="btn btn-info btn-sm"
                        onClick={() =>
                          onOpenScreenshot(
                            o.paymentScreenshot!,
                            `Order #${detailOrderId.slice(-6)} • UTR: ${o.transactionId || 'N/A'} • ₹${Number(o.totalAmount || 0).toFixed(0)}`
                          )
                        }
                      >
                        <i className="fa-solid fa-image"></i> View Customer
                        Payment Screenshot
                      </button>
                    </div>
                  )}

                  <div className="detail-kv" style={{ marginBottom: '1rem' }}>
                    <small>Delivery Address &amp; GPS</small>
                    <strong>{o.address || 'N/A'}</strong>
                    {mapUrl && (
                      <div style={{ marginTop: '4px' }}>
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: '#0284c7', fontSize: '0.8rem' }}
                        >
                          📍 Open Customer Google Maps
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="detail-kv" style={{ marginBottom: '1rem' }}>
                    <small>Ordered Items</small>
                    {rawItems.length === 0 ? (
                      <em>No items</em>
                    ) : (
                      rawItems.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 0',
                            borderBottom: '1px dashed var(--border)',
                          }}
                        >
                          <span>
                            {item.qty}× {item.name}
                          </span>
                          <strong>
                            ₹{(Number(item.price || 0) * item.qty).toFixed(0)}
                          </strong>
                        </div>
                      ))
                    )}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '8px',
                        fontSize: '1rem',
                        color: 'var(--primary)',
                      }}
                    >
                      <strong>Total Payable:</strong>
                      <strong>₹{Number(o.totalAmount || 0).toFixed(2)}</strong>
                    </div>
                  </div>

                  {/* INTERNAL ORDER NOTES */}
                  <div
                    className="detail-kv"
                    style={{
                      marginBottom: '1rem',
                      borderColor: 'rgba(245, 158, 11, 0.35)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '6px',
                      }}
                    >
                      <small style={{ color: '#b45309', marginBottom: 0 }}>
                        📝 INTERNAL ORDER NOTES (ADMIN ONLY)
                      </small>
                      {o.orderNotesUpdatedAt && (
                        <small
                          style={{
                            color: 'var(--text-muted)',
                            fontSize: '0.68rem',
                            marginBottom: 0,
                          }}
                        >
                          Updated{' '}
                          {new Date(o.orderNotesUpdatedAt).toLocaleString()}
                          {o.orderNotesUpdatedBy
                            ? ` • ${o.orderNotesUpdatedBy}`
                            : ''}
                        </small>
                      )}
                    </div>

                    <div className="order-note-chip-row">
                      {[
                        'Customer called',
                        'Fragile item',
                        'Verify address',
                        'Handle carefully',
                        'Deliver at gate',
                      ].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="order-note-chip"
                          onClick={() =>
                            setOrderNoteDraft((prev) => {
                              const trimmed = prev.trim();
                              if (!trimmed) return tag;
                              if (
                                trimmed.toLowerCase().includes(tag.toLowerCase())
                              ) {
                                return prev;
                              }
                              return `${trimmed}; ${tag}`;
                            })
                          }
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>

                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="Add internal notes (e.g., customer called, fragile item, gate landmark)..."
                      value={orderNoteDraft}
                      onChange={(e) => setOrderNoteDraft(e.target.value)}
                      style={{ marginBottom: '8px', resize: 'vertical' }}
                    />

                    <div
                      style={{
                        display: 'flex',
                        gap: '8px',
                        justifyContent: 'flex-end',
                      }}
                    >
                      {(orderNoteDraft.trim() || o.orderNotes) && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          disabled={savingOrderNote}
                          onClick={() => {
                            setSavingOrderNote(true);
                            void db
                              .ref(`orders/${detailOrderId}`)
                              .update({
                                orderNotes: '',
                                orderNotesUpdatedAt: Date.now(),
                                orderNotesUpdatedBy: adminEmail || 'Admin',
                                updatedAt: Date.now(),
                              })
                              .then(() => {
                                setOrderNoteDraft('');
                                onToast('Order note cleared.', 'info');
                              })
                              .finally(() => setSavingOrderNote(false));
                          }}
                        >
                          Clear
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        disabled={savingOrderNote}
                        onClick={() => {
                          const cleanNote = sanitizeText(orderNoteDraft).trim();
                          setSavingOrderNote(true);
                          void db
                            .ref(`orders/${detailOrderId}`)
                            .update({
                              orderNotes: cleanNote,
                              orderNotesUpdatedAt: Date.now(),
                              orderNotesUpdatedBy: adminEmail || 'Admin',
                              updatedAt: Date.now(),
                            })
                            .then(() => {
                              onToast(
                                cleanNote
                                  ? `📝 Order note saved for #${detailOrderId.slice(-6)}!`
                                  : `Order note cleared for #${detailOrderId.slice(-6)}.`,
                                'success'
                              );
                            })
                            .finally(() => setSavingOrderNote(false));
                        }}
                      >
                        <i className="fa-solid fa-floppy-disk"></i>{' '}
                        {savingOrderNote ? 'Saving...' : 'Save Order Note'}
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid var(--border)',
                      borderRadius: '14px',
                      padding: '1rem',
                    }}
                  >
                    <label
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        color: 'var(--warning)',
                        display: 'block',
                        marginBottom: '6px',
                      }}
                    >
                      ADMIN FORCE STATUS OVERRIDE
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <select
                        className="form-input"
                        style={{ flex: 1, minWidth: '180px' }}
                        value={overrideStatus}
                        onChange={(e) => setOverrideStatus(e.target.value)}
                      >
                        {[
                          'PLACED',
                          'ACCEPTED',
                          'PREPARING',
                          'READY_FOR_PICKUP',
                          'PICKED_UP',
                          'OUT_FOR_DELIVERY',
                          'DELIVERED',
                          'CANCELLED',
                        ].map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          const updates: Record<string, unknown> = {
                            status: overrideStatus,
                            updatedAt: Date.now(),
                          };
                          if (overrideStatus === 'CANCELLED') {
                            updates.cancelledBy = 'ADMIN';
                            updates.cancelReason = 'Updated by Admin';
                          }
                          db.ref(`orders/${detailOrderId}`)
                            .update(updates)
                            .then(() => {
                              onCloseDetailOrder();
                              onToast(
                                `Order #${detailOrderId.slice(-6)} updated to ${overrideStatus}!`,
                                'success'
                              );
                            });
                        }}
                      >
                        Update Status
                      </button>
                      {o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            onCloseDetailOrder();
                            onCancelOrder(detailOrderId);
                          }}
                        >
                          Cancel &amp; Refund
                        </button>
                      )}
                      {o.emergencyAlert && (
                        <button
                          type="button"
                          className="btn btn-warning btn-sm"
                          onClick={() => {
                            db.ref(`orders/${detailOrderId}`)
                              .update({
                                emergencyAlert: false,
                                updatedAt: Date.now(),
                              })
                              .then(() => {
                                onCloseDetailOrder();
                                onToast('SOS Alert cleared.', 'info');
                              });
                          }}
                        >
                          Clear SOS
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* CUSTOMER MANAGE MODAL */}
      {manageCustomerUid && state.customers[manageCustomerUid] && (
        <div className="modal-backdrop open" onClick={onCloseManageCustomer}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900, color: '#0284c7' }}>
                <i className="fa-solid fa-user-gear"></i> Customer Full Details,
                Wallet &amp; Control
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseManageCustomer}
                style={{ fontSize: '1.3rem', cursor: 'pointer' }}
              ></i>
            </div>

            {(() => {
              const c = state.customers[manageCustomerUid];
              const custOrders = Object.entries(state.orders)
                .filter(([, o]) => o.customerUid === manageCustomerUid)
                .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));
              let spent = 0;
              let cancels = 0;
              custOrders.forEach(([, o]) => {
                if (o.status === 'DELIVERED') spent += Number(o.totalAmount || 0);
                if (o.status === 'CANCELLED') cancels++;
              });
              const mapUrl =
                c.lat && c.lng
                  ? `https://www.google.com/maps?q=${c.lat},${c.lng}`
                  : c.locationLink || '';

              return (
                <>
                  <div className="detail-kv-grid">
                    <div className="detail-kv">
                      <small>Wallet &amp; Referral</small>
                      <strong>
                        ₹{Number(c.walletBalance || 0).toFixed(2)} • Code:{' '}
                        {c.referralCode ||
                          `GB${manageCustomerUid.slice(0, 6).toUpperCase()}`}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Email &amp; Joined</small>
                      <strong>
                        {c.email || 'N/A'} •{' '}
                        {c.createdAt
                          ? new Date(c.createdAt).toLocaleDateString()
                          : '-'}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Order Stats</small>
                      <strong>
                        {custOrders.length} Total • ₹{spent.toFixed(0)} Spent •{' '}
                        {cancels} Cancels
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Saved GPS</small>
                      <strong>
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: '#0284c7' }}
                          >
                            Open Map
                          </a>
                        ) : (
                          'Not saved'
                        )}
                      </strong>
                    </div>
                  </div>

                  <form onSubmit={handleSaveCustomer}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div className="form-group">
                        <label>Full Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={custForm.name}
                          onChange={(e) =>
                            setCustForm({ ...custForm, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Mobile Number</label>
                        <input
                          type="tel"
                          className="form-input"
                          maxLength={10}
                          value={custForm.phone}
                          onChange={(e) =>
                            setCustForm({ ...custForm, phone: e.target.value })
                          }
                          required
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Saved Address</label>
                      <textarea
                        className="form-input"
                        rows={2}
                        value={custForm.address}
                        onChange={(e) =>
                          setCustForm({ ...custForm, address: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Admin Private Note / Warning</label>
                      <input
                        type="text"
                        className="form-input"
                        value={custForm.adminNote}
                        onChange={(e) =>
                          setCustForm({ ...custForm, adminNote: e.target.value })
                        }
                      />
                    </div>
                    <div className="toggle-row">
                      <label htmlFor="edit-cust-blocked" style={{ color: '#b91c1c' }}>
                        🚫 Block / Ban This Customer Account
                      </label>
                      <input
                        type="checkbox"
                        id="edit-cust-blocked"
                        checked={custForm.blocked}
                        onChange={(e) =>
                          setCustForm({ ...custForm, blocked: e.target.checked })
                        }
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        Save Customer Changes
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={onCloseManageCustomer}
                      >
                        Close
                      </button>
                    </div>
                  </form>

                  <div
                    style={{
                      marginTop: '1.15rem',
                      background: '#fffbeb',
                      border: '1px solid #d97706',
                      borderRadius: '14px',
                      padding: '1rem',
                    }}
                  >
                    <strong
                      style={{
                        color: '#b45309',
                        fontSize: '0.84rem',
                        display: 'block',
                        marginBottom: '8px',
                      }}
                    >
                      💳 Adjust Customer Wallet Balance
                    </strong>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ flex: 1, minWidth: '110px' }}
                        placeholder="Amount (₹)"
                        min={1}
                        value={walletAdjAmt}
                        onChange={(e) => setWalletAdjAmt(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input"
                        style={{ flex: 1.5, minWidth: '150px' }}
                        placeholder="Reason (e.g. Refund / Bonus)"
                        value={walletAdjReason}
                        onChange={(e) => setWalletAdjReason(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => handleAdjustWallet('CREDIT')}
                      >
                        + Credit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleAdjustWallet('DEBIT')}
                      >
                        - Debit
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '1.25rem' }}>
                    <h4
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-muted)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Recent Orders by This Customer
                    </h4>
                    <div
                      style={{
                        maxHeight: '180px',
                        overflowY: 'auto',
                        fontSize: '0.82rem',
                      }}
                    >
                      {custOrders.length === 0 ? (
                        <em style={{ color: 'var(--text-muted)' }}>
                          No orders placed yet.
                        </em>
                      ) : (
                        custOrders.slice(0, 10).map(([id, o]) => (
                          <div
                            key={id}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '6px 8px',
                              borderBottom: '1px solid var(--border)',
                              background: '#f8fafc',
                            }}
                          >
                            <span>
                              <strong>#{id.slice(-6)}</strong> (
                              {new Date(o.createdAt || Date.now()).toLocaleDateString()}
                              ) • ₹{Number(o.totalAmount || 0).toFixed(0)}{' '}
                              {o.isSpamSuspect ? '🚨' : ''}
                            </span>
                            <span className="badge badge-info">
                              {o.status === 'PREPARING'
                                ? 'PACKING'
                                : o.status || 'PLACED'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* RIDER MANAGE MODAL */}
      {manageRiderUid && state.deliveryPartners[manageRiderUid] && (
        <div className="modal-backdrop open" onClick={onCloseManageRider}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900, color: '#0284c7' }}>
                <i className="fa-solid fa-motorcycle"></i> Rider Full Details,
                Rating &amp; Control
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseManageRider}
                style={{ fontSize: '1.3rem', cursor: 'pointer' }}
              ></i>
            </div>

            {(() => {
              const d = state.deliveryPartners[manageRiderUid];
              const cashMetrics = getRiderCashMetrics(manageRiderUid);
              let deliveredTrips = 0;
              let passedTrips = 0;
              let totalEarned = 0;
              const baseFee = Number(
                state.settings?.riderBaseFee || state.settings?.deliveryCharge || 25
              );
              Object.values(state.orders).forEach((o) => {
                if (o.deliveryUid === manageRiderUid && o.status === 'DELIVERED') {
                  deliveredTrips++;
                  totalEarned +=
                    o.deliveryCharge !== undefined && Number(o.deliveryCharge) > 0
                      ? Number(o.deliveryCharge)
                      : baseFee;
                }
                if (o.rejectedByRiders && o.rejectedByRiders[manageRiderUid]) {
                  passedTrips++;
                }
              });
              let paidPayout = 0;
              Object.values(state.riderPayouts).forEach((p) => {
                if (p.riderUid === manageRiderUid && p.status === 'PAID') {
                  paidPayout += Number(p.amount || 0);
                }
              });
              const ratingText = d.ratingCount
                ? `⭐ ${Number(d.ratingAvg || 5).toFixed(1)} (${d.ratingCount} ratings)`
                : 'No ratings yet';

              return (
                <>
                  <div className="detail-kv-grid">
                    <div className="detail-kv">
                      <small>Rating &amp; Email</small>
                      <strong>
                        {ratingText} • {d.email || 'N/A'}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Trips Done / Passed</small>
                      <strong>
                        {deliveredTrips} Delivered • {passedTrips} Passed
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Earnings / Paid</small>
                      <strong>
                        Earned ₹{totalEarned.toFixed(0)} • Paid ₹
                        {paidPayout.toFixed(0)}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>COD Cash Held / Settled</small>
                      <strong>
                        Held ₹{cashMetrics.netCashInHand.toFixed(0)} • Settled ₹
                        {cashMetrics.totalSettled.toFixed(0)}
                      </strong>
                    </div>
                  </div>
                  {(d.codAssignmentRestricted || d.codReviewFlagged) && (
                    <div
                      style={{
                        background: d.codAssignmentRestricted
                          ? '#fef2f2'
                          : '#fffbeb',
                        border: `1px solid ${
                          d.codAssignmentRestricted
                            ? '#fca5a5'
                            : '#fcd34d'
                        }`,
                        borderRadius: '10px',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.78rem',
                        color: d.codAssignmentRestricted ? '#991b1b' : '#92400e',
                        marginBottom: '1rem',
                      }}
                    >
                      <strong>
                        {d.codAssignmentRestricted
                          ? '🚫 Order Assignments Restricted (Smart Auto-Settle)'
                          : '🚩 Flagged for COD Cash Admin Review'}
                      </strong>
                      {d.codRestrictionReason && (
                        <div style={{ marginTop: '3px' }}>
                          {d.codRestrictionReason}
                        </div>
                      )}
                    </div>
                  )}

                  <RiderWeeklyChart
                    riderUid={manageRiderUid}
                    orders={state.orders}
                    baseFee={baseFee}
                  />

                  <form onSubmit={handleSaveRider}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div className="form-group">
                        <label>Rider Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={riderForm.name}
                          onChange={(e) =>
                            setRiderForm({ ...riderForm, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Phone</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={riderForm.phone}
                          onChange={(e) =>
                            setRiderForm({ ...riderForm, phone: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Vehicle</label>
                        <input
                          type="text"
                          className="form-input"
                          value={riderForm.vehicle}
                          onChange={(e) =>
                            setRiderForm({ ...riderForm, vehicle: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Payout UPI ID</label>
                        <input
                          type="text"
                          className="form-input"
                          value={riderForm.upiId}
                          onChange={(e) =>
                            setRiderForm({ ...riderForm, upiId: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Admin Notice to Rider</label>
                      <input
                        type="text"
                        className="form-input"
                        value={riderForm.adminNote}
                        onChange={(e) =>
                          setRiderForm({ ...riderForm, adminNote: e.target.value })
                        }
                      />
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div className="toggle-row">
                        <label htmlFor="edit-rider-approved">✅ KYC Approved</label>
                        <input
                          type="checkbox"
                          id="edit-rider-approved"
                          checked={riderForm.approved}
                          onChange={(e) =>
                            setRiderForm({
                              ...riderForm,
                              approved: e.target.checked,
                            })
                          }
                        />
                      </div>
                      <div className="toggle-row">
                        <label htmlFor="edit-rider-online">🟢 Duty Online</label>
                        <input
                          type="checkbox"
                          id="edit-rider-online"
                          checked={riderForm.online}
                          onChange={(e) =>
                            setRiderForm({ ...riderForm, online: e.target.checked })
                          }
                        />
                      </div>
                    </div>
                    <div
                      className="toggle-row"
                      style={{ borderColor: 'rgba(239,68,68,0.5)' }}
                    >
                      <label
                        htmlFor="edit-rider-suspended"
                        style={{ color: '#b91c1c' }}
                      >
                        🚫 Suspend Rider
                      </label>
                      <input
                        type="checkbox"
                        id="edit-rider-suspended"
                        checked={riderForm.suspended}
                        onChange={(e) =>
                          setRiderForm({
                            ...riderForm,
                            suspended: e.target.checked,
                          })
                        }
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        Save Rider Profile
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={onCloseManageRider}
                      >
                        Close
                      </button>
                    </div>
                  </form>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* STORE MANAGE MODAL */}
      {manageStoreUid && state.restaurants[manageStoreUid] && (
        <div className="modal-backdrop open" onClick={onCloseManageStore}>
          <div className="modal-box wide" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900, color: 'var(--primary)' }}>
                <i className="fa-solid fa-store"></i> Store Full Details, Edit
                &amp; Catalog
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={onCloseManageStore}
                style={{ fontSize: '1.3rem', cursor: 'pointer' }}
              ></i>
            </div>

            {(() => {
              const store = state.restaurants[manageStoreUid];
              const metrics = getStorePayoutMetrics(manageStoreUid);
              const catalogEntries = Object.entries(
                state.menus[manageStoreUid] || {}
              );

              return (
                <>
                  <div className="detail-kv-grid">
                    <div className="detail-kv">
                      <small>Store UID</small>
                      <strong>{manageStoreUid.slice(0, 12)}...</strong>
                    </div>
                    <div className="detail-kv">
                      <small>Email</small>
                      <strong>{store.email || 'N/A'}</strong>
                    </div>
                    <div className="detail-kv">
                      <small>Delivered Orders / Gross</small>
                      <strong>
                        {metrics.orderCount} Orders • ₹
                        {metrics.grossSales.toFixed(0)}
                      </strong>
                    </div>
                    <div className="detail-kv">
                      <small>Paid / Net Dues</small>
                      <strong>
                        Paid ₹{metrics.totalPaidToStore.toFixed(0)} • Due ₹
                        {metrics.unpaidBalance.toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <form onSubmit={handleSaveStore}>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div className="form-group">
                        <label>Store Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={storeForm.name}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, name: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Phone</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={storeForm.phone}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, phone: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Categories / Cuisine</label>
                        <input
                          type="text"
                          className="form-input"
                          value={storeForm.cuisine}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, cuisine: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Store Payout UPI ID</label>
                        <input
                          type="text"
                          className="form-input"
                          value={storeForm.upiId}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, upiId: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Hours</label>
                        <input
                          type="text"
                          className="form-input"
                          value={storeForm.hours}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, hours: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Banner Image URL</label>
                        <input
                          type="url"
                          className="form-input"
                          value={storeForm.imageUrl}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, imageUrl: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          className="form-input"
                          value={storeForm.lat}
                          onChange={(e) =>
                            setStoreForm({
                              ...storeForm,
                              lat: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label>Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          className="form-input"
                          value={storeForm.lng}
                          onChange={(e) =>
                            setStoreForm({
                              ...storeForm,
                              lng: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>Physical Address</label>
                      <input
                        type="text"
                        className="form-input"
                        value={storeForm.address}
                        onChange={(e) =>
                          setStoreForm({ ...storeForm, address: e.target.value })
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label>Admin Notice to Store</label>
                      <input
                        type="text"
                        className="form-input"
                        value={storeForm.adminNote}
                        onChange={(e) =>
                          setStoreForm({ ...storeForm, adminNote: e.target.value })
                        }
                      />
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '10px',
                      }}
                    >
                      <div className="toggle-row">
                        <label htmlFor="edit-store-approved">✅ Store Approved</label>
                        <input
                          type="checkbox"
                          id="edit-store-approved"
                          checked={storeForm.approved}
                          onChange={(e) =>
                            setStoreForm({
                              ...storeForm,
                              approved: e.target.checked,
                            })
                          }
                        />
                      </div>
                      <div className="toggle-row">
                        <label htmlFor="edit-store-open">🟢 Store Open</label>
                        <input
                          type="checkbox"
                          id="edit-store-open"
                          checked={storeForm.isOpen}
                          onChange={(e) =>
                            setStoreForm({ ...storeForm, isOpen: e.target.checked })
                          }
                        />
                      </div>
                    </div>
                    <div
                      className="toggle-row"
                      style={{ borderColor: 'rgba(239,68,68,0.5)' }}
                    >
                      <label
                        htmlFor="edit-store-suspended"
                        style={{ color: '#b91c1c' }}
                      >
                        🚫 Force Suspend Store
                      </label>
                      <input
                        type="checkbox"
                        id="edit-store-suspended"
                        checked={storeForm.suspended}
                        onChange={(e) =>
                          setStoreForm({
                            ...storeForm,
                            suspended: e.target.checked,
                          })
                        }
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                      >
                        Save Store Changes
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={onCloseManageStore}
                      >
                        Close
                      </button>
                    </div>
                  </form>

                  <div
                    style={{
                      marginTop: '1.5rem',
                      borderTop: '1px dashed var(--border)',
                      paddingTop: '1rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.75rem',
                      }}
                    >
                      <h4 style={{ fontSize: '0.95rem', color: '#0284c7' }}>
                        📦 Store Products Catalog &amp; Admin Approval
                      </h4>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => openProductModal(manageStoreUid)}
                      >
                        + Add Product
                      </button>
                    </div>
                    <div className="table-responsive" style={{ maxHeight: '240px' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Product &amp; Rating</th>
                            <th>Price / MRP</th>
                            <th>Approval</th>
                            <th>Stock</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catalogEntries.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                style={{
                                  textAlign: 'center',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                No products yet.
                              </td>
                            </tr>
                          ) : (
                            catalogEntries.map(([itemId, item]) => {
                              const isAvail = item.available !== false;
                              const isApproved = item.adminApproved === true;
                              const ratingTxt = item.ratingCount
                                ? `⭐ ${Number(item.ratingAvg || 5).toFixed(1)} (${item.ratingCount})`
                                : 'No ratings';
                              return (
                                <tr key={itemId}>
                                  <td>
                                    <strong>{item.name}</strong>
                                    <div
                                      style={{
                                        fontSize: '0.72rem',
                                        color: '#b45309',
                                      }}
                                    >
                                      {ratingTxt}
                                    </div>
                                  </td>
                                  <td>
                                    ₹{Number(item.price || 0).toFixed(0)}{' '}
                                    {item.mrp ? (
                                      <small
                                        style={{
                                          textDecoration: 'line-through',
                                          color: 'var(--text-muted)',
                                        }}
                                      >
                                        ₹{item.mrp}
                                      </small>
                                    ) : null}
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${isApproved ? 'btn-success' : 'btn-warning'}`}
                                      onClick={() =>
                                        onVerifyProduct(
                                          manageStoreUid,
                                          itemId,
                                          !isApproved
                                        )
                                      }
                                    >
                                      {isApproved ? '✅ Live' : '⏳ Approve'}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className={`btn btn-sm ${isAvail ? 'btn-success' : 'btn-danger'}`}
                                      onClick={() =>
                                        db.ref(
                                          `menus/${manageStoreUid}/${itemId}`
                                        ).update({ available: !isAvail })
                                      }
                                    >
                                      {isAvail ? 'In Stock' : 'Out'}
                                    </button>
                                  </td>
                                  <td>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        className="btn btn-outline btn-sm"
                                        onClick={() =>
                                          openProductModal(manageStoreUid, itemId)
                                        }
                                      >
                                        <i className="fa-solid fa-pen"></i>
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() =>
                                          handleDeleteProduct(
                                            manageStoreUid,
                                            itemId
                                          )
                                        }
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
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ADMIN PRODUCT ADD/EDIT MODAL */}
      {productModalState && (
        <div
          className="modal-backdrop open"
          onClick={() => setProductModalState(null)}
          style={{ zIndex: 600 }}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3 style={{ fontWeight: 900 }}>
                {productModalState.itemId
                  ? 'Edit Store Product'
                  : 'Add Store Product'}
              </h3>
              <i
                className="fa-solid fa-xmark"
                onClick={() => setProductModalState(null)}
                style={{ fontSize: '1.25rem', cursor: 'pointer' }}
              ></i>
            </div>
            <form onSubmit={handleSaveProduct}>
              <div className="form-group">
                <label>Product Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={prodForm.name}
                  onChange={(e) =>
                    setProdForm({ ...prodForm, name: e.target.value })
                  }
                  required
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr',
                  gap: '10px',
                }}
              >
                <div className="form-group">
                  <label>Sale Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={1}
                    className="form-input"
                    value={prodForm.price}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, price: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="form-group">
                  <label>MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    className="form-input"
                    value={prodForm.mrp}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, mrp: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Stock Qty</label>
                  <input
                    type="number"
                    min={0}
                    placeholder="e.g. 20"
                    className="form-input"
                    value={prodForm.stockQty}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, stockQty: e.target.value })
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Category Tag</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="VEG / DAIRY"
                    value={prodForm.category}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, category: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Search Keywords (Comma Separated)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="aalu, potato, sabzi"
                  value={prodForm.searchKeywords}
                  onChange={(e) =>
                    setProdForm({ ...prodForm, searchKeywords: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Description / Unit</label>
                <input
                  type="text"
                  className="form-input"
                  value={prodForm.description}
                  onChange={(e) =>
                    setProdForm({ ...prodForm, description: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Image URL</label>
                <input
                  type="text"
                  className="form-input"
                  value={prodForm.imageUrl}
                  onChange={(e) =>
                    setProdForm({ ...prodForm, imageUrl: e.target.value })
                  }
                />
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <div className="toggle-row">
                  <label htmlFor="admin-prod-avail">In Stock</label>
                  <input
                    type="checkbox"
                    id="admin-prod-avail"
                    checked={prodForm.available}
                    onChange={(e) =>
                      setProdForm({ ...prodForm, available: e.target.checked })
                    }
                  />
                </div>
                <div className="toggle-row">
                  <label htmlFor="admin-prod-approved">✅ Admin Approved</label>
                  <input
                    type="checkbox"
                    id="admin-prod-approved"
                    checked={prodForm.adminApproved}
                    onChange={(e) =>
                      setProdForm({
                        ...prodForm,
                        adminApproved: e.target.checked,
                      })
                    }
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Save Product
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setProductModalState(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
