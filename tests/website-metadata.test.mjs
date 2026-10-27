import assert from 'node:assert/strict'
import test from 'node:test'
import { extractWebsiteMetadata, isSupportedPreviewContentType } from '../server/website-metadata.mjs'

test('prefers social title, decodes entities, and resolves declared icon and preview URLs', () => {
  const html = `
    <title>Fallback title</title>
    <meta content="Research &amp; Design" property="og:title">
    <link href="/icons/app-32.png" sizes="32x32" rel="icon">
    <meta content="../images/social-card.webp" property="og:image">
  `

  assert.deepEqual(extractWebsiteMetadata(html, 'https://example.test/projects/app/'), {
    title: 'Research & Design',
    faviconUrl: 'https://example.test/icons/app-32.png',
    previewImageUrl: 'https://example.test/projects/images/social-card.webp',
  })
})

test('supports alternate attribute order, shortcut icons, and twitter metadata', () => {
  const html = `
    <meta name='twitter:title' content='Twitter title'>
    <meta name='twitter:image:src' content='https://cdn.example.test/card.jpg'>
    <link rel='shortcut icon' href='/favicon.png'>
  `

  assert.deepEqual(extractWebsiteMetadata(html, 'https://example.test/'), {
    title: 'Twitter title',
    faviconUrl: 'https://example.test/favicon.png',
    previewImageUrl: 'https://cdn.example.test/card.jpg',
  })
})

test('rejects unsafe or non-web icon and preview references', () => {
  const html = `
    <link rel="icon" href="javascript:alert(1)">
    <link rel="icon" href="https://user:secret@example.test/icon.png">
    <meta property="og:image" content="data:image/png;base64,AAAA">
  `

  assert.deepEqual(extractWebsiteMetadata(html, 'https://example.test/'), {
    title: null,
    faviconUrl: null,
    previewImageUrl: null,
  })
})

test('falls back to the document title and returns null for absent values', () => {
  assert.deepEqual(extractWebsiteMetadata('<title>  Plain &lt;title&gt;  </title>', 'https://example.test/'), {
    title: 'Plain <title>',
    faviconUrl: null,
    previewImageUrl: null,
  })
  assert.deepEqual(extractWebsiteMetadata('<html><body>Nothing here</body></html>', 'https://example.test/'), {
    title: null,
    faviconUrl: null,
    previewImageUrl: null,
  })
})

test('allows common raster preview formats but never active SVG or HTML', () => {
  assert.equal(isSupportedPreviewContentType('image/png; charset=binary'), true)
  assert.equal(isSupportedPreviewContentType('image/webp'), true)
  assert.equal(isSupportedPreviewContentType('image/svg+xml'), false)
  assert.equal(isSupportedPreviewContentType('text/html'), false)
})
