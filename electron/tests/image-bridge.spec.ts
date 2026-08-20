import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopImageBridge } from '../src/image-bridge'
import {
  dialog,
  getIpcHandler,
  ipcMain,
  resetElectronMock,
} from './mocks/electron'

const fsMocks = vi.hoisted(() => ({
  copyFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
}))
const cryptoMocks = vi.hoisted(() => ({
  randomUUID: vi.fn(() => 'image-id'),
}))

vi.mock('node:fs/promises', () => fsMocks)
vi.mock('node:crypto', () => cryptoMocks)

describe('Electron desktop-image bridge runtime', () => {
  beforeEach(() => {
    resetElectronMock()
    cryptoMocks.randomUUID.mockReturnValue('image-id')
    fsMocks.copyFile.mockResolvedValue(undefined)
    fsMocks.mkdir.mockResolvedValue(undefined)
    fsMocks.readFile.mockResolvedValue(Buffer.from('image-bytes'))
    fsMocks.rm.mockResolvedValue(undefined)
    fsMocks.stat.mockResolvedValue({
      size: 123,
      mtime: new Date('2026-08-20T12:00:00.000Z'),
    })
    fsMocks.writeFile.mockResolvedValue(undefined)
    registerDesktopImageBridge()
  })

  it('registers the complete desktop-image IPC surface', () => {
    expect(ipcMain.handle.mock.calls.map(([channel]) => channel)).toEqual([
      'desktop-images:pick-chapter',
      'desktop-images:pick-cover',
      'desktop-images:read',
      'desktop-images:delete',
      'desktop-images:metadata',
      'desktop-images:write',
    ])
  })

  it('validates identifiers and returns canceled picker results', async () => {
    await expect(getIpcHandler('desktop-images:pick-chapter')(null, {
      bookId: 'book-1',
    })).rejects.toThrow('Missing identifiers')
    await expect(getIpcHandler('desktop-images:pick-cover')(null, {})).rejects.toThrow(
      'Missing book identifier',
    )

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(getIpcHandler('desktop-images:pick-chapter')(null, {
      bookId: 'book-1',
      chapterId: 'chapter-1',
    })).resolves.toEqual({ canceled: true, images: [] })

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] })
    await expect(getIpcHandler('desktop-images:pick-cover')(null, {
      bookId: 'book-1',
    })).resolves.toEqual({ canceled: true })
  })

  it('copies selected chapter images into sanitized library paths', async () => {
    cryptoMocks.randomUUID
      .mockReturnValueOnce('first-id')
      .mockReturnValueOnce('second-id')
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/source/first.JPG', '/source/no-extension'],
    })

    await expect(getIpcHandler('desktop-images:pick-chapter')(null, {
      bookId: 'book/one',
      chapterId: 'chapter?',
    })).resolves.toEqual({
      canceled: false,
      images: [
        {
          id: 'first-id',
          fileName: 'first-id.jpg',
          relativePath: path.join('books', 'book_one', 'chapters', 'chapter_', 'first-id.jpg'),
          mimeType: 'image/jpeg',
        },
        {
          id: 'second-id',
          fileName: 'second-id.png',
          relativePath: path.join('books', 'book_one', 'chapters', 'chapter_', 'second-id.png'),
          mimeType: 'image/png',
        },
      ],
    })

    const chapterDirectory = path.join(
      '/tmp/beta-bot-user-data',
      'images',
      'books',
      'book_one',
      'chapters',
      'chapter_',
    )
    expect(fsMocks.mkdir).toHaveBeenCalledWith(chapterDirectory, { recursive: true })
    expect(fsMocks.copyFile).toHaveBeenNthCalledWith(
      1,
      '/source/first.JPG',
      path.join(chapterDirectory, 'first-id.jpg'),
    )
    expect(fsMocks.copyFile).toHaveBeenNthCalledWith(
      2,
      '/source/no-extension',
      path.join(chapterDirectory, 'second-id.png'),
    )
  })

  it('copies a selected cover into the book cover directory', async () => {
    dialog.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['/source/cover.webp'],
    })

    const result = await getIpcHandler('desktop-images:pick-cover')(null, { bookId: 'book-1' })

    expect(result).toEqual({
      canceled: false,
      image: {
        id: 'image-id',
        fileName: 'image-id.webp',
        relativePath: path.join('books', 'book-1', 'covers', 'image-id.webp'),
        mimeType: 'image/webp',
      },
    })
  })

  it('reads contained images and derives a safe MIME type', async () => {
    const relativePath = path.join('books', 'book-1', 'covers', 'cover.png')

    await expect(getIpcHandler('desktop-images:read')(null, {
      relativePath,
      mimeType: 'text/html',
    })).resolves.toEqual({
      dataUrl: `data:image/png;base64,${Buffer.from('image-bytes').toString('base64')}`,
    })
    expect(fsMocks.readFile).toHaveBeenCalledWith(path.join(
      '/tmp/beta-bot-user-data',
      'images',
      relativePath,
    ))

    await expect(getIpcHandler('desktop-images:read')(null, {
      relativePath: 'books/book-1/unknown.bin',
    })).resolves.toEqual({
      dataUrl: `data:application/octet-stream;base64,${Buffer.from('image-bytes').toString('base64')}`,
    })
  })

  it('rejects missing and escaping image reads', async () => {
    await expect(getIpcHandler('desktop-images:read')(null, {})).rejects.toThrow('Missing image path')
    await expect(getIpcHandler('desktop-images:read')(null, {
      relativePath: '../outside.png',
    })).rejects.toThrow('escapes')
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })

  it('deletes contained images and reports deletion failures', async () => {
    expect(await getIpcHandler('desktop-images:delete')(null, {})).toEqual({ success: false })
    await expect(getIpcHandler('desktop-images:delete')(null, {
      relativePath: 'books/book-1/cover.png',
    })).resolves.toEqual({ success: true })

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fsMocks.rm.mockRejectedValueOnce(new Error('locked'))
    await expect(getIpcHandler('desktop-images:delete')(null, {
      relativePath: 'books/book-1/cover.png',
    })).resolves.toEqual({ success: false })
  })

  it('returns image metadata from the contained file', async () => {
    await expect(getIpcHandler('desktop-images:metadata')(null, {
      relativePath: 'books/book-1/cover.png',
    })).resolves.toEqual({
      size: 123,
      updatedAt: '2026-08-20T12:00:00.000Z',
    })
  })

  it('writes validated image data into a contained library directory', async () => {
    const relativePath = path.join('books', 'book-1', 'covers', 'restored.png')
    const dataUrl = `data:image/png;base64,${Buffer.from('restored-image').toString('base64')}`

    await expect(getIpcHandler('desktop-images:write')(null, {
      relativePath,
      dataUrl,
    })).resolves.toEqual({ success: true })

    const absolutePath = path.join('/tmp/beta-bot-user-data', 'images', relativePath)
    expect(fsMocks.mkdir).toHaveBeenCalledWith(path.dirname(absolutePath), { recursive: true })
    expect(fsMocks.writeFile).toHaveBeenCalledWith(absolutePath, Buffer.from('restored-image'))
  })

  it('rejects incomplete, unsafe, and escaping image writes', async () => {
    await expect(getIpcHandler('desktop-images:write')(null, {
      relativePath: 'books/book-1/image.png',
    })).rejects.toThrow('Missing image path or data')
    await expect(getIpcHandler('desktop-images:write')(null, {
      relativePath: 'books/book-1/image.svg',
      dataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    })).rejects.toThrow('unsupported image')
    await expect(getIpcHandler('desktop-images:write')(null, {
      relativePath: '../outside.png',
      dataUrl: 'data:image/png;base64,aGVsbG8=',
    })).rejects.toThrow('escapes')
    expect(fsMocks.writeFile).not.toHaveBeenCalled()
  })
})
