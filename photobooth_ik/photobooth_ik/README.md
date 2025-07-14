# Photobooth IK Project

This project is a browser-based photobooth application that uses 3D avatars (VRM models) and real-time body/face/hand tracking to animate the avatar based on webcam input. It leverages Three.js for 3D rendering, Kalidokit for pose/face/hand solving, and MediaPipe Holistic for landmark detection.

## Overview

- **index.html**: The main HTML file that sets up the UI, video input, and canvas elements for rendering the 3D avatar and guides.
- **script.js**: The main JavaScript file that handles:
  - Setting up the Three.js scene, camera, lights, and renderer
  - Loading and displaying a VRM avatar model
  - Integrating MediaPipe Holistic for real-time face, pose, and hand landmark detection from webcam
  - Using Kalidokit to solve landmarks and animate the VRM avatar accordingly
  - UI controls for toggling face movement, capturing photos, and showing/hiding landmarks or the avatar
  - Capturing and downloading a photo of the current scene (video, avatar, and/or landmarks)

## Features

- **Live 3D Avatar Animation**: Animates a VRM model in real-time based on your body, face, and hand movements detected from your webcam.
- **Photo Capture**: Take a snapshot of the current scene, including the avatar, video, and landmarks.
- **UI Controls**: Toggle face movement, show/hide avatar or landmarks, and download captured photos.

## Setup Instructions

1. **Clone or download this repository** to your local machine.
2. **Start a local HTTP server** in the project directory [ Live Server helps ].
3. **Open `index.html` in your browser** (e.g., go to `http://localhost:8000/index.html`).
4. **Allow webcam access** when prompted.
5. The 3D avatar should appear and animate according to your movements. Use the UI buttons to capture photos or toggle features.

## File Descriptions

### index.html

- Sets up the HTML structure, including:
  - Video element for webcam input
  - Canvas for drawing landmarks/guides
  - UI buttons for toggling features and capturing photos
  - Container for displaying the captured photo

### script.js

- **Three.js Setup**: Initializes the renderer, camera, scene, lights, and controls.
- **VRM Model Loading**: Loads a VRM avatar from the `models/` directory and adds it to the scene.
- **MediaPipe Holistic Integration**: Sets up the Holistic model to detect face, pose, and hand landmarks from the webcam video.
- **Kalidokit Integration**: Uses Kalidokit to convert MediaPipe landmarks into VRM bone rotations/positions for realistic animation.
- **Animation Loop**: Continuously updates the avatar based on the latest detected landmarks.
- **UI Controls**: Handles button clicks for toggling face movement, capturing photos, and showing/hiding UI elements.
- **Photo Capture**: Combines the video, landmarks, and avatar into a single image for download.

## Adding/Changing Avatars

- Place your `.vrm` files in the `models/` directory.
- Update the model path in `script.js` if you want to load a different avatar by default.

## Troubleshooting

- If the avatar does not appear or animate, check the browser console for errors.
- Make sure you are running a local server (not opening the file directly with `file://`).
- Ensure your webcam is connected and allowed by the browser.

## Useful Links

- [Three.js Documentation](https://threejs.org/docs/)
- [Kalidokit](https://github.com/yeemachine/kalidokit)
- [MediaPipe Holistic](https://google.github.io/mediapipe/solutions/holistic.html)
- [VRM Specification](https://vrm.dev/en/)

## For Future Developers

- Read through `script.js` to understand how the 3D scene and avatar are set up and animated.
- Experiment with the UI and try changing the VRM model or UI features.
- Use the browser console for debugging and learning how the data flows from webcam to avatar.
- If you want to extend the project, consider adding new UI features, supporting more avatars, or improving the animation logic.
