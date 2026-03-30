const FIXTURE_KEYS = {
  customers: {
    demo1: 'cust-demo-001',
    demo2: 'cust-demo-002',
    seller: 'cust-seller-001'
  },
  products: {
    notebook: 'prod-notebook',
    mug: 'prod-mug',
    sticker: 'prod-sticker',
    keyboard: 'prod-keyboard',
    tumbler: 'prod-tumbler',
    hoodie: 'prod-hoodie'
  },
  variants: {
    notebook: 'var-notebook-std',
    mug: 'var-mug-std',
    sticker: 'var-sticker-pack',
    keyboard: 'var-keyboard-std',
    tumbler: 'var-tumbler-std',
    hoodie: 'var-hoodie-l'
  }
}

const FIXTURE_IDS = {
  customers: {
    [FIXTURE_KEYS.customers.demo1]: '11111111-1111-4111-8111-111111111111',
    [FIXTURE_KEYS.customers.demo2]: '11111111-1111-4111-8111-111111111112',
    [FIXTURE_KEYS.customers.seller]: '11111111-1111-4111-8111-111111111113'
  },
  addresses: {
    demo1: '22222222-2222-4222-8222-222222222221',
    demo2: '22222222-2222-4222-8222-222222222222'
  },
  carts: {
    active: '33333333-3333-4333-8333-333333333331',
    paymentSuccess: '33333333-3333-4333-8333-333333333332',
    paymentFailure: '33333333-3333-4333-8333-333333333333'
  },
  cartItems: {
    active: '44444444-4444-4444-8444-444444444441',
    paymentSuccess: '44444444-4444-4444-8444-444444444442',
    paymentFailure: '44444444-4444-4444-8444-444444444443'
  },
  orders: {
    paymentSuccess: '55555555-5555-4555-8555-555555555551',
    paymentFailure: '55555555-5555-4555-8555-555555555552'
  },
  paymentAttempts: {
    success: '66666666-6666-4666-8666-666666666661',
    failure: '66666666-6666-4666-8666-666666666662'
  },
  sales: {
    [FIXTURE_KEYS.products.notebook]: '77777777-7777-4777-8777-777777777771',
    [FIXTURE_KEYS.products.mug]: '77777777-7777-4777-8777-777777777772',
    [FIXTURE_KEYS.products.sticker]: '77777777-7777-4777-8777-777777777773',
    [FIXTURE_KEYS.products.keyboard]: '77777777-7777-4777-8777-777777777774',
    [FIXTURE_KEYS.products.tumbler]: '77777777-7777-4777-8777-777777777775',
    [FIXTURE_KEYS.products.hoodie]: '77777777-7777-4777-8777-777777777776'
  },
  saleSnapshots: {
    [FIXTURE_KEYS.products.notebook]: '88888888-8888-4888-8888-888888888881',
    [FIXTURE_KEYS.products.mug]: '88888888-8888-4888-8888-888888888882',
    [FIXTURE_KEYS.products.sticker]: '88888888-8888-4888-8888-888888888883',
    [FIXTURE_KEYS.products.keyboard]: '88888888-8888-4888-8888-888888888884',
    [FIXTURE_KEYS.products.tumbler]: '88888888-8888-4888-8888-888888888885',
    [FIXTURE_KEYS.products.hoodie]: '88888888-8888-4888-8888-888888888886'
  },
  snapshotUnits: {
    [FIXTURE_KEYS.products.notebook]: '99999999-9999-4999-8999-999999999991',
    [FIXTURE_KEYS.products.mug]: '99999999-9999-4999-8999-999999999992',
    [FIXTURE_KEYS.products.sticker]: '99999999-9999-4999-8999-999999999993',
    [FIXTURE_KEYS.products.keyboard]: '99999999-9999-4999-8999-999999999994',
    [FIXTURE_KEYS.products.tumbler]: '99999999-9999-4999-8999-999999999995',
    [FIXTURE_KEYS.products.hoodie]: '99999999-9999-4999-8999-999999999996'
  },
  variantStocks: {
    [FIXTURE_KEYS.variants.notebook]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    [FIXTURE_KEYS.variants.mug]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    [FIXTURE_KEYS.variants.sticker]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
    [FIXTURE_KEYS.variants.keyboard]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
    [FIXTURE_KEYS.variants.tumbler]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5',
    [FIXTURE_KEYS.variants.hoodie]: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
  }
}

const PRODUCT_FIXTURES = [
  {
    productKey: FIXTURE_KEYS.products.notebook,
    variantKey: FIXTURE_KEYS.variants.notebook,
    title: 'Monitoring Notebook',
    stockName: 'Standard',
    nominalPrice: '12000.00',
    realPrice: '9900.00'
  },
  {
    productKey: FIXTURE_KEYS.products.mug,
    variantKey: FIXTURE_KEYS.variants.mug,
    title: 'SRE Mug',
    stockName: 'Standard',
    nominalPrice: '19000.00',
    realPrice: '14900.00'
  },
  {
    productKey: FIXTURE_KEYS.products.sticker,
    variantKey: FIXTURE_KEYS.variants.sticker,
    title: 'Alert Sticker Pack',
    stockName: 'Pack',
    nominalPrice: '7900.00',
    realPrice: '5900.00'
  },
  {
    productKey: FIXTURE_KEYS.products.keyboard,
    variantKey: FIXTURE_KEYS.variants.keyboard,
    title: 'Ops Keyboard',
    stockName: 'Standard',
    nominalPrice: '129000.00',
    realPrice: '109000.00'
  },
  {
    productKey: FIXTURE_KEYS.products.tumbler,
    variantKey: FIXTURE_KEYS.variants.tumbler,
    title: 'On-call Tumbler',
    stockName: 'Standard',
    nominalPrice: '25000.00',
    realPrice: '19900.00'
  },
  {
    productKey: FIXTURE_KEYS.products.hoodie,
    variantKey: FIXTURE_KEYS.variants.hoodie,
    title: 'Incident Hoodie',
    stockName: 'L',
    nominalPrice: '69000.00',
    realPrice: '59000.00'
  }
]

const SECTION_TAG = 'section:home'
const CHANNEL_TAG = 'channel:main'

module.exports = {
  FIXTURE_KEYS,
  FIXTURE_IDS,
  PRODUCT_FIXTURES,
  SECTION_TAG,
  CHANNEL_TAG
}
