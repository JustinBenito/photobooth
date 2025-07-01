import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('avatar-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
renderer.setSize(1280, 720);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1280/720, 0.1, 1000);
camera.position.set(0, 1.5, 3);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 5, 5);
scene.add(light);

let avatar, skeleton;

// Bone mapping (should match pose.js)
// const BONE_MAP = {
//     Hips: 'Hips_66',
//     Spine: 'Spine_55',
//     Chest: 'Spine2_53',
//     Neck: 'Neck_4',
//     Head: 'Head_3',
//     LeftUpperArm: 'LeftArm_27',
//     LeftLowerArm: 'LeftForeArm_26',
//     LeftHand: 'LeftHand_25',
//     RightUpperArm: 'RightArm_51',
//     RightLowerArm: 'RightForeArm_50',
//     RightHand: 'RightHand_49',
//     LeftUpperLeg: 'LeftUpLeg_60',
//     LeftLowerLeg: 'LeftLeg_59',
//     LeftFoot: 'LeftFoot_58',
//     RightUpperLeg: 'RightUpLeg_65',
//     RightLowerLeg: 'RightLeg_64',
//     RightFoot: 'RightFoot_63',
//   };

  const BONE_MAP = {
    Hips: 'Hips',
    Spine: 'Spine',
    Chest: 'Spine2',
    Neck: 'Neck',
    Head: 'Head',
    LeftUpperArm: 'LeftArm',
    LeftLowerArm: 'LeftForeArm',
    LeftHand: 'LeftHand',
    RightUpperArm: 'RightArm',
    RightLowerArm: 'RightForeArm',
    RightHand: 'RightHand',
    LeftUpperLeg: 'LeftUpLeg',
    LeftLowerLeg: 'LeftLeg',
    LeftFoot: 'LeftFoot',
    RightUpperLeg: 'RightUpLeg',
    RightLowerLeg: 'RightLeg',
    RightFoot: 'RightFoot',
  };



// Optional: Bone axis correction (adjust as needed for your model)
const BONE_AXIS_CORRECTION = {
  // Upper arms: -90° around X to fix T-pose/zombie swap
  LeftUpperArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  RightUpperArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
  // You can add more corrections for other bones as needed
};

// Store initial bone rotations and positions for calibration
function getInitialBoneData(skeleton) {
  const boneData = {};
  for (const [key, boneName] of Object.entries(BONE_MAP)) {
    const bone = skeleton.getBoneByName(boneName);
    if (bone) {
      // Get world position of this bone and its child (if exists)
      const pos = new THREE.Vector3();
      bone.getWorldPosition(pos);
      // Try to get child bone (for direction)
      let childBone = null;
      for (const [childKey, childName] of Object.entries(BONE_MAP)) {
        const child = skeleton.getBoneByName(childName);
        if (child && child.parent === bone) {
          childBone = child;
          break;
        }
      }
      let childPos = null;
      if (childBone) {
        childPos = new THREE.Vector3();
        childBone.getWorldPosition(childPos);
      }
      // Initial direction in model space
      let initialDir = null;
      if (childPos) {
        initialDir = childPos.clone().sub(pos).normalize();
      }
      boneData[key] = {
        boneName,
        position: pos.toArray(),
        childPosition: childPos ? childPos.toArray() : null,
        initialDir: initialDir ? initialDir.toArray() : null,
        initialRotation: bone.quaternion.toArray(),
      };
      // Debug log
      console.log(`Bone: ${boneName}, Position:`, pos.toArray(), 'Child:', childPos ? childPos.toArray() : null, 'InitialDir:', initialDir ? initialDir.toArray() : null);
    }
  }
  return boneData;
}

// Load GLTF model
const loader = new GLTFLoader();
loader.load('models/justin.glb', (gltf) => {
  avatar = gltf.scene;
  scene.add(avatar);
  // Try to find skeleton
  avatar.traverse((obj) => {
    if (obj.isSkinnedMesh) {
      skeleton = obj.skeleton;
    }
  });
  if (skeleton) {
    // Send initial bone data to pose.js for calibration
    const boneData = getInitialBoneData(skeleton);
    window.dispatchEvent(new CustomEvent('avatar-bone-data', { detail: boneData }));
  }
}, undefined, (e) => { console.error('GLTF load error', e); });

// Listen for quaternion data
window.addEventListener('avatar-quaternions', (e) => {
  if (!skeleton) return;
  const quats = e.detail;
  for (const [key, boneName] of Object.entries(BONE_MAP)) {
    const bone = skeleton.getBoneByName(boneName);
    if (bone && quats[key]) {
      //bone.quaternion.fromArray(quats[key]);
      let q = new THREE.Quaternion().fromArray(quats[key]);
      // Apply axis correction if specified
      if (BONE_AXIS_CORRECTION[key]) {
        q = BONE_AXIS_CORRECTION[key].clone().multiply(q);
      }
      bone.quaternion.copy(q);

      // Debug: Log quaternion values
      console.log(`Bone: ${boneName}, Key: ${key}, Quaternion:`, quats[key]);
    }
  }
});

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// UI overlay for status
const overlay = document.createElement('div');
overlay.style.position = 'absolute';
overlay.style.bottom = '20px';
overlay.style.left = '20px';
overlay.style.zIndex = '10';
overlay.style.color = '#fff';
overlay.innerHTML = `<span id="avatar-status">Waiting for calibration...</span>`;
document.body.appendChild(overlay);

window.addEventListener('avatar-quaternions', () => {
  document.getElementById('avatar-status').innerText = 'Avatar tracking!';
});
