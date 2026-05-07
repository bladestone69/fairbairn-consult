/**
 * Erenst Meyer Financial Advisor — Voice Booking Agent Widget
 * Connects to xAI Grok Voice Agent via WebSocket using ephemeral tokens
 * for secure, server-side-authenticated voice conversations.
 */

class VoiceBookingAgent {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '';
    this.model = options.model || 'grok-voice-think-fast-1.0';
    this.voice = options.voice || 'eve'; // Warm, friendly — fits financial advisor
    this.ws = null;
    this.isListening = false;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaProcessor = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onError = options.onError || (() => {});
    this.onBookingConfirmed = options.onBookingConfirmed || (() => {});
  }

  async start() {
    try {
      this._setState('connecting');
      
      // 1. Get ephemeral token from our server
      const tokenRes = await fetch(`${this.apiBase}/api/session`, { method: 'POST' });
      if (!tokenRes.ok) throw new Error('Failed to create session');
      const tokenData = await tokenRes.json();
      const ephemeralToken = tokenData.client_secret?.value || tokenData.value;
      if (!ephemeralToken) throw new Error('No ephemeral token received');

      // 2. Connect to xAI Voice Agent via WebSocket
      const wsUrl = `wss://api.x.ai/v1/realtime?model=${this.model}`;
      this.ws = new WebSocket(wsUrl, [`xai-client-secret.${ephemeralToken}`]);

      this.ws.onopen = () => this._onOpen();
      this.ws.onmessage = (e) => this._onMessage(e);
      this.ws.onerror = (e) => this._onError('WebSocket error');
      this.ws.onclose = () => this._onClose();

    } catch (err) {
      this._onError(err.message);
    }
  }

  async _onOpen() {
    // Configure the session with our booking agent persona
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
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 800
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
        audio: {
          input: { format: { type: 'audio/pcm', rate: 24000 } },
          output: { format: { type: 'audio/pcm', rate: 24000 } }
        }
      }
    }));

    // Set up microphone
    await this._setupMicrophone();
    this._setState('listening');
  }

  async _setupMicrophone() {
    this.audioContext = new AudioContext({ sampleRate: 24000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    
    const processorConfig = {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    };

    // Use AudioWorklet for better performance
    await this.audioContext.audioWorklet.addModule('/voice-agent/audio-processor.js');
    this.mediaProcessor = new AudioWorkletNode(this.audioContext, 'pcm-processor', processorConfig);

    this.mediaProcessor.port.onmessage = (e) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Convert Float32 to Int16 PCM
        const int16 = new Int16Array(e.data.length);
        for (let i = 0; i < e.data.length; i++) {
          const s = Math.max(-1, Math.min(1, e.data[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        this.ws.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: btoa(String.fromCharCode(...new Uint8Array(int16.buffer)))
        }));
      }
    };

    source.connect(this.mediaProcessor);
    this.mediaProcessor.connect(this.audioContext.destination);
  }

  _onMessage(event) {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'session.created':
        console.log('Voice session created');
        break;

      case 'session.updated':
        console.log('Voice session configured');
        break;

      case 'response.audio.delta':
        // Incoming audio from Grok — queue for playback
        this._queueAudio(data.delta);
        break;

      case 'response.audio.done':
        this._flushAudio();
        break;

      case 'response.text.delta':
        this.onTranscript({ role: 'assistant', text: data.delta, done: false });
        break;

      case 'response.text.done':
        this.onTranscript({ role: 'assistant', text: data.text || '', done: true });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.onTranscript({ role: 'user', text: data.transcript, done: true });
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

      case 'error':
        this._onError(data.error?.message || 'Voice agent error');
        break;
    }
  }

  async _handleToolCall(data) {
    const args = JSON.parse(data.arguments || '{}');
    let result;

    const secret = 'changeme-setup-env-var'; // Must match BOOKING_API_SECRET on server

    if (data.name === 'save_callback_request') {
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
    } else {
      result = { error: 'Unknown function: ' + data.name };
    }

    // Send tool result back to Grok
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: data.call_id,
        output: JSON.stringify(result)
      }
    }));
  }

  _queueAudio(base64Delta) {
    const binary = atob(base64Delta);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    
    // Convert Int16 PCM back to Float32 for AudioContext
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
    }
    
    this.audioQueue.push(float32);
    if (!this.isPlaying) this._playAudio();
  }

  _playAudio() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    const float32 = this.audioQueue.shift();
    const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);
    
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.onended = () => this._playAudio();
    source.start();
  }

  _flushAudio() {
    // Process remaining audio
  }

  _onError(message) {
    console.error('Voice agent error:', message);
    this.onError(message);
    this._setState('error');
  }

  _onClose() {
    console.log('Voice session closed');
    this._setState('disconnected');
    this._cleanup();
  }

  _setState(state) {
    this.isListening = state === 'listening' || state === 'user_speaking';
    this.onStateChange(state);
  }

  _cleanup() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.mediaProcessor) {
      this.mediaProcessor.disconnect();
      this.mediaProcessor = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
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