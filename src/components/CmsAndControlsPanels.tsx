import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { AdminSettings, CategoryConfig, DEFAULT_CATEGORIES } from '../types';
import { sanitizeText } from '../utils/helpers';
import { DialogConfig } from './ActionDialogModal';

interface CmsAndControlsProps {
  activePanel: string;
  settings: AdminSettings;
  onToast: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
  onConfirmDialog: (cfg: DialogConfig) => void;
}

export const CmsPanel: React.FC<CmsAndControlsProps> = ({
  activePanel,
  settings,
  onToast,
  onConfirmDialog,
}) => {
  const [cms, setCms] = useState({
    appBrandName: 'Gossaigaon Bazar',
    expressEtaText: '⚡ 15 MINS EXPRESS',
    expressLocalBadge: 'LOCAL',
    searchPlaceholder: 'Search vegetables, atta, milk, oil across stores...',
    themePrimaryColor: '#0c831f',
    themeAccentColor: '#f8cb46',
    themeBgColor: '#f4f6fb',
    heroTitle: 'Fresh Groceries Delivered',
    heroSubtitle: 'Shop from any store together! 15-Mins Express',
    heroTag: 'Gossaigaon Bazar',
    heroEmoji: '🛍️',
    extraBannerText: '',
    customBannerImageUrl: '',
    freeDeliveryAbove: 299,
    deliveryCharge: 25,
    minOrderAmount: 0,
    handlingFee: 0,
    activeCouponCode: 'GOSSAIGAON20',
    activeCouponDiscount: 20,
    couponMinOrder: 100,
    upiId: 'gossaigaonbazar@apl',
    referrerBonus: 25,
    refereeBonus: 25,
    allowCod: true,
    allowUpi: true,
    allowCoupons: true,
    allowVoiceSearch: true,
    allowReferrals: true,
    showHeroBanner: true,
    maintenanceMode: false,
    maintenanceMessage:
      'Gossaigaon Bazar is currently closed for scheduled maintenance. We will be back shortly!',
    announcementActive: false,
    announcementText: '',
    allowCardPayment: true,
    allowWalletPayment: true,
    allowCashback: true,
    allowChutkiPlus: true,
    allowDeliveryQr: true,
    allowFavoriteStores: true,
    allowRefundRequests: true,
    allowRiderTip: true,
    allowScheduledDelivery: true,
    allowStoreQuickAdd: true,
    allowStoreRatings: true,
    blockCodForFlaggedUsers: true,
    enforceStockLimits: true,
    prioritizeNearbyStores: true,
    showStockBadges: true,
    strictAntiScamShield: true,
    cashbackPercent: 5,
    codMaxOrderAmount: 3000,
    maxActiveOrdersPerUser: 5,
    nearbyRadiusKm: 15,
    plusPlanPrice: 99,
    plusValidityDays: 30,
    spamAutoBlockThreshold: 3,
    actionCooldownMs: 15000,
    customDeliverySlots: '',
    riderTipOptions: '10, 20, 30, 50',
  });

  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catEditIndex, setCatEditIndex] = useState(-1);
  const [catForm, setCatForm] = useState({
    id: '',
    icon: '🛒',
    name: '',
    keywords: '',
    active: true,
  });

  useEffect(() => {
    setCms({
      appBrandName: settings.appBrandName || 'Gossaigaon Bazar',
      expressEtaText: settings.expressEtaText || '⚡ 15 MINS EXPRESS',
      expressLocalBadge: settings.expressLocalBadge || 'LOCAL',
      searchPlaceholder:
        settings.searchPlaceholder ||
        'Search vegetables, atta, milk, oil across stores...',
      themePrimaryColor: settings.themePrimaryColor || '#0c831f',
      themeAccentColor: settings.themeAccentColor || '#f8cb46',
      themeBgColor: settings.themeBgColor || '#f4f6fb',
      heroTitle: settings.heroTitle || 'Fresh Groceries Delivered',
      heroSubtitle:
        settings.heroSubtitle ||
        'Shop from any store together! 15-Mins Express',
      heroTag: settings.heroTag || 'Gossaigaon Bazar',
      heroEmoji: settings.heroEmoji || '🛍️',
      extraBannerText: settings.extraBannerText || '',
      customBannerImageUrl: settings.customBannerImageUrl || '',
      freeDeliveryAbove:
        settings.freeDeliveryAbove !== undefined ? settings.freeDeliveryAbove : 299,
      deliveryCharge:
        settings.deliveryCharge !== undefined ? settings.deliveryCharge : 25,
      minOrderAmount:
        settings.minOrderAmount !== undefined ? settings.minOrderAmount : 0,
      handlingFee: settings.handlingFee !== undefined ? settings.handlingFee : 0,
      activeCouponCode: settings.activeCouponCode || 'GOSSAIGAON20',
      activeCouponDiscount:
        settings.activeCouponDiscount !== undefined
          ? settings.activeCouponDiscount
          : 20,
      couponMinOrder:
        settings.couponMinOrder !== undefined ? settings.couponMinOrder : 100,
      upiId: settings.upiId || 'gossaigaonbazar@apl',
      referrerBonus:
        settings.referrerBonus !== undefined ? settings.referrerBonus : 25,
      refereeBonus:
        settings.refereeBonus !== undefined ? settings.refereeBonus : 25,
      allowCod: settings.allowCod !== false,
      allowUpi: settings.allowUpi !== false,
      allowCoupons: settings.allowCoupons !== false,
      allowVoiceSearch: settings.allowVoiceSearch !== false,
      allowReferrals: settings.allowReferrals !== false,
      showHeroBanner: settings.showHeroBanner !== false,
      maintenanceMode: settings.maintenanceMode === true,
      maintenanceMessage:
        settings.maintenanceMessage ||
        'Gossaigaon Bazar is currently closed for scheduled maintenance. We will be back shortly!',
      announcementActive: settings.announcementActive === true,
      announcementText: settings.announcementText || '',
      allowCardPayment: settings.allowCardPayment !== false,
      allowWalletPayment: settings.allowWalletPayment !== false,
      allowCashback: settings.allowCashback === true,
      allowChutkiPlus: settings.allowChutkiPlus !== false,
      allowDeliveryQr: settings.allowDeliveryQr !== false,
      allowFavoriteStores: settings.allowFavoriteStores !== false,
      allowRefundRequests: settings.allowRefundRequests !== false,
      allowRiderTip: settings.allowRiderTip !== false,
      allowScheduledDelivery: settings.allowScheduledDelivery !== false,
      allowStoreQuickAdd: settings.allowStoreQuickAdd !== false,
      allowStoreRatings: settings.allowStoreRatings !== false,
      blockCodForFlaggedUsers: settings.blockCodForFlaggedUsers !== false,
      enforceStockLimits: settings.enforceStockLimits !== false,
      prioritizeNearbyStores: settings.prioritizeNearbyStores !== false,
      showStockBadges: settings.showStockBadges !== false,
      strictAntiScamShield: settings.strictAntiScamShield !== false,
      cashbackPercent: settings.cashbackPercent ?? 5,
      codMaxOrderAmount: settings.codMaxOrderAmount ?? 3000,
      maxActiveOrdersPerUser: settings.maxActiveOrdersPerUser ?? 5,
      nearbyRadiusKm: settings.nearbyRadiusKm ?? 15,
      plusPlanPrice: settings.plusPlanPrice ?? 99,
      plusValidityDays: settings.plusValidityDays ?? 30,
      spamAutoBlockThreshold: settings.spamAutoBlockThreshold ?? 3,
      actionCooldownMs: settings.actionCooldownMs ?? 15000,
      customDeliverySlots: Array.isArray(settings.customDeliverySlots) ? settings.customDeliverySlots.join(', ') : '',
      riderTipOptions: Array.isArray(settings.riderTipOptions) ? settings.riderTipOptions.join(', ') : '10, 20, 30, 50',
    });
  }, [settings]);

  const categories: CategoryConfig[] =
    Array.isArray(settings.customCategories) && settings.customCategories.length > 0
      ? settings.customCategories
      : JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));

  const handleSaveCms = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: AdminSettings = {
      appBrandName: sanitizeText(cms.appBrandName.trim()),
      expressEtaText: sanitizeText(cms.expressEtaText.trim()),
      expressLocalBadge: sanitizeText(cms.expressLocalBadge.trim()),
      searchPlaceholder: sanitizeText(cms.searchPlaceholder.trim()),
      themePrimaryColor: cms.themePrimaryColor,
      themeAccentColor: cms.themeAccentColor,
      themeBgColor: cms.themeBgColor,
      heroTitle: sanitizeText(cms.heroTitle.trim()),
      heroSubtitle: sanitizeText(cms.heroSubtitle.trim()),
      heroTag: sanitizeText(cms.heroTag.trim()),
      heroEmoji: sanitizeText(cms.heroEmoji.trim()) || '🛍️',
      extraBannerText: sanitizeText(cms.extraBannerText.trim()),
      customBannerImageUrl: cms.customBannerImageUrl.trim(),
      freeDeliveryAbove: Number(cms.freeDeliveryAbove || 0),
      deliveryCharge: Number(cms.deliveryCharge || 0),
      minOrderAmount: Number(cms.minOrderAmount || 0),
      handlingFee: Number(cms.handlingFee || 0),
      activeCouponCode: sanitizeText(cms.activeCouponCode.trim().toUpperCase()),
      activeCouponDiscount: Number(cms.activeCouponDiscount || 0),
      couponMinOrder: Number(cms.couponMinOrder || 100),
      upiId: cms.upiId.trim(),
      referrerBonus: Number(cms.referrerBonus || 0),
      refereeBonus: Number(cms.refereeBonus || 0),
      allowCod: cms.allowCod,
      allowUpi: cms.allowUpi,
      allowCoupons: cms.allowCoupons,
      allowVoiceSearch: cms.allowVoiceSearch,
      allowReferrals: cms.allowReferrals,
      showHeroBanner: cms.showHeroBanner,
      maintenanceMode: cms.maintenanceMode,
      maintenanceMessage: sanitizeText(cms.maintenanceMessage.trim()),
      announcementActive: cms.announcementActive,
      announcementText: sanitizeText(cms.announcementText.trim()),
      allowCardPayment: cms.allowCardPayment,
      allowWalletPayment: cms.allowWalletPayment,
      allowCashback: cms.allowCashback,
      allowChutkiPlus: cms.allowChutkiPlus,
      allowDeliveryQr: cms.allowDeliveryQr,
      allowFavoriteStores: cms.allowFavoriteStores,
      allowRefundRequests: cms.allowRefundRequests,
      allowRiderTip: cms.allowRiderTip,
      allowScheduledDelivery: cms.allowScheduledDelivery,
      allowStoreQuickAdd: cms.allowStoreQuickAdd,
      allowStoreRatings: cms.allowStoreRatings,
      blockCodForFlaggedUsers: cms.blockCodForFlaggedUsers,
      enforceStockLimits: cms.enforceStockLimits,
      prioritizeNearbyStores: cms.prioritizeNearbyStores,
      showStockBadges: cms.showStockBadges,
      strictAntiScamShield: cms.strictAntiScamShield,
      cashbackPercent: Math.max(0, Math.min(100, Number(cms.cashbackPercent || 0))),
      codMaxOrderAmount: Math.max(1, Number(cms.codMaxOrderAmount || 3000)),
      maxActiveOrdersPerUser: Math.max(1, Math.min(50, Number(cms.maxActiveOrdersPerUser || 5))),
      nearbyRadiusKm: Math.max(1, Math.min(100, Number(cms.nearbyRadiusKm || 15))),
      plusPlanPrice: Math.max(0, Number(cms.plusPlanPrice || 0)),
      plusValidityDays: Math.max(1, Math.min(365, Number(cms.plusValidityDays || 30))),
      spamAutoBlockThreshold: Math.max(1, Math.min(20, Number(cms.spamAutoBlockThreshold || 3))),
      actionCooldownMs: Math.max(0, Math.min(300000, Number(cms.actionCooldownMs || 0))),
      customDeliverySlots: cms.customDeliverySlots.split(',').map((v) => sanitizeText(v.trim())).filter(Boolean),
      riderTipOptions: cms.riderTipOptions.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && v > 0).slice(0, 10),
      updatedAt: Date.now(),
    };

    db.ref('admin/settings')
      .update(payload)
      .then(() =>
        onToast('🎉 Customer App UI, Referral & Rules published live!', 'success')
      );
  };

  const openCategoryModal = (idx = -1) => {
    setCatEditIndex(idx);
    if (idx >= 0 && categories[idx]) {
      const c = categories[idx];
      setCatForm({
        id: c.id,
        icon: c.icon || '🛒',
        name: c.name || '',
        keywords: Array.isArray(c.keywords) ? c.keywords.join(', ') : '',
        active: c.active !== false,
      });
    } else {
      setCatForm({ id: '', icon: '🛒', name: '', keywords: '', active: true });
    }
    setCatModalOpen(true);
    window.history.pushState({ modal: 'cat' }, '');
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const nextCats = [...categories];
    const catObj: CategoryConfig = {
      id: sanitizeText(catForm.id.trim().toUpperCase().replace(/\s+/g, '_')),
      icon: sanitizeText(catForm.icon.trim()) || '🛒',
      name: sanitizeText(catForm.name.trim()),
      keywords: catForm.keywords
        .split(',')
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
      active: catForm.active,
    };
    if (catEditIndex >= 0 && nextCats[catEditIndex]) {
      nextCats[catEditIndex] = catObj;
    } else {
      nextCats.push(catObj);
    }
    db.ref('admin/settings/customCategories')
      .set(nextCats)
      .then(() => {
        setCatModalOpen(false);
        onToast('Category updated live!', 'success');
      });
  };

  const handleDeleteCategory = (idx: number) => {
    onConfirmDialog({
      mode: 'confirm',
      title: 'Remove Category?',
      message: 'Remove this category from Customer App?',
      confirmLabel: 'Remove',
      confirmVariant: 'danger',
      onConfirm: () => {
        const nextCats = [...categories];
        nextCats.splice(idx, 1);
        db.ref('admin/settings/customCategories')
          .set(nextCats)
          .then(() => onToast('Category removed.', 'info'));
      },
    });
  };

  const handleResetCategories = () => {
    onConfirmDialog({
      mode: 'confirm',
      title: 'Reset Default Categories?',
      message:
        'Reset Customer App categories to defaults (includes All Store, Sale, Favorites)?',
      confirmLabel: 'Reset Defaults',
      confirmVariant: 'warning',
      onConfirm: () => {
        db.ref('admin/settings/customCategories')
          .set(DEFAULT_CATEGORIES)
          .then(() => onToast('Default categories restored!', 'success'));
      },
    });
  };

  return (
    <>
      <section
        id="panel-cms"
        className={`panel-section ${activePanel === 'cms' ? 'active' : ''}`}
      >
        <div className="card" style={{ border: '1.5px solid #ec4899' }}>
          <div className="card-title">
            <span style={{ color: '#ec4899' }}>
              <i className="fa-solid fa-palette"></i> Full Customer App Customizer
              (UI, Theme, Referral &amp; Offers)
            </span>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Live updates in the Chutki Customer App through Firebase real-time settings.
            </small>
          </div>

          <form id="app-cms-form" onSubmit={handleSaveCms}>
            <h4
              style={{
                color: '#0284c7',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}
            >
              1. Branding, Colors &amp; Header
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="form-group">
                <label>App Brand Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.appBrandName}
                  onChange={(e) => setCms({ ...cms, appBrandName: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Express ETA Header Badge</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.expressEtaText}
                  onChange={(e) =>
                    setCms({ ...cms, expressEtaText: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Local Area Tag</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.expressLocalBadge}
                  onChange={(e) =>
                    setCms({ ...cms, expressLocalBadge: e.target.value })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Search Bar Placeholder</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.searchPlaceholder}
                  onChange={(e) =>
                    setCms({ ...cms, searchPlaceholder: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Primary Brand Color</label>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: '44px', padding: '4px' }}
                  value={cms.themePrimaryColor}
                  onChange={(e) =>
                    setCms({ ...cms, themePrimaryColor: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Accent / Yellow Pill Color</label>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: '44px', padding: '4px' }}
                  value={cms.themeAccentColor}
                  onChange={(e) =>
                    setCms({ ...cms, themeAccentColor: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>App Background Color</label>
                <input
                  type="color"
                  className="form-input"
                  style={{ height: '44px', padding: '4px' }}
                  value={cms.themeBgColor}
                  onChange={(e) => setCms({ ...cms, themeBgColor: e.target.value })}
                />
              </div>
            </div>

            <h4
              style={{
                color: '#0284c7',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}
            >
              2. Hero Banner, Secondary Banner &amp; Promo
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="form-group">
                <label>Hero Banner Headline</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.heroTitle}
                  onChange={(e) => setCms({ ...cms, heroTitle: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Hero Banner Subtitle</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.heroSubtitle}
                  onChange={(e) => setCms({ ...cms, heroSubtitle: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Promo Tag Badge</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.heroTag}
                  onChange={(e) => setCms({ ...cms, heroTag: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Hero Emoji / Icon</label>
                <input
                  type="text"
                  className="form-input"
                  maxLength={6}
                  value={cms.heroEmoji}
                  onChange={(e) => setCms({ ...cms, heroEmoji: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Extra Promo Banner Text (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.extraBannerText}
                  onChange={(e) =>
                    setCms({ ...cms, extraBannerText: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Custom Banner Image URL (Optional)</label>
                <input
                  type="url"
                  className="form-input"
                  value={cms.customBannerImageUrl}
                  onChange={(e) =>
                    setCms({ ...cms, customBannerImageUrl: e.target.value })
                  }
                />
              </div>
            </div>

            <h4
              style={{
                color: '#0284c7',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}
            >
              3. Delivery Fees, Coupons, Referral &amp; Checkout Rules
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '12px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="form-group">
                <label>Free Delivery Above (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={5000}
                  value={cms.freeDeliveryAbove}
                  onChange={(e) =>
                    setCms({ ...cms, freeDeliveryAbove: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Standard Delivery Fee (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={500}
                  value={cms.deliveryCharge}
                  onChange={(e) =>
                    setCms({ ...cms, deliveryCharge: Number(e.target.value) })
                  }
                  required
                />
              </div>
              <div className="form-group">
                <label>Min Order Amount to Checkout (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={2000}
                  value={cms.minOrderAmount}
                  onChange={(e) =>
                    setCms({ ...cms, minOrderAmount: Number(e.target.value) })
                  }
                />
              </div>
              <div className="form-group">
                <label>Packing / Handling Fee (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={200}
                  value={cms.handlingFee}
                  onChange={(e) =>
                    setCms({ ...cms, handlingFee: Number(e.target.value) })
                  }
                />
              </div>
              <div className="form-group">
                <label>Active Coupon Code</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ textTransform: 'uppercase' }}
                  value={cms.activeCouponCode}
                  onChange={(e) =>
                    setCms({ ...cms, activeCouponCode: e.target.value })
                  }
                />
              </div>
              <div className="form-group">
                <label>Coupon Discount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={1000}
                  value={cms.activeCouponDiscount}
                  onChange={(e) =>
                    setCms({
                      ...cms,
                      activeCouponDiscount: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Coupon Min Order (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={2000}
                  value={cms.couponMinOrder}
                  onChange={(e) =>
                    setCms({ ...cms, couponMinOrder: Number(e.target.value) })
                  }
                />
              </div>
              <div className="form-group">
                <label>Admin Receiving UPI ID</label>
                <input
                  type="text"
                  className="form-input"
                  value={cms.upiId}
                  onChange={(e) => setCms({ ...cms, upiId: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Referrer Bonus (₹ Wallet)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={500}
                  value={cms.referrerBonus}
                  onChange={(e) =>
                    setCms({ ...cms, referrerBonus: Number(e.target.value) })
                  }
                />
              </div>
              <div className="form-group">
                <label>New Friend Welcome Bonus (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  min={0}
                  max={500}
                  value={cms.refereeBonus}
                  onChange={(e) =>
                    setCms({ ...cms, refereeBonus: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <h4
              style={{
                color: '#0284c7',
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                marginBottom: '0.75rem',
              }}
            >
              4. Customer App Feature Toggles
            </h4>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '10px',
                marginBottom: '1.25rem',
              }}
            >
              <div className="toggle-row">
                <label htmlFor="cms-allow-cod">💵 Allow Cash on Delivery (COD)</label>
                <input
                  type="checkbox"
                  id="cms-allow-cod"
                  checked={cms.allowCod}
                  onChange={(e) => setCms({ ...cms, allowCod: e.target.checked })}
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cms-allow-upi">📱 Allow Instant UPI QR</label>
                <input
                  type="checkbox"
                  id="cms-allow-upi"
                  checked={cms.allowUpi}
                  onChange={(e) => setCms({ ...cms, allowUpi: e.target.checked })}
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cms-allow-coupons">🏷️ Show Promo Coupon Box</label>
                <input
                  type="checkbox"
                  id="cms-allow-coupons"
                  checked={cms.allowCoupons}
                  onChange={(e) =>
                    setCms({ ...cms, allowCoupons: e.target.checked })
                  }
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cms-allow-voice">🎤 Enable Voice Search Mic</label>
                <input
                  type="checkbox"
                  id="cms-allow-voice"
                  checked={cms.allowVoiceSearch}
                  onChange={(e) =>
                    setCms({ ...cms, allowVoiceSearch: e.target.checked })
                  }
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cms-allow-referral">
                  🎁 Enable Refer &amp; Earn Program
                </label>
                <input
                  type="checkbox"
                  id="cms-allow-referral"
                  checked={cms.allowReferrals}
                  onChange={(e) =>
                    setCms({ ...cms, allowReferrals: e.target.checked })
                  }
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cms-show-hero">🖼️ Show Hero Promo Banner</label>
                <input
                  type="checkbox"
                  id="cms-show-hero"
                  checked={cms.showHeroBanner}
                  onChange={(e) =>
                    setCms({ ...cms, showHeroBanner: e.target.checked })
                  }
                />
              </div>
              <div
                className="toggle-row"
                style={{ borderColor: 'rgba(239, 68, 68, 0.5)' }}
              >
                <label
                  htmlFor="cms-maintenance-mode"
                  style={{ color: '#b91c1c' }}
                >
                  🚧 Maintenance Mode (Pause Orders)
                </label>
                <input
                  type="checkbox"
                  id="cms-maintenance-mode"
                  checked={cms.maintenanceMode}
                  onChange={(e) =>
                    setCms({ ...cms, maintenanceMode: e.target.checked })
                  }
                />
              </div>
            </div>

            <h4 style={{ color: '#0284c7', fontSize: '0.85rem', textTransform: 'uppercase', margin: '1.25rem 0 0.75rem' }}>
              5. Advanced Customer Features, Limits &amp; Anti-Scam Controls
            </h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.8rem' }}>
              These controls publish to admin/settings and affect only the matching features implemented in the Customer App.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '9px', marginBottom: '1rem' }}>
              {([
                ['allowCardPayment', '💳 Card Payment'],
                ['allowWalletPayment', '👛 Wallet Payment'],
                ['allowCashback', '🎁 Cashback'],
                ['allowChutkiPlus', '👑 Chutki Plus Membership'],
                ['allowDeliveryQr', '🔐 Delivery PIN / QR'],
                ['allowFavoriteStores', '❤️ Favourite Stores'],
                ['allowRefundRequests', '↩️ Customer Refund Requests'],
                ['allowRiderTip', '🛵 Rider Tips'],
                ['allowScheduledDelivery', '🗓️ Scheduled Delivery'],
                ['allowStoreQuickAdd', '➕ Quick Add Store Items'],
                ['allowStoreRatings', '⭐ Store Ratings'],
                ['blockCodForFlaggedUsers', '🚫 Block COD for Flagged Users'],
                ['enforceStockLimits', '📦 Enforce Product Stock Limits'],
                ['prioritizeNearbyStores', '📍 Prioritize Nearby Stores'],
                ['showStockBadges', '🏷️ Show Stock Badges'],
                ['strictAntiScamShield', '🛡️ Strict Anti-Scam Shield'],
              ] as const).map(([key, label]) => (
                <label key={key} className="toggle-row" style={{ justifyContent: 'space-between' }}>
                  <span>{label}</span>
                  <input type="checkbox" checked={cms[key]} onChange={(e) => setCms({ ...cms, [key]: e.target.checked })} />
                </label>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '1.25rem' }}>
              {([
                ['cashbackPercent', 'Cashback Percentage (%)', 0, 100],
                ['codMaxOrderAmount', 'Maximum COD Order (₹)', 1, 100000],
                ['maxActiveOrdersPerUser', 'Max Active Orders / Customer', 1, 50],
                ['nearbyRadiusKm', 'Nearby Store Radius (KM)', 1, 100],
                ['plusPlanPrice', 'Chutki Plus Price (₹)', 0, 100000],
                ['plusValidityDays', 'Chutki Plus Validity (Days)', 1, 365],
                ['spamAutoBlockThreshold', 'Spam Auto-Block Threshold', 1, 20],
                ['actionCooldownMs', 'Anti-Spam Cooldown (ms)', 0, 300000],
              ] as const).map(([key, label, min, max]) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input type="number" className="form-input" min={min} max={max} value={cms[key]} onChange={(e) => setCms({ ...cms, [key]: Number(e.target.value) })} />
                </div>
              ))}
              <div className="form-group">
                <label>Scheduled Delivery Slots (comma separated)</label>
                <input className="form-input" value={cms.customDeliverySlots} onChange={(e) => setCms({ ...cms, customDeliverySlots: e.target.value })} placeholder="EXPRESS_15, STANDARD_60, 6PM-8PM" />
              </div>
              <div className="form-group">
                <label>Rider Tip Amounts ₹ (comma separated)</label>
                <input className="form-input" value={cms.riderTipOptions} onChange={(e) => setCms({ ...cms, riderTipOptions: e.target.value })} placeholder="10, 20, 30, 50" />
              </div>
            </div>

            <div className="form-group">
              <label>Maintenance Mode Message</label>
              <input
                type="text"
                className="form-input"
                value={cms.maintenanceMessage}
                onChange={(e) =>
                  setCms({ ...cms, maintenanceMessage: e.target.value })
                }
              />
            </div>

            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1.5px dashed var(--warning)',
                borderRadius: '14px',
                padding: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <label
                  style={{
                    color: 'var(--warning)',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    margin: 0,
                  }}
                >
                  <i className="fa-solid fa-bullhorn"></i> Live Emergency / Weather
                  Delay Notice (Top Ticker)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="cms-ticker-active"
                    checked={cms.announcementActive}
                    onChange={(e) =>
                      setCms({ ...cms, announcementActive: e.target.checked })
                    }
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: 'var(--warning)',
                    }}
                  />
                  <label
                    htmlFor="cms-ticker-active"
                    style={{
                      margin: 0,
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    Enable
                  </label>
                </div>
              </div>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 🌧️ Heavy rain in Gossaigaon town: delivery may take 5-10 extra mins!"
                value={cms.announcementText}
                onChange={(e) =>
                  setCms({ ...cms, announcementText: e.target.value })
                }
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ padding: '0.9rem 1.8rem', background: '#ec4899' }}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i> Save &amp; Publish
              Customer App Customizations
            </button>
          </form>
        </div>

        <div className="card" style={{ border: '1px solid #0284c7' }}>
          <div className="card-title">
            <span style={{ color: '#0284c7' }}>
              <i className="fa-solid fa-layer-group"></i> Customer App Categories
              Manager
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleResetCategories}
              >
                Reset Defaults
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => openCategoryModal(-1)}
              >
                + Add New Category
              </button>
            </div>
          </div>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Icon</th>
                  <th>ID</th>
                  <th>Category Name</th>
                  <th>Auto-Match Keywords</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, idx) => {
                  const isActive = cat.active !== false;
                  const kwPreview = Array.isArray(cat.keywords)
                    ? cat.keywords.slice(0, 6).join(', ')
                    : '';
                  return (
                    <tr key={`${cat.id}-${idx}`}>
                      <td style={{ fontSize: '1.5rem' }}>{cat.icon || '🛒'}</td>
                      <td>
                        <code>{cat.id}</code>
                      </td>
                      <td>
                        <strong>{cat.name}</strong>
                      </td>
                      <td>
                        <small style={{ color: 'var(--text-muted)' }}>
                          {kwPreview || 'Special filter'}
                        </small>
                      </td>
                      <td>
                        {isActive ? (
                          <span className="badge badge-success">Visible</span>
                        ) : (
                          <span className="badge badge-danger">Hidden</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => openCategoryModal(idx)}
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          {cat.id !== 'ALL' && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDeleteCategory(idx)}
                            >
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {catModalOpen && (
        <div
          className="modal-backdrop open"
          onClick={() => setCatModalOpen(false)}
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
              <h3 style={{ fontWeight: 900 }}>Add / Edit Customer Category</h3>
              <i
                className="fa-solid fa-xmark"
                onClick={() => setCatModalOpen(false)}
                style={{ fontSize: '1.25rem', cursor: 'pointer' }}
              ></i>
            </div>
            <form onSubmit={handleSaveCategory}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                }}
              >
                <div className="form-group">
                  <label>Category ID (No Spaces)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ textTransform: 'uppercase' }}
                    value={catForm.id}
                    disabled={catEditIndex >= 0 && catForm.id === 'ALL'}
                    onChange={(e) => setCatForm({ ...catForm, id: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Emoji Icon</label>
                  <input
                    type="text"
                    className="form-input"
                    value={catForm.icon}
                    onChange={(e) => setCatForm({ ...catForm, icon: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Auto-Match Keywords (Comma Separated)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={catForm.keywords}
                  onChange={(e) =>
                    setCatForm({ ...catForm, keywords: e.target.value })
                  }
                />
              </div>
              <div className="toggle-row">
                <label htmlFor="cat-active">Show Category in Customer App</label>
                <input
                  type="checkbox"
                  id="cat-active"
                  checked={catForm.active}
                  onChange={(e) =>
                    setCatForm({ ...catForm, active: e.target.checked })
                  }
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  Save Category
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCatModalOpen(false)}
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

export const ControlsPanel: React.FC<{
  activePanel: string;
  settings: AdminSettings;
  totalFleetCodCash?: number;
  isPayoutWithdrawalFrozen?: boolean;
  onAdminInterventionLiftFreeze?: () => void;
  onToast: (msg: string, type?: 'success' | 'danger' | 'info' | 'warning') => void;
}> = ({
  activePanel,
  settings,
  totalFleetCodCash = 0,
  isPayoutWithdrawalFrozen = false,
  onAdminInterventionLiftFreeze,
  onToast,
}) => {
  const [ctrl, setCtrl] = useState({
    minCustomerDeposit: 50,
    maxCustomerDeposit: 5000,
    minCustomerWithdraw: 50,
    maxCustomerWithdraw: 5000,
    minRiderPayout: 10,
    maxRiderPayout: 10000,
    minRiderCodDeposit: 10,
    maxRiderCodDeposit: 25000,
    minStorePayout: 10,
    maxStorePayout: 50000,
    commissionPercent: 5,
    storeAnnouncement: '',
    allowStoreProductEdit: true,
    allowStoreQuickSeed: true,
    riderBaseFee: 25,
    maxRiderCashLimit: 3000,
    riderAcceptTimeoutSec: 45,
    riderAnnouncement: '',
    allowRiderPassTrip: true,
    allowRiderSos: true,
    supportPhone: '',
    supportWhatsapp: '',
    supportEmail: '',
    supportHours: '7:00 AM - 10:00 PM Daily',
    autoPausePayoutsOnFleetCodRisk: false,
    fleetCodRiskThreshold: 15000,
  });

  useEffect(() => {
    setCtrl({
      minCustomerDeposit:
        settings.minCustomerDeposit !== undefined
          ? settings.minCustomerDeposit
          : 50,
      maxCustomerDeposit:
        settings.maxCustomerDeposit !== undefined
          ? settings.maxCustomerDeposit
          : 5000,
      minCustomerWithdraw:
        settings.minCustomerWithdraw !== undefined
          ? settings.minCustomerWithdraw
          : 50,
      maxCustomerWithdraw:
        settings.maxCustomerWithdraw !== undefined
          ? settings.maxCustomerWithdraw
          : 5000,
      minRiderPayout:
        settings.minRiderPayout !== undefined ? settings.minRiderPayout : 10,
      maxRiderPayout:
        settings.maxRiderPayout !== undefined ? settings.maxRiderPayout : 10000,
      minRiderCodDeposit:
        settings.minRiderCodDeposit !== undefined
          ? settings.minRiderCodDeposit
          : 10,
      maxRiderCodDeposit:
        settings.maxRiderCodDeposit !== undefined
          ? settings.maxRiderCodDeposit
          : 25000,
      minStorePayout:
        settings.minStorePayout !== undefined ? settings.minStorePayout : 10,
      maxStorePayout:
        settings.maxStorePayout !== undefined ? settings.maxStorePayout : 50000,
      commissionPercent:
        settings.commissionPercent !== undefined ? settings.commissionPercent : 5,
      storeAnnouncement: settings.storeAnnouncement || '',
      allowStoreProductEdit: settings.allowStoreProductEdit !== false,
      allowStoreQuickSeed: settings.allowStoreQuickSeed !== false,
      riderBaseFee:
        settings.riderBaseFee !== undefined
          ? settings.riderBaseFee
          : settings.deliveryCharge !== undefined
            ? settings.deliveryCharge
            : 25,
      maxRiderCashLimit:
        settings.maxRiderCashLimit !== undefined
          ? settings.maxRiderCashLimit
          : 3000,
      riderAcceptTimeoutSec:
        settings.riderAcceptTimeoutSec !== undefined
          ? settings.riderAcceptTimeoutSec
          : 45,
      riderAnnouncement: settings.riderAnnouncement || '',
      allowRiderPassTrip: settings.allowRiderPassTrip !== false,
      allowRiderSos: settings.allowRiderSos !== false,
      supportPhone: settings.supportPhone || '',
      supportWhatsapp: settings.supportWhatsapp || '',
      supportEmail: settings.supportEmail || '',
      supportHours: settings.supportHours || '7:00 AM - 10:00 PM Daily',
      autoPausePayoutsOnFleetCodRisk:
        settings.autoPausePayoutsOnFleetCodRisk === true,
      fleetCodRiskThreshold:
        settings.fleetCodRiskThreshold !== undefined
          ? settings.fleetCodRiskThreshold
          : 15000,
    });
  }, [settings]);

  const handleSaveControls = (e: React.FormEvent) => {
    e.preventDefault();
    const thresholdNum = Math.max(500, Number(ctrl.fleetCodRiskThreshold || 15000));
    const payload: AdminSettings = {
      minCustomerDeposit: Number(ctrl.minCustomerDeposit || 50),
      maxCustomerDeposit: Number(ctrl.maxCustomerDeposit || 5000),
      minCustomerWithdraw: Number(ctrl.minCustomerWithdraw || 50),
      maxCustomerWithdraw: Number(ctrl.maxCustomerWithdraw || 5000),
      minRiderPayout: Number(ctrl.minRiderPayout || 10),
      maxRiderPayout: Number(ctrl.maxRiderPayout || 10000),
      minRiderCodDeposit: Number(ctrl.minRiderCodDeposit || 10),
      maxRiderCodDeposit: Number(ctrl.maxRiderCodDeposit || 25000),
      minStorePayout: Number(ctrl.minStorePayout || 10),
      maxStorePayout: Number(ctrl.maxStorePayout || 50000),
      commissionPercent: Number(ctrl.commissionPercent || 5),
      storeAnnouncement: sanitizeText(ctrl.storeAnnouncement.trim()),
      allowStoreProductEdit: ctrl.allowStoreProductEdit,
      allowStoreQuickSeed: ctrl.allowStoreQuickSeed,
      riderBaseFee: Number(ctrl.riderBaseFee || 25),
      maxRiderCashLimit: Number(ctrl.maxRiderCashLimit || 3000),
      riderAcceptTimeoutSec: Number(ctrl.riderAcceptTimeoutSec || 45),
      riderAnnouncement: sanitizeText(ctrl.riderAnnouncement.trim()),
      allowRiderPassTrip: ctrl.allowRiderPassTrip,
      allowRiderSos: ctrl.allowRiderSos,
      supportPhone: ctrl.supportPhone.trim(),
      supportWhatsapp: ctrl.supportWhatsapp.trim(),
      supportEmail: ctrl.supportEmail.trim(),
      supportHours: sanitizeText(ctrl.supportHours.trim()),
      autoPausePayoutsOnFleetCodRisk: ctrl.autoPausePayoutsOnFleetCodRisk,
      fleetCodRiskThreshold: thresholdNum,
      ...(ctrl.autoPausePayoutsOnFleetCodRisk
        ? {}
        : { fleetCodPayoutFreezeActive: false }),
      updatedAt: Date.now(),
    };
    db.ref('admin/settings')
      .update(payload)
      .then(() =>
        onToast('🎛️ All Limits & Panel Controls synced live!', 'success')
      );
  };

  return (
    <section
      id="panel-controls"
      className={`panel-section ${activePanel === 'controls' ? 'active' : ''}`}
    >
      <form id="all-panel-controls-form" onSubmit={handleSaveControls}>
        <div className="card" style={{ border: '1.5px solid #d97706' }}>
          <div className="card-title">
            <span style={{ color: '#b45309' }}>
              <i className="fa-solid fa-coins"></i> Master Deposit &amp; Withdraw
              Money Limits (All Panels)
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '12px',
            }}
          >
            <div className="form-group">
              <label>Customer Min Deposit (₹)</label>
              <input
                type="number"
                className="form-input"
                min={1}
                value={ctrl.minCustomerDeposit}
                onChange={(e) =>
                  setCtrl({ ...ctrl, minCustomerDeposit: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Customer Max Deposit (₹)</label>
              <input
                type="number"
                className="form-input"
                min={10}
                value={ctrl.maxCustomerDeposit}
                onChange={(e) =>
                  setCtrl({ ...ctrl, maxCustomerDeposit: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Customer Min Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={1}
                value={ctrl.minCustomerWithdraw}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    minCustomerWithdraw: Number(e.target.value),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Customer Max Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={10}
                value={ctrl.maxCustomerWithdraw}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    maxCustomerWithdraw: Number(e.target.value),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Rider Min Earnings Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={1}
                value={ctrl.minRiderPayout}
                onChange={(e) =>
                  setCtrl({ ...ctrl, minRiderPayout: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Rider Max Earnings Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={10}
                value={ctrl.maxRiderPayout}
                onChange={(e) =>
                  setCtrl({ ...ctrl, maxRiderPayout: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Rider Min COD Deposit (₹)</label>
              <input
                type="number"
                className="form-input"
                min={1}
                value={ctrl.minRiderCodDeposit}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    minRiderCodDeposit: Number(e.target.value),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Rider Max COD Deposit (₹)</label>
              <input
                type="number"
                className="form-input"
                min={10}
                value={ctrl.maxRiderCodDeposit}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    maxRiderCodDeposit: Number(e.target.value),
                  })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Store Min Payout Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={ctrl.minStorePayout}
                onChange={(e) =>
                  setCtrl({ ...ctrl, minStorePayout: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Store Max Payout Withdraw (₹)</label>
              <input
                type="number"
                className="form-input"
                min={10}
                value={ctrl.maxStorePayout}
                onChange={(e) =>
                  setCtrl({ ...ctrl, maxStorePayout: Number(e.target.value) })
                }
                required
              />
            </div>
          </div>
        </div>

        <div
          className="card"
          style={{
            border: isPayoutWithdrawalFrozen
              ? '1.5px solid #ef4444'
              : '1.5px solid #f59e0b',
          }}
        >
          <div className="card-title">
            <span
              style={{
                color: isPayoutWithdrawalFrozen ? '#dc2626' : '#b45309',
              }}
            >
              <i className="fa-solid fa-shield-halved"></i> Financial Risk Radar
              Circuit Breaker (Payout &amp; Withdrawal Guard)
            </span>
            {isPayoutWithdrawalFrozen ? (
              <span className="badge badge-danger">
                🚨 PAYOUTS FROZEN — ADMIN INTERVENTION REQUIRED
              </span>
            ) : ctrl.autoPausePayoutsOnFleetCodRisk ? (
              <span className="badge badge-success">🛡️ Guard Armed</span>
            ) : (
              <span className="badge badge-muted">Guard Disabled</span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '12px',
              alignItems: 'center',
              marginBottom: '0.85rem',
            }}
          >
            <div
              className="toggle-row"
              style={{
                marginBottom: 0,
                borderColor: ctrl.autoPausePayoutsOnFleetCodRisk
                  ? 'rgba(245, 158, 11, 0.55)'
                  : undefined,
              }}
            >
              <label htmlFor="ctrl-fleet-cod-pause">
                🚨 Auto-Disable All Payout &amp; Withdrawal Approvals if Fleet COD
                Cash Exceeds Threshold
              </label>
              <input
                type="checkbox"
                id="ctrl-fleet-cod-pause"
                checked={ctrl.autoPausePayoutsOnFleetCodRisk}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    autoPausePayoutsOnFleetCodRisk: e.target.checked,
                  })
                }
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="ctrl-fleet-cod-threshold">
                Max Total Fleet COD Cash-in-Hand Threshold (₹)
              </label>
              <input
                id="ctrl-fleet-cod-threshold"
                type="number"
                className="form-input"
                min={500}
                step={500}
                value={ctrl.fleetCodRiskThreshold}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    fleetCodRiskThreshold: Number(e.target.value),
                  })
                }
                required
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              padding: '0.75rem 0.95rem',
              borderRadius: '10px',
              background: isPayoutWithdrawalFrozen
                ? '#fef2f2'
                : '#f8fafc',
              border: `1px solid ${
                isPayoutWithdrawalFrozen
                  ? '#fca5a5'
                  : 'var(--border)'
              }`,
              fontSize: '0.8rem',
            }}
          >
            <div style={{ fontVariantNumeric: 'tabular-nums' }}>
              Current Fleet COD Cash-in-Hand:{' '}
              <strong
                style={{
                  color:
                    totalFleetCodCash >
                    Math.max(500, Number(ctrl.fleetCodRiskThreshold || 15000))
                      ? '#dc2626'
                      : '#059669',
                }}
              >
                ₹{totalFleetCodCash.toFixed(0)}
              </strong>{' '}
              / Threshold:{' '}
              <strong>
                ₹{Math.max(500, Number(ctrl.fleetCodRiskThreshold || 15000))}
              </strong>
              <div
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                {isPayoutWithdrawalFrozen
                  ? 'All Rider Payouts, Store Payouts, and Customer Wallet Withdrawals are automatically locked until an administrator lifts the freeze.'
                  : 'When enabled, exceeding this total fleet COD cash balance locks all Payout & Withdrawal approvals until manual admin intervention.'}
              </div>
            </div>

            {isPayoutWithdrawalFrozen && onAdminInterventionLiftFreeze && (
              <button
                type="button"
                className="btn btn-warning btn-sm"
                onClick={onAdminInterventionLiftFreeze}
              >
                <i className="fa-solid fa-gavel"></i> Admin Intervention: Lift
                Payout Freeze
              </button>
            )}
          </div>
        </div>

        <div className="card" style={{ border: '1.5px solid #9333ea' }}>
          <div className="card-title">
            <span style={{ color: '#7e22ce' }}>
              <i className="fa-solid fa-store"></i> Store Partner Panel Controls
              (resturant.html)
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginBottom: '1rem',
            }}
          >
            <div className="form-group">
              <label>Platform Commission Fee (%)</label>
              <input
                type="number"
                className="form-input"
                min={0}
                max={50}
                step={0.5}
                value={ctrl.commissionPercent}
                onChange={(e) =>
                  setCtrl({ ...ctrl, commissionPercent: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Store Broadcast Notice (Top Banner)</label>
              <input
                type="text"
                className="form-input"
                value={ctrl.storeAnnouncement}
                onChange={(e) =>
                  setCtrl({ ...ctrl, storeAnnouncement: e.target.value })
                }
              />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '10px',
            }}
          >
            <div className="toggle-row">
              <label htmlFor="ctrl-store-allow-edit">
                🛒 Allow Stores to Add/Edit Products
              </label>
              <input
                type="checkbox"
                id="ctrl-store-allow-edit"
                checked={ctrl.allowStoreProductEdit}
                onChange={(e) =>
                  setCtrl({ ...ctrl, allowStoreProductEdit: e.target.checked })
                }
              />
            </div>
            <div className="toggle-row">
              <label htmlFor="ctrl-store-allow-seed">
                ✨ Show &quot;+6 Popular Items&quot; Quick Seed
              </label>
              <input
                type="checkbox"
                id="ctrl-store-allow-seed"
                checked={ctrl.allowStoreQuickSeed}
                onChange={(e) =>
                  setCtrl({ ...ctrl, allowStoreQuickSeed: e.target.checked })
                }
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ border: '1.5px solid #0284c7' }}>
          <div className="card-title">
            <span style={{ color: '#0284c7' }}>
              <i className="fa-solid fa-motorcycle"></i> Delivery Rider Terminal
              Controls (deliver.html)
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              marginBottom: '1rem',
            }}
          >
            <div className="form-group">
              <label>Rider Earning Per Order/Stop (₹)</label>
              <input
                type="number"
                className="form-input"
                min={5}
                max={500}
                value={ctrl.riderBaseFee}
                onChange={(e) =>
                  setCtrl({ ...ctrl, riderBaseFee: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Rider Max COD Cash Limit (₹)</label>
              <input
                type="number"
                className="form-input"
                min={500}
                max={50000}
                value={ctrl.maxRiderCashLimit}
                onChange={(e) =>
                  setCtrl({ ...ctrl, maxRiderCashLimit: Number(e.target.value) })
                }
                required
              />
            </div>
            <div className="form-group">
              <label>Auto-Pass Accept Countdown (Seconds)</label>
              <input
                type="number"
                className="form-input"
                min={15}
                max={300}
                value={ctrl.riderAcceptTimeoutSec}
                onChange={(e) =>
                  setCtrl({
                    ...ctrl,
                    riderAcceptTimeoutSec: Number(e.target.value),
                  })
                }
                required
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Rider Broadcast Notice (Top Banner)</label>
              <input
                type="text"
                className="form-input"
                value={ctrl.riderAnnouncement}
                onChange={(e) =>
                  setCtrl({ ...ctrl, riderAnnouncement: e.target.value })
                }
              />
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '10px',
            }}
          >
            <div className="toggle-row">
              <label htmlFor="ctrl-rider-allow-pass">
                🔄 Allow Riders to Pass/Reject Trips
              </label>
              <input
                type="checkbox"
                id="ctrl-rider-allow-pass"
                checked={ctrl.allowRiderPassTrip}
                onChange={(e) =>
                  setCtrl({ ...ctrl, allowRiderPassTrip: e.target.checked })
                }
              />
            </div>
            <div className="toggle-row">
              <label htmlFor="ctrl-rider-allow-sos">
                ⚠️ Enable Rider Road Issue / SOS Button
              </label>
              <input
                type="checkbox"
                id="ctrl-rider-allow-sos"
                checked={ctrl.allowRiderSos}
                onChange={(e) =>
                  setCtrl({ ...ctrl, allowRiderSos: e.target.checked })
                }
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ border: '1.5px solid var(--primary)' }}>
          <div className="card-title">
            <span style={{ color: 'var(--primary)' }}>
              <i className="fa-solid fa-headset"></i> Global Helpline &amp; Hub
              Contact (All Panels)
            </span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '12px',
              marginBottom: '1.25rem',
            }}
          >
            <div className="form-group">
              <label>Helpline Phone Number</label>
              <input
                type="tel"
                className="form-input"
                maxLength={10}
                value={ctrl.supportPhone}
                onChange={(e) => setCtrl({ ...ctrl, supportPhone: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Helpline WhatsApp Number</label>
              <input
                type="tel"
                className="form-input"
                maxLength={10}
                value={ctrl.supportWhatsapp}
                onChange={(e) =>
                  setCtrl({ ...ctrl, supportWhatsapp: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label>Helpline Email</label>
              <input
                type="email"
                className="form-input"
                value={ctrl.supportEmail}
                onChange={(e) => setCtrl({ ...ctrl, supportEmail: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Helpline Hours</label>
              <input
                type="text"
                className="form-input"
                value={ctrl.supportHours}
                onChange={(e) => setCtrl({ ...ctrl, supportHours: e.target.value })}
              />
            </div>
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ padding: '0.9rem 1.8rem' }}
          >
            <i className="fa-solid fa-floppy-disk"></i> Save &amp; Apply All
            Limits &amp; Controls Live
          </button>
        </div>
      </form>
    </section>
  );
};
