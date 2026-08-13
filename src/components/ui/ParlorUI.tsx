import { GlassButton, GlassCard, type GlassButtonProps, type GlassCardProps } from '@mawtech/glass-ui';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function FrameCorners({ inset = false, alert = false }: { inset?: boolean; alert?: boolean }) {
  return (
    <span className={`frame-corners${inset ? ' frame-inset' : ''}${alert ? ' frame-alert' : ''}`} aria-hidden="true">
      <i className="corner corner-nw" />
      <i className="corner corner-ne" />
      <i className="corner corner-sw" />
      <i className="corner corner-se" />
    </span>
  );
}

type FrameElement = 'header' | 'aside' | 'footer' | 'section' | 'article' | 'div';

export function FramedPanel({ as: _element = 'section', className = '', children, ...props }: Omit<GlassCardProps, 'variant' | 'padding' | 'radius'> & {
  as?: FrameElement;
  children: ReactNode;
}) {
  return (
    <GlassCard {...props} variant="elevated" padding="none" radius="lg" className={`${className} glass-panel framed-window maw-glass-panel`.trim()}>
      {children}
    </GlassCard>
  );
}

export function FramedCard({ as: _element = 'div', className = '', tone = 'default', children, ...props }: Omit<GlassCardProps, 'variant' | 'padding' | 'radius'> & {
  as?: FrameElement;
  tone?: 'default' | 'amber' | 'alert' | 'warning-outline';
  children: ReactNode;
}) {
  const variant = tone === 'alert' ? 'glow-pink' : tone === 'amber' ? 'glow' : 'default';
  return (
    <GlassCard {...props} variant={variant} padding="none" radius="md" disableAnimation className={`${className} framed-card frame-tone-${tone} maw-glass-card`.trim()}>
      {children}
    </GlassCard>
  );
}

export function PanelHeading({ index, kicker, variant = 'default', children }: {
  index?: string;
  kicker?: string;
  variant?: 'default' | 'notice' | 'operation';
  children: ReactNode;
}) {
  return (
    <div className={`panel-heading ui-title-block panel-heading-${variant}`}>
      {index && <span>{index}</span>}
      <div>{kicker && <small>{kicker}</small>}<h2>{children}</h2></div>
    </div>
  );
}

export function NoticeDetailPopover({
  tone = 'neutral',
  symbol,
  eyebrow,
  title,
  description,
  facts,
  stamp,
  onClose,
}: {
  tone?: 'neutral' | 'policy' | 'enterprise' | 'city' | 'audit' | 'media';
  symbol: ReactNode;
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  facts: Array<{ label: string; value: ReactNode }>;
  stamp?: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  return <div className="notice-detail-popover-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className={`notice-detail-popover tone-${tone}`} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <button type="button" className="notice-detail-close" aria-label="关闭播报详情" onClick={onClose}>×</button>
      <header>
        <span>{symbol}</span>
        <div><small>{eyebrow}</small><h3 id={titleId}>{title}</h3></div>
      </header>
      <p>{description}</p>
      <dl>{facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      {stamp && <div className="notice-detail-stamp"><i aria-hidden="true" />{stamp}</div>}
    </aside>
  </div>;
}

export function ActionButton({ children, tone = 'primary', ...props }: Omit<GlassButtonProps, 'variant' | 'size' | 'fullWidth' | 'rightIcon'> & {
  tone?: 'primary' | 'secondary' | 'danger';
}) {
  const className = `${props.className ?? ''} ${tone === 'secondary' ? 'secondary-action' : `primary-action${tone === 'danger' ? ' danger-action' : ''}`}`.trim();
  const variant = tone === 'danger' ? 'danger' : tone === 'secondary' ? 'outline' : 'secondary';

  return (
    <GlassButton {...props} variant={variant} size="md" fullWidth className={className} rightIcon={tone !== 'secondary' ? <span aria-hidden="true">→</span> : undefined}>
      {children}
    </GlassButton>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <small className="section-label ui-section-label"><span>{children}</span></small>;
}

export function DirectionalButton({
  direction,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  direction: 'back' | 'previous' | 'next';
}) {
  const trailing = direction === 'next';
  const icon = trailing ? '→' : '←';
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      className={`ui-direction-button ui-direction-${direction} ${className}`.trim()}
    >
      {!trailing && <span className="ui-direction-icon" aria-hidden="true">{icon}</span>}
      <span className="ui-direction-label">{children}</span>
      {trailing && <span className="ui-direction-icon" aria-hidden="true">{icon}</span>}
    </button>
  );
}
