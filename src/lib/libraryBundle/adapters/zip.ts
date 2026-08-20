import JSZip from 'jszip'
import { sortedBundlePaths, type ReadonlyBundleFileMap } from '../fileMap'

const DETERMINISTIC_ZIP_DATE = new Date('1980-01-01T00:00:00.000Z')

export async function createBundleZip(files: ReadonlyBundleFileMap): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const path of sortedBundlePaths(files)) {
    zip.file(path, files.get(path)!, {
      binary: true,
      createFolders: false,
      date: DETERMINISTIC_ZIP_DATE,
      unixPermissions: 0o100644,
    })
  }

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'UNIX',
  })
}

export async function readBundleZipForTest(zipBytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(zipBytes)
  const files = new Map<string, Uint8Array>()
  const paths = Object.keys(zip.files).filter((path) => !zip.files[path].dir).sort()
  for (const path of paths) files.set(path, await zip.files[path].async('uint8array'))
  return files
}
