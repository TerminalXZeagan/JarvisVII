// Shared error type + plain-English messages for the user.
// Technical details stay in the console log; the screen shows friendlyMessage().

export class JarvisError extends Error {
  constructor(code, detail = "", cause = undefined) {
    super(detail || code);
    this.name = "JarvisError";
    this.code = code;
    this.detail = detail;
    if (cause) this.cause = cause;
  }
}

const MESSAGES = {
  mic_denied: "JARVIS can't access the microphone. Please allow microphone permission for this site in your browser settings.",
  audio_capture: "I can't find a working microphone on this phone.",
  stt_unsupported: "This browser can't do speech recognition. Please use Chrome on Android or Safari on iPhone.",
  stt_network: "Speech recognition couldn't reach its service. Please check your internet connection.",
  stt_failed: "I couldn't understand that. Please try again.",
  no_speech: "I didn't hear anything. Tap the button and try again.",
  tts_unsupported: "This browser can't speak out loud. The answer is shown on screen instead.",
  tts_failed: "The response was generated, but I couldn't play the audio.",
  no_key: "No API key yet. Open Settings and paste your key.",
  bad_settings: "The AI settings look incomplete. Open Settings and check them.",
  auth: "The AI service rejected the API key. Open Settings and check it.",
  quota: "The free quota for the AI service is used up for now. Please wait a little and try again.",
  bad_request: "The AI service didn't accept the request. The model name in Settings may be wrong.",
  network: "I can't reach the service right now. Please check your internet connection.",
  unavailable: "The AI service isn't available right now.",
  bad_response: "The AI service sent a reply I couldn't read.",
  aborted: "Cancelled.",
};

export function friendlyMessage(err) {
  return MESSAGES[err && err.code] || "Something went wrong. Please try again.";
}

export const ERROR_CODES = Object.keys(MESSAGES);
