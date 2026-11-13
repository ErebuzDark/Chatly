import { APP_NAME } from '@/lib/utils'

const DEFAULT_FAVICON_HREF = '/favicon.svg'

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/**
 * Generates a 64x64 PNG data URL of the Chatly favicon with a red unread number chip.
 */
function renderBadgedFaviconDataUrl(count) {
  if (typeof document === 'undefined') return DEFAULT_FAVICON_HREF
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return DEFAULT_FAVICON_HREF

  // 1. Base blue rounded square (#0a84ff)
  ctx.fillStyle = '#0a84ff'
  drawRoundedRect(ctx, 0, 0, 64, 64, 16)
  ctx.fill()

  // 2. White chat bubble icon
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  // Scaled slightly toward top-left when badge is present so both are super crisp
  const offset = count > 0 ? -3 : 0
  const bx = 16 + offset
  const by = 16 + offset
  const bw = 32
  const bh = 24
  drawRoundedRect(ctx, bx, by, bw, bh, 6)
  ctx.fill()

  // Chat bubble tail
  ctx.beginPath()
  ctx.moveTo(bx + 6, by + bh - 1)
  ctx.lineTo(bx + 6, by + bh + 8)
  ctx.lineTo(bx + 16, by + bh - 1)
  ctx.closePath()
  ctx.fill()

  // 3. Red notification badge chip in bottom-right corner
  if (count > 0) {
    const label = count > 99 ? '99+' : String(count)
    const isWide = label.length >= 2
    const badgeH = 30
    const badgeW = label.length >= 3 ? 44 : isWide ? 36 : 30
    const badgeX = 64 - badgeW
    const badgeY = 64 - badgeH
    const radius = badgeH / 2

    // Dark outer cutout border for contrast against the blue icon & browser tab bar
    ctx.fillStyle = '#0f1014'
    drawRoundedRect(ctx, badgeX - 3, badgeY - 3, badgeW + 3, badgeH + 3, radius + 2)
    ctx.fill()

    // Bright red pill (#ef4444)
    ctx.fillStyle = '#ef4444'
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, radius)
    ctx.fill()

    // Bold white unread count text
    ctx.fillStyle = '#ffffff'
    ctx.font = `900 ${label.length >= 3 ? 16 : isWide ? 18 : 20}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1)
  }

  return canvas.toDataURL('image/png')
}

/**
 * Updates the browser tab's <link rel="icon"> and PWA app badge with the unread count.
 */
export function updateTabFaviconBadge(unreadCount = 0) {
  if (typeof document === 'undefined') return

  let link = document.querySelector("link[rel*='icon']")
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    document.head.appendChild(link)
  }

  if (unreadCount > 0) {
    link.type = 'image/png'
    link.href = renderBadgedFaviconDataUrl(unreadCount)
  } else {
    link.type = 'image/svg+xml'
    link.href = DEFAULT_FAVICON_HREF
  }

  // Also update PWA / OS taskbar badge if supported by Chrome
  if (typeof navigator !== 'undefined') {
    if (unreadCount > 0 && typeof navigator.setAppBadge === 'function') {
      navigator.setAppBadge(unreadCount).catch(() => {})
    } else if (unreadCount <= 0 && typeof navigator.clearAppBadge === 'function') {
      navigator.clearAppBadge().catch(() => {})
    }
  }
}

/**
 * Formats the steady Chrome tab title with unread count.
 */
export function getSteadyTabTitle(unreadCount = 0) {
  return unreadCount > 0 ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${APP_NAME}` : APP_NAME
}

