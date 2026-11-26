/**
 * Video selection + MediaPipe pose tracking
 */
import { applyPose, getNodeInfo, resetPose } from "./pose";

const MEDIAPIPE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// how accurate is the model (lite, full, heavy)
const POSE_MODEL = "full";

/**
 * @param {Object} dancer the joints returned by buildDancer()
 */
export function setupTracking(dancer) {
  let PoseLandmarker, FilesetResolver, DrawingUtils, drawingUtils;

  // get controls, video and mediapipe canvas elements from HTML
  const smoothingSlider = document.getElementById("smoothing");
  const rotTorsoControl = document.getElementById("rotTorso");
  const mirrorControl = document.getElementById("mirror"); // mirroring for help LEARNING dances! :D
  const invertDepthControl = document.getElementById("invertDepth");
  const danceSelect = document.getElementById("danceSelect");
  const video = document.getElementById("video");
  const overlay = document.getElementById("overlay");
  const overlayCtx = overlay.getContext("2d");
  const statusText = document.getElementById("status");
  const fileInput = document.getElementById("videoFile");

  // setup mediapipe variable
  let poseLandmarker = null;
  let lastVideoTime = -1;
  let lastTimeStamp = 0;
  let currentURL = null;

  // initialize mediapipe
  async function initMediaPipe() {
    // loaded straight from the CDN at runtime, webpackIgnore keeps webpack out of it
    ({ PoseLandmarker, FilesetResolver, DrawingUtils } = await import(
      /* webpackIgnore: true */ MEDIAPIPE_URL
    ));
    drawingUtils = new DrawingUtils(overlayCtx);

    const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_URL}/wasm`);
    const make = delegate => PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${POSE_MODEL}/float16/1/pose_landmarker_${POSE_MODEL}.task`,
        delegate
      },
      runningMode: "VIDEO",
      numPoses: 1
    });
    try {
      // try to use the GPU for the landmarker
      poseLandmarker = await make("GPU");
    }
    catch (e) {
      // fall back to CPU if GPU doesn't work
      console.warn("GPU delegate failed, using CPU", e);
      poseLandmarker = await make("CPU");
    }
    statusText.textContent = "Pose model ready. Choose an .mp4 to begin.";
  }

  function detect() {
    if (!poseLandmarker || video.readyState < 2) return;
    const timeStamp = Math.max(performance.now(), lastTimeStamp + 1);
    lastTimeStamp = timeStamp;
    const poseOut = poseLandmarker.detectForVideo(video, timeStamp);

    overlayCtx.drawImage(video, 0, 0, overlay.width, overlay.height);
    if (poseOut.landmarks && poseOut.landmarks.length > 0) {
      drawingUtils.drawConnectors(poseOut.landmarks[0], PoseLandmarker.POSE_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
      drawingUtils.drawLandmarks(poseOut.landmarks[0], { color: "#FF0000", lineWidth: 1, radius: 3 });
      if (poseOut.worldLandmarks && poseOut.worldLandmarks.length > 0) {
        getNodeInfo(poseOut.worldLandmarks[0], {
          smoothing: Number(smoothingSlider.value),
          mirror: mirrorControl.checked,
          invertDepth: invertDepthControl.checked,
        });
        applyPose(dancer, { rotateTorso: rotTorsoControl.checked });
      }
    }
  }

  function videoLoop() {
    if (!video.paused && !video.ended && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      detect();
    }
    requestAnimationFrame(videoLoop);
  }
  videoLoop();

  video.addEventListener("seeked", () => { lastVideoTime = video.currentTime; detect(); });

  video.addEventListener("loadedmetadata", () => {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    resetPose();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = URL.createObjectURL(file);
    video.src = currentURL;
    statusText.textContent = poseLandmarker ? `Tracking: ${file.name}` : "Video loaded, waiting for pose model…";
    video.play().catch(() => { statusText.textContent = "Press play on the video to start."; });
  });

  // Handle Dropdown selection for preset dances in ./savedDances/
  danceSelect.addEventListener("change", () => {
    const selectedUrl = danceSelect.value;
    if (!selectedUrl) return;

    // Clear local file input selection
    fileInput.value = "";

    if (currentURL) {
      URL.revokeObjectURL(currentURL);
      currentURL = null;
    }

    video.src = selectedUrl;
    const selectedName = danceSelect.options[danceSelect.selectedIndex].text;
    statusText.textContent = poseLandmarker ? `Tracking: ${selectedName}` : "Video loaded, waiting for pose model…";
    video.play().catch(() => { statusText.textContent = "Press play on the video to start."; });
  });

  initMediaPipe().catch(e => { console.error(e); statusText.textContent = "Failed to load pose model (see console)."; });
}
