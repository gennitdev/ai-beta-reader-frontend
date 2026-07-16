export interface PersistenceCoordinatorOptions {
  exportSnapshot: () => Uint8Array
  writeSnapshot: (snapshot: Uint8Array) => Promise<void>
  onBackgroundError?: (error: unknown) => void
}

export function decodeLegacyDatabaseSnapshot(serialized: string): Uint8Array {
  if (serialized.startsWith('[')) {
    const parsed: unknown = JSON.parse(serialized)
    if (
      !Array.isArray(parsed)
      || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
    ) {
      throw new Error('Legacy database JSON must contain byte values.')
    }
    return Uint8Array.from(parsed)
  }

  const binary = atob(serialized)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * Serializes sql.js snapshot writes and coalesces mutations that happen while a
 * write is in flight. Callers that require durability should await flush().
 */
export class PersistenceCoordinator {
  private requestedRevision = 0
  private persistedRevision = 0
  private activeWrite: Promise<void> | null = null
  private lastWriteFailed = false

  constructor(private readonly options: PersistenceCoordinatorOptions) {}

  request(): void {
    this.requestedRevision += 1

    if (!this.activeWrite) {
      this.startWrite().catch((error: unknown) => {
        this.options.onBackgroundError?.(error)
      })
    }
  }

  async flush(): Promise<void> {
    while (this.persistedRevision < this.requestedRevision) {
      await (this.activeWrite ?? this.startWrite())
    }
  }

  hasPendingChanges(): boolean {
    return this.persistedRevision < this.requestedRevision
  }

  private startWrite(): Promise<void> {
    if (this.activeWrite) return this.activeWrite

    this.lastWriteFailed = false
    const write = this.drainWrites()
    const trackedWrite = write.finally(() => {
      if (this.activeWrite === trackedWrite) {
        this.activeWrite = null
      }

      // A request can arrive after drainWrites observes a clean state but
      // before its promise settles. Start that newly requested write here.
      if (!this.lastWriteFailed && this.persistedRevision < this.requestedRevision) {
        this.startWrite().catch((error: unknown) => {
          this.options.onBackgroundError?.(error)
        })
      }
    })

    this.activeWrite = trackedWrite
    return trackedWrite
  }

  private async drainWrites(): Promise<void> {
    try {
      while (this.persistedRevision < this.requestedRevision) {
        const targetRevision = this.requestedRevision
        const snapshot = this.options.exportSnapshot()
        await this.options.writeSnapshot(snapshot)
        this.persistedRevision = targetRevision
      }
    } catch (error) {
      this.lastWriteFailed = true
      throw error
    }
  }
}
