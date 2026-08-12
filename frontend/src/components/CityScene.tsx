import { useMemo, useRef, useState } from 'react';
import { Container, Graphics, Stage, useTick } from '@pixi/react';
import { Container as PixiContainer, Graphics as PixiGraphics } from 'pixi.js';
import { useElementSize } from 'usehooks-ts';
import { SceneMode } from '../city/v3/types.ts';
import { CITY_LOGICAL_WIDTH, CITY_VISIBLE_HEIGHT, computeSceneTransform } from '../city/v3/layout.ts';
import { BackgroundLayer, GroundLayer, StaticWorldObjects } from './city/StaticLayers.tsx';
import { MotionLayers } from './city/MotionLayers.tsx';
import { LightingLayer } from './city/LightingLayer.tsx';
import { MapDebugLayer } from './city/MapDebugLayer.tsx';
import { getFeed, type ActorState, type RoundFeed, type RunId } from '../city/v3/policyFeed.ts';
import { PolicyFlowLayer } from './city/PolicyFlowLayer.tsx';

const TRANSITION_SECONDS = 1.6;

const smoothstep = (start: number, end: number, value: number) => {
  const ratio = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return ratio * ratio * (3 - 2 * ratio);
};

const drawAtmosphere = (graphics: PixiGraphics) => {
  graphics.clear();
  graphics.beginFill(0x27345e, 0.12);
  graphics.drawRect(0, 0, CITY_LOGICAL_WIDTH, CITY_VISIBLE_HEIGHT);
  graphics.endFill();
};

function SceneRuntime({ mode, debug, feed }: { mode: SceneMode; debug: boolean; feed: RoundFeed }) {
  const progress = useRef(mode === 'night' ? 1 : 0);
  const dayBackground = useRef<PixiContainer | null>(null);
  const nightBackground = useRef<PixiContainer | null>(null);
  const dayGround = useRef<PixiContainer | null>(null);
  const nightGround = useRef<PixiContainer | null>(null);
  const atmosphere = useRef<PixiContainer | null>(null);
  const lights = useRef<PixiContainer | null>(null);

  useTick((delta) => {
    const direction = mode === 'night' ? 1 : -1;
    const step = Math.min(0.03, delta / 60 / TRANSITION_SECONDS);
    progress.current = Math.max(0, Math.min(1, progress.current + direction * step));

    const skyNight = smoothstep(0, 0.35, progress.current);
    const objectNight = smoothstep(0.25, 0.75, progress.current);
    const lightLevel = smoothstep(0.45, 1, progress.current);

    if (dayBackground.current) dayBackground.current.alpha = 1 - skyNight;
    if (nightBackground.current) nightBackground.current.alpha = skyNight;
    if (dayGround.current) dayGround.current.alpha = 1 - objectNight;
    if (nightGround.current) nightGround.current.alpha = objectNight;
    if (atmosphere.current) atmosphere.current.alpha = progress.current;
    if (lights.current) lights.current.alpha = lightLevel;
  });

  return (
    <Container>
      <Container ref={dayBackground} alpha={mode === 'day' ? 1 : 0}>
        <BackgroundLayer night={false} />
      </Container>
      <Container ref={nightBackground} alpha={mode === 'night' ? 1 : 0}>
        <BackgroundLayer night />
      </Container>
      <Container ref={dayGround} alpha={mode === 'day' ? 1 : 0}>
        <GroundLayer night={false} />
      </Container>
      <Container ref={nightGround} alpha={mode === 'night' ? 1 : 0}>
        <GroundLayer night />
      </Container>
      <Container sortableChildren>
        <StaticWorldObjects transition={progress} />
        <MotionLayers transition={progress} />
        <PolicyFlowLayer feed={feed} />
      </Container>
      <Container ref={atmosphere} alpha={mode === 'night' ? 1 : 0}>
        <Graphics draw={drawAtmosphere} />
      </Container>
      <Container ref={lights} alpha={mode === 'night' ? 1 : 0}>
        <LightingLayer feed={feed} />
      </Container>
      {debug && <MapDebugLayer />}
    </Container>
  );
}

