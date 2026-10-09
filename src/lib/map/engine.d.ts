export const SKELETON: string;
export function mountErdMap(
  root: HTMLElement,
  data: unknown,
  cfg: {
    askUrl?: string;
    flagsUrl?: string;
    feedbackUrl?: string;
    flaggingEnabled?: boolean;
    visitor?: boolean;
    sessionId?: string;
    onEvent?: ((type: string, payload: Record<string, unknown>) => void) | null;
  },
): {
  destroy(): void;
  select(name: string): void;
  fit(): void;
  setTab(tab: string): void;
  ask(text: string, send?: boolean): void;
  startWalk(index: number): void;
};
