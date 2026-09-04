import crypto from 'node:crypto'
import { Router } from 'express'
import { cloudinary, usingCloudinary } from '../config.js'
import { requireRole } from '../middleware/auth.js'

/**
 * CLOUDINARY — SIGNED DIRECT UPLOAD
 * =================================
 * The browser uploads straight to Cloudinary; the image bytes never touch this
 * server. That keeps a 3MB photo off our bandwidth and out of our request
 * limits, and it is markedly faster on a rural connection.
 *
 * The API secret stays here. We only hand the client a signature that is valid
 * for one upload, into one folder, at one moment. An *unsigned* preset would
 * be simpler but lets anyone on the internet fill your Cloudinary account.
 *
 * Flow:
 *   client → POST /api/uploads/signature   (authenticated)
 *   client → POST to Cloudinary with file + signature
 *   client → sends the returned secure_url with the product
 */
export const uploadsRouter: Router = Router()

/** Cloudinary signs the sha1 of `key=value` pairs sorted by key, + the secret. */
function sign(params: Record<string, string | number>, secret: string): string {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&')
  return crypto.createHash('sha1').update(canonical + secret).digest('hex')
}

uploadsRouter.post('/signature', requireRole('seller', 'customer', 'admin'), (req, res) => {
  if (!usingCloudinary || !cloudinary) {
    res.status(503).json({
      error: 'Image uploads are not configured',
      messageMr: 'फोटो अपलोड सध्या बंद आहे',
    })
    return
  }

  const kind = req.body?.kind === 'payment' ? 'payment' : 'product'

  // Scope every upload to a folder we control, and tag it with who uploaded it
  // so an orphaned image can be traced back later.
  const folder = `${cloudinary.folder}/${kind}`
  const timestamp = Math.floor(Date.now() / 1000)

  const params: Record<string, string | number> = {
    folder,
    timestamp,
    // Cloudinary applies this on upload, so we store one sensibly sized master
    // instead of a 12MP phone photo: 1200px long edge, auto quality.
    transformation: 'c_limit,w_1200,h_1200,q_auto',
  }

  res.json({
    cloudName: cloudinary.cloudName,
    apiKey: cloudinary.apiKey,
    signature: sign(params, cloudinary.apiSecret),
    ...params,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,
  })
})

/**
 * Delete an image. Used when a seller replaces a product photo, so the old one
 * does not sit in the account forever.
 */
uploadsRouter.post('/delete', requireRole('seller', 'admin'), async (req, res) => {
  if (!usingCloudinary || !cloudinary) {
    res.status(503).json({ error: 'Image uploads are not configured' })
    return
  }
  const publicId = String(req.body?.publicId ?? '')
  if (!publicId.startsWith(`${cloudinary.folder}/`)) {
    // Never let a caller name an arbitrary asset in the account.
    res.status(400).json({ error: 'Not an image of this app' })
    return
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const signature = sign({ public_id: publicId, timestamp }, cloudinary.apiSecret)

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: cloudinary.apiKey,
    signature,
  })

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/destroy`,
    { method: 'POST', body },
  )
  res.status(resp.ok ? 200 : 502).json(await resp.json())
})
