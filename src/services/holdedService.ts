// Client Holded API key (KANRI)
const HOLDED_API_KEY = '8e84d14ba4bf4a4354fbc5ef57fd9a7b'
const BASE_URL = 'https://api.holded.com/api/invoicing/v1'

async function holdedRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = `${BASE_URL}${path}`

  const res = await fetch(url, {
    method: init.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      key: HOLDED_API_KEY,
      ...(init.headers || {}),
    },
    ...init,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Holded API error ${res.status}: ${text || res.statusText}`)
  }

  return res
}

const DOC_TYPE = 'invoice'

/**
 * Holded invoice visibility (tested with your API):
 * - DRAFT:  status=1, docNumber=null or empty  → no "View invoice" button
 * - APPROVED: status=1, docNumber="F260004"    → show "View invoice" button
 *
 * Rule: approved ONLY when (status is 1 or 2) AND docNumber exists and is not "borrador"/"draft".
 */
export function getHoldedInvoiceStatus(doc: any): 'approved' | 'draft' {
  if (!doc || typeof doc !== 'object') return 'draft'

  const rawDocNumber = doc.docNumber ?? doc.docnumber ?? doc.number
  const docNumber =
    rawDocNumber === null || rawDocNumber === undefined
      ? ''
      : String(rawDocNumber).trim().toLowerCase()

  if (docNumber.includes('borrador') || docNumber.includes('draft')) return 'draft'

  const rawStatus = doc.status ?? doc.docstatus ?? doc.docStatus ?? doc.state
  const status =
    typeof rawStatus === 'string' ? parseInt(rawStatus, 10) : Number(rawStatus)
  if (Number.isNaN(status)) return 'draft'
  if (status !== 1 && status !== 2) return 'draft'

  // status 1 or 2: approved only if there is a real invoice number (Holded sets this when you click Aprobar)
  if (!docNumber || docNumber.length < 2) return 'draft'

  return 'approved'
}

export async function getHoldedDocument(documentId: string): Promise<any> {
  const res = await holdedRequest(`/documents/${DOC_TYPE}/${documentId}`)
  return res.json()
}

export async function getHoldedDocumentPdf(documentId: string): Promise<Buffer> {
  const res = await holdedRequest(`/documents/${DOC_TYPE}/${documentId}/pdf`)
  const contentType = (res.headers.get('content-type') || '').toLowerCase()
  console.log('[Holded] PDF response content-type:', contentType)

  if (contentType.includes('application/pdf')) {
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }

  const body = await res.text()

  if (contentType.includes('application/json') || contentType.includes('text/html')) {
    let json: Record<string, unknown>
    try {
      json = JSON.parse(body) as Record<string, unknown>
    } catch {
      if (contentType.includes('text/html')) {
        console.log('[Holded] PDF endpoint returned HTML (first 300 chars):', body.slice(0, 300))
        throw new Error('Holded returned an HTML page instead of a PDF. Check that your API key has PDF access and the document ID is correct.')
      }
      throw new Error('Holded PDF response was not valid JSON')
    }
    const b64 =
      typeof json?.data === 'string' ? json.data
      : typeof (json as any)?.file === 'string' ? (json as any).file
      : typeof (json as any)?.pdf === 'string' ? (json as any).pdf
      : typeof (json as any)?.content === 'string' ? (json as any).content
      : null
    if (!b64) {
      console.log('[Holded] PDF JSON keys:', Object.keys(json || {}), 'sample:', body.slice(0, 200))
      throw new Error((json?.info as string) || 'Holded PDF response missing data')
    }
    const cleaned = b64.replace(/\s/g, '')
    let pdfBuffer = Buffer.from(cleaned, 'base64')
    const pdfStart = pdfBuffer.indexOf('%PDF')
    if (pdfStart >= 0) {
      pdfBuffer = pdfBuffer.subarray(pdfStart)
    }
    const startsWithPdf = pdfBuffer.length >= 4 && pdfBuffer.toString('ascii', 0, 4) === '%PDF'
    console.log('[Holded] PDF decoded length:', pdfBuffer.length, 'starts with %PDF:', startsWithPdf)
    if (!startsWithPdf) {
      throw new Error('Holded did not return a valid PDF')
    }
    return pdfBuffer
  }

  const buf = Buffer.from(body, 'binary')
  const pdfStart = buf.indexOf('%PDF')
  if (pdfStart >= 0) {
    const pdfBuffer = buf.subarray(pdfStart)
    if (pdfBuffer.length >= 4) return pdfBuffer
  }
  console.log('[Holded] PDF binary length:', buf.length, 'starts with %PDF:', buf.length >= 4 && buf.toString('ascii', 0, 4) === '%PDF')
  return buf
}

