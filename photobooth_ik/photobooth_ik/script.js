const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

/* THREEJS WORLD SETUP */
let currentVrm;
let showLandmarks = true;
let showAvatar = true;

// renderer
const renderer = new THREE.WebGLRenderer({alpha: true, preserveDrawingBuffer: true});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.id = 'three-canvas';
document.body.appendChild(renderer.domElement);

// camera
const orbitCamera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
orbitCamera.position.set(0.0, 1.4, 0.7);

// controls (disabled for photobooth mode)
const orbitControls = new THREE.OrbitControls(orbitCamera, renderer.domElement);
orbitControls.enabled = false;
orbitControls.screenSpacePanning = true;
orbitControls.target.set(0.0, 1.4, 0.0);
orbitControls.update();

// scene
const scene = new THREE.Scene();

// light
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

// Main Render Loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);

    if (currentVrm && showAvatar) {
        currentVrm.update(clock.getDelta());
    }
    renderer.render(scene, orbitCamera);
}
animate();

/* VRM CHARACTER SETUP */
const loader = new THREE.GLTFLoader();
loader.crossOrigin = "anonymous";

loader.load(
    "models/test.vrm",
  
    gltf => {
      THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
  
      THREE.VRM.from(gltf).then(vrm => {
        scene.add(vrm.scene);
        currentVrm = vrm;
        currentVrm.scene.rotation.y = Math.PI; // Rotate model 180deg to face camera
      });
    },
  
    progress =>
      console.log(
        "Loading model...",
        100.0 * (progress.loaded / progress.total),
        "%"
      ),
  
    error => console.error(error)
  );

// Animation functions for default avatar
const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) return;
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    
    let euler = new THREE.Euler(
        rotation.x * dampener,
        rotation.y * dampener,
        rotation.z * dampener
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);
    Part.quaternion.slerp(quaternion, lerpAmount);
};

const rigPosition = (name, position = { x: 0, y: 0, z: 0 }, dampener = 1, lerpAmount = 0.3) => {
    if (!currentVrm) return;
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    let vector = new THREE.Vector3(
        position.x * dampener,
        position.y * dampener,
        position.z * dampener
    );
    Part.position.lerp(vector, lerpAmount);
};

let oldLookTarget = new THREE.Euler();
const rigFace = (riggedFace) => {
    if (!currentVrm) return;
    rigRotation("Neck", riggedFace.head, 0.7);

    const Blendshape = currentVrm.blendShapeProxy;
    const PresetName = THREE.VRMSchema.BlendShapePresetName;

    if (Blendshape && PresetName) {
        riggedFace.eye.l = lerp(clamp(1 - riggedFace.eye.l, 0, 1), Blendshape.getValue(PresetName.Blink), .5);
        riggedFace.eye.r = lerp(clamp(1 - riggedFace.eye.r, 0, 1), Blendshape.getValue(PresetName.Blink), .5);
        riggedFace.eye = Kalidokit.Face.stabilizeBlink(riggedFace.eye, riggedFace.head.y);
        Blendshape.setValue(PresetName.Blink, riggedFace.eye.l);

        Blendshape.setValue(PresetName.I, lerp(riggedFace.mouth.shape.I, Blendshape.getValue(PresetName.I), .5));
        Blendshape.setValue(PresetName.A, lerp(riggedFace.mouth.shape.A, Blendshape.getValue(PresetName.A), .5));
        Blendshape.setValue(PresetName.E, lerp(riggedFace.mouth.shape.E, Blendshape.getValue(PresetName.E), .5));
        Blendshape.setValue(PresetName.O, lerp(riggedFace.mouth.shape.O, Blendshape.getValue(PresetName.O), .5));
        Blendshape.setValue(PresetName.U, lerp(riggedFace.mouth.shape.U, Blendshape.getValue(PresetName.U), .5));

        let lookTarget = new THREE.Euler(
            lerp(oldLookTarget.x, riggedFace.pupil.y, .4),
            lerp(oldLookTarget.y, riggedFace.pupil.x, .4),
            0,
            "XYZ"
        );
        oldLookTarget.copy(lookTarget);
        if (currentVrm.lookAt) {
            currentVrm.lookAt.applyer.lookAt(lookTarget);
        }
    }
};

/* VRM Character Animator */
const animateVRM = (vrm, results) => {
    if (!vrm) return;
    const faceLandmarks = results.faceLandmarks;
    const pose3DLandmarks = results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;

    // Animate Face for VRM
    if (faceLandmarks && vrm) {
        const riggedFace = Kalidokit.Face.solve(faceLandmarks, {
            runtime: "mediapipe",
            video: videoElement
        });
        rigFace(riggedFace);
    }

    // Animate Pose for VRM
    if (pose2DLandmarks && pose3DLandmarks && vrm) {
        const riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
        rigRotation("Hips", riggedPose.Hips.rotation, 0.7);
        rigPosition("Hips", {
            x: -riggedPose.Hips.position.x,
            y: riggedPose.Hips.position.y + 1,
            z: -riggedPose.Hips.position.z
        }, 1, 0.07);

        rigRotation("Chest", riggedPose.Spine, 0.25, .3);
        rigRotation("Spine", riggedPose.Spine, 0.45, .3);
        rigRotation("RightUpperArm", riggedPose.RightUpperArm, 1, .3);
        rigRotation("RightLowerArm", riggedPose.RightLowerArm, 1, .3);
        rigRotation("LeftUpperArm", riggedPose.LeftUpperArm, 1, .3);
        rigRotation("LeftLowerArm", riggedPose.LeftLowerArm, 1, .3);
        rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg, 1, .3);
        rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg, 1, .3);
        rigRotation("RightUpperLeg", riggedPose.RightUpperLeg, 1, .3);
        rigRotation("RightLowerLeg", riggedPose.RightLowerLeg, 1, .3);
    }

    // Animate Hands for VRM
    if (leftHandLandmarks && vrm) {
        const riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
        // Hand animation code...
    }
    if (rightHandLandmarks && vrm) {
        const riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
        // Hand animation code...
    }
};

