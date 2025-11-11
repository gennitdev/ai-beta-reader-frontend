export interface DesktopImageMetadata {
  id: string;
  fileName: string;
  relativePath: string;
  mimeType: string | null;
}

export interface DesktopImagesBridge {
  pickChapterImages: (payload: { bookId: string; chapterId: string; allowMultiple?: boolean }) => Promise<{
    canceled: boolean;
    images: DesktopImageMetadata[];
  }>;
  pickBookCover: (payload: { bookId: string }) => Promise<{
    canceled: boolean;
    image?: DesktopImageMetadata;
  }>;
  readImageData: (payload: { relativePath: string; mimeType?: string | null }) => Promise<{
    dataUrl: string;
  }>;
  deleteImageFile: (payload: { relativePath: string }) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    desktopImages?: DesktopImagesBridge;
  }
}
