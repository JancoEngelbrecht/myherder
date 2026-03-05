---
name: logistics-entities
description: Understanding the relationships between logistics entities (Shipment, Consignment, HandlingUnit, TrackingEvent) in Viya TMS. Use when working with shipping data models, tracking flows, or building features that involve these core entities.
license: MIT
metadata:
  author: shipitsmarter
  version: "1.0"
---

# Logistics Entities Domain Knowledge

Understanding how Shipments, Consignments, Handling Units, and Tracking Events relate to each other in the Viya TMS platform.

---

## Entity Hierarchy Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         SHIPMENT                                │
│  (Customer order - one delivery from sender to receiver)        │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  HandlingUnit 1 │  │  HandlingUnit 2 │  │ HandlingUnit N │  │
│  │  (package/pallet)│  │  (package/pallet)│ │ (package/pallet)│ │
│  │                 │  │                 │  │                │  │
│  │  - GoodsItems   │  │  - GoodsItems   │  │ - GoodsItems   │  │
│  │  - TrackingRef  │  │  - TrackingRef  │  │ - TrackingRef  │  │
│  └─────────────────┘  └─────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  CONSIGNMENT  │     │  CONSIGNMENT  │     │  CONSIGNMENT  │
│  (Road trip)  │     │  (Air leg)    │     │  (Last mile)  │
│               │     │               │     │               │
│  HUs: 1,2     │     │  HUs: 1,2,N   │     │  HUs: N       │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────┐
│                     TRACKING EVENTS                           │
│  (Scan events from carriers - linked to HU, Shipment, or      │
│   Consignment)                                                │
└───────────────────────────────────────────────────────────────┘
```

---

## Core Entities

### 1. Shipment

The primary customer-facing entity. Represents one delivery order from a sender to a receiver.

**Key characteristics:**
- Created by the shipper (customer)
- Contains addresses (sender, receiver, pickup, delivery)
- Contains one or more HandlingUnits
- Has a lifecycle: Created → Ordered → In Transit → Delivered
- Has a `reference` (shipper-assigned) and `trackingReference` (carrier-assigned)

**TypeScript type:** `Shipment` from `@/generated/shipping`

```typescript
interface Shipment {
  reference: string;                    // Shipper's reference (required)
  addresses: AddressCollection;         // sender, receiver, pickup, delivery
  handlingUnits: HandlingUnit[];        // Packages in this shipment
  carrierReference?: string;            // Which carrier is used
  trackingReference?: string;           // Carrier's tracking number
  timeWindows: TimeWindows;             // Pickup/delivery windows
  weightUnit: WeightUnit;               // 'kgm' | 'lbr'
  dimensionUnit: DimensionUnit;         // 'cmt' | 'inh'
  // ... more fields
}
```

**API Service:** `ShipmentService` at `src/services/shipping/shipment-service.ts`

**Frontend views:**
- `src/views/shipment/create/ShipmentCreatePage.vue` - Create new shipment
- `src/views/shipment/details/ShipmentDetailPage.vue` - View shipment details
- `src/views/shipment/overview/ShipmentOverviewPage.vue` - List all shipments

---

### 2. Consignment

A transport leg or "trip" that moves goods between two points. One shipment can be split across multiple consignments for network routing.

**Key characteristics:**
- Used for road transport (Despatch Advice / Pre-Advice messaging)
- Groups HandlingUnits for a specific transport leg
- Can contain HandlingUnits from multiple Shipments
- Has its own lifecycle: Created → Ordered → Confirmed → Delivered
- Enables multi-leg journeys (first mile → hub → last mile)

**TypeScript type:** `Consignment` from `@/generated/shipping`

```typescript
interface Consignment {
  reference: string;                           // Shipper's reference
  carrierReference?: string;                   // Carrier for this leg
  trackingReference?: string;                  // Carrier's tracking number
  timeWindows: TimeWindows;                    // Pickup/delivery windows
  addresses?: LoadAddressCollection;           // sender, pickup, delivery
  handlingUnits?: ConsignmentHandlingUnit[];   // HUs on this consignment
  status: ConsignmentLoadingStatus;            // created|ordered|confirmed|...
  // ... more fields
}
```

**API Service:** `ConsignmentService` at `src/services/consignment/consignment-service.ts`

**Frontend views:**
- `src/views/consignments/ConsignmentCreatePage.vue` - Create new consignment
- `src/views/consignments/ConsignmentDetailPage.vue` - View consignment details
- `src/views/consignments/ConsignmentOverviewPage.vue` - List all consignments

**Workflow documentation:** `src/views/consignments/consignment-workflow.md`

---

### 3. HandlingUnit

A physical package, pallet, or container that is being transported. The trackable unit of goods.

**Key characteristics:**
- The physical item that gets scanned and tracked
- Belongs to exactly one Shipment (created from shipment)
- Can be loaded onto multiple Consignments (for multi-leg transport)
- Has dimensions, weight, and package type
- Contains GoodsItems (the actual products)
- Can have children (overpacks - one pallet containing multiple boxes)

**TypeScript type:** `HandlingUnit` from `@/generated/shipping`

```typescript
interface HandlingUnit {
  id: string;                          // System-assigned UUID (readonly)
  reference: string;                   // SSCC or package ID
  sequence: number;                    // Order in shipment (1, 2, 3...)
  weight: number;                      // In shipment's weightUnit
  length: number;                      // In shipment's dimensionUnit
  width: number;
  height: number;
  packageType: PackageTypeInfo;        // Box, pallet, envelope, etc.
  status?: HandlingUnitStatus;         // atOrigin|inTransit|inHub|delivered
  location?: Address;                  // Current location (readonly)
  isDocument: boolean;                 // Is this a document envelope?
  goodsItems: GoodsItem[];             // Products inside
  trackingReference?: string;          // Carrier's barcode
  children?: string[];                 // Child HU IDs (for overpacks)
  // ... more fields
}
```

**Statuses:**
- `atOrigin` - Still at pickup location
- `inTransit` - Moving between locations
- `inHub` - At an intermediate hub
- `delivered` - Arrived at final destination

**Frontend components:**
- `src/views/shipment/create/components/handlingUnits/ShipmentHandlingUnits.vue`
- `src/views/consignments/components/ShipmentHandlingUnit.vue`
- `src/views/tracking/components/trackingHandlingUnitList.vue`

---

### 4. TrackingEvent

A scan or status update from a carrier about a shipment, consignment, or handling unit.

**Key characteristics:**
- Generated by carrier systems (scans, status updates)
- Can be linked to Shipment, Consignment, or HandlingUnit
- Has both carrier-specific codes AND standardized Viya codes
- Contains location information (scan location)
- Can include documents (POD images, signatures)

**TypeScript type:** `TrackingEventWithMappedCodes` from `@/generated/shipping`

```typescript
interface TrackingEventWithMappedCodes {
  id: string;                          // Event ID
  eventDateTime: string;               // When the event occurred
  eventType: CodeRequiredDescription;  // Carrier's event code
  reason?: CodeDescription;            // Carrier's reason code
  standardizedCode?: TrackingEventStandardizedCode;  // Viya's standard code
  scannedBy?: string;                  // Who scanned it
  scanText?: string;                   // Descriptive text
  scanLocation?: Address;              // Where it was scanned
  estimatedDateTimeOfArrival?: string; // Updated ETA
  documents: BaseDocumentDetails[];    // POD, signature, etc.
}
```

**API Service:** `TrackingService` at `src/services/shipping/tracking-service.ts`

**Frontend views:**
- `src/views/network-tracking/tracking/TrackingEvent.vue`
- `src/views/network-tracking/tracking/TrackingDetails.vue`

---

## Entity Relationships

### Shipment → HandlingUnits (1:N)
A shipment CONTAINS handling units. HandlingUnits are created as part of the shipment.

```typescript
// Access handling units from shipment
const shipment: Shipment = await shipmentService.readSingle(id);
const handlingUnits = shipment.handlingUnits;
```

### Consignment → HandlingUnits (N:M)
A consignment REFERENCES handling units (they can exist independently). HandlingUnits are "loaded" onto consignments.

```typescript
// Load handling units onto a consignment
await consignmentService.loadHandlingUnits(consignmentId, handlingUnitIds);

