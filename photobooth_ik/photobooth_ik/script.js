const remap = Kalidokit.Utils.remap;
const clamp = Kalidokit.Utils.clamp;
const lerp = Kalidokit.Vector.lerp;

// Default values
let globalDampener = 0.7;
let globalLerpAmount = 0.3;

// UI elements
const dampenerSlider = document.getElementById('dampenerSlider');
const lerpSlider = document.getElementById('lerpSlider');
const dampenerValue = document.getElementById('dampenerValue');
const lerpValue = document.getElementById('lerpValue');

// Update global variables and UI on slider change
dampenerSlider.addEventListener('input', (e) => {
  globalDampener = parseFloat(e.target.value);
  dampenerValue.textContent = globalDampener;
});
lerpSlider.addEventListener('input', (e) => {
  globalLerpAmount = parseFloat(e.target.value);
  lerpValue.textContent = globalLerpAmount;
});

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
orbitControls.target.set(0.0, 1.5, 0.0);
orbitControls.update();

// scene
const scene = new THREE.Scene();

// light
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(1.0, 1.0, 1.0).normalize();
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
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
      //THREE.VRMUtils.removeUnnecessaryJoints(gltf.scene);
  
      THREE.VRM.from(gltf).then(vrm => {
        scene.add(vrm.scene);
        currentVrm = vrm;
        currentVrm.scene.rotation.y = Math.PI; // Rotate model 180deg to face camera
        currentVrm.scene.rotation.x = 0.2

        currentVrm.scene.position.y = 1; // up
        currentVrm.scene.position.z = -5; // move closer to camera
        currentVrm.scene.position.x = 0; // move side ways
        // Hide loading screen after avatar is loaded
        const loadingElem = document.getElementById('loading');
        if (loadingElem) loadingElem.style.display = 'none';
        // Print all bones in the model for debugging
        console.log("---------------------")
        printAllBones(currentVrm);
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
const rigRotation = (name, rotation = { x: 0, y: 0, z: 0 }) => {
    if (!currentVrm) return;
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;

    
    let euler = new THREE.Euler(
        rotation.x * globalDampener,
        rotation.y * globalDampener,
        rotation.z * globalDampener
    );
    let quaternion = new THREE.Quaternion().setFromEuler(euler);

        
    if(name=="RightLowerArm"){
        console.log("heo",Part,quaternion )
        // Part.rotation.x = Math.PI / 2; // or some large value
    }
    Part.quaternion.slerp(quaternion, globalLerpAmount);
};

const rigPosition = (name, position = { x: 0, y: 0, z: 0 }) => {
    if (!currentVrm) return;
    const Part = currentVrm.humanoid.getBoneNode(THREE.VRMSchema.HumanoidBoneName[name]);
    if (!Part) return;
    let vector = new THREE.Vector3(
        position.x * globalDampener,
        position.y * globalDampener,
        position.z * globalDampener
    );
    Part.position.lerp(vector, globalLerpAmount);
};

let oldLookTarget = new THREE.Euler();
const rigFace = (riggedFace) => {
    if (!currentVrm) return;
    rigRotation("Neck", riggedFace.head);

};

// Robust hand and finger rigging for VRM using Kalidokit.Hand.solve output
const rigHand = (vrm, riggedHand, handedness = 'Right') => {
    if (!vrm || !riggedHand) return;
    const prefix = handedness.charAt(0).toUpperCase() + handedness.slice(1); // 'Right' or 'Left'
    const boneNames = [
        'Hand',
        'ThumbProximal', 'ThumbIntermediate', 'ThumbDistal',
        'IndexProximal', 'IndexIntermediate', 'IndexDistal',
        'MiddleProximal', 'MiddleIntermediate', 'MiddleDistal',
        'RingProximal', 'RingIntermediate', 'RingDistal',
        'LittleProximal', 'LittleIntermediate', 'LittleDistal'
    ];
    boneNames.forEach((joint) => {
        let key = prefix + joint; // e.g., 'RightIndexProximal'
        const boneSchemaName = THREE.VRMSchema.HumanoidBoneName[key];
        if (!boneSchemaName) return;
        const bone = vrm.humanoid.getBoneNode(boneSchemaName);
        if (!bone) return;

        // enable this if you want movement in wrist
        if(key==="LeftHand"){
            key="LeftWrist";
        }
        if(key==="RightHand"){
            key="RightWrist";
        }
        const rot = riggedHand[key];
        if (!rot) return;

        // Apply correction quaternion for wrist to fix palm/knuckle inversion
        if (key === "LeftWrist" || key === "RightWrist") {
            // Convert to Three.js Euler
            let euler = new THREE.Euler(-rot.x, -rot.y, -rot.z, "XYZ");
            let quaternion = new THREE.Quaternion().setFromEuler(euler);
            // Correction: flip palm/knuckle orientation (180 deg Y)
            // let correction = new THREE.Quaternion();
            // correction.setFromAxisAngle(new THREE.Vector3(0, 0, 0), Math.PI);
            // quaternion.multiply(correction);
            bone.quaternion.slerp(quaternion, globalLerpAmount);
            return; // Skip the rest for wrist
        }
        // Only wrist and thumb have x/y/z, others only z
        if (joint === 'leftWrist' || joint === 'rightWrist' || joint.startsWith('Thumb')) {
            bone.rotation.x = -rot.x;
            bone.rotation.y = -rot.y;
            bone.rotation.z = -rot.z;
        } else {
            bone.rotation.z = rot.z;
        }
    });
};

/* VRM Character Animator */
const animateVRM = (vrm, results) => {
    if (!vrm) return;
    //const faceLandmarks = results.faceLandmarks;
    const pose3DLandmarks = results.ea;
    const pose2DLandmarks = results.poseLandmarks;
    const leftHandLandmarks = results.rightHandLandmarks;
    const rightHandLandmarks = results.leftHandLandmarks;
    console.log("Dhoo paaruda")
    console.log("Pose3DLandmarks:", pose3DLandmarks);
    console.log("Pose2DLandmarks:", pose2DLandmarks);

    // Animate Face for VRM
    // if (faceLandmarks && vrm) {
    //     const riggedFace = Kalidokit.Face.solve(faceLandmarks, {
    //         runtime: "mediapipe",
    //         video: videoElement
    //     });
    //     rigFace(riggedFace);
    // }

    // Animate Pose for VRM
    if (pose2DLandmarks && pose3DLandmarks && vrm) {
        const riggedPose = Kalidokit.Pose.solve(pose3DLandmarks, pose2DLandmarks, {
            runtime: "mediapipe",
            video: videoElement,
        });
       // rigRotation("Hips", riggedPose.Hips.rotation);
        rigPosition("Hips", {
            x: -riggedPose.Hips.position.x,
            y: riggedPose.Hips.position.y + 1,
            z: -riggedPose.Hips.position.z
        });

        rigRotation("Chest", riggedPose.Spine);
        rigRotation("Spine", riggedPose.Spine);
        rigRotation("RightUpperArm", riggedPose.RightUpperArm);
        rigRotation("RightLowerArm", riggedPose.RightLowerArm);
        rigRotation("LeftUpperArm", riggedPose.LeftUpperArm);
        rigRotation("LeftLowerArm", riggedPose.LeftLowerArm);
        rigRotation("LeftHand", riggedPose.LeftWrist);
        rigRotation("RightHand", riggedPose.RightWrist);


        //rigRotation("LeftUpperLeg", riggedPose.LeftUpperLeg);
        //rigRotation("LeftLowerLeg", riggedPose.LeftLowerLeg);
        //rigRotation("RightUpperLeg", riggedPose.RightUpperLeg);
        //rigRotation("RightLowerLeg", riggedPose.RightLowerLeg);
    }

    // Animate Hands for VRM
    if (leftHandLandmarks && vrm) {
        const riggedLeftHand = Kalidokit.Hand.solve(leftHandLandmarks, "Left");
        rigHand(vrm, riggedLeftHand, 'Left');
    }
    if (rightHandLandmarks && vrm) {
        const riggedRightHand = Kalidokit.Hand.solve(rightHandLandmarks, "Right");
        rigHand(vrm, riggedRightHand, 'Right');
    }
};

/* SETUP MEDIAPIPE HOLISTIC INSTANCE */
let videoElement = document.querySelector(".input_video");
let guideCanvas = document.querySelector('canvas.guides');

// Array to store all landmark data per frame
let allLandmarkFrames = [];

const onResults = (results) => {
    // // Log all landmarks for debugging
    // console.log('poseLandmarks:', results.poseLandmarks);
    // console.log('faceLandmarks:', results.faceLandmarks);
    // console.log('leftHandLandmarks:', results.leftHandLandmarks);
    // console.log('rightHandLandmarks:', results.rightHandLandmarks);

    // Collect and store landmark data for this frame
    allLandmarkFrames.push({
        timestamp: Date.now(),
        poseLandmarks: results.poseLandmarks || null,
        faceLandmarks: results.faceLandmarks || null,
        leftHandLandmarks: results.leftHandLandmarks || null,
        rightHandLandmarks: results.rightHandLandmarks || null
    });

    if (showLandmarks) {
        drawResults(results);
    } else {
        // Clear the guide canvas
        let canvasCtx = guideCanvas.getContext('2d');
        canvasCtx.clearRect(0, 0, guideCanvas.width, guideCanvas.height);
    }
    animateVRM(currentVrm, results);
};

// Add a button to download the collected landmark data as JSON
if (!document.getElementById('downloadLandmarksBtn')) {
    const btn = document.createElement('button');
    btn.id = 'downloadLandmarksBtn';
    btn.textContent = 'Download Landmarks JSON';
    btn.style.position = 'fixed';
    btn.style.top = '10px';
    btn.style.right = '10px';
    btn.style.zIndex = 1000;
    btn.onclick = function() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allLandmarkFrames, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "landmarks_data.json");
        dlAnchorElem.click();
    };
    document.body.appendChild(btn);
}

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
    refineFaceLandmarks: false,
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
    
    // if (results.faceLandmarks) {
    //     drawConnectors(canvasCtx, results.faceLandmarks, FACEMESH_TESSELATION, {
    //         color: "#C0C0C070",
    //         lineWidth: 1
    //     });
    //     if (results.faceLandmarks.length === 478) {
    //         drawLandmarks(canvasCtx, [results.faceLandmarks[468], results.faceLandmarks[468+5]], {
    //             color: "#ffe603",
    //             lineWidth: 2
    //         });
    //     }
    // }
    
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

function printAllBones(vrm) {
    if (!vrm || !vrm.humanoid) {
        console.log('No VRM or humanoid found.');
        return;
    }
    const boneMap = vrm.humanoid.humanBones;
    console.log('--- VRM Humanoid Bones ---');
    for (const boneName in boneMap) {
        const boneNode = boneMap[boneName]?.node;
        console.log(`${boneName}:`, boneNode ? boneNode.name : 'Not mapped');
    }
    console.log('--------------------------');
}