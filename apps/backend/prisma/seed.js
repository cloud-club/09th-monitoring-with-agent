require('dotenv/config')

const { PrismaClient } = require('@prisma/client')

const {
  buildAddressFixtures,
  buildCartFixtures,
  buildCartItemFixtures,
  buildCartItemStockFixtures,
  buildCustomerFixtures,
  buildOrderFixtures,
  buildOrderItemFixtures,
  buildPaymentAttemptFixtures,
  buildSaleFixtures,
  buildSaleSnapshotFixtures,
  buildSnapshotContentFixtures,
  buildSnapshotTagFixtures,
  buildSnapshotUnitFixtures,
  buildVariantStockFixtures
} = require('./factories')

const prisma = new PrismaClient()

async function resetSeedScope() {
  await prisma.cartItemStockChoice.deleteMany({})
  await prisma.cartItemStock.deleteMany({})
  await prisma.orderItem.deleteMany({})
  await prisma.paymentAttempt.deleteMany({})
  await prisma.cartItem.deleteMany({})
  await prisma.orderEntity.deleteMany({})
  await prisma.cart.deleteMany({})
  await prisma.saleSnapshotUnitStock.deleteMany({})
  await prisma.saleSnapshotUnitOptionCandidate.deleteMany({})
  await prisma.saleSnapshotUnitOption.deleteMany({})
  await prisma.saleSnapshotUnit.deleteMany({})
  await prisma.saleSnapshotTag.deleteMany({})
  await prisma.saleSnapshotContent.deleteMany({})
  await prisma.saleSnapshot.deleteMany({})
  await prisma.sale.deleteMany({})
  await prisma.address.deleteMany({})
  await prisma.customer.deleteMany({})
}

async function seed() {
  await resetSeedScope()

  await prisma.customer.createMany({ data: buildCustomerFixtures() })
  await prisma.address.createMany({ data: buildAddressFixtures() })
  await prisma.sale.createMany({ data: buildSaleFixtures() })
  await prisma.saleSnapshot.createMany({ data: buildSaleSnapshotFixtures() })
  await prisma.saleSnapshotContent.createMany({ data: buildSnapshotContentFixtures() })
  await prisma.saleSnapshotTag.createMany({ data: buildSnapshotTagFixtures() })
  await prisma.saleSnapshotUnit.createMany({ data: buildSnapshotUnitFixtures() })
  await prisma.saleSnapshotUnitStock.createMany({ data: buildVariantStockFixtures() })
  await prisma.cart.createMany({ data: buildCartFixtures() })
  await prisma.cartItem.createMany({ data: buildCartItemFixtures() })
  await prisma.cartItemStock.createMany({ data: buildCartItemStockFixtures() })
  await prisma.orderEntity.createMany({ data: buildOrderFixtures() })
  await prisma.orderItem.createMany({ data: buildOrderItemFixtures() })
  await prisma.paymentAttempt.createMany({ data: buildPaymentAttemptFixtures() })
}

seed()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
