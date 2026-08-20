import { beforeEach, describe, expect, it } from 'vitest'
import {
  isRetryingPersistence,
  persistenceError,
  reportPersistenceFailure,
  reportPersistenceSuccess,
} from '@/lib/persistenceStatus'

beforeEach(() => {
  reportPersistenceSuccess()
  isRetryingPersistence.value = false
})

describe('persistence status', () => {
  it('exposes actionable copy when a durable write fails', () => {
    reportPersistenceFailure()

    expect(persistenceError.value).toContain('could not be saved')
    expect(persistenceError.value).toContain('Keep the app open and retry')
  })

  it('clears the failure only when persistence succeeds', () => {
    reportPersistenceFailure()
    reportPersistenceSuccess()

    expect(persistenceError.value).toBeNull()
  })
})
