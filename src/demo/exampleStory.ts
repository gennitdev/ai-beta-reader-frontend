import { readBundleZip } from '@/lib/libraryBundle/adapters/zip'
import type { CanonicalLibraryModel } from '@/lib/libraryBundle/model'
import { readLibraryBundle } from '@/lib/libraryBundle/read'
import { validateLibraryBundle } from '@/lib/libraryBundle/validate'
import exampleStoryBundleUrl from '@/demo/stories/jack-and-the-beanstalk.zip?url'

export interface ExampleStory {
  model: CanonicalLibraryModel
  imageUrl(assetId: string | null | undefined): string | null
}

export async function readExampleStory(bytes: Uint8Array): Promise<ExampleStory> {
  const transport = await readBundleZip(bytes)
  if (!transport.files) throw new Error('The example story archive could not be opened.')

  const validated = await validateLibraryBundle(readLibraryBundle(transport.files), transport.files)
  if (!validated.model || validated.diagnostics.some((item) => item.severity === 'error')) {
    throw new Error('The example story fixture is invalid.')
  }

  const imageUrls = new Map<string, string>()
  const assets = new Map(validated.model.assets.map((asset) => [asset.id, asset]))
  return {
    model: validated.model,
    imageUrl(assetId) {
      if (!assetId) return null
      const existing = imageUrls.get(assetId)
      if (existing) return existing
      const asset = assets.get(assetId)
      if (!asset?.bytes) return null
      const url = URL.createObjectURL(new Blob([asset.bytes as BlobPart], {
        type: asset.mime_type ?? 'application/octet-stream',
      }))
      imageUrls.set(assetId, url)
      return url
    },
  }
}

let storyPromise: Promise<ExampleStory> | null = null

/** Load the bundled example without touching the user's database. */
export function loadExampleStory(fetcher: typeof fetch = fetch): Promise<ExampleStory> {
  storyPromise ??= fetcher(exampleStoryBundleUrl)
    .then((response) => {
      if (!response.ok) throw new Error('The example story could not be loaded.')
      return response.arrayBuffer()
    })
    .then((buffer) => readExampleStory(new Uint8Array(buffer)))
  return storyPromise
}

export function resetExampleStoryForTest(): void {
  storyPromise = null
}
