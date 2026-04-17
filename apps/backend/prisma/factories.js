const {
  FIXTURE_IDS,
  FIXTURE_KEYS,
  PRODUCT_FIXTURES,
  CHANNEL_TAG,
  SECTION_TAG
} = require('./seed-data')

function buildCustomerFixtures() {
  return [
    {
      id: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo1],
      href: FIXTURE_KEYS.customers.demo1,
      referrer: 'seed:buyer',
      ip: '127.0.0.11'
    },
    {
      id: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo2],
      href: FIXTURE_KEYS.customers.demo2,
      referrer: 'seed:buyer',
      ip: '127.0.0.12'
    },
    {
      id: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.seller],
      href: FIXTURE_KEYS.customers.seller,
      referrer: 'seed:seller',
      ip: '127.0.0.13'
    }
  ]
}

function buildAddressFixtures() {
  return [
    {
      id: FIXTURE_IDS.addresses.demo1,
      mobile: '010-1111-1111',
      name: 'Demo Buyer One',
      country: 'KR',
      province: 'Seoul',
      city: 'Seoul',
      department: 'Mapo-gu',
      possession: 'home',
      zipCode: '04100',
      specialNote: 'Call before delivery'
    },
    {
      id: FIXTURE_IDS.addresses.demo2,
      mobile: '010-2222-2222',
      name: 'Demo Buyer Two',
      country: 'KR',
      province: 'Gyeonggi',
      city: 'Suwon',
      department: 'Yeongtong-gu',
      possession: 'office',
      zipCode: '16500',
      specialNote: 'Leave at front desk'
    }
  ]
}

function buildSaleFixtures() {
  return PRODUCT_FIXTURES.map((product) => ({
    id: FIXTURE_IDS.sales[product.productKey],
    sellerCustomerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.seller],
    openedAt: new Date('2026-03-01T00:00:00.000Z'),
    closedAt: null,
    pausedAt: null,
    suspendedAt: null
  }))
}

function buildSaleSnapshotFixtures() {
  return PRODUCT_FIXTURES.map((product) => ({
    id: FIXTURE_IDS.saleSnapshots[product.productKey],
    saleId: FIXTURE_IDS.sales[product.productKey]
  }))
}