// Get handling units for a consignment
const hus = await consignmentService.readHandlingUnitsListWithQuery(consignmentId);
```

### Shipment ↔ Consignment (N:M via HandlingUnits)
The relationship is indirect through handling units:
- One shipment's handling units can be spread across multiple consignments
- One consignment can contain handling units from multiple shipments

### TrackingEvents → LogisticsEntities
Tracking events can be linked to any of:
- `LogisticsUnitType.shipment` - Shipment-level tracking
- `LogisticsUnitType.consignment` - Consignment-level tracking
- `LogisticsUnitType.handlingUnit` - Package-level tracking

```typescript
// Get tracking events for a specific entity
const events = await trackingService.getEventsByLogisticEntity(
  entityId,
  LogisticsUnitType.shipment,  // or .consignment or .handlingUnit
  playground
);
```

---

## Network Tracking (Multi-Leg Journeys)

For shipments that travel through a network (first mile → hub → last mile), the `ShipmentNetworkTracking` type provides a unified view:

```typescript
interface ShipmentNetworkTracking {
  shipment: NetworkTrackingShipmentSummary;    // Shipment summary
  lanes: NetworkTrackingLane[];                // Consignment legs
  addresses: { [ref: string]: Address };       // All addresses
  consignments: { [ref: string]: GetConsignmentListItem };  // All consignments
  handlingUnits: HandlingUnitWithEvents[];     // HUs with their events
  exceptions: NetworkTrackingExceptionCollection;  // Problems/delays
  routeGraph: RouteGraph;                      // Visual route data
}
```

**API endpoint:**
```typescript
await shipmentService.getNetworkTrackingForShipment(shipmentId, playground);
```

**Frontend views:**
- `src/views/network-tracking/tracking/TrackingChart.vue` - Visual journey
- `src/views/network-tracking/tracking/TrackingSidebar.vue` - Details panel
- `src/views/network-tracking/tracking/details/ConsignmentDetails.vue`

---

## Common Patterns

### Checking if a shipment can be edited
```typescript
const canEdit = shipment.status === 'created';
```

### Getting all handling units across consignments
```typescript
// From ShipmentHandlingUnit.vue pattern
const loadedHUs = consignmentResponse.handlingUnits ?? [];
const shipmentHUIds = shipment.handlingUnits.map(hu => hu.id);
const selectedHUs = loadedHUs.filter(hu => shipmentHUIds.includes(hu.id));
```

### Displaying tracking status
```typescript
// From trackingHandlingUnitList.vue
enum HandlingUnitState {
  inTransit = 'info',
  atOrigin = 'neutral',
  inHub = 'info',
  delivered = 'success',
}
```

---

## Type Imports

```typescript
// Core entity types
import type {
  Shipment,
  Consignment,
  HandlingUnit,
  ConsignmentHandlingUnit,
  TrackingEventWithMappedCodes,
  HandlingUnitStatus,
  ShipmentStatus,
  ConsignmentLoadingStatus,
  LogisticsUnitType,
} from '@/generated/shipping';

