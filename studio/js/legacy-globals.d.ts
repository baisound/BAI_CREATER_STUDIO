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
  BAICameraBundleCore?: any;
  baiStudio?: any;
}
