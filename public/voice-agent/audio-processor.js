/**
 * Audio Worklet Processor for capturing microphone PCM data
 * Runs in a separate audio thread for performance
 */

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      // Clone the Float32 data to avoid buffer reuse issues
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);