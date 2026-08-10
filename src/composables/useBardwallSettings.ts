import { ref, watch, type Ref } from 'vue'

export const BARDWALL_ENABLED_STORAGE_KEY = 'bardwall_enabled'

const bardwallEnabled = ref(true)

function readBardwallEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(BARDWALL_ENABLED_STORAGE_KEY) !== 'false'
}

watch(bardwallEnabled, (enabled) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(BARDWALL_ENABLED_STORAGE_KEY, String(enabled))
  }
})

/**
 * Controls whether Bardwall is promoted in the app navigation. This preference
 * is enabled by default and intentionally does not affect routes or game data.
 */
export function useBardwallSettings(): { bardwallEnabled: Ref<boolean> } {
  bardwallEnabled.value = readBardwallEnabled()
  return { bardwallEnabled }
}
