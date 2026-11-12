// Voice prompt recording, as small as speech allows: one channel at 16 kHz with the browser's noise suppression,
// encoded as Opus at its lowest useful bitrate (~8 kbps, about 1 KB a second). Safari, which can't record Opus,
// falls back to low-bitrate AAC in MP4. Gemini bills audio by duration, so the size only saves upload time.

const BITRATE = 8000;
// Ogg first: Gemini lists it; WebM Opus is Chrome's only Opus container; MP4 is Safari's.
const TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4"];
const CONSTRAINTS = {
  audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};
// A voice prompt, not a podcast: stop on its own after this long.
export const MAX_RECORDING_MS = 60_000;

export const canRecord = () =>
  typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

const pickType = () => TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";

// Starts recording. Returns { stop, cancel, done }: done resolves to the recorded Blob once it stops (by stop() or
// the length cap), or null if cancelled or silent-empty.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
  const mimeType = pickType();
  const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: BITRATE });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  let cancelled = false;
  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(!cancelled && chunks.length ? new Blob(chunks, { type: recorder.mimeType || mimeType }) : null);
    };
  });
  recorder.start();
  const timer = setTimeout(() => recorder.state !== "inactive" && recorder.stop(), MAX_RECORDING_MS);
  return {
    stop() {
      clearTimeout(timer);
      if (recorder.state !== "inactive") recorder.stop();
    },
    cancel() {
      cancelled = true;
      this.stop();
    },
    done,
  };
}