function buildSnapshotContentFixtures() {
  return PRODUCT_FIXTURES.map((product, index) => ({
    id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, '0')}`,
    saleSnapshotId: FIXTURE_IDS.saleSnapshots[product.productKey],
    title: product.title,
    format: 'markdown',
    body: `Seeded fixture for ${product.productKey}`,
    revertPolicy: 'manual'
  }))
}

function buildSnapshotTagFixtures() {
  return PRODUCT_FIXTURES.flatMap((product, index) => {
    const base = String(index + 1).padStart(12, '0')
    const next = String(index + 101).padStart(12, '0')

    return [
      {
        id: `cccccccc-cccc-4ccc-8ccc-${base}`,
        saleSnapshotId: FIXTURE_IDS.saleSnapshots[product.productKey],
        value: CHANNEL_TAG,
        sequence: 1
      },
      {
        id: `dddddddd-dddd-4ddd-8ddd-${next}`,
        saleSnapshotId: FIXTURE_IDS.saleSnapshots[product.productKey],
        value: SECTION_TAG,
        sequence: 2
      }
    ]
  })
}

function buildSnapshotUnitFixtures() {
  return PRODUCT_FIXTURES.map((product) => ({
    id: FIXTURE_IDS.snapshotUnits[product.productKey],
    saleSnapshotId: FIXTURE_IDS.saleSnapshots[product.productKey],
    name: 'variant',
    primary: true,
    required: true,
    sequence: 1
  }))
}

function buildVariantStockFixtures() {
  return PRODUCT_FIXTURES.map((product) => ({
    id: FIXTURE_IDS.variantStocks[product.variantKey],
    saleSnapshotUnitId: FIXTURE_IDS.snapshotUnits[product.productKey],
    name: product.stockName,
    nominalPrice: product.nominalPrice,
    realPrice: product.realPrice,
    quantity: 50,
    sequence: 1
  }))
}

function buildCartFixtures() {
  return [
    {
      id: FIXTURE_IDS.carts.active,
      customerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo1],
      actorType: 'buyer',
      deletedAt: null
    },
    {
      id: FIXTURE_IDS.carts.paymentSuccess,
      customerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo1],
      actorType: 'buyer',
      deletedAt: null
    },
    {
      id: FIXTURE_IDS.carts.paymentFailure,
      customerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo2],
      actorType: 'buyer',
      deletedAt: null
    }
  ]
}

function buildCartItemFixtures() {
  return [
    {
      id: FIXTURE_IDS.cartItems.active,
      cartId: FIXTURE_IDS.carts.active,
      saleSnapshotId: FIXTURE_IDS.saleSnapshots[FIXTURE_KEYS.products.notebook],
      volume: 1,
      published: true,
      deletedAt: null
    },
    {
      id: FIXTURE_IDS.cartItems.paymentSuccess,
      cartId: FIXTURE_IDS.carts.paymentSuccess,
      saleSnapshotId: FIXTURE_IDS.saleSnapshots[FIXTURE_KEYS.products.mug],
      volume: 2,
      published: true,
      deletedAt: null
    },
    {
      id: FIXTURE_IDS.cartItems.paymentFailure,
      cartId: FIXTURE_IDS.carts.paymentFailure,
      saleSnapshotId: FIXTURE_IDS.saleSnapshots[FIXTURE_KEYS.products.hoodie],
      volume: 1,
      published: true,
      deletedAt: null
    }
  ]
}

function buildCartItemStockFixtures() {
  return [
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
      cartItemId: FIXTURE_IDS.cartItems.active,
      saleSnapshotUnitId: FIXTURE_IDS.snapshotUnits[FIXTURE_KEYS.products.notebook],
      saleSnapshotUnitStockId: FIXTURE_IDS.variantStocks[FIXTURE_KEYS.variants.notebook],
      quantity: 1,
      sequence: 1
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
      cartItemId: FIXTURE_IDS.cartItems.paymentSuccess,
      saleSnapshotUnitId: FIXTURE_IDS.snapshotUnits[FIXTURE_KEYS.products.mug],
      saleSnapshotUnitStockId: FIXTURE_IDS.variantStocks[FIXTURE_KEYS.variants.mug],
      quantity: 2,
      sequence: 1
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
      cartItemId: FIXTURE_IDS.cartItems.paymentFailure,
      saleSnapshotUnitId: FIXTURE_IDS.snapshotUnits[FIXTURE_KEYS.products.hoodie],
      saleSnapshotUnitStockId: FIXTURE_IDS.variantStocks[FIXTURE_KEYS.variants.hoodie],
      quantity: 1,
      sequence: 1
    }
  ]
}

function buildOrderFixtures() {
  return [
    {
      id: FIXTURE_IDS.orders.paymentSuccess,
      customerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo1],
      addressId: FIXTURE_IDS.addresses.demo1,
      name: 'Demo Order Success',
      cash: '29800.00',
      deposit: '0.00',
      mileage: '0.00',
      deletedAt: null
    },
    {
      id: FIXTURE_IDS.orders.paymentFailure,
      customerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo2],
      addressId: FIXTURE_IDS.addresses.demo2,
      name: 'Demo Order Failure',
      cash: '59000.00',
      deposit: '0.00',
      mileage: '0.00',
      deletedAt: null
    }
  ]
}

function buildOrderItemFixtures() {
  return [
    {
      id: 'f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1',
      orderId: FIXTURE_IDS.orders.paymentSuccess,
      cartItemId: FIXTURE_IDS.cartItems.paymentSuccess,
      sellerCustomerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.seller],
      volume: 2,
      sequence: 1,
      confirmedAt: new Date('2026-03-01T10:00:00.000Z')
    },
    {
      id: 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2',
      orderId: FIXTURE_IDS.orders.paymentFailure,
      cartItemId: FIXTURE_IDS.cartItems.paymentFailure,
      sellerCustomerId: FIXTURE_IDS.customers[FIXTURE_KEYS.customers.seller],
      volume: 1,
      sequence: 1,
      confirmedAt: new Date('2026-03-01T10:05:00.000Z')
    }
  ]
}

function buildPaymentAttemptFixtures() {
  return [
    {
      id: FIXTURE_IDS.paymentAttempts.success,
      orderId: FIXTURE_IDS.orders.paymentSuccess,
      requestKey: 'req-seeded-success',
      status: 'succeeded',
      amount: '29800.00',
      failureCode: null
    },
    {
      id: FIXTURE_IDS.paymentAttempts.failure,
      orderId: FIXTURE_IDS.orders.paymentFailure,
      requestKey: 'req-seeded-failure',
      status: 'failed',
      amount: '59000.00',
      failureCode: 'CARD_DECLINED'
    }
  ]
}

module.exports = {
  buildCustomerFixtures,
  buildAddressFixtures,
  buildSaleFixtures,
  buildSaleSnapshotFixtures,
  buildSnapshotContentFixtures,
  buildSnapshotTagFixtures,
  buildSnapshotUnitFixtures,
  buildVariantStockFixtures,
  buildCartFixtures,
  buildCartItemFixtures,
  buildCartItemStockFixtures,
  buildOrderFixtures,
  buildOrderItemFixtures,
  buildPaymentAttemptFixtures
}
