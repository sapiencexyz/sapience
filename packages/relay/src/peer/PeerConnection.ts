export interface PeerConnectionEvents {
  onOpen: () => void;
  onClose: () => void;
  onMessage: (data: string) => void;
  onError: (err: unknown) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class PeerConnection {
  readonly peerId: string;
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private events: PeerConnectionEvents;
  private hasRemoteDesc = false;
  private candidateQueue: RTCIceCandidateInit[] = [];
  onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;

  constructor(
    peerId: string,
    config: RTCConfiguration | undefined,
    events: PeerConnectionEvents
  ) {
    this.peerId = peerId;
    this.events = events;
    this.pc = new RTCPeerConnection(config ?? RTC_CONFIG);

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.onIceCandidate) {
        this.onIceCandidate(ev.candidate.toJSON());
      }
    };

    this.pc.ondatachannel = (ev) => {
      this.setupDataChannel(ev.channel);
    };
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.onopen = () => this.events.onOpen();
    dc.onclose = () => this.events.onClose();
    dc.onerror = (e) => this.events.onError(e);
    dc.onmessage = (ev) => this.events.onMessage(String(ev.data));
    if (dc.readyState === 'open') this.events.onOpen();
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const dc = this.pc.createDataChannel('sapience-relay', { ordered: true });
    this.setupDataChannel(dc);
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription(offer);
    this.hasRemoteDesc = true;
    await this.drainCandidateQueue();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(answer);
    this.hasRemoteDesc = true;
    await this.drainCandidateQueue();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.hasRemoteDesc) {
      await this.pc.addIceCandidate(candidate);
    } else {
      // Buffer until remote description is set
      this.candidateQueue.push(candidate);
    }
  }

  private async drainCandidateQueue(): Promise<void> {
    for (const c of this.candidateQueue) {
      try {
        await this.pc.addIceCandidate(c);
      } catch { /* ignore stale candidates */ }
    }
    this.candidateQueue = [];
  }

  send(data: string): boolean {
    if (this.dc && this.dc.readyState === 'open') {
      this.dc.send(data);
      return true;
    }
    return false;
  }

  get isOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  close(): void {
    this.dc?.close();
    this.pc.close();
  }
}
