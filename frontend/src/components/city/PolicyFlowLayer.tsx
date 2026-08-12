import { Fragment, useRef } from 'react';
import { Container, Graphics, Text, useTick } from '@pixi/react';
import { Container as PixiContainer, Graphics as PixiGraphics, TextStyle } from 'pixi.js';
import type { CrowdFlow, RoundFeed } from '../../city/v3/policyFeed.ts';

const POINTS: Record<string, { x: number; y: number }> = {
  entrants: { x: 960, y: 1010 }, market: { x: 960, y: 840 }, unemployed: { x: 1680, y: 990 }, exited: { x: 1930, y: 1010 },
  A: { x: 245, y: 602 }, B: { x: 575, y: 732 }, C: { x: 1375, y: 607 }, D: { x: 1690, y: 727 },
};
const style = new TextStyle({ fill: '#fff5cd', fontFamily: 'VCR OSD Mono', fontSize: 12, stroke: '#111b2b', strokeThickness: 3 });

function FlowDots({ flow, index }: { flow: CrowdFlow; index: number }) {
  const refs = useRef<Array<PixiContainer | null>>([]);
  const elapsed = useRef(0);
  const from = POINTS[flow.from] ?? POINTS.market;
  const to = POINTS[flow.to] ?? POINTS.market;
  const count = Math.min(5, flow.sprites);
  useTick((delta) => {
    elapsed.current += delta / 60;
    refs.current.forEach((node, dot) => {
      if (!node) return;
      const raw = (elapsed.current * 0.18 + dot / count + index * 0.07) % 1;
      const progress = flow.blocked ? (raw < 0.58 ? raw / 0.58 : 1 - (raw - 0.58) / 0.42) : raw;
      node.position.set(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 34);
      node.alpha = flow.to === 'exited' && raw > 0.82 ? Math.max(0, (1 - raw) / 0.18) : 1;
      node.zIndex = node.y;
    });
  });
  return <Fragment>{Array.from({ length: count }, (_, dot) => <Container key={dot} ref={(node) => { refs.current[dot] = node; }} x={from.x} y={from.y} zIndex={from.y}><Graphics draw={(graphics: PixiGraphics) => { graphics.clear(); graphics.beginFill(flow.blocked ? 0xffc652 : flow.skill === 'ai' ? 0x55cfff : 0xb4bbc5, 0.95); graphics.drawCircle(0, 0, flow.blocked ? 7 : 5); graphics.endFill(); if (flow.blocked) { graphics.lineStyle(2, 0xe95b5b); graphics.drawCircle(0, 0, 10); } }} /></Container>)}</Fragment>;
}

export function PolicyFlowLayer({ feed }: { feed: RoundFeed }) {
  const visible = feed.crowdFlows.filter((flow) => flow.people > 0 && ['market', 'entrants', 'exited'].includes(flow.from) || flow.blocked || flow.to === 'exited').slice(0, 12);
  return <Container sortableChildren>{visible.map((flow, index) => <FlowDots key={`${flow.from}-${flow.to}-${flow.skill}-${flow.blocked}-${index}`} flow={flow} index={index} />)}{feed.crowdFlows.filter((flow) => flow.blocked).map((flow) => <Text key={`${flow.people}-blocked`} text={`技能不匹配 · ${flow.people} 人被挡回`} x={1375} y={555} anchor={{ x: .5, y: 1 }} style={style} />)}</Container>;
}
