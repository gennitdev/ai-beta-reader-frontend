import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'

/**
 * Copy text to clipboard with native support for mobile apps.
 * Uses Capacitor's native clipboard plugin on iOS/Android for reliable
 * large text copying, falls back to web APIs on other platforms.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Use native clipboard on iOS/Android for reliable large text copying
  if (Capacitor.isNativePlatform()) {
    try {
      await Clipboard.write({ string: text })
      return true
    } catch (error) {
      console.error('Native clipboard write failed:', error)
      // Fall through to web fallbacks
    }
  }

  // Try ClipboardItem API (better for large content on some browsers)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const blob = new Blob([text], { type: 'text/plain' })
      const clipboardItem = new ClipboardItem({ 'text/plain': blob })
      await navigator.clipboard.write([clipboardItem])
      return true
    } catch (error) {
      // ClipboardItem may not work in all contexts, fall through
      console.warn('ClipboardItem write failed, trying writeText:', error)
    }
  }

  // Try standard clipboard API
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.warn('clipboard.writeText failed, trying execCommand:', error)
    }
  }

  // Final fallback: execCommand with textarea
  return fallbackCopy(text)
}

/**
 * Fallback copy using execCommand and a temporary textarea.
 * This is the most compatible method but may have size limitations on mobile.
 */
function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text

  // Prevent scrolling and keyboard popup on mobile
  textarea.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 2em;
    height: 2em;
    padding: 0;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    font-size: 16px;
  `

  document.body.appendChild(textarea)

  // iOS-specific handling
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  if (isIOS) {
    textarea.contentEditable = 'true'
    textarea.readOnly = false
    const range = document.createRange()
    range.selectNodeContents(textarea)
    const selection = window.getSelection()
    if (selection) {
      selection.removeAllRanges()
      selection.addRange(range)
    }
    textarea.setSelectionRange(0, text.length)
  } else {
    textarea.focus()
    textarea.select()
  }

  let success = false
  try {
    success = document.execCommand('copy')
  } catch (error) {
    console.error('execCommand copy failed:', error)
  }

  document.body.removeChild(textarea)
  return success
}
