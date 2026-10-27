import { describe, it, expect } from 'vitest'
import { hasCycle } from './chain-graph'

const steps = ['a', 'b', 'c', 'd'].map((nodeKey) => ({ nodeKey }))

describe('hasCycle', () => {
  it('accepts a DAG (diamond)', () => {
    expect(
      hasCycle(steps, [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'd' },
        { from: 'c', to: 'd' },
      ])
    ).toBe(false)
  })

  it('detects a cycle', () => {
    expect(
      hasCycle(steps, [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'c', to: 'a' },
      ])
    ).toBe(true)
  })

  it('detects a self-loop', () => {
    expect(hasCycle(steps, [{ from: 'a', to: 'a' }])).toBe(true)
  })
})
