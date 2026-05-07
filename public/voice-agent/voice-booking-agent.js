/**
 * Erenst Meyer Financial Advisor — Voice Booking Agent Widget
 * Based on xAI's official Web Agent example
 * Connects to xAI Grok Voice Agent via WebSocket using ephemeral tokens
 */

class VoiceBookingAgent {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.model = options.model || 'grok-voice-think-fast-1.0';
    this.voice = options.voice || 'eve';
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processorNode = null;
    this.sourceNode = null;
    this.playbackQueue = [];
    this.isPlaying = false;
    this.currentPlaybackSource = null;
    this.isSessionConfigured = false;
    this.sampleRate = 24000; // will be overridden by native rate
    this.audioBuffer = [];
    this.totalSamples = 0;
    this.chunkSizeSamples = 2400; // 100ms at 24kHz, adjusted on init
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onBookingConfirmed = options.onBookingConfirmed || (() => {});
  }

  async start() {
    try {
      this._setState('connecting');

      // 1. Get ephemeral token from server
      const tokenRes = await fetch(`${this.apiBase}/api/session`, { method: 'POST' });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error('Failed to create session: ' + errText);
      }
      const tokenData = await tokenRes.json();
      // Response format: { client_secret: { value: "...", expires_at: ... } } or { value: "...", expires_at: ... }
      const ephemeralToken = tokenData.client_secret?.value || tokenData.value;
      if (!ephemeralToken) {
        console.error('[Ara] Token response:', tokenData);
        throw new Error('No ephemeral token received');
      }
      console.log('[Ara] Ephemeral token received');

      // 2. Initialize AudioContext with native sample rate
      this.audioContext = new AudioContext();
      this.sampleRate = this.audioContext.sampleRate;
      this.chunkSizeSamples = Math.floor(this.sampleRate * 0.1); // 100ms chunks
      console.log('[Ara] Native sample rate:', this.sampleRate);

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // 3. Connect to xAI Voice Agent
      const wsUrl = `wss://api.x.ai/v1/realtime?model=${this.model}`;
      this.ws = new WebSocket(wsUrl, [
        'realtime',
        `openai-insecure-api-key.${ephemeralToken}`,
        'openai-beta.realtime-v1'
      ]);

      this.ws.onopen = () => {
        console.log('[Ara] WebSocket connected');
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
    console.log('[Ara] Configuring session...');
    const config = {
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
        input_audio_transcription: {},
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
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: this.sampleRate
            }
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: this.sampleRate
            }
          }
        }
      }
    };

    this.ws.send(JSON.stringify(config));
  }

  _sendInitialGreeting() {
    console.log('[Ara] Session configured, sending greeting...');

    // Commit any pending audio
    this.ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));

    // Send a text greeting to kick off the conversation
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'Hello' }]
      }
    }));

    this.ws.send(JSON.stringify({ type: 'response.create' }));
  }

  async _setupMicrophone() {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

    // Use ScriptProcessorNode (same as xAI's official example)
    const bufferSize = 4096;
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.audioBuffer = [];
    this.totalSamples = 0;

    this.processorNode.onaudioprocess = (event) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.isSessionConfigured) return;

      const inputData = event.inputBuffer.getChannelData(0);

      // Buffer audio data
      this.audioBuffer.push(new Float32Array(inputData));
      this.totalSamples += inputData.length;

      // Send chunks of ~100ms
      while (this.totalSamples >= this.chunkSizeSamples) {
        const chunk = new Float32Array(this.chunkSizeSamples);
        let offset = 0;

        while (offset < this.chunkSizeSamples && this.audioBuffer.length > 0) {
          const buf = this.audioBuffer[0];
          const needed = this.chunkSizeSamples - offset;
          const available = buf.length;

          if (available <= needed) {
            chunk.set(buf, offset);
            offset += available;
            this.totalSamples -= available;
            this.audioBuffer.shift();
          } else {
            chunk.set(buf.subarray(0, needed), offset);
            this.audioBuffer[0] = buf.subarray(needed);
            offset += needed;
            this.totalSamples -= needed;
          }
        }

        // Convert Float32 to PCM16 and base64 encode
        const pcm16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        const bytes = new Uint8Array(pcm16.buffer);
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

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  _onMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch { return; }

    console.log('[Ara] Event:', data.type);

    switch (data.type) {
      case 'conversation.created':
        console.log('[Ara] Conversation created');
        // Send session config after conversation is created
        this._sendSessionUpdate();
        break;

      case 'session.updated':
        console.log('[Ara] Session configured');
        if (!this.isSessionConfigured) {
          this.isSessionConfigured = true;
          this._setupMicrophone().then(() => {
            this._sendInitialGreeting();
            this._setState('listening');
          }).catch(err => {
            this._onError('Microphone access denied: ' + err.message);
          });
        }
        break;

      // Incoming audio from Grok
      case 'response.output_audio.delta':
        if (data.delta) {
          this._playAudioChunk(data.delta);
        }
        break;

      case 'response.output_audio.done':
        this._flushAudio();
        break;

      // Transcript of assistant's spoken response
      case 'response.output_audio_transcript.delta':
        if (data.delta) {
          this.onTranscript({ role: 'assistant', text: data.delta, done: false });
        }
        break;

      case 'response.output_audio_transcript.done':
        if (data.text) {
          this.onTranscript({ role: 'assistant', text: data.text, done: true });
        }
        break;

      // User speech transcript
      case 'conversation.item.input_audio_transcription.completed':
        if (data.transcript) {
          this.onTranscript({ role: 'user', text: data.transcript, done: true });
        }
        break;

      // Also handle conversation.item.added for user transcript
      case 'conversation.item.added':
        if (data.item?.role === 'user' && data.item?.content) {
          for (const c of data.item.content) {
            if (c.type === 'input_audio' && c.transcript) {
              this.onTranscript({ role: 'user', text: c.transcript, done: true });
            }
          }
        }
        break;

      case 'response.function_call_arguments.done':
        this._handleToolCall(data);
        break;

      case 'input_audio_buffer.speech_started':
        // User started speaking — stop playback (interruption)
        this._stopPlayback();
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
    }
  }

  _playAudioChunk(base64Delta) {
    try {
      // Decode base64 to PCM16 to Float32 for playback at native sample rate
      const binary = atob(base64Delta);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      this.playbackQueue.push(float32);

      if (!this.isPlaying) {
        this._playNextChunk();
      }
    } catch (err) {
      console.error('[Ara] Audio decode error:', err);
    }
  }

  _playNextChunk() {
    if (this.playbackQueue.length === 0) {
      this.isPlaying = false;
      this.currentPlaybackSource = null;
      return;
    }

    this.isPlaying = true;
    const float32 = this.playbackQueue.shift();

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.isPlaying = false;
      return;
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.getChannelData(0).set(float32);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    this.currentPlaybackSource = source;

    source.onended = () => {
      if (this.currentPlaybackSource === source) {
        this.currentPlaybackSource = null;
      }
      this._playNextChunk();
    };

    source.start();
  }

  _flushAudio() {
    if (this.playbackQueue.length > 0 && !this.isPlaying) {
      this._playNextChunk();
    }
  }

  _stopPlayback() {
    if (this.currentPlaybackSource) {
      try {
        this.currentPlaybackSource.stop();
        this.currentPlaybackSource.disconnect();
      } catch {}
      this.currentPlaybackSource = null;
    }
    this.playbackQueue = [];
    this.isPlaying = false;
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
    this._stopPlayback();

    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.playbackQueue = [];
    this.audioBuffer = [];
    this.totalSamples = 0;
    this.isSessionConfigured = false;
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