// 旧ファイル /camera_follow_config.js（ルート直下の ESM）の型宣言。tsconfig.json の paths から参照する（P2 設計 §1.8）。
export const FOLLOW_STORAGE_KEY: string;
export const ALIASES: Record<'head' | 'neck' | 'chest' | 'hips', string[]>;
export function classifyBone(name: unknown): 'head' | 'neck' | 'chest' | 'hips' | null;
export function parseOffset(values: unknown): [number, number, number];
export function validFollowConfig(input: unknown): {
  boneName: string; role: '' | 'head' | 'neck' | 'chest' | 'hips'; offset: [number, number, number]; enabled: boolean; smoothingSeconds: number;
};
export function pickBone<T extends { name: string }>(nodes: T[], config: { boneName: string; role: string }): T | null;
