export type AdminPanelId =
  | 'dashboard'
  | 'product-approvals'
  | 'cms'
  | 'controls'
  | 'orders'
  | 'upi'
  | 'wallet-requests'
  | 'rider-payouts'
  | 'settlements'
  | 'store-payouts'
  | 'stores'
  | 'delivery'
  | 'customers'
  | 'service-areas'
  | 'feedbacks'
  | 'reports'
  | 'security';

export interface OrderItem {
  name: string;
  price: number;
  qty: number;
}

export interface OrderRecord {
  restaurantId?: string;
  customerUid?: string;
  deliveryUid?: string;
  phone?: string;
  address?: string;
  customerLat?: number;
  customerLng?: number;
  locationLink?: string;
  riderLat?: number | null;
  riderLng?: number | null;
  items?: OrderItem[] | Record<string, OrderItem>;
  subtotalAmount?: number;
  deliveryCharge?: number;
  totalAmount?: number;
  deliveryOtp?: string;
  pickupOtp?: string;
  paymentMode?: string;
  paymentStatus?: string;
  transactionId?: string;
  paymentScreenshot?: string;
  status?: string;
  cancelledBy?: string;
  cancelReason?: string;
  isSpamSuspect?: boolean;
  spamReason?: string;
  emergencyAlert?: boolean;
  assignedAt?: number;
  riderAccepted?: boolean | null;
  rejectedByRiders?: Record<string, { riderName?: string; reason?: string }>;
  createdAt?: number;
  updatedAt?: number;
  billPrinted?: boolean;
  billPrintedAt?: number;
  orderNotes?: string;
  orderNotesUpdatedAt?: number;
  orderNotesUpdatedBy?: string;
}

export interface StoreRecord {
  name?: string;
  email?: string;
  phone?: string;
  cuisine?: string;
  upiId?: string;
  hours?: string;
  imageUrl?: string;
  lat?: number;
  lng?: number;
  locationLink?: string;
  address?: string;
  adminNote?: string;
  approved?: boolean;
  isOpen?: boolean;
  suspended?: boolean;
}

export interface MenuItemRecord {
  name: string;
  price: number;
  mrp?: number;
  discountPercent?: number;
  isOnSale?: boolean;
  category?: string;
  searchKeywords?: string;
  description?: string;
  imageUrl?: string;
  available?: boolean;
  stockQty?: number;
  stock?: number;
  quantity?: number;
  lowStockThreshold?: number;
  adminApproved?: boolean;
  approvalStatus?: string;
  rejectionReason?: string;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  updatedAt?: number;
  ratingAvg?: number;
  ratingCount?: number;
}

export interface DeliveryPartnerRecord {
  name?: string;
  email?: string;
  phone?: string;
  vehicle?: string;
  upiId?: string;
  adminNote?: string;
  approved?: boolean;
  online?: boolean;
  suspended?: boolean;
  lat?: number;
  lng?: number;
  lastLocationUpdate?: number;
  lastSeen?: number;
  recentRoute?: Array<{ lat: number; lng: number }>;
  ratingAvg?: number;
  ratingCount?: number;
  codLimitBreaches?: number;
  lastCodBreachAt?: number;
  codReviewFlagged?: boolean;
  codAssignmentRestricted?: boolean;
  codRestrictionReason?: string;
  codSettlementVerifiedAt?: number;
  codAutoClearedAt?: number;
}

