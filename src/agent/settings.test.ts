import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db.ts'
import { DEFAULT_AGENT_SETTINGS, loadAgentSettings, MAX_STEPS_RANGE, saveAgentSettings } from './settings.ts'

describe('agent settings', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('defaults to 12 steps per reply', async () => {
    expect(DEFAULT_AGENT_SETTINGS.maxSteps).toBe(12)
    expect(await loadAgentSettings()).toEqual(DEFAULT_AGENT_SETTINGS)
  })

  it('saves and loads the step limit', async () => {
    await saveAgentSettings({ maxSteps: 5 })
    expect(await loadAgentSettings()).toEqual({ maxSteps: 5 })
  })

  it('keeps the step limit within range', async () => {
    await saveAgentSettings({ maxSteps: 0 })
    expect((await loadAgentSettings()).maxSteps).toBe(MAX_STEPS_RANGE.min)
    await saveAgentSettings({ maxSteps: 999 })
    expect((await loadAgentSettings()).maxSteps).toBe(MAX_STEPS_RANGE.max)
    await saveAgentSettings({ maxSteps: 7.6 })
    expect((await loadAgentSettings()).maxSteps).toBe(8)
  })
})
