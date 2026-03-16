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
      if (ev.candidate) {
        console.log(
          `[PeerConnection] ICE candidate peer=${peerId} type=${ev.candidate.type} ${ev.candidate.candidate.slice(0, 60)}`
        );
        if (this.onIceCandidate) {
          this.onIceCandidate(ev.candidate.toJSON());
        }
      } else {
        console.log(`[PeerConnection] ICE gathering complete peer=${peerId}`);
      }
    };

    this.pc.ondatachannel = (ev) => {
      console.log(
        `[PeerConnection] ondatachannel peer=${peerId} channel=${ev.channel.label}`
      );
      this.setupDataChannel(ev.channel);
    };

    this.pc.oniceconnectionstatechange = () => {
      console.log(
        `[PeerConnection] ICE state peer=${peerId}: ${this.pc.iceConnectionState}`
      );
    };

    this.pc.onconnectionstatechange = () => {
      console.log(
        `[PeerConnection] conn state peer=${peerId}: ${this.pc.connectionState}`
      );
    };
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    console.log(
      `[PeerConnection] setupDataChannel peer=${this.peerId} label=${dc.label} state=${dc.readyState}`
    );
    dc.onopen = () => {
      console.log(`[PeerConnection] DC OPEN peer=${this.peerId}`);
      this.events.onOpen();
    };
    dc.onclose = () => {
      console.log(`[PeerConnection] DC CLOSE peer=${this.peerId}`);
      this.events.onClose();
    };
    dc.onerror = (e) => {
      console.log(`[PeerConnection] DC ERROR peer=${this.peerId}`, e);
      this.events.onError(e);
    };
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
      console.log(
        `[PeerConnection] adding ICE candidate peer=${this.peerId} (remote desc set)`
      );
      await this.pc.addIceCandidate(candidate);
    } else {
      console.log(
        `[PeerConnection] buffering ICE candidate peer=${this.peerId} (no remote desc yet, queue=${this.candidateQueue.length + 1})`
      );
      this.candidateQueue.push(candidate);
    }
  }

  private async drainCandidateQueue(): Promise<void> {
    for (const c of this.candidateQueue) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {
        /* ignore stale candidates */
      }
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
