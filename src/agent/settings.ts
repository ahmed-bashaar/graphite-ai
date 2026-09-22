import { db } from '../db.ts'

export type AgentSettings = {
  /** Model calls GraphiteAI may make while working on one reply. */
  maxSteps: number
}

export const MAX_STEPS_RANGE = { min: 1, max: 50 }

export const DEFAULT_AGENT_SETTINGS: AgentSettings = { maxSteps: 12 }

export async function loadAgentSettings(): Promise<AgentSettings> {
  const stored = (await db.settings.get('agent'))?.value as Partial<AgentSettings> | undefined
  return { ...DEFAULT_AGENT_SETTINGS, ...stored }
}

/** Saves `settings`, rounding the step limit and keeping it within MAX_STEPS_RANGE. */
export async function saveAgentSettings(settings: AgentSettings): Promise<void> {
  const maxSteps = Math.min(MAX_STEPS_RANGE.max, Math.max(MAX_STEPS_RANGE.min, Math.round(settings.maxSteps)))
  await db.settings.put({ key: 'agent', value: { maxSteps } })
}
