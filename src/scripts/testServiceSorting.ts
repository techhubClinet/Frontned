import { connectDatabase } from '../config/database'
import { Service } from '../models/Service'
import { ServiceController } from '../controllers/ServiceController'

type MockResponse = {
  statusCode: number
  body: any
  status: (code: number) => MockResponse
  json: (payload: any) => MockResponse
}

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return this
    },
  }
}

async function callGetServices(sort?: 'price_asc' | 'price_desc') {
  const req = { query: sort ? { sort } : {} } as any
  const res = createMockResponse() as any
  await ServiceController.getServices(req, res)
  return res.body
}

function getEffectivePrice(service: any): number {
  if (typeof service.priceUSD === 'number') return service.priceUSD
  return Number(service.price || 0)
}

function assertSortedAscending(items: any[]) {
  for (let i = 1; i < items.length; i += 1) {
    if (getEffectivePrice(items[i - 1]) > getEffectivePrice(items[i])) {
      throw new Error('Ascending sort assertion failed')
    }
  }
}

function assertSortedDescending(items: any[]) {
  for (let i = 1; i < items.length; i += 1) {
    if (getEffectivePrice(items[i - 1]) < getEffectivePrice(items[i])) {
      throw new Error('Descending sort assertion failed')
    }
  }
}

async function run() {
  const marker = `sort_test_${Date.now()}`

  try {
    await connectDatabase()

    await Service.insertMany([
      {
        name: `${marker}_legacy_mid`,
        description: 'legacy price field',
        price: 300,
        is_active: true,
      },
      {
        name: `${marker}_usd_low`,
        description: 'priceUSD field low',
        price: 9999,
        priceUSD: 120,
        is_active: true,
      },
      {
        name: `${marker}_usd_high`,
        description: 'priceUSD field high',
        price: 1,
        priceUSD: 700,
        is_active: true,
      },
      {
        name: `${marker}_inactive`,
        description: 'should be excluded',
        price: 10,
        is_active: false,
      },
    ])

    const asc = await callGetServices('price_asc')
    const desc = await callGetServices('price_desc')

    if (!asc?.success || !Array.isArray(asc.data)) {
      throw new Error('Ascending request did not return expected success payload')
    }
    if (!desc?.success || !Array.isArray(desc.data)) {
      throw new Error('Descending request did not return expected success payload')
    }

    const ascSubset = asc.data.filter((item: any) => String(item.name || '').startsWith(marker))
    const descSubset = desc.data.filter((item: any) => String(item.name || '').startsWith(marker))

    if (ascSubset.length !== 3 || descSubset.length !== 3) {
      throw new Error('Expected 3 active test services in sorted results')
    }

    assertSortedAscending(ascSubset)
    assertSortedDescending(descSubset)

    console.log('✅ Service sorting test passed')
    console.log('   - price_asc sorted correctly')
    console.log('   - price_desc sorted correctly')
    console.log('   - inactive services excluded')
    console.log('   - priceUSD fallback to legacy price verified')
  } finally {
    await Service.deleteMany({ name: { $regex: `^${marker}` } })
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Service sorting test failed:', error?.message || error)
    process.exit(1)
  })
