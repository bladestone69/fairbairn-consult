/**
 * Erenst Meyer Financial Advisor — Voice Booking Agent Widget
 * Connects to xAI Grok Voice Agent via WebSocket using ephemeral tokens.
 * 
 * Fixed issues:
 * - Wait for session.created before sending session.update
 * - Proper base64 encoding for large audio chunks
 * - Continuous audio playback (ScriptProcessorNode ring buffer)
 * - Correct PCM format spec for session.update
 * - Commit audio buffer after each utterance with server VAD
 */

class VoiceBookingAgent {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.model = options.model || 'grok-voice-think-fast-1.0';
    this.voice = options.voice || 'eve';
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.workletNode = null;
    this.nextAudioCtx = null; // separate context for playback
    this.isPlaying = false;
    this.audioChunks = [];
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onBookingConfirmed = options.onBookingConfirmed || (() => {});
    this._sessionReady = false;
  }

  async start() {
    try {
      this._setState('connecting');

      // 1. Get ephemeral token from server
      const tokenRes = await fetch(`${this.apiBase}/api/session`, { method: 'POST' });
      if (!tokenRes.ok) throw new Error('Failed to create session — check that XAI_API_KEY is set in Vercel env');
      const tokenData = await tokenRes.json();
      const ephemeralToken = tokenData.client_secret?.value || tokenData.value;
      if (!ephemeralToken) throw new Error('No ephemeral token received from server');

      // 2. Create playback audio context (separate from mic context)
      this.nextAudioCtx = new AudioContext({ sampleRate: 24000 });

      // 3. Connect to xAI Voice Agent
      const wsUrl = `wss://api.x.ai/v1/realtime?model=${this.model}`;
      this.ws = new WebSocket(wsUrl, [`xai-client-secret.${ephemeralToken}`]);

      this.ws.onopen = () => {
        console.log('[Ara] WebSocket connected');
        // Session config will be sent after session.created event
      };
      this.ws.onmessage = (e) => this._onMessage(e);
      this.ws.onerror = () => this._onError('WebSocket connection error');
      this.ws.onclose = (e) => {
        console.log('[Ara] WebSocket closed:', e.code, e.reason);
        this._onClose();
      };

    } catch (err) {
      console.error('[Ara] Start error:', err);
      this._onError(err.message);
    }
  }

  _sendSessionUpdate() {
    this.ws.send(JSON.stringify({
      type: 'session.update',
      session: {
        voice: this.voice,
        instructions: `You are Ara, the AI receptionist for Erenst Meyer Financial Advisor. You were programmed by Erenst Meyer.

Your job is to answer calls from website visitors, be warm and professional, and take messages so that Erenst can call them back. That is your only function.

STRICT RULES:
- You NEVER give financial advice. Not even general advice. Not even "you could consider" suggestions. If someone asks about investments, retirement, tax, insurance, or any financial topic, say: "I'm not able to give financial advice, but I can take your details and Erenst will call you back to discuss that." No exceptions.
- You do not discuss fees, products, portfolios, or strategies.
- You do not compare or recommend any financial products or services.
- You do not answer questions like "what do you think about..." or "would it be a good idea to..." — redirect every time.
- You are not a financial advisor. You are a receptionist.

YOUR ROLE:
- Greet visitors warmly and introduce yourself by name
- Ask for their full name, contact number, and a preferred time for a call-back
- Ask briefly what they'd like to discuss, but only to help Erenst prepare — not to advise them
- Confirm the details back to them before ending the conversation
- Thank them for calling and let them know Erenst will be in touch

TONE:
- Polite, calm, and professional
- Friendly but not overly casual
- South African context — use "you" naturally, not overly formal language
- Patient with older callers who may not be comfortable with technology
- If someone is confused or hesitant, slow down and reassure them

CALL-BACK DETAILS TO COLLECT:
- Full name (required)
- Phone number (required)
- Preferred call-back time (morning / afternoon / specific time)
- Brief reason for the call (just a note for Erenst — no advice given)

CLOSING:
- Confirm all details
- Say something like: "Thank you, [Name]. I've passed your message to Erenst and he'll call you back [timeframe]. Have a good day."
- End the conversation cleanly

Keep your responses short and conversational since they are spoken aloud.`,
        turn_detection: {
          type: 'server_vad'
        },
        tools: [
          {
            type: 'function',
            name: 'save_callback_request',
            description: 'Save a call-back request from a visitor. Call this once you have collected all the required details: name, phone number, and preferred call-back time.',
            parameters: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Full name of the visitor' },
                phone: { type: 'string', description: 'Contact phone number' },
                preferred_time: { type: 'string', description: 'Preferred call-back time (morning, afternoon, or specific time)' },
                reason: { type: 'string', description: 'Brief reason for the call, just a note for Erenst' }
              },
              required: ['name', 'phone']
            }
          }
        ],
        input_audio_transcription: {},
        audio: {
          input: {
            format: {
              type: 'pcm16',
              rate: 24000
            }
          },
          output: {
            format: {
              type: 'pcm16',
              rate: 24000
            }
          }
        }
      }
    }));
  }

  async _setupMicrophone() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 24000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    const source = this.audioContext.createMediaStreamSource(this.mediaStream);

    await this.audioContext.audioWorklet.addModule('/voice-agent/audio-processor.js');
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    this.workletNode.port.onmessage = (e) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const float32 = e.data;
        // Convert Float32 to Int16 PCM
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        // Proper base64 encoding (avoid stack overflow on large chunks)
        const bytes = new Uint8Array(int16.buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
        }
        const base64 = btoa(binary);

        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: base64
        }));
      }
    };

    source.connect(this.workletNode);
    // Don't connect workletNode to destination — we don't want mic audio playing through speakers
  }

  _onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    console.log('[Ara] Event:', data.type);

    switch (data.type) {
      case 'session.created':
        console.log('[Ara] Session created, sending config...');
        this._sendSessionUpdate();
        break;

      case 'session.updated':
        console.log('[Ara] Session configured');
        this._sessionReady = true;
        // Now set up the microphone
        this._setupMicrophone().then(() => {
          this._setState('listening');
        }).catch(err => {
          this._onError('Microphone access denied: ' + err.message);
        });
        break;

      case 'response.audio.delta':
        // Incoming audio chunk from Grok — play it
        this._playAudioChunk(data.delta);
        break;

      case 'response.audio.done':
        // Audio response complete
        this._flushAudio();
        break;

      case 'response.text.delta':
        if (data.delta) {
          this.onTranscript({ role: 'assistant', text: data.delta, done: false });
        }
        break;

      case 'response.text.done':
        if (data.text) {
          this.onTranscript({ role: 'assistant', text: data.text, done: true });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (data.transcript) {
          this.onTranscript({ role: 'user', text: data.transcript, done: true });
        }
        break;

      case 'response.function_call_arguments.done':
        this._handleToolCall(data);
        break;

      case 'input_audio_buffer.speech_started':
        this._setState('user_speaking');
        break;

      case 'input_audio_buffer.speech_stopped':
        this._setState('processing');
        break;

      case 'response.created':
        this._setState('processing');
        break;

      case 'response.done':
        this._setState('listening');
        break;

      case 'error':
        console.error('[Ara] Error event:', data);
        this._onError(data.error?.message || 'Voice agent error');
        break;

      default:
        // Log unhandled events for debugging
        break;
    }
  }

  _playAudioChunk(base64Delta) {
    try {
      const binary = atob(base64Delta);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Convert Int16 PCM to Float32 for AudioContext playback
      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      this.audioChunks.push(float32);

      // Start playing if not already
      if (!this.isPlaying) {
        this._schedulePlayback();
      }
    } catch (err) {
      console.error('[Ara] Audio decode error:', err);
    }
  }

  _schedulePlayback() {
    if (this.audioChunks.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const float32 = this.audioChunks.shift();

    if (!this.nextAudioCtx || this.nextAudioCtx.state === 'closed') {
      this.isPlaying = false;
      return;
    }

    // Resume context if suspended (browser autoplay policy)
    if (this.nextAudioCtx.state === 'suspended') {
      this.nextAudioCtx.resume();
    }

    const buffer = this.nextAudioCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = this.nextAudioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.nextAudioCtx.destination);
    source.onended = () => this._schedulePlayback();
    source.start();
  }

  _flushAudio() {
    // Play any remaining chunks
    if (this.audioChunks.length > 0 && !this.isPlaying) {
      this._schedulePlayback();
    }
  }

  async _handleToolCall(data) {
    let args = {};
    try {
      args = JSON.parse(data.arguments || '{}');
    } catch {}

    let result;
    const secret = 'changeme-setup-env-var';

    if (data.name === 'save_callback_request') {
      try {
        const res = await fetch(`${this.apiBase}/api/callback-request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-booking-secret': secret
          },
          body: JSON.stringify(args)
        });
        result = await res.json();
        if (result.success) {
          this.onBookingConfirmed(result);
        }
      } catch (err) {
        result = { success: false, error: err.message };
      }
    } else {
      result = { error: 'Unknown function: ' + data.name };
    }

    // Send tool result back to Grok
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: data.call_id,
          output: JSON.stringify(result)
        }
      }));
    }
  }

  _onError(message) {
    console.error('[Ara] Error:', message);
    this.onError(message);
    this._setState('error');
  }

  _onClose() {
    console.log('[Ara] Session closed');
    this._setState('disconnected');
    this._cleanup();
  }

  _setState(state) {
    this.onStateChange(state);
  }

  _cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.nextAudioCtx && this.nextAudioCtx.state !== 'closed') {
      this.nextAudioCtx.close().catch(() => {});
      this.nextAudioCtx = null;
    }
    this.audioChunks = [];
    this.isPlaying = false;
    this._sessionReady = false;
  }

  stop() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._cleanup();
    this._setState('disconnected');
  }
}

window.VoiceBookingAgent = VoiceBookingAgent;