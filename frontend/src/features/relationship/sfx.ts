/**
 * 合成音效：打开 Agent 档案时的紧张感一击。
 * 纯 WebAudio 合成（上行 riser + 清脆金属敲击 + 高频噪声 attack），无外部素材、零版权风险。
 * 首次调用由点击手势触发，不涉及自动播放限制。
 */

export type CardSoundKind = 'open' | 'switch';

let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') {
      void audioContext.resume();
    }
    return audioContext;
  } catch {
    return null;
  }
}

/** 生成一段带衰减包络的白噪声 buffer，用于重拍的 attack。 */
function noiseBurst(ac: AudioContext, duration: number): AudioBuffer {
  const length = Math.floor(ac.sampleRate * duration);
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  return buffer;
}

/**
 * open：0.18s 上行 riser 后接清脆的金属敲击（档案首次展开）。
 * switch：无 riser、更轻更弱的敲击（档案已打开、切换角色时避免听觉轰炸）。
 */
export function playCardOpenSound(kind: CardSoundKind = 'open'): void {
  const ac = getContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.45;
    master.connect(ac.destination);

    if (kind === 'open') {
      // riser：方波经带通扫频，更亮的上行紧张感
      const osc = ac.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, t0);
      osc.frequency.exponentialRampToValueAtTime(1400, t0 + 0.18);
      const bandpass = ac.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.value = 3;
      bandpass.frequency.setValueAtTime(600, t0);
      bandpass.frequency.exponentialRampToValueAtTime(3600, t0 + 0.18);
      const riserGain = ac.createGain();
      riserGain.gain.setValueAtTime(0.0001, t0);
      riserGain.gain.exponentialRampToValueAtTime(0.16, t0 + 0.12);
      riserGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      osc.connect(bandpass).connect(riserGain).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.24);
    }

    const t = kind === 'open' ? t0 + 0.16 : t0;

    // hit：短促的中高频下扫（清脆主体），卡在抽屉滑入动画上
    const hit = ac.createOscillator();
    hit.type = 'triangle';
    hit.frequency.setValueAtTime(kind === 'open' ? 520 : 420, t);
    hit.frequency.exponentialRampToValueAtTime(140, t + 0.14);
    const hitGain = ac.createGain();
    hitGain.gain.setValueAtTime(kind === 'open' ? 0.5 : 0.28, t);
    hitGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    hit.connect(hitGain).connect(master);
    hit.start(t);
    hit.stop(t + 0.22);

    // ping：高频金属泛音快速衰减，提供"清脆"的敲击感
    const ping = ac.createOscillator();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(kind === 'open' ? 1560 : 1240, t);
    const pingGain = ac.createGain();
    pingGain.gain.setValueAtTime(kind === 'open' ? 0.22 : 0.12, t);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    ping.connect(pingGain).connect(master);
    ping.start(t);
    ping.stop(t + 0.14);

    // attack：更短更高的噪声瞬态，强化"脆"感
    const src = ac.createBufferSource();
    src.buffer = noiseBurst(ac, 0.045);
    const highpass = ac.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 2600;
    const attackGain = ac.createGain();
    attackGain.gain.value = kind === 'open' ? 0.3 : 0.14;
    src.connect(highpass).connect(attackGain).connect(master);
    src.start(t);
  } catch {
    // 音频不可用时静默降级，不影响交互
  }
}
