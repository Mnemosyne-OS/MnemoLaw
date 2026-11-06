/**
 * LawAgentActions — serves MnemoLaw's agent actions (doc 149) while this window is open.
 *
 * A CHILD that renders nothing, never a hook in App: App is mounted on the person's board while
 * the app runs, and a hook added to it breaks the order of its hooks under hot reload. The
 * handlers live in `lawAgent.ts`; this only keeps their view of the app fresh (a ref written
 * every render) and subscribes ONCE.
 */
import { useEffect, useRef } from 'react';
import { sdk } from '../host';
import { lawAgentHandlers, type LawAgentContext } from './lawAgent';

/** The context App hands down; the host moves the screen does not own are added here. */
type LawAgentProps = Omit<LawAgentContext, 'openInOS'>;

/** The Footer's own move: the host opens the folder in the OS file manager. */
const openInOS = (path: string) => sdk.openInOS(path);

export function LawAgentActions(props: LawAgentProps) {
  const latest = useRef<LawAgentContext>({ ...props, openInOS });
  latest.current = { ...props, openInOS };

  useEffect(() => {
    // Outside the shell nobody calls (a plain tab, the tests): no subscription.
    if (typeof window === 'undefined' || window.parent === window) return undefined;
    if (typeof sdk.onAgentActions !== 'function') {
      // An iframe served an older SDK build: it must not take the window down.
      console.warn('[mnemo-law] this SDK build has no onAgentActions; reload the cartridge to serve agent actions');
      return undefined;
    }
    const sub = sdk.onAgentActions(lawAgentHandlers(() => latest.current));
    sub.ready.catch((err: unknown) => console.warn('[mnemo-law] agent actions not served:', err instanceof Error ? err.message : err));
    return () => sub.off();
  }, []);

  return null;
}
