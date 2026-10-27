import { createSign, randomBytes } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { request as httpRequest, createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'
import { extname, resolve, sep } from 'node:path'
import { extractWebsiteMetadata, isSupportedPreviewContentType } from './website-metadata.mjs'

function loadEnvironmentFile() {
  const file = resolve('.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || Object.hasOwn(process.env, match[1])) continue
    let value = match[2]
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\n/g, '\n')
    else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1)
    process.env[match[1]] = value
  }
}

loadEnvironmentFile()

const isProduction = process.env.NODE_ENV === 'production'
const appBaseUrl = process.env.APP_BASE_URL ?? 'http://127.0.0.1:5173'
const appBase = new URL(appBaseUrl)
if (isProduction && appBase.protocol !== 'https:') {
  throw new Error('APP_BASE_URL must use HTTPS in production.')
}
const port = Number(process.env.CTRLSPACE_API_PORT ?? process.env.PORT ?? (isProduction ? 5173 : 3001))
const sessions = new Map()
const pendingStates = new Map()
const sessionCookieName = 'ctrlspace_github_session'
const stateCookieName = 'ctrlspace_github_state'
const sessionLifetimeMs = 12 * 60 * 60 * 1000
const stateLifetimeMs = 10 * 60 * 1000
const apiHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'CTRLSPACE',
}

function githubAppConfig() {
  const appId = process.env.GITHUB_APP_ID?.trim()
  const slug = process.env.GITHUB_APP_SLUG?.trim()
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  return appId && slug && privateKey ? { appId, slug, privateKey } : null
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  })
  response.end(JSON.stringify(body))
}

function cookieValue(request, name) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

function setCookie(response, name, value, maxAge) {
  const secure = isProduction ? '; Secure' : ''
  appendCookie(response, `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/api/github; Max-Age=${maxAge}${secure}`)
}

function clearCookie(response, name) {
  const secure = isProduction ? '; Secure' : ''
  appendCookie(response, `${name}=; HttpOnly; SameSite=Lax; Path=/api/github; Max-Age=0${secure}`)
}

function appendCookie(response, cookie) {
  const current = response.getHeader('Set-Cookie')
  const cookies = current === undefined ? [] : Array.isArray(current) ? current : [current]
  response.setHeader('Set-Cookie', [...cookies, cookie])
}

function getSession(request) {
  const id = cookieValue(request, sessionCookieName)
  const session = id ? sessions.get(id) : null
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id)
    return null
  }
  return session
}

