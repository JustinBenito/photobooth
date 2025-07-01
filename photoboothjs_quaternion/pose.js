import { Pose } from '@mediapipe/pose';
import { FaceMesh } from '@mediapipe/face_mesh';
import { Camera } from '@mediapipe/camera_utils';
import { Quaternion, Vector3 } from 'three';

const videoElement = document.getElementById('webcam');

// --- HumanBodyBones Enum (Unity-like) ---
const HumanBodyBones = {
  Hips: 'Hips',
  Spine: 'Spine',
  Chest: 'Chest',
  Neck: 'Neck',
  Head: 'Head',
  LeftUpperArm: 'LeftUpperArm',
  LeftLowerArm: 'LeftLowerArm',
  LeftHand: 'LeftHand',
  RightUpperArm: 'RightUpperArm',
  RightLowerArm: 'RightLowerArm',
  RightHand: 'RightHand',
  LeftUpperLeg: 'LeftUpperLeg',
  LeftLowerLeg: 'LeftLowerLeg',
  LeftFoot: 'LeftFoot',
  RightUpperLeg: 'RightUpperLeg',
  RightLowerLeg: 'RightLowerLeg',
  RightFoot: 'RightFoot',
};

// --- Landmark Mapping ---
const LANDMARKS = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
};

// --- Utility Functions ---
function toVec3(pt) {
  return new Vector3(pt.x, pt.y, pt.z);
}
function lerpVec3(a, b, t) {
  return a.clone().lerp(b, t);
}
function slerpQuat(a, b, t) {
  return a.clone().slerp(b, t);
}
function quatFromDirs(from, to) {
  const vFrom = from.clone().normalize();
  const vTo = to.clone().normalize();
  const q = new Quaternion();
  q.setFromUnitVectors(vFrom, vTo);
  return q;
}
function getMidpoint(a, b) {
  return a.clone().add(b).multiplyScalar(0.5);
}

// --- Virtual Landmarks ---
function getVirtualHip(landmarks) {
  return getMidpoint(toVec3(landmarks[LANDMARKS.leftHip]), toVec3(landmarks[LANDMARKS.rightHip]));
}
function getVirtualNeck(landmarks) {
  return getMidpoint(toVec3(landmarks[LANDMARKS.leftShoulder]), toVec3(landmarks[LANDMARKS.rightShoulder]));
}

// --- Calibration Data Structure ---
class CalibrationData {
  constructor(root, parent, child, trackParent, trackChild, initialDir, initialRotation) {
    this.root = root; // Vector3
    this.parent = parent; // Vector3
    this.child = child; // Vector3
    this.trackParent = trackParent; // Vector3
    this.trackChild = trackChild; // Vector3
    this.initialDir = initialDir; // Vector3
    this.initialRotation = initialRotation; // Quaternion
    this.currentDir = initialDir.clone(); // Vector3
    this.currentRotation = initialRotation.clone(); // Quaternion
    this.smoothedRotation = initialRotation.clone(); // Quaternion
    this.lastUpdate = performance.now();
  }
  updateCurrentDir(newDir) {
    this.currentDir.copy(newDir);
  }
  updateCurrentRotation(newRot, deltaTime, smoothing=10) {
    // Slerp for temporal smoothing, frame-rate independent
    this.smoothedRotation.slerp(newRot, Math.min(1, deltaTime * smoothing));
    this.currentRotation.copy(newRot);
  }
}

// --- Calibration State ---
let calibrationData = {}; // { boneName: CalibrationData }
let calibrated = false;
let initialBoneData = {}; // { boneName: { position, childPosition, initialDir, initialRotation } }
let lastPoseLandmarks = null;
let lastFaceLandmarks = null;
let lastTimestamp = performance.now();
let lastGroundY = 0;

// Listen for initial bone data from script.js
window.addEventListener('avatar-bone-data', (e) => {
  initialBoneData = e.detail; // { boneName: { position, childPosition, initialDir, initialRotation } }
});

// --- Calibration Logic ---
function calibrate(poseLandmarks, faceLandmarks) {
  calibrationData = {};
  // For each bone, use model-space initial direction and rotation
  for (const bone in initialBoneData) {
    const data = initialBoneData[bone];
    if (!data) continue;
    calibrationData[bone] = {
      initialDir: new Vector3().fromArray(data.initialDir || [1,0,0]),
      initialRotation: new Quaternion().fromArray(data.initialRotation || [0,0,0,1]),
    };
    // Debug log
    console.log(`[Calibration] Bone: ${bone}, InitialDir:`, data.initialDir, 'InitialRotation:', data.initialRotation);
  }
  calibrated = true;
}

