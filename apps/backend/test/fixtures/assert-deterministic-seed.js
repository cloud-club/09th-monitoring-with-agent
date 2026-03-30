require('dotenv/config')

const assert = require('node:assert/strict')
const { PrismaClient } = require('@prisma/client')

const { FIXTURE_IDS, FIXTURE_KEYS, PRODUCT_FIXTURES } = require('../../prisma/seed-data')

const prisma = new PrismaClient()

async function assertFixtureData() {
  const customers = await prisma.customer.findMany({ orderBy: { id: 'asc' } })
  assert.equal(customers.length, 3)

  assert.ok(customers.some((customer) => customer.id === FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo1]))
  assert.ok(customers.some((customer) => customer.id === FIXTURE_IDS.customers[FIXTURE_KEYS.customers.demo2]))
  assert.ok(customers.some((customer) => customer.id === FIXTURE_IDS.customers[FIXTURE_KEYS.customers.seller]))

  const productCount = await prisma.sale.count()
  const snapshotCount = await prisma.saleSnapshot.count()
  const variantCount = await prisma.saleSnapshotUnitStock.count()

  assert.ok(productCount >= 6)
  assert.equal(snapshotCount, PRODUCT_FIXTURES.length)
  assert.equal(variantCount, PRODUCT_FIXTURES.length)

  const activeCart = await prisma.cart.findUnique({ where: { id: FIXTURE_IDS.carts.active } })
  assert.ok(activeCart)
  assert.equal(activeCart.deletedAt, null)

  const paymentStatuses = await prisma.paymentAttempt.findMany({ orderBy: { id: 'asc' } })
  assert.ok(paymentStatuses.some((attempt) => attempt.status === 'succeeded'))
  assert.ok(paymentStatuses.some((attempt) => attempt.status === 'failed'))
}

assertFixtureData()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Fixture assertion failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