// Response types
import type {
  GetShipmentResponse,
  GetConsignmentResponse,
  ShipmentNetworkTracking,
  HandlingUnitWithEvents,
} from '@/generated/shipping';

// List item types (for tables)
import type {
  GetShipmentListItem,
  GetConsignmentListItem,
  GetShipmentListHandlingUnitItem,
} from '@/generated/shipping';
```

---

## API Patterns for Entity Operations

### Linking Handling Units to Consignments

To load handling units from a shipment onto a consignment, use the `load-by-shipment` endpoint:

```
PATCH /v4/consignments/{id}/load-by-shipment
```

**IMPORTANT:**
- The endpoint is `/v4/consignments/{id}/load-by-shipment` (NOT `/v4/consignments/{id}/handling-units/load-by-shipment`)
- Must use **PATCH** method (not PUT)

**Request Body:**
```json
[
  {
    "shipmentReference": "SHIPMENT-REF",
    "handlingUnitReferences": ["HU-001", "HU-002"]
  }
]
```

**Frontend service example:**
```typescript
// In consignment-service.ts
async loadByShipment(
  consignmentId: string,
  shipmentLoads: Array<{
    shipmentReference: string;
    handlingUnitReferences: string[];
  }>,
  ...args: Options<void>
) {
  return this.executeRequest(
    () => shippingClient.PATCH('/v4/consignments/{id}/load-by-shipment', {
      params: { path: { id: consignmentId } },
      body: shipmentLoads,
    }),
    ...args
  );
}
```

**E2E test helper example:**
```typescript
// In playwright E2E tests
async linkHandlingUnitsToConsignment(
  consignmentId: string,
  shipmentReference: string,
  handlingUnitReferences: string[]
) {
  const response = await this.request.patch(
    `${this.baseUrl}/v4/consignments/${consignmentId}/load-by-shipment`,
    {
      headers: this.getHeaders(),
      data: [{
        shipmentReference,
        handlingUnitReferences,
      }],
    }
  );
  expect(response.ok()).toBeTruthy();
}
```

### Search by Reference

The `searchIdsByReference` endpoint returns an object with an `ids` array:

```typescript
// API response structure
interface SearchIdsResponse {
  ids: string[];  // NOT a plain array!
}

