# Chutki Customer App ↔ Admin Control Coverage

This Admin build adds the missing customer-facing feature controls to **Customer App Customizer (CMS)**. The Customer App source was audited for all `settings.*` reads: 67 distinct setting keys were found, and all 67 now have an Admin-side management path (CMS or the existing Limits & Panel Controls panel).

## Existing Admin sections retained

- Dashboard / operational overview
- Product approvals and low-stock review
- Customer App Customizer (brand, theme, hero/banner, coupon, delivery fees, announcements, feature switches, categories)
- Limits & Panel Controls (customer wallet limits, rider/store payout limits, commission, support contacts, store/rider controls)
- Orders and dispatch
- UPI verification
- Customer wallet requests
- Rider payouts and COD settlements
- Store payouts
- Stores and catalog management
- Delivery fleet / rider management
- Customers / block controls
- Service areas and zone delivery policy
- Feedback / helpline
- Reports
- Security center

## Added controls in Customer App Customizer

### Payment and checkout
- Card payment, wallet payment, COD, UPI and coupon availability
- Maximum COD order value
- Minimum order value, delivery fee, free-delivery threshold and handling fee
- Scheduled delivery enablement and custom delivery slot labels
- Rider tip enablement and suggested tip amounts

### Customer features
- Cashback enablement and percentage
- Chutki Plus enablement, plan price and validity
- Delivery PIN / QR visibility
- Favourite stores
- Refund requests
- Store ratings
- Store quick-add
- Voice search
- Referral programme and referral bonuses

### Catalog and discovery
- Stock-limit enforcement
- Stock badges
- Nearby-store radius
- Prioritize nearby stores
- Editable customer categories and category keywords

### Risk and operations
- Strict anti-scam shield
- Block COD for flagged users
- Maximum active orders per customer
- Spam auto-block threshold
- Customer action cooldown
- Maintenance mode and customer-facing notice
- Emergency / weather announcement ticker

## Firebase path

All newly added settings are published using `update()` to the existing path:

`admin/settings`

The Customer App already reads these setting keys from Firebase. Existing keys are preserved because the Admin saves with a partial update rather than replacing the whole settings node.

## Important limits and production cautions

1. These are Admin UI controls for features already implemented in the supplied Customer App. They do not create new payment providers, delivery-slot capacity management, a subscription billing system, or backend fraud enforcement.
2. The customer app's anti-scam, COD, stock, cashback, and payment restrictions are client-side checks. A modified client can bypass client-side logic. Critical money, stock, order-state, OTP, and fraud decisions need trusted server-side enforcement or carefully validated database rules.
3. The supplied `database.rules.json` currently grants `.read: true` on the entire `/admin` node. That can expose private admin settings and security audit/config data (including PIN hash/salt fields) to unauthenticated readers. Do not deploy those rules unchanged. A safer design is to keep private admin data admin-only and publish a separate, deliberately limited `/publicSettings` node for customer-readable settings, with the Customer App updated to read that public node.
4. A full production build was not run in this environment because the ZIP does not include installed npm dependencies. TypeScript/TSX syntax transpilation passed for the modified source files; dependency-backed type checking and browser/device testing remain required.

## Files changed

- `src/types.ts`
- `src/components/CmsAndControlsPanels.tsx`
