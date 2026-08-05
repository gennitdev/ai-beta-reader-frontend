/* eslint-disable no-console -- this suite verifies the logger delegates to console.* */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    logger.resetLevel()
    vi.restoreAllMocks()
  })

  it('emits every level when set to debug', () => {
    logger.setLevel('debug')
    logger.debug('d')
    logger.info('i')
    logger.log('l')
    logger.warn('w')
    logger.error('e')

    expect(console.debug).toHaveBeenCalledWith('d')
    expect(console.info).toHaveBeenCalledWith('i')
    expect(console.log).toHaveBeenCalledWith('l')
    expect(console.warn).toHaveBeenCalledWith('w')
    expect(console.error).toHaveBeenCalledWith('e')
  })

  it('suppresses debug/info/log but keeps warn/error at warn level', () => {
    logger.setLevel('warn')
    logger.debug('d')
    logger.info('i')
    logger.log('l')
    logger.warn('w')
    logger.error('e')

    expect(console.debug).not.toHaveBeenCalled()
    expect(console.info).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('w')
    expect(console.error).toHaveBeenCalledWith('e')
  })

  it('suppresses everything below error at error level', () => {
    logger.setLevel('error')
    logger.warn('w')
    logger.error('e')

    expect(console.warn).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith('e')
  })

  it('emits nothing when silent', () => {
    logger.setLevel('silent')
    logger.error('e')
    logger.warn('w')

    expect(console.error).not.toHaveBeenCalled()
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('forwards multiple arguments', () => {
    logger.setLevel('debug')
    const err = new Error('boom')
    logger.error('failed to load', err)

    expect(console.error).toHaveBeenCalledWith('failed to load', err)
  })
})
