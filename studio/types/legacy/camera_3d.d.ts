// 旧ファイル /camera_3d.js の型宣言（P2 設計 §1.8）。mount(root) 化は WP-06a。それまでは形だけ。
export interface MountHandle { destroy(): void; [k: string]: any }
export function mount(root: HTMLElement, options?: { host?: 'legacy' | 'studio'; [k: string]: any }): MountHandle;
