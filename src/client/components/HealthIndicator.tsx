import { useEffect, useState } from 'react';
import { useT } from '../i18n/index.ts';
import { fetchHealth } from '../api/health.ts';
import type { Health } from '../../shared/schemas/health.ts';
import styles from './HealthIndicator.module.css';

type HealthState = { kind: 'checking' } | { kind: 'ok'; health: Health } | { kind: 'down' };

const POLL_MS = 10_000;

export function HealthIndicator() {
  const t = useT();
  const [state, setState] = useState<HealthState>({ kind: 'checking' });

  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      fetchHealth(controller.signal)
        .then((health) => setState({ kind: 'ok', health }))
        .catch(() => {
          if (!controller.signal.aborted) setState({ kind: 'down' });
        });
    };
    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);

  const dotClass =
    state.kind === 'ok' ? styles.ok : state.kind === 'down' ? styles.down : undefined;
  const label =
    state.kind === 'checking'
      ? t('app.health.checking')
      : state.kind === 'down'
        ? t('app.health.down')
        : t('app.health.ok', {
            data: t(
              state.health.mode === 'production' ? 'app.health.realData' : 'app.health.devData',
            ),
          });

  return (
    <div className={styles.health} role="status">
      <span className={`${styles.dot} ${dotClass ?? ''}`} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