// --- Runtime Update: Robust, Model-Space Directions, Debugging ---
function getQuaternions(poseLandmarks, faceLandmarks) {
  if (!calibrated) return null;
  const quats = {};
  const now = performance.now();
  const deltaTime = Math.min(0.1, (now - lastTimestamp) / 1000); // Clamp to 100ms max
  lastTimestamp = now;

  for (const bone in calibrationData) {
    // Get current direction from landmarks (world space)
    let from, to;
    switch (bone) {
      case 'LeftUpperArm':
        from = toVec3(poseLandmarks[LANDMARKS.leftShoulder]);
        to = toVec3(poseLandmarks[LANDMARKS.leftElbow]);
        break;
      case 'LeftLowerArm':
        from = toVec3(poseLandmarks[LANDMARKS.leftElbow]);
        to = toVec3(poseLandmarks[LANDMARKS.leftWrist]);
        break;
      case 'RightUpperArm':
        from = toVec3(poseLandmarks[LANDMARKS.rightShoulder]);
        to = toVec3(poseLandmarks[LANDMARKS.rightElbow]);
        break;
      case 'RightLowerArm':
        from = toVec3(poseLandmarks[LANDMARKS.rightElbow]);
        to = toVec3(poseLandmarks[LANDMARKS.rightWrist]);
        break;
      // ... repeat for all bones ...
      default:
        // Use default mapping if not a special case
        continue;
    }
    let currentDir = to.clone().sub(from).normalize();
    // Flip forearm direction if bone is a lower arm
    if (bone === 'LeftLowerArm' || bone === 'RightLowerArm') {
      currentDir = currentDir.negate();
    }
    // Flip upper arm direction if bone is an upper arm
    if (bone === 'LeftUpperArm' || bone === 'RightUpperArm') {
      currentDir = currentDir.negate();
    }
    // Optionally: transform currentDir into model/bone local space if needed
    // (For now, assume world space is sufficient. If not, add transform here.)
    // Calculate delta quaternion
    const initialDir = calibrationData[bone].initialDir;
    const initialRotation = calibrationData[bone].initialRotation;
    const deltaQ = quatFromDirs(initialDir, currentDir);
    const finalQ = deltaQ.multiply(initialRotation);
    quats[bone] = finalQ.toArray();
    // Debug log
    console.log(`[Runtime] Bone: ${bone}, InitialDir:`, initialDir.toArray(), 'CurrentDir:', currentDir.toArray(), 'DeltaQ:', deltaQ.toArray(), 'FinalQ:', finalQ.toArray());
  }
  return quats;
}

// Send quaternion data to script.js
function sendQuaternions(quats) {
  window.dispatchEvent(new CustomEvent('avatar-quaternions', { detail: quats }));
}

// MediaPipe setup
const pose = new Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`});
pose.setOptions({modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5});

const faceMesh = new FaceMesh({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`});
faceMesh.setOptions({maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5});

pose.onResults((results) => {
  lastPoseLandmarks = results.poseLandmarks;
  if (calibrated && lastPoseLandmarks && lastFaceLandmarks) {
    const quats = getQuaternions(lastPoseLandmarks, lastFaceLandmarks);
    if (quats) sendQuaternions(quats);
  }
});

faceMesh.onResults((results) => {
  lastFaceLandmarks = results.multiFaceLandmarks && results.multiFaceLandmarks[0];
});

// Camera setup
const camera = new Camera(videoElement, {
  onFrame: async () => {
    await pose.send({image: videoElement});
    await faceMesh.send({image: videoElement});
  },
  width: 1280,
  height: 720,
});
camera.start();

// UI: Calibration button
const ui = document.createElement('div');
ui.style.position = 'absolute';
ui.style.top = '20px';
ui.style.left = '20px';
ui.style.zIndex = '10';
ui.innerHTML = `<button id="calib-btn">Calibrate</button> <span id="calib-status">Not Calibrated</span> <span id="countdown"></span>`;
document.body.appendChild(ui);
let countdown = 3;
document.getElementById('calib-btn').onclick = () => {
  countdown = 3;
  document.getElementById('countdown').innerText = countdown;
  const interval = setInterval(() => {
    countdown--;
    if (countdown > 0) {
      document.getElementById('countdown').innerText = countdown;
    } else {
      clearInterval(interval);
      if (lastPoseLandmarks && lastFaceLandmarks) {
        calibrate(lastPoseLandmarks, lastFaceLandmarks);
        document.getElementById('calib-status').innerText = 'Calibrated';
      }
      document.getElementById('countdown').innerText = '';
    }
  }, 1000);
};