export default function CityScene() {
  const [wrapperRef, { width, height }] = useElementSize();
  const [mode, setMode] = useState<SceneMode>('day');
  const [run, setRun] = useState<RunId>('B');
  const [round, setRound] = useState(4);
  const [focus, setFocus] = useState<ActorState | null>(null);
  const feed = useMemo(() => getFeed(run, round), [run, round]);
  const referenceFeed = useMemo(() => getFeed('A', round), [round]);
  const bBuilding = feed.buildings.find((item) => item.id === 'B')!;
  const referenceB = referenceFeed.buildings.find((item) => item.id === 'B')!;
  const metricDifferences = [
    { label: '总就业', current: feed.headline.employment, reference: referenceFeed.headline.employment, suffix: '人' },
    { label: '隐性失业', current: feed.headline.hidden, reference: referenceFeed.headline.hidden, suffix: '人' },
    { label: 'B 厂在册', current: bBuilding.headcount, reference: referenceB.headcount, suffix: '人' },
  ];
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debugMap') === '1', []);
  const stageWidth = Math.max(1, width);
  const stageHeight = Math.max(1, height);
  const transform = useMemo(() => {
    return computeSceneTransform(stageWidth, stageHeight);
  }, [stageHeight, stageWidth]);

  return (
    <div ref={wrapperRef} className="city-scene">
      <Stage
        width={stageWidth}
        height={stageHeight}
        options={{ backgroundColor: 0x0b1434, antialias: false, autoDensity: true }}
      >
        <Container x={transform.x} y={transform.y} scale={transform.scale}>
          <SceneRuntime mode={mode} debug={debug} feed={feed} />
        </Container>
      </Stage>
      <div className="policy-topbar">
        <div className="policy-brand">POLICY TOWN <small>离线政策预演</small></div>
        <div className="run-switch" aria-label="世界线切换">
          {(['A', 'B'] as RunId[]).map((id) => <button key={id} className={run === id ? 'active' : ''} onClick={() => setRun(id)}>{id === 'A' ? 'A 基线' : 'B 管制'}</button>)}
        </div>
        <div className="headline-metrics">
          <span>官方失业率 <b>{(feed.headline.unemploymentRate * 100).toFixed(1)}%</b></span>
          <span>总就业 <b>{feed.headline.employment}</b></span>
          <span>隐性失业 <b>{feed.headline.hidden}</b></span>
        </div>
      </div>
      <section className={`impact-ribbon ${run === 'A' ? 'reference' : ''}`}>
        <div className="impact-story"><span>{run === 'A' ? '不干预参考线' : '当前政策草案'}</span><strong>{run === 'A' ? '人才仍在正常循环' : round < 4 ? '政策正在传导' : '管的是 A，打到的是 B'}</strong><small>{run === 'B' && round >= 4 ? 'B 厂因未来解雇成本上升而收缩招聘' : '拖动轮次观察政策冲击'}</small></div>
        {metricDifferences.map((metric) => { const delta = metric.current - metric.reference; return <div key={metric.label} className={`impact-number ${delta < 0 ? 'bad' : delta > 0 ? 'warn' : ''}`}><span>{metric.label}</span><b>{metric.current}</b><small>{run === 'A' ? '参考值' : `较参考 ${delta > 0 ? '+' : ''}${delta}${metric.suffix}`}</small></div>; })}
      </section>
      <div className="round-panel">
        <div><b>第 {round} 轮</b><span>{run === 'B' && round >= 3 ? '政策生效' : '观察期'}</span></div>
        <input aria-label="推演轮次" type="range" min="1" max="8" value={round} onChange={(event) => setRound(Number(event.target.value))} />
        <div className="round-ticks">{[1,2,3,4,5,6,7,8].map((value) => <button key={value} onClick={() => setRound(value)} className={value === round ? 'active' : ''}>{value}</button>)}</div>
      </div>
      <div className="building-panel">
        {feed.buildings.filter((item) => item.id !== 'GOV').map((item) => <div key={item.id} className={`building-card stress-${item.stress} ${item.hiringLightOn ? '' : 'light-off'}`}><strong>{item.id} 厂</strong><span>{item.hiringLightOn ? '招聘中' : '停止扩招'}</span><b>{item.headcount} 人</b>{item.banner && <em>{item.banner}</em>}</div>)}
      </div>
      {run === 'B' && round >= 4 && <div className="b-shutdown-callout"><b>B 厂招聘灯牌熄灭</b><span>未被直接管制，却开始收缩</span></div>}
      <div className="event-stack">
        {feed.events.slice(-3).map((event, index) => <div key={`${event.type}-${index}`} className={`town-event ${event.type}`}>{event.text}</div>)}
      </div>
      <div className="actor-strip">
        {feed.actors.filter((actor) => actor.kind === 'worker').map((actor) => <button key={actor.id} onClick={() => setFocus(actor)}>{actor.id}<small>{actor.routeTo}</small></button>)}
      </div>
      {focus && <aside className="trace-drawer"><button className="drawer-close" onClick={() => setFocus(null)}>×</button><p className="eyebrow">代表性员工 · {focus.id}</p><h2>{focus.cohortLabel}</h2><div className="cohort-number">所属人群 {focus.cohortWeight ?? 0} 人</div><div className="cohort-number">本轮 {Math.round((focus.cohortWeight ?? 0) * (focus.cohortShare ?? 0))} 人走了这条路（{((focus.cohortShare ?? 0) * 100).toFixed(1)}%）</div><hr/><p>本轮去向：{focus.routeTo}</p><blockquote>“{focus.bubble || '本轮无事发生。'}”</blockquote><p className="measure-note">这是分层抽样代表，不表示整个人群都做出了相同选择。</p></aside>}
      <button
        type="button"
        className="day-night-toggle"
        aria-label={mode === 'day' ? '切换到夜间' : '切换到白天'}
        aria-pressed={mode === 'night'}
        onClick={() => setMode((current) => (current === 'day' ? 'night' : 'day'))}
      >
        <span aria-hidden="true" className="day-night-icon">{mode === 'day' ? '☀' : '☾'}</span>
        <span>{mode === 'day' ? '日间' : '夜间'}</span>
      </button>
    </div>
  );
}
