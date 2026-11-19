import type { Conversation, PartialOptions } from '@elevenlabs/client';

type StartSession = (options: PartialOptions) => Promise<Conversation>;
type Channel = 'voice' | 'chat';

export function attachReceptionist(panel: HTMLElement, form: HTMLFormElement, startSession: StartSession) {
  const agentId = panel.dataset.agentId;
  if (!agentId) return;
  const voice = panel.querySelector<HTMLButtonElement>('#ara-call')!;
  const chat = panel.querySelector<HTMLButtonElement>('#ara-chat')!;
  const status = panel.querySelector<HTMLElement>('#ara-status')!;
  const messages = panel.querySelector<HTMLElement>('#ara-messages')!;
  const compose = panel.querySelector<HTMLFormElement>('#ara-compose')!;
  const input = compose.querySelector('input')!;
  const canSpeak = Boolean(navigator.mediaDevices?.getUserMedia);
  const unavailable = 'Ara could not connect. Please try again or use the callback form.';
  let session: Conversation | undefined;
  let channel: Channel | undefined;
  let attempt = 0;
  const voiceValues = new Map<string, string>();

  function reset(message: string) {
    attempt++;
    session = undefined;
    channel = undefined;
    voice.hidden = !canSpeak;
    chat.hidden = false;
    voice.textContent = 'Start voice call';
    chat.textContent = 'Type to Ara';
    compose.hidden = true;
    input.value = '';
    status.textContent = message;
  }

  function stop(message: string) {
    const previous = session;
    reset(message);
    void previous?.endSession().catch(() => {});
  }

  function addMessage(who: string, message: string) {
    const line = document.createElement('p');
    const speaker = document.createElement('strong');
    speaker.textContent = who + ' ';
    line.append(speaker, message);
    messages.append(line);
    messages.hidden = false;
    messages.scrollTop = messages.scrollHeight;
  }

  function prepareCallback(details: Record<string, unknown>) {
    if (!details || typeof details.name !== 'string' || !details.name.trim() ||
        typeof details.phone !== 'string' || details.phone.replace(/\D/g, '').length < 7) {
      return 'Please confirm the visitor’s name and phone number before preparing the form.';
    }
    for (const field of ['name', 'phone', 'preferred_time', 'reason']) {
      const control = form.elements.namedItem(field);
      const value = details[field];
      if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) || typeof value !== 'string') continue;
      // Keep details the visitor has already edited themselves.
      if (control.value && control.value !== voiceValues.get(field)) continue;
      control.value = value.trim().slice(0, control.maxLength);
      voiceValues.set(field, control.value);
    }
    const optional = form.querySelector('details');
    if (optional && (details.preferred_time || details.reason)) optional.open = true;
    const notice = form.querySelector('#callback-status');
    if (notice) notice.textContent = 'Ara has prepared your details. Review the form and select Request a call back to send it.';
    form.querySelector<HTMLInputElement>('[name="name"]')?.focus();
    return 'The callback form is ready for review. Ask the visitor to check it and select Request a call back to send it.';
  }

  async function start(next: Channel) {
    if (channel) {
      stop('Conversation ended.');
      return;
    }
    channel = next;
    const current = ++attempt;
    const textOnly = next === 'chat';
    const button = textOnly ? chat : voice;
    voice.hidden = textOnly;
    chat.hidden = !textOnly;
    button.textContent = 'Cancel';
    messages.replaceChildren();
    messages.hidden = true;
    status.textContent = textOnly ? 'Connecting to Ara…' : 'Connecting. Allow microphone access if your browser asks.';
    try {
      const connected = await startSession({
        agentId,
        textOnly,
        connectionType: 'websocket',
        clientTools: {
          prepare_callback: (details) => current === attempt ? prepareCallback(details) : 'Conversation ended.'
        },
        onModeChange: ({ mode }) => {
          if (current === attempt && !textOnly) status.textContent = mode === 'speaking' ? 'Ara is speaking.' : 'Ara is listening.';
        },
        onMessage: ({ role, message }) => {
          if (current !== attempt || (textOnly && role === 'user')) return;
          addMessage(role === 'agent' ? 'Ara' : 'You', message);
        },
        onDisconnect: ({ reason }) => {
          if (current === attempt) reset(reason === 'error' ? unavailable : 'Conversation ended.');
        },
        onError: () => {
          if (current === attempt) stop(unavailable);
        }
      });
      if (current !== attempt) {
        await connected.endSession();
        return;
      }
      session = connected;
      button.textContent = textOnly ? 'End chat' : 'End call';
      status.textContent = 'Connected to Ara.';
      if (textOnly) { compose.hidden = false; input.focus(); }
    } catch (error) {
      if (current !== attempt) return;
      const denied = error instanceof Error && error.name === 'NotAllowedError';
      reset(denied ? 'Microphone access was declined. You can type to Ara or use the callback form.' : unavailable);
    }
  }

  reset(canSpeak ? '' : 'You can type to Ara on this device.');
  voice.addEventListener('click', () => { void start('voice'); });
  chat.addEventListener('click', () => { void start('chat'); });
  compose.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || !session || channel !== 'chat') return;
    try {
      session.sendUserMessage(message);
      addMessage('You', message);
      input.value = '';
      input.focus();
    } catch {
      stop('Your message could not be sent. Please try again or use the callback form.');
    }
  });
  window.addEventListener('pagehide', () => { stop('Conversation ended.'); });
}