function appJwt(config) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  // Keep the JWT valid with modest local clock drift while staying within GitHub's 10-minute limit.
  const claims = { iat: now - 300, exp: now + 300, iss: config.appId }
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(config.privateKey, 'base64url')}`
}

async function installationToken(config, installationId) {
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { ...apiHeaders, Authorization: `Bearer ${appJwt(config)}` },
  })
  if (!response.ok) {
    console.error(`GitHub installation token request failed with status ${response.status}.`)
    throw new Error('Could not access this GitHub App installation.')
  }
  const result = await response.json()
  if (typeof result.token !== 'string') throw new Error('GitHub did not return an installation token.')
  return result.token
}

async function listInstallationRepositories(session) {
  const config = githubAppConfig()
  if (!config) throw new Error('GitHub App integration is not configured.')
  const token = await installationToken(config, session.installationId)
  let url = new URL('https://api.github.com/installation/repositories')
  url.searchParams.set('per_page', '100')
  const repositories = []
  while (url && repositories.length < 10000) {
    const response = await fetch(url, {
      headers: { ...apiHeaders, Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      console.error(`GitHub repository request failed with status ${response.status}.`)
      throw new Error('Could not load repositories. Check the GitHub App installation and permissions.')
    }
    const page = await response.json()
    if (!Array.isArray(page.repositories)) throw new Error('GitHub returned an unexpected repository list.')
    repositories.push(...page.repositories)
    const nextLink = response.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1]
    if (!nextLink) break
    const nextUrl = new URL(nextLink)
    if (nextUrl.origin !== 'https://api.github.com') throw new Error('GitHub returned an unexpected pagination link.')
    url = nextUrl
  }
  return repositories.map((repository) => ({
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    htmlUrl: repository.html_url,
    description: repository.description,
    isPrivate: repository.private,
    defaultBranch: repository.default_branch,
    updatedAt: repository.updated_at,
  }))
}

function validateOrigin(request) {
  const origin = request.headers.origin
  if (origin !== appBase.origin) {
    throw new Error('This request did not come from the CTRLSPACE app.')
  }
}

function validatePreviewRequest(request) {
  const origin = request.headers.origin
  if (origin) {
    if (origin !== appBase.origin) throw new Error('This preview request did not come from the CTRLSPACE app.')
    return
  }
  if (request.headers['sec-fetch-site'] === 'same-origin') return
  try {
    if (new URL(request.headers.referer).origin === appBase.origin) return
  } catch {
    // Requests without a same-origin browser signal are not allowed to proxy external images.
  }
  throw new Error('This preview request did not come from the CTRLSPACE app.')
}

async function readJsonBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > 4096) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

function isPublicIpv4(address) {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false
  const [first, second, third] = octets
  return !(first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 88 && third === 99)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224)
}

async function publicIpv4Address(target) {
  if ((target.protocol !== 'http:' && target.protocol !== 'https:')
    || target.username || target.password
    || (target.port && target.port !== '80' && target.port !== '443')) {
    throw new Error('Use a public website URL with no credentials or custom port.')
  }
  const hostname = target.hostname.replace(/^\[|\]$/g, '')
  const ipVersion = isIP(hostname)
  const addresses = ipVersion === 4
    ? [{ address: hostname, family: 4 }]
    : ipVersion === 6
      ? []
      : await dnsLookup(hostname, { all: true, verbatim: true })
  const address = addresses.find((entry) => entry.family === 4 && isPublicIpv4(entry.address))
  if (!address) throw new Error('This website does not resolve to a public IPv4 address.')
  return address
}

function requestWebsite(target, address, { headers, method = 'GET' }) {
  return new Promise((resolveResponse, rejectResponse) => {
    const requester = target.protocol === 'https:' ? httpsRequest : httpRequest
    const req = requester(target, {
      method,
      headers,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address])
        else callback(null, address.address, address.family)
      },
    }, (response) => resolveResponse(response))
    req.setTimeout(5000, () => req.destroy(new Error('The website request timed out.')))
    req.on('error', rejectResponse)
    req.end()
  })
}

async function fetchWebsiteMetadata(inputUrl, redirectsRemaining = 3) {
  const target = new URL(inputUrl)
  const address = await publicIpv4Address(target)
  const response = await requestWebsite(target, address, {
    headers: { Accept: 'text/html', 'User-Agent': 'CTRLSPACE website metadata lookup' },
  })
  const status = response.statusCode ?? 0
  if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
    response.resume()
    if (redirectsRemaining === 0) throw new Error('The website redirected too many times.')
    const nextUrl = new URL(response.headers.location, target)
    return fetchWebsiteMetadata(nextUrl.toString(), redirectsRemaining - 1)
  }
  if (status < 200 || status >= 300) {
    response.resume()
    throw new Error(`The website returned HTTP ${status}.`)
  }
  if (!response.headers['content-type']?.toLowerCase().includes('text/html')) {
    response.resume()
    throw new Error('The website did not return an HTML page.')
  }

  const chunks = []
  let length = 0
  for await (const chunk of response) {
    length += chunk.length
    if (length > 1024 * 1024) {
      response.destroy()
      throw new Error('The website page is too large to inspect safely.')
    }
    chunks.push(chunk)
  }
  return extractWebsiteMetadata(Buffer.concat(chunks).toString('utf8'), target.toString())
}

async function fetchWebsitePreview(inputUrl, kind = 'preview', redirectsRemaining = 3) {
  const target = new URL(inputUrl)
  const address = await publicIpv4Address(target)
  const response = await requestWebsite(target, address, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.1',
      'User-Agent': 'CTRLSPACE website preview',
    },
  })
  const status = response.statusCode ?? 0
  if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
    response.resume()
    if (redirectsRemaining === 0) throw new Error('The preview image redirected too many times.')
    const nextUrl = new URL(response.headers.location, target)
    return fetchWebsitePreview(nextUrl.toString(), kind, redirectsRemaining - 1)
  }
  if (status !== 200) {
    response.resume()
    throw new Error(`The preview image returned HTTP ${status}.`)
  }
  const contentType = response.headers['content-type']
  const imageType = String(contentType ?? '').split(';', 1)[0].trim().toLowerCase()
  const iconTypes = ['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/bmp']
  if (!isSupportedPreviewContentType(contentType) && !(kind === 'icon' && iconTypes.includes(imageType))) {
    response.resume()
    throw new Error('The preview URL did not return a supported image.')
  }
  const declaredLength = Number(response.headers['content-length'])
  const maxLength = 2 * 1024 * 1024
  if (Number.isFinite(declaredLength) && declaredLength > maxLength) {
    response.resume()
    throw new Error('The preview image is too large to display safely.')
  }

  const chunks = []
  let length = 0
  for await (const chunk of response) {
    length += chunk.length
    if (length > maxLength) {
      response.destroy()
      throw new Error('The preview image is too large to display safely.')
    }
    chunks.push(chunk)
  }
  return { contentType: contentType.split(';', 1)[0].trim().toLowerCase(), body: Buffer.concat(chunks) }
}

async function checkWebsite(inputUrl, redirectsRemaining = 3) {
  const target = new URL(inputUrl)
  const address = await publicIpv4Address(target)
  const startedAt = performance.now()
  let response
  try {
    response = await requestWebsite(target, address, {
      headers: {
        Accept: '*/*',
        Range: 'bytes=0-0',
        'User-Agent': 'CTRLSPACE website health check',
      },
    })
  } catch (error) {
    const networkErrorCodes = ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN']
    if (networkErrorCodes.includes(error.code)) {
      return { status: 'offline', statusCode: null, latencyMs: Math.round(performance.now() - startedAt), detail: error.message }
    }
    throw error
  }

  const statusCode = response.statusCode ?? 0
  const latencyMs = Math.round(performance.now() - startedAt)
  if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
    response.destroy()
    if (redirectsRemaining === 0) throw new Error('The website redirected too many times.')
    const nextUrl = new URL(response.headers.location, target)
    return checkWebsite(nextUrl.toString(), redirectsRemaining - 1)
  }
  response.destroy()
  const status = statusCode >= 200 && statusCode < 400 ? 'online' : 'degraded'
  return {
    status,
    statusCode,
    latencyMs,
    detail: `HTTP ${statusCode}`,
  }
}

function sendAppPage(request, response, pathname) {
  const root = resolve('dist')
  const decoded = decodeURIComponent(pathname)
  const requested = resolve(root, `.${decoded}`)
  if (requested !== root && !requested.startsWith(`${root}${sep}`)) {
    response.writeHead(400)
    response.end('Invalid path.')
    return
  }
  const file = existsSync(requested) && statSync(requested).isFile() ? requested : resolve(root, 'index.html')
  if (!existsSync(file)) {
    response.writeHead(404)
    response.end('CTRLSPACE has not been built. Run npm run build.')
    return
  }
  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': extname(file) === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
}

async function handleApi(request, response, url) {
  const config = githubAppConfig()
  if (request.method === 'POST' && url.pathname === '/api/website/metadata') {
    try {
      validateOrigin(request)
    } catch (error) {
      return sendJson(response, 403, { error: error.message })
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
    const inputUrl = typeof body === 'object' && body !== null && typeof body.url === 'string' ? body.url : ''
    let parsedUrl
    try {
      parsedUrl = new URL(inputUrl)
    } catch {
      return sendJson(response, 400, { error: 'Enter a valid website URL.' })
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return sendJson(response, 400, { error: 'Only http:// and https:// website addresses are supported.' })
    }
    try {
      return sendJson(response, 200, await fetchWebsiteMetadata(parsedUrl.toString()))
    } catch (error) {
      console.error('Website metadata could not be retrieved.', error)
      return sendJson(response, 502, { error: error.message })
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/website/preview') {
    try {
      validatePreviewRequest(request)
    } catch (error) {
      return sendJson(response, 403, { error: error.message })
    }
    const kind = url.searchParams.get('kind') ?? 'preview'
    if (kind !== 'icon' && kind !== 'preview') return sendJson(response, 400, { error: 'Choose a valid website image type.' })
    const inputUrl = url.searchParams.get('url') ?? ''
    if (!inputUrl || inputUrl.length > 2048) return sendJson(response, 400, { error: 'Choose a valid preview image URL.' })
    let parsedUrl
    try {
      parsedUrl = new URL(inputUrl)
    } catch {
      return sendJson(response, 400, { error: 'Choose a valid preview image URL.' })
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return sendJson(response, 400, { error: 'Preview images must use http:// or https://.' })
    }
    try {
      const image = await fetchWebsitePreview(parsedUrl.toString(), kind)
      response.writeHead(200, {
        'Content-Type': image.contentType,
        'Content-Length': image.body.length,
        'Cache-Control': 'private, max-age=300',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      })
      response.end(image.body)
    } catch (error) {
      console.error('Website preview image could not be retrieved.', error)
      return sendJson(response, 502, { error: error.message })
    }
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/website/check') {
    try {
      validateOrigin(request)
    } catch (error) {
      return sendJson(response, 403, { error: error.message })
    }
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
    const inputUrl = typeof body === 'object' && body !== null && typeof body.url === 'string' ? body.url : ''
    let parsedUrl
    try {
      parsedUrl = new URL(inputUrl)
    } catch {
      return sendJson(response, 400, { error: 'Enter a valid website URL.' })
    }
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return sendJson(response, 400, { error: 'Only http:// and https:// website addresses are supported.' })
    }
    try {
      return sendJson(response, 200, await checkWebsite(parsedUrl.toString()))
    } catch (error) {
      console.error('Website health check could not be completed.', error)
      return sendJson(response, 502, { error: error.message })
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/github/status') {
    return sendJson(response, 200, { configured: Boolean(config), connected: Boolean(getSession(request)) })
  }

  if (request.method === 'GET' && url.pathname === '/api/github/install') {
    if (!config) return sendJson(response, 503, { error: 'GitHub import is not configured on this server yet.' })
    for (const [pendingState, expiresAt] of pendingStates) {
      if (expiresAt <= Date.now()) pendingStates.delete(pendingState)
    }
    const state = randomBytes(32).toString('base64url')
    pendingStates.set(state, Date.now() + stateLifetimeMs)
    setCookie(response, stateCookieName, state, Math.floor(stateLifetimeMs / 1000))
    const installUrl = new URL(`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`)
    installUrl.searchParams.set('state', state)
    response.writeHead(302, { Location: installUrl.toString(), 'Cache-Control': 'no-store' })
    response.end()
    return
  }

  if (request.method === 'GET' && url.pathname === '/api/github/callback') {
    const state = url.searchParams.get('state')
    const installationId = url.searchParams.get('installation_id')
    const action = url.searchParams.get('setup_action')
    const expectedState = cookieValue(request, stateCookieName)
    const expiresAt = state ? pendingStates.get(state) : undefined
    if (!state || !expectedState || state !== expectedState || !expiresAt || expiresAt <= Date.now()) {
      clearCookie(response, stateCookieName)
      response.writeHead(303, { Location: '/?github=error&reason=state', 'Cache-Control': 'no-store' })
      response.end()
      return
    }
    pendingStates.delete(state)
    clearCookie(response, stateCookieName)
    if (!installationId || !/^\d+$/.test(installationId) || (action !== 'install' && action !== 'update')) {
      response.writeHead(303, { Location: '/?github=error&reason=install', 'Cache-Control': 'no-store' })
      response.end()
      return
    }
    const sessionId = randomBytes(32).toString('base64url')
    sessions.set(sessionId, { installationId, expiresAt: Date.now() + sessionLifetimeMs })
    setCookie(response, sessionCookieName, sessionId, Math.floor(sessionLifetimeMs / 1000))
    response.writeHead(303, { Location: '/?github=connected&import=1', 'Cache-Control': 'no-store' })
    response.end()
    return
  }

  if (request.method === 'POST' && url.pathname === '/api/github/disconnect') {
    try {
      validateOrigin(request)
    } catch (error) {
      return sendJson(response, 403, { error: error.message })
    }
    const id = cookieValue(request, sessionCookieName)
    if (id) sessions.delete(id)
    clearCookie(response, sessionCookieName)
    return sendJson(response, 200, { connected: false })
  }

  if (request.method === 'GET' && url.pathname === '/api/github/repositories') {
    const session = getSession(request)
    if (!session) return sendJson(response, 401, { error: 'Connect a GitHub account to browse repositories.' })
    try {
      return sendJson(response, 200, { repositories: await listInstallationRepositories(session) })
    } catch (error) {
      console.error('GitHub repositories could not be loaded.', error)
      return sendJson(response, 502, { error: error.message })
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/github/import') {
    try {
      validateOrigin(request)
    } catch (error) {
      return sendJson(response, 403, { error: error.message })
    }
    const session = getSession(request)
    if (!session) return sendJson(response, 401, { error: 'Connect a GitHub account to import repositories.' })
    let body
    try {
      body = await readJsonBody(request)
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
    const repositoryId = typeof body === 'object' && body !== null ? body.repositoryId : null
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
      return sendJson(response, 400, { error: 'Choose a valid GitHub repository.' })
    }
    try {
      const repositories = await listInstallationRepositories(session)
      const repository = repositories.find((item) => item.id === repositoryId)
      if (!repository) return sendJson(response, 404, { error: 'That repository is not available to this GitHub App installation.' })
      return sendJson(response, 200, { repository })
    } catch (error) {
      console.error('The GitHub repository could not be imported.', error)
      return sendJson(response, 502, { error: error.message })
    }
  }

  return sendJson(response, 404, { error: 'GitHub API route not found.' })
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', appBase)
    if (url.pathname.startsWith('/api/github/') || url.pathname.startsWith('/api/website/')) {
      return await handleApi(request, response, url)
    }
    if (isProduction && (request.method === 'GET' || request.method === 'HEAD')) {
      return sendAppPage(request, response, url.pathname)
    }
    response.writeHead(404)
    response.end('Not found.')
  } catch (error) {
    console.error('CTRLSPACE server request failed.', error)
    if (!response.headersSent) sendJson(response, 500, { error: 'The CTRLSPACE server could not complete this request.' })
    else response.destroy()
  }
})

server.listen(port, isProduction ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`CTRLSPACE ${isProduction ? 'server' : 'GitHub API'} listening on port ${port}.`)
})
