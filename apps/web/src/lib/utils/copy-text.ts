/**
 * Puts text on the clipboard. The clipboard API exists only on a secure page: https, or localhost. The dashboard is
 * often opened over plain http at a network address, such as a master reached from another computer, where
 * `navigator.clipboard` is missing and the old way is the only one. That way has to run in the click that asked for
 * it, so it is tried first on such a page, before anything is awaited. Resolves to whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  // The API is only there on a secure page, so its presence is the test.
  const modern = typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText
  if (modern) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Refused, such as when the page is not in focus: try the old way.
    }
  }
  return copyWithSelection(text)
}

function copyWithSelection(text: string): boolean {
  if (typeof document === 'undefined') return false
  const field = document.createElement('textarea')
  field.value = text
  // Out of sight, and not zoomed into on a phone, but still selectable.
  field.setAttribute('readonly', '')
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px'
  const active = document.activeElement as HTMLElement | null
  document.body.appendChild(field)
  try {
    field.select()
    field.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(field)
    active?.focus?.()
  }
}
