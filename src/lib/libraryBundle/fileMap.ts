export type BundleFileMap = Map<string, Uint8Array>
export type ReadonlyBundleFileMap = ReadonlyMap<string, Uint8Array>

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export function encodeBundleText(value: string): Uint8Array {
  return textEncoder.encode(value)
}

export function decodeBundleText(value: Uint8Array): string {
  return textDecoder.decode(value)
}

export function sortedBundlePaths(files: ReadonlyBundleFileMap): string[] {
  return [...files.keys()].sort((left, right) => left.localeCompare(right))
}
