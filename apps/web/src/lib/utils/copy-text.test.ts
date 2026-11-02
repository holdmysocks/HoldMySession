import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copy-text'

describe('copyText', () => {
  const original = { clipboard: Object.getOwnPropertyDescriptor(navigator, 'clipboard') }
  const setClipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { value, configurable: true })

  beforeEach(() => {
    document.execCommand = vi.fn(() => true)
  })
  afterEach(() => {
    if (original.clipboard) Object.defineProperty(navigator, 'clipboard', original.clipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.restoreAllMocks()
  })

  it('uses the clipboard API on a secure page', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard({ writeText })
    expect(await copyText('hms1-abc')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hms1-abc')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('selects and copies on a page that is not secure, where there is no clipboard API', async () => {
    setClipboard(undefined)
    let copied = ''
    document.execCommand = vi.fn(() => {
      copied = document.querySelector('textarea')?.value ?? ''
      return true
    })
    expect(await copyText('hms1-abc')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe('hms1-abc')
  })

  it('falls back to selecting when the clipboard API refuses', async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('not focused')) })
    expect(await copyText('x')).toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('says so when nothing worked, and leaves no stray field behind', async () => {
    setClipboard(undefined)
    document.execCommand = vi.fn(() => false)
    expect(await copyText('x')).toBe(false)
    document.execCommand = vi.fn(() => {
      throw new Error('blocked')
    })
    expect(await copyText('x')).toBe(false)
    expect(document.querySelectorAll('textarea').length).toBe(0)
  })

  it('puts focus back where it was', async () => {
    setClipboard(undefined)
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    await copyText('x')
    expect(document.activeElement).toBe(button)
    button.remove()
  })
})
