// 共有する旧 JS（UMD）が window に公開するものの型宣言（any）。P2 設計 §1.8。
interface Window {
  BAICameraRig?: any;
  BAICameraFraming?: any;
  BAICameraLens?: any;
  BAICameraDOF?: any;
  BAICameraFocusTracking?: any;
  BAICameraFocusConsistency?: any;
  BAICameraSequencePlayback?: any;
  BAIVmdLocal?: any;
  BAICameraPage?: any;
  BAI_CAMERA_MANUAL_MOUNT?: boolean;
  BAICameraBundleCore?: {
    validateRestore(bundle: any): void;
    buildBundleBody(x: { combination: any; camera: any; workspace: any }): Record<string, any>;
    mergeWorkspace(storeWorkspace: any, hostSnapshot: any): any;
    CAMERA_OWNED_WORKSPACE_FIELDS: readonly string[];
  };
  baiStudio?: any;
}
