import { describe, it, expect } from 'vitest'
import { chainJobInsertValues } from './chain-job'

describe('chainJobInsertValues', () => {
  it('includes issued_by from the chain run creator', () => {
    const row = chainJobInsertValues('srv-1', 'uptime', 'step-1', 'user-42')
    expect(row.issued_by).toBe('user-42')
    expect(row.status).toBe('queued')
    expect(row.chain_run_step_id).toBe('step-1')
  })

  it('allows null issued_by', () => {
    expect(chainJobInsertValues('s', 'c', 'st', null).issued_by).toBeNull()
  })
})
