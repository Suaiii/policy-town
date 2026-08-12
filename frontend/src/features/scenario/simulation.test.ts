import { nanshanTalentScenario } from '../../../scenarios/nanshan-talent.scenario.ts';
import {
  compileRoundMemories,
  compileScenario,
  validateScenario,
} from './compiler.ts';
import {
  advanceRound,
  getAgentProfileSnapshot,
  getSimulationState,
  resetSimulation,
} from './simulation.ts';

describe('scenario compiler', () => {
  test('示例剧情引用校验通过', () => {
    expect(validateScenario(nanshanTalentScenario)).toEqual([]);
  });

  test('引用不存在的角色会被校验捕获', () => {
    const broken = {
      ...nanshanTalentScenario,
      relations: [{ from: 'nobody', to: 'yan-guoqiang', type: 'check' as const, label: 'x' }],
    };
    expect(validateScenario(broken).length).toBeGreaterThan(0);
  });

  test('编译产物：每个角色一份档案，关系按 from 归属', () => {
    const compiled = compileScenario(nanshanTalentScenario);
    expect(Object.keys(compiled.profiles)).toHaveLength(
      nanshanTalentScenario.roles.length,
    );
    const yan = compiled.profiles['yan-guoqiang'];
    expect(yan.relations.every((r) => r.targetId !== 'yan-guoqiang')).toBe(true);
    expect(compiled.graphEdges).toHaveLength(nanshanTalentScenario.edges.length);
  });

  test('compileRoundMemories 按角色归组', () => {
    const r1 = compileRoundMemories(nanshanTalentScenario, 1);
    expect(r1['yan-guoqiang'][0].scene).toBe('联席会 · 人才新政');
    expect(r1['song-pingan'][0].stance).toBe('oppose');
  });
});

describe('simulation engine（手动推进）', () => {
  test('推进一轮后写入状态与记忆，重置后清空', async () => {
    resetSimulation();
    expect(getSimulationState().round).toBe(0);
    expect(getAgentProfileSnapshot('yan-guoqiang')!.status.text).toBe('');

    await advanceRound();
    expect(getSimulationState().round).toBe(1);

    const yan = getAgentProfileSnapshot('yan-guoqiang')!;
    expect(yan.status.text).toBe('推进人才新政与项目落地捆绑方案');
    expect(yan.status.asOfRound).toBe(1);
    expect(yan.memories).toHaveLength(1);
    expect(yan.memories[0].scene).toBe('联席会 · 人才新政');

    // 本轮无剧情 beat 的角色不受影响
    expect(getAgentProfileSnapshot('su-xiao')!.memories).toHaveLength(0);

    resetSimulation();
    expect(getAgentProfileSnapshot('yan-guoqiang')!.memories).toHaveLength(0);
  });

  test('推进到末轮后不再前进', async () => {
    resetSimulation();
    const total = getSimulationState().totalRounds;
    for (let i = 0; i < total + 2; i += 1) {
      await advanceRound();
    }
    expect(getSimulationState().round).toBe(total);

    // 全量回放后：苏晓有记忆且最终状态为入职
    const su = getAgentProfileSnapshot('su-xiao')!;
    expect(su.memories.length).toBeGreaterThan(0);
    expect(su.status.text).toBe('入职星澜南山研发中心');
    resetSimulation();
  });
});
