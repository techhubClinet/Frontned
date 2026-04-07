import assert from 'assert'
import { deliveryRedirect, normalizeAndValidateDeliveryUrl } from '../controllers/deliveryController'
import { Project } from '../models/Project'

type MockResponse = {
  statusCode?: number
  body?: string
  contentType?: string
  redirectCode?: number
  redirectUrl?: string
  status: (code: number) => MockResponse
  send: (value: string) => MockResponse
  type: (value: string) => MockResponse
  redirect: (code: number, url: string) => MockResponse
}

function createMockResponse(): MockResponse {
  return {
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(value: string) {
      this.body = value
      return this
    },
    type(value: string) {
      this.contentType = value
      return this
    },
    redirect(code: number, url: string) {
      this.redirectCode = code
      this.redirectUrl = url
      return this
    },
  }
}

async function run(): Promise<void> {
  const originalFindOne = Project.findOne
  const token = '1234567890abcdef'

  try {
    // Case 1: successful redirect for valid external URL.
    ;(Project.findOne as any) = async () => ({
      deliveryUrl: 'https://www.dropbox.com/s/example/file.zip?dl=0',
      isDelivered: true,
    })
    const res1 = createMockResponse()
    await deliveryRedirect({ params: { token } } as any, res1 as any)
    assert.strictEqual(res1.redirectCode, 302)
    assert.strictEqual(res1.redirectUrl, 'https://www.dropbox.com/s/example/file.zip?dl=0')

    // Case 2: token not found should return 404.
    ;(Project.findOne as any) = async () => null
    const res2 = createMockResponse()
    await deliveryRedirect({ params: { token } } as any, res2 as any)
    assert.strictEqual(res2.statusCode, 404)
    assert.strictEqual(res2.body, 'Not found')

    // Case 3: URL without protocol should be normalized to https and redirected.
    ;(Project.findOne as any) = async () => ({
      deliveryUrl: 'www.google.com/drive/file',
    })
    const res3 = createMockResponse()
    await deliveryRedirect({ params: { token } } as any, res3 as any)
    assert.strictEqual(res3.redirectCode, 302)
    assert.strictEqual(res3.redirectUrl, 'https://www.google.com/drive/file')

    // Case 4: malformed URL in DB should return 404 (no redirect).
    ;(Project.findOne as any) = async () => ({
      deliveryUrl: 'ht!tp://broken',
    })
    const res4 = createMockResponse()
    await deliveryRedirect({ params: { token } } as any, res4 as any)
    assert.strictEqual(res4.statusCode, 404)
    assert.strictEqual(res4.redirectUrl, undefined)

    // Case 5: unexpected failure in lookup should return fallback 500 HTML.
    ;(Project.findOne as any) = async () => {
      throw new Error('lookup failed')
    }
    const res5 = createMockResponse()
    await deliveryRedirect({ params: { token } } as any, res5 as any)
    assert.strictEqual(res5.statusCode, 500)
    assert.strictEqual(res5.contentType, 'html')
    const body5 = res5.body || ''
    assert.ok(body5.includes('Redirect unavailable'))
    assert.ok(body5.includes('KANRI'))

    // URL normalization helper checks.
    assert.strictEqual(normalizeAndValidateDeliveryUrl('  https://drive.google.com/file  '), 'https://drive.google.com/file')
    assert.strictEqual(normalizeAndValidateDeliveryUrl('http://example.com/a'), 'http://example.com/a')
    assert.strictEqual(normalizeAndValidateDeliveryUrl('ftp://example.com/a'), null)
    assert.strictEqual(normalizeAndValidateDeliveryUrl('example.com/a'), null)

    console.log('delivery redirect tests passed')
  } finally {
    ;(Project.findOne as any) = originalFindOne
  }
}

run().catch((err) => {
  console.error('delivery redirect tests failed:', err)
  process.exit(1)
})
