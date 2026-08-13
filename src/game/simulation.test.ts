import { describe, expect, it } from 'vitest'
import {
  enterApplications,
  enterEnterpriseMeeting,
  initialState,
  openAllocation,
  openAnalysis,
  continueSimulation,
  revealEvent,
  settleRound,
  selectEnterprise,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from './simulation'

describe('fiscal competition simulation', () => {
  it('preserves the phase order and rejects premature transitions', () => {
    expect(openAnalysis(initialState)).toEqual(initialState)

    const applications = enterApplications(initialState)
    const analysis = openAnalysis(applications)
    const allocation = openAllocation(analysis)

    expect(applications.phase).toBe('applications')
    expect(analysis.phase).toBe('analysis')
    expect(allocation.phase).toBe('allocation')
  })

  it('enforces the fiscal pool across competing enterprises', () => {
    let state = openAllocation(openAnalysis(enterApplications(initialState)))
    state = updateAllocation(state, 'enterprise-a', 60)
    state = updateAllocation(state, 'enterprise-b', 60)

    expect(state.enterprises.find((enterprise) => enterprise.id === 'enterprise-a')?.allocation).toBe(60)
    expect(state.enterprises.find((enterprise) => enterprise.id === 'enterprise-b')?.allocation).toBe(40)
    expect(state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0)).toBe(100)
  })

  it('requires support tools and produces deterministic enterprise responses', () => {
    let state = openAllocation(openAnalysis(enterApplications(initialState)))
    state = updateAllocation(state, 'enterprise-a', 42)
    expect(submitDecision(state)).toEqual(state)

    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure')
    state = submitDecision(state)

    expect(state.phase).toBe('response')
    expect(state.enterprises[0].action).toBe('扩建并研发')
    expect(state.enterprises[0].actionReason).toBeTruthy()
    expect(state.resources.fiscal).toBe(58)
  })

  it('selects only enterprises that exist in the current state', () => {
    const selected = selectEnterprise(initialState, 'enterprise-c')
    expect(selected.selectedEnterpriseId).toBe('enterprise-c')

    const meeting = enterEnterpriseMeeting(selected, 'enterprise-c')
    expect(meeting.selectedEnterpriseId).toBe('enterprise-c')
    expect(meeting.cameraMode).toBe('meeting')
  })

  it('increments settlement revision only on settlement and keeps physical construction monotonic', () => {
    let state = openAllocation(openAnalysis(enterApplications(initialState)))
    state = updateAllocation(state, 'enterprise-a', 42)
    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure')
    state = submitDecision(state)
    expect(state.settlementRevision).toBe(0)
    state = revealEvent(state)
    expect(state.settlementRevision).toBe(0)
    state = settleRound(state)
    expect(state.settlementRevision).toBe(1)
    expect(state.enterprises[0].builtProgress).toBe(30)
    expect(state.enterprises[0].lastSettlementDelta.employment).toBe(12)
  })

  it('persists stalled lifecycle and built progress across round changes', () => {
    let state = openAllocation(openAnalysis(enterApplications(initialState)))
    state = updateAllocation(state, 'enterprise-a', 1)
    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = submitDecision(state)
    state = settleRound(revealEvent(state))
    const stalled = state.enterprises.find((enterprise) => enterprise.id === 'enterprise-b')!
    expect(stalled.lifecycle).toBe('stalled')
    const builtProgress = stalled.builtProgress
    state = continueSimulation(state)
    const nextRound = state.enterprises.find((enterprise) => enterprise.id === 'enterprise-b')!
    expect(nextRound.lifecycle).toBe('stalled')
    expect(nextRound.builtProgress).toBe(builtProgress)
  })
})
