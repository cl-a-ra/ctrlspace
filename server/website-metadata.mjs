function decodeHtmlText(value) {
  return value.replace(/&#(x[0-9a-f]+|\d+);?|&(amp|lt|gt|quot|apos|nbsp);/gi, (entity, numeric, named) => {
    if (numeric) {
      const hex = numeric[0].toLowerCase() === 'x'
      const code = Number.parseInt(hex ? numeric.slice(1) : numeric, hex ? 16 : 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()]
  }).replace(/\s+/g, ' ').trim()
}

function parseTagAttributes(tag) {
  const attributes = Object.create(null)
  const body = tag.slice(tag.search(/\s/)).replace(/\/?\s*>$/, '')
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match
  while ((match = attributePattern.exec(body))) {
    const name = match[1].toLowerCase()
    if (!Object.hasOwn(attributes, name)) attributes[name] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attributes
}

function safeWebUrl(value, baseUrl) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(decodeHtmlText(value), baseUrl)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null
    if (url.port && url.port !== '80' && url.port !== '443') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

export function extractWebsiteMetadata(html, pageUrl) {
  const cleanHtml = String(html).replace(/<!--[\s\S]*?-->/g, '')
  const metaValues = new Map()
  const iconLinks = []
  const tagPattern = /<(meta|link)\b[^>]*>/gi
  let match
  while ((match = tagPattern.exec(cleanHtml))) {
    const tagName = match[1].toLowerCase()
    const attributes = parseTagAttributes(match[0])
    if (tagName === 'meta') {
      const key = (attributes.property || attributes.name || '').toLowerCase()
      if (key && !metaValues.has(key) && attributes.content) metaValues.set(key, decodeHtmlText(attributes.content))
      continue
    }
    const rel = (attributes.rel || '').toLowerCase().split(/\s+/)
    const href = safeWebUrl(attributes.href, pageUrl)
    if (!href) continue
    if (rel.includes('icon')) iconLinks.push({ priority: 0, url: href })
    else if (rel.includes('apple-touch-icon')) iconLinks.push({ priority: 1, url: href })
  }

  let documentTitle = null
  const title = cleanHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]
  if (title) {
    const cleanTitle = decodeHtmlText(title.replace(/<[^>]*>/g, ''))
    if (cleanTitle) documentTitle = cleanTitle.slice(0, 200)
  }
  const titleFromMeta = metaValues.get('og:title') || metaValues.get('twitter:title')
  const favicon = iconLinks.sort((left, right) => left.priority - right.priority)[0]?.url ?? null
  const preview = safeWebUrl(
    metaValues.get('og:image')
      || metaValues.get('og:image:secure_url')
      || metaValues.get('twitter:image')
      || metaValues.get('twitter:image:src'),
    pageUrl,
  )

  return {
    title: titleFromMeta ? titleFromMeta.slice(0, 200) : documentTitle,
    faviconUrl: favicon,
    previewImageUrl: preview,
  }
}

export function isSupportedPreviewContentType(value) {
  const contentType = String(value ?? '').split(';', 1)[0].trim().toLowerCase()
  return ['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'].includes(contentType)
}