/* SETUP MEDIAPIPE HOLISTIC INSTANCE */
let videoElement = document.querySelector(".input_video");
let guideCanvas = document.querySelector('canvas.guides');

const onResults = (results) => {
    if (showLandmarks) {
        drawResults(results);
    } else {
        // Clear the guide canvas
        let canvasCtx = guideCanvas.getContext('2d');
        canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    }
    animateVRM(currentVrm, results);
};

const holistic = new Holistic({
    locateFile: file => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1635989137/${file}`;
    }
});

holistic.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
    refineFaceLandmarks: true,
});

holistic.onResults(onResults);

const drawResults = (results) => {
    guideCanvas.width = videoElement.videoWidth;
    guideCanvas.height = videoElement.videoHeight;
    let canvasCtx = guideCanvas.getContext('2d');
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    
    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
            color: "#00cff7",
            lineWidth: 4
        });
        drawLandmarks(canvasCtx, results.poseLandmarks, {
            color: "#ff0364",
            lineWidth: 2
        });
    }
    
    if (results.faceLandmarks) {
        drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
            color: "#C0C0C070",
            lineWidth: 1
        });
        if (results.faceLandmarks.length === 478) {
            drawLandmarks(canvasCtx, [results.faceLandmarks[468], results.faceLandmarks[468+5]], {
                color: "#ffe603",
                lineWidth: 2
            });
        }
    }
    
    if (results.leftHandLandmarks) {
        drawConnectors(canvasCtx, results.leftHandLandmarks, HAND_CONNECTIONS, {
            color: "#eb1064",
            lineWidth: 5
        });
        drawLandmarks(canvasCtx, results.leftHandLandmarks, {
            color: "#00cff7",
            lineWidth: 2
        });
    }
    
    if (results.rightHandLandmarks) {
        drawConnectors(canvasCtx, results.rightHandLandmarks, HAND_CONNECTIONS, {
            color: "#22c3e3",
            lineWidth: 5
        });
        drawLandmarks(canvasCtx, results.rightHandLandmarks, {
            color: "#ff0364",
            lineWidth: 2
        });
    }
    
    canvasCtx.restore();
};

// Camera setup
const camera = new Camera(videoElement, {
    onFrame: async () => {
        await holistic.send({image: videoElement});
    },
    width: 1280,
    height: 720
});
camera.start();

/* UI CONTROLS */
function showStatus(message) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.classList.add('show');
    setTimeout(() => {
        status.classList.remove('show');
    }, 3000);
}

// Toggle landmarks
document.getElementById('landmarksToggle').addEventListener('click', () => {
    showLandmarks = !showLandmarks;
    document.getElementById('landmarksToggle').textContent = showLandmarks ? 'Hide Landmarks' : 'Show Landmarks';
    if (!showLandmarks) {
        let canvasCtx = guideCanvas.getContext('2d');
        canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    }
});

// Toggle avatar
document.getElementById('avatarToggle').addEventListener('click', () => {
    showAvatar = !showAvatar;
    document.getElementById('avatarToggle').textContent = showAvatar ? 'Hide Avatar' : 'Show Avatar';
    if (currentVrm) {
        currentVrm.scene.visible = showAvatar;
    }
});

// Photo capture
document.getElementById('captureBtn').addEventListener('click', capturePhoto);

function capturePhoto() {
    const captureCanvas = document.createElement('canvas');
    const ctx = captureCanvas.getContext('2d');
    
    // Set canvas size to match viewport
    captureCanvas.width = window.innerWidth;
    captureCanvas.height = window.innerHeight;
    
    // Draw video frame (mirrored)
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(videoElement, -captureCanvas.width, 0, captureCanvas.width, captureCanvas.height);
    ctx.restore();
    
    // Draw landmarks if visible
    if (showLandmarks && guideCanvas.width > 0) {
        ctx.drawImage(guideCanvas, 0, 0, captureCanvas.width, captureCanvas.height);
    }
    
    // Draw Three.js canvas (avatar)
    if (showAvatar) {
        ctx.drawImage(renderer.domElement, 0, 0, captureCanvas.width, captureCanvas.height);
    }
    
    // Show photo preview
    const dataURL = captureCanvas.toDataURL('image/png');
    document.getElementById('photoImg').src = dataURL;
    document.getElementById('photoPreview').style.display = 'block';
    
    // Store for download
    document.getElementById('downloadBtn').onclick = () => {
        const link = document.createElement('a');
        link.download = `photobooth-${Date.now()}.png`;
        link.href = dataURL;
        link.click();
    };
    
    showStatus('Photo captured!');
}

// Close photo preview
document.getElementById('closeBtn').addEventListener('click', () => {
    document.getElementById('photoPreview').style.display = 'none';
});

// Handle window resize
window.addEventListener('resize', () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    renderer.setSize(width, height);
    orbitCamera.aspect = width / height;
    orbitCamera.updateProjectionMatrix();
});

// Prevent context menu on canvas
renderer.domElement.addEventListener('contextmenu', (e) => {
    e.preventDefault();
});