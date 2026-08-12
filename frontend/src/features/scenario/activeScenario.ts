import { nanshanTalentScenario } from '../../../scenarios/nanshan-talent.scenario.ts';
import { compileScenario, validateScenario } from './compiler.ts';

/**
 * 当前启用的剧情。换剧情 = 换这里的导入（未来可做剧情选择器）。
 * 加载即校验，引用错误会在 console 与页面上暴露，而不是静默坏掉。
 */
const errors = validateScenario(nanshanTalentScenario);
if (errors.length > 0) {
  // eslint-disable-next-line no-console
  console.error('[scenario] 剧情文件校验失败：\n' + errors.join('\n'));
}

export const activeScenario = nanshanTalentScenario;
export const scenarioErrors = errors;
export const compiled = compileScenario(nanshanTalentScenario);