// Usage
const response = await shipmentService.searchIdsByReference(reference);
const shipmentIds = response.data.ids;  // Access .ids property
```

### Handling 409 Conflict

Creating an entity with an existing reference returns **409 Conflict**. Handle this in tests:

```typescript
const response = await createShipment(shipmentData);
if (response.status() === 409) {
  // Entity already exists, fetch it instead
  const existing = await getShipmentByReference(shipmentData.reference);
  return existing;
}
```

---

## Test Data Setup Order

When setting up test data involving shipments and consignments, **order matters**:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. CREATE SHIPMENT (with handling units defined)               │
│     - Shipment contains HandlingUnits                           │
│     - HUs have references like "HU-001", "HU-002"               │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. CREATE CONSIGNMENT(S)                                        │
│     - Initially has no handling units                           │
│     - Just defines the transport leg (addresses, carrier, etc.) │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. LINK HANDLING UNITS TO CONSIGNMENT                          │
│     - PATCH /v4/consignments/{id}/load-by-shipment              │
│     - Links HUs from shipment to consignment                    │
│     - THIS IS REQUIRED for network tracking to work!            │
└─────────────────────────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. VERIFY: Network tracking now shows consignments             │
│     - GET /v4/shipments/{id}/network-tracking                   │
│     - Response includes linked consignments in `lanes`          │
└─────────────────────────────────────────────────────────────────┘
```

### E2E Test Setup Example

```typescript
// 1. Create shipment with handling units
const shipment = await shipmentHelper.createShipment({
  reference: 'TEST-SHIPMENT-001',
  handlingUnits: [
    { reference: 'HU-001', weight: 10, length: 30, width: 20, height: 15 },
    { reference: 'HU-002', weight: 5, length: 20, width: 15, height: 10 },
  ],
  // ... other required fields
});

// 2. Create consignment
const consignment = await consignmentHelper.createConsignment({
  reference: 'TEST-CONSIGNMENT-001',
  // ... addresses, carrier, etc.
});

// 3. Link handling units from shipment to consignment
await consignmentHelper.linkHandlingUnitsToConsignment(
  consignment.id,
  shipment.reference,
  ['HU-001', 'HU-002']
);

// 4. Now network tracking will show the consignment
const networkTracking = await shipmentHelper.getNetworkTracking(shipment.id);
expect(networkTracking.lanes).toHaveLength(1);
expect(networkTracking.consignments['TEST-CONSIGNMENT-001']).toBeDefined();
```

### Common Pitfall

**Without linking handling units**, consignments won't appear in network tracking:

```typescript
// ❌ WRONG - Consignment exists but won't show in tracking
await createConsignment({ reference: 'CONS-001' });
const tracking = await getNetworkTracking(shipmentId);
// tracking.lanes will be EMPTY!

// ✅ CORRECT - Link HUs first
await createConsignment({ reference: 'CONS-001' });
await linkHandlingUnitsToConsignment(consignmentId, shipmentRef, huRefs);
const tracking = await getNetworkTracking(shipmentId);
// tracking.lanes now includes the consignment
```

---

## Related Skills

| Skill | When to Use |
|-------|-------------|
| **api-integration** | Working with services and API responses |
| **vue-component** | Building UI for these entities |
| **viya-app-structure** | Finding relevant files and views |
| **playwright-test** | Writing E2E tests for tracking features |
| **shipping-structure** | Understanding the Shipping microservice backend |