export interface CustomerRecord {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  adminNote?: string;
  walletBalance?: number;
  referralCode?: string;
  blocked?: boolean;
  lat?: number;
  lng?: number;
  locationLink?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface SettlementRecord {
  riderUid?: string;
  riderName?: string;
  amount?: number;
  mode?: string;
  utr?: string;
  status?: string;
  createdAt?: number;
  verifiedAt?: number;
  verifiedBy?: string;
}

export interface StorePayoutRecord {
  storeId?: string;
  storeName?: string;
  storePhone?: string;
  storeUpiId?: string;
  amount?: number;
  status?: string;
  adminRef?: string;
  mode?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface RiderPayoutRecord {
  riderUid?: string;
  riderName?: string;
  riderPhone?: string;
  riderUpiId?: string;
  amount?: number;
  status?: string;
  adminRef?: string;
  mode?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface WalletRequestRecord {
  customerUid?: string;
  customerName?: string;
  customerPhone?: string;
  type?: 'DEPOSIT' | 'WITHDRAW';
  amount?: number;
  utr?: string;
  upiId?: string;
  screenshot?: string;
  status?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface FeedbackRecord {
  role?: string;
  name?: string;
  phone?: string;
  subject?: string;
  rating?: number;
  message?: string;
  adminReply?: string;
  status?: string;
  createdAt?: number;
  resolvedAt?: number;
}

export interface CategoryConfig {
  id: string;
  name: string;
  icon: string;
  keywords: string[];
  active: boolean;
}

export interface AdminSettings {
  appBrandName?: string;
  expressEtaText?: string;
  expressLocalBadge?: string;
  searchPlaceholder?: string;
  themePrimaryColor?: string;
  themeAccentColor?: string;
  themeBgColor?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroTag?: string;
  heroEmoji?: string;
  extraBannerText?: string;
  customBannerImageUrl?: string;
  freeDeliveryAbove?: number;
  deliveryCharge?: number;
  minOrderAmount?: number;
  handlingFee?: number;
  activeCouponCode?: string;
  activeCouponDiscount?: number;
  couponMinOrder?: number;
  upiId?: string;
  referrerBonus?: number;
  refereeBonus?: number;
  allowCod?: boolean;
  allowUpi?: boolean;
  allowCoupons?: boolean;
  allowVoiceSearch?: boolean;
  allowReferrals?: boolean;
  showHeroBanner?: boolean;
  maintenanceMode?: boolean;
  maintenanceMessage?: string;
  announcementActive?: boolean;
  announcementText?: string;
  customCategories?: CategoryConfig[];
  minCustomerDeposit?: number;
  maxCustomerDeposit?: number;
  minCustomerWithdraw?: number;
  maxCustomerWithdraw?: number;
  minRiderPayout?: number;
  maxRiderPayout?: number;
  minRiderCodDeposit?: number;
  maxRiderCodDeposit?: number;
  minStorePayout?: number;
  maxStorePayout?: number;
  commissionPercent?: number;
  storeAnnouncement?: string;
  allowStoreProductEdit?: boolean;
  allowStoreQuickSeed?: boolean;
  riderBaseFee?: number;
  maxRiderCashLimit?: number;
  riderAcceptTimeoutSec?: number;
  riderAnnouncement?: string;
  allowRiderPassTrip?: boolean;
  allowRiderSos?: boolean;
  supportPhone?: string;
  supportWhatsapp?: string;
  supportEmail?: string;
  supportHours?: string;
  autoPausePayoutsOnFleetCodRisk?: boolean;
  fleetCodRiskThreshold?: number;
  fleetCodPayoutFreezeActive?: boolean;
  fleetCodFreezeTriggeredAt?: number;
  fleetCodFreezeTriggeredAmount?: number;
  fleetCodFreezeIntervenedAt?: number;
  fleetCodFreezeResolvedBy?: string;
  // Customer app feature and anti-abuse controls
  allowCardPayment?: boolean;
  allowWalletPayment?: boolean;
  allowCashback?: boolean;
  allowChutkiPlus?: boolean;
  allowDeliveryQr?: boolean;
  allowFavoriteStores?: boolean;
  allowRefundRequests?: boolean;
  allowRiderTip?: boolean;
  allowScheduledDelivery?: boolean;
  allowStoreQuickAdd?: boolean;
  allowStoreRatings?: boolean;
  blockCodForFlaggedUsers?: boolean;
  enforceStockLimits?: boolean;
  prioritizeNearbyStores?: boolean;
  showStockBadges?: boolean;
  strictAntiScamShield?: boolean;
  cashbackPercent?: number;
  codMaxOrderAmount?: number;
  maxActiveOrdersPerUser?: number;
  nearbyRadiusKm?: number;
  plusPlanPrice?: number;
  plusValidityDays?: number;
  spamAutoBlockThreshold?: number;
  actionCooldownMs?: number;
  customDeliverySlots?: string[];
  riderTipOptions?: number[];
  updatedAt?: number;
}

export interface SecurityConfig {
  autoLockEnabled?: boolean;
  autoLockMinutes?: number;
  pinHash?: string;
  pinSalt?: string;
  blockDuplicateUtr?: boolean;
  requireStrict12DigitUtr?: boolean;
  maxLoginAttempts?: number;
  updatedAt?: number;
  updatedBy?: string;
}

export type SecurityEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export type SecurityEventType =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOCKOUT_TRIGGERED'
  | 'SESSION_LOCKED'
  | 'SESSION_UNLOCKED'
  | 'PIN_FAILED'
  | 'PIN_UPDATED'
  | 'UTR_FRAUD_REJECTED'
  | 'ACCOUNT_FROZEN'
  | 'POLICY_UPDATED'
  | 'THREAT_DISMISSED'
  | 'COD_LIMIT_FLAGGED'
  | 'COD_ASSIGNMENT_RESTRICTED'
  | 'COD_SETTLEMENT_VERIFIED'
  | 'FLEET_COD_RISK_FREEZE'
  | 'FLEET_COD_FREEZE_LIFTED';

export interface SecurityAuditLogRecord {
  eventType: SecurityEventType;
  actorEmail?: string;
  targetId?: string;
  details: string;
  severity: SecurityEventSeverity;
  createdAt: number;
}

export interface ServiceAreaZone {
  id: string;
  name: string;
  areaCode: string;
  pinCodes: string[];
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  enabled: boolean;
  deliveryCharge: number;
  freeDeliveryAbove: number;
  minOrderAmount: number;
  etaText: string;
  allowCod: boolean;
  allowUpi: boolean;
  priority: 'EXPRESS' | 'STANDARD' | 'EXTENDED';
  pauseReason?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface ServiceAreaConfig {
  restrictOrdersToSelectedAreas?: boolean;
  outsideAreaMessage?: string;
  defaultFallbackCharge?: number;
  updatedAt?: number;
  updatedBy?: string;
}

export interface SmartAutoSettleConfig {
  enabled?: boolean;
  mode?: 'FLAG_ONLY' | 'RESTRICT_ASSIGNMENTS';
  breachThresholdCount?: number;
  triggerAtPercent?: number;
  autoClearOnSettlementVerify?: boolean;
  updatedAt?: number;
  updatedBy?: string;
}

export type ReportFrequency = 'DAILY' | 'WEEKLY';
export type ReportWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ScheduledReportConfig {
  enabled?: boolean;
  frequency?: ReportFrequency;
  weekday?: ReportWeekday;
  timeOfDay?: string;
  sendViaEmail?: boolean;
  emailRecipients?: string;
  sendViaWhatsapp?: boolean;
  whatsappNumber?: string;
  includeFinancials?: boolean;
  includeTopStores?: boolean;
  includeRiderCash?: boolean;
  autoDownloadPdf?: boolean;
  webhookUrl?: string;
  nextRunAt?: number;
  lastRunAt?: number;
  lastRunStatus?: string;
  updatedAt?: number;
  updatedBy?: string;
}

export interface ReportDispatchLogRecord {
  frequency: ReportFrequency;
  periodLabel: string;
  filename: string;
  channels: string[];
  recipientsSummary: string;
  totalOrders: number;
  deliveredOrders: number;
  grossRevenue: number;
  adminCommission: number;
  status: 'READY_TO_SEND' | 'DOWNLOADED' | 'WEBHOOK_SENT' | 'WEBHOOK_FAILED';
  triggerSource: 'SCHEDULED' | 'MANUAL';
  createdAt: number;
  createdBy?: string;
  note?: string;
}

export interface AdminState {
  orders: Record<string, OrderRecord>;
  restaurants: Record<string, StoreRecord>;
  menus: Record<string, Record<string, MenuItemRecord>>;
  deliveryPartners: Record<string, DeliveryPartnerRecord>;
  customers: Record<string, CustomerRecord>;
  settlements: Record<string, SettlementRecord>;
  storePayouts: Record<string, StorePayoutRecord>;
  riderPayouts: Record<string, RiderPayoutRecord>;
  walletRequests: Record<string, WalletRequestRecord>;
  feedbacks: Record<string, FeedbackRecord>;
  settings: AdminSettings;
  securityConfig: SecurityConfig;
  securityLogs: Record<string, SecurityAuditLogRecord>;
  dismissedThreatKeys: Record<string, boolean>;
  serviceAreas: Record<string, ServiceAreaZone>;
  serviceAreaConfig: ServiceAreaConfig;
  smartAutoSettleConfig: SmartAutoSettleConfig;
  scheduledReportConfig: ScheduledReportConfig;
  reportDispatchLogs: Record<string, ReportDispatchLogRecord>;
}

export const DEFAULT_CATEGORIES: CategoryConfig[] = [
  { id: 'ALL', name: 'All Items', icon: '🛒', keywords: [], active: true },
  { id: 'ALL_STORES', name: 'All Store', icon: '🏪', keywords: [], active: true },
  { id: 'ON_SALE', name: 'Sale & Offers', icon: '🔥', keywords: [], active: true },
  { id: 'FAVORITES', name: 'Favorites', icon: '❤️', keywords: [], active: true },
  { id: 'VEG', name: 'Vegetables & Fruits', icon: '🥬', keywords: ['potato', 'aloo', 'onion', 'pyaz', 'tomato', 'tamatar', 'chilli', 'mirchi', 'ginger', 'adrak', 'garlic', 'lahsun', 'lemon', 'fruit', 'apple', 'banana', 'mango', 'veg', 'sabzi', 'gobi', 'carrot', 'cucumber', 'kheera', 'palak', 'methi', 'coriander', 'dhaniya'], active: true },
  { id: 'DAIRY', name: 'Milk & Dairy', icon: '🥛', keywords: ['milk', 'doodh', 'amul', 'dahi', 'curd', 'paneer', 'butter', 'cheese', 'ghee', 'chaas', 'lassi', 'cream', 'egg', 'bread', 'toast'], active: true },
  { id: 'STAPLES', name: 'Atta, Rice & Dal', icon: '🌾', keywords: ['atta', 'aashirvaad', 'chakki', 'wheat', 'rice', 'chawal', 'basmati', 'dal', 'moong', 'masoor', 'toor', 'chana', 'rajma', 'besan', 'maida', 'sooji', 'poha', 'sugar', 'cheeni', 'salt', 'namak'], active: true },
  { id: 'OIL_MASALA', name: 'Oil & Spices', icon: '🌻', keywords: ['oil', 'mustard', 'fortune', 'refined', 'kachi ghani', 'tel', 'masala', 'haldi', 'turmeric', 'mirch', 'jeera', 'dhaniya', 'garam masala', 'hing', 'methi'], active: true },
  { id: 'SNACKS', name: 'Snacks & Drinks', icon: '🍪', keywords: ['biscuit', 'cookie', 'chips', 'kurkure', 'lays', 'namkeen', 'bhujia', 'maggi', 'noodle', 'pasta', 'tea', 'chai', 'coffee', 'juice', 'coke', 'pepsi', 'cold drink', 'frooti', 'chocolate', 'snack'], active: true },
  { id: 'CLEANING', name: 'Cleaning & Care', icon: '🧼', keywords: ['soap', 'surf', 'detergent', 'shampoo', 'paste', 'colgate', 'brush', 'harpic', 'vim', 'rin', 'ariel', 'tide', 'cleaner', 'wash', 'handwash', 'agarbatti', 'dettol'], active: true },
];
