import { describe, expect, it } from 'vitest'
import {
  enterApplications,
  enterEnterpriseMeeting,
  finalizeNegotiation,
  initialState,
  openAllocation,
  openAnalysis,
  continueSimulation,
  revealEvent,
  randomEnterpriseIds,
  settleRound,
  selectEnterprise,
  startSimulation,
  submitDecision,
  toggleSupportTool,
  updateAllocation,
} from './simulation'

describe('fiscal competition simulation', () => {
  const started = () => startSimulation(initialState)

  it('keeps the frozen two-enterprise set regardless of the auditable run seed', () => {
    const seed = 20260813
    const startedState = startSimulation(initialState, seed)

    expect(startedState.setupRandomSeed).toBe(seed)
    expect(startedState.setupEnterpriseIds).toEqual(randomEnterpriseIds(seed))
    expect(startedState.enterprises.map((enterprise) => enterprise.id)).toEqual(randomEnterpriseIds(seed))
    expect(startedState.enterprises).toHaveLength(2)
    expect(startSimulation(startedState, seed + 1)).toBe(startedState)
  })

  it('never creates a third active enterprise seat', () => {
    expect(randomEnterpriseIds(0)).toEqual(['enterprise-a', 'enterprise-b'])
    expect(randomEnterpriseIds(20260813)).toEqual(['enterprise-a', 'enterprise-b'])
    expect(randomEnterpriseIds(20260814)).toEqual(['enterprise-a', 'enterprise-b'])
  })

  it('preserves the phase order and rejects premature transitions', () => {
    expect(openAnalysis(initialState)).toEqual(initialState)

    const applications = enterApplications(started())
    const analysis = openAnalysis(applications)
    const allocation = openAllocation(analysis)

    expect(applications.phase).toBe('applications')
    expect(analysis.phase).toBe('analysis')
    expect(analysis.cameraMode).toBe('table')
    expect(allocation.phase).toBe('allocation')
  })

  it('enforces the fiscal pool across competing enterprises', () => {
    let state = openAllocation(openAnalysis(enterApplications(started())))
    state = updateAllocation(state, 'enterprise-a', 60)
    state = updateAllocation(state, 'enterprise-b', 60)

    expect(state.enterprises.find((enterprise) => enterprise.id === 'enterprise-a')?.allocation).toBe(60)
    expect(state.enterprises.find((enterprise) => enterprise.id === 'enterprise-b')?.allocation).toBe(40)
    expect(state.enterprises.reduce((sum, enterprise) => sum + enterprise.allocation, 0)).toBe(100)
  })

  it('requires support tools and produces deterministic enterprise responses', () => {
    let state = openAllocation(openAnalysis(enterApplications(started())))
    state = updateAllocation(state, 'enterprise-a', 42)
    expect(submitDecision(state)).toEqual(state)

    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure')
    state = finalizeNegotiation(state, 'enterprise-a', ['按建设里程碑分期拨付'])
    state = submitDecision(state)

    expect(state.phase).toBe('response')
    expect(state.enterprises[0].action).toBe('扩建并研发')
    expect(state.enterprises[0].actionReason).toBeTruthy()
    expect(state.resources.fiscal).toBe(58)
  })

  it('selects only enterprises that exist in the current state', () => {
    const rejected = selectEnterprise(initialState, 'enterprise-c')
    expect(rejected.selectedEnterpriseId).toBe('enterprise-a')

    const selected = selectEnterprise(initialState, 'enterprise-b')
    const meeting = enterEnterpriseMeeting(selected, 'enterprise-b')
    expect(meeting.selectedEnterpriseId).toBe('enterprise-b')
    expect(meeting.cameraMode).toBe('meeting')
  })

  it('increments settlement revision only on settlement and keeps physical construction monotonic', () => {
    let state = openAllocation(openAnalysis(enterApplications(started())))
    state = updateAllocation(state, 'enterprise-a', 42)
    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = toggleSupportTool(state, 'enterprise-a', 'infrastructure')
    state = finalizeNegotiation(state, 'enterprise-a', ['按建设里程碑分期拨付'])
    state = submitDecision(state)
    expect(state.settlementRevision).toBe(0)
    state = revealEvent(state)
    expect(state.settlementRevision).toBe(0)
    state = settleRound(state)
    expect(state.settlementRevision).toBe(1)
    expect(state.enterprises[0].builtProgress).toBe(22)
    expect(state.enterprises[0].lastSettlementDelta.employment).toBe(12)
  })

  it('persists stalled lifecycle and built progress across round changes', () => {
    let state = openAllocation(openAnalysis(enterApplications(started())))
    state = updateAllocation(state, 'enterprise-a', 1)
    state = toggleSupportTool(state, 'enterprise-a', 'investment')
    state = finalizeNegotiation(state, 'enterprise-a', ['未达里程碑暂停追加'])
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

  it('runs S1 through S4 in order, persists immutable snapshots, then enters the finale', () => {
    let state = started()

    for (const expectedStage of ['S1', 'S2', 'S3', 'S4']) {
      state = openAllocation(openAnalysis(enterApplications(state)))
      const selected = state.enterprises[0]
      state = updateAllocation(state, selected.id, 42)
      state = toggleSupportTool(state, selected.id, 'investment')
      state = toggleSupportTool(state, selected.id, 'infrastructure')
      state = finalizeNegotiation(state, selected.id, ['按建设里程碑分期拨付'])
      state = settleRound(revealEvent(submitDecision(state)))

      expect(state.stageSnapshots.at(-1)?.stageCode).toBe(expectedStage)
      expect(state.stageSnapshots.at(-1)?.enterprises).not.toBe(state.enterprises)
      state = continueSimulation(state)
    }

    expect(state.phase).toBe('result')
    expect(state.stageSnapshots.map((snapshot) => snapshot.stageCode)).toEqual(['S1', 'S2', 'S3', 'S4'])
    expect(new Set(state.stageSnapshots.map((snapshot) => snapshot.decisionId)).size).toBe(4)
  })
})
