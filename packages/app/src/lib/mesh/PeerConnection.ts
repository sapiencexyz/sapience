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
  private debug: boolean;
  onIceCandidate: ((candidate: RTCIceCandidateInit) => void) | null = null;

  constructor(
    peerId: string,
    config: RTCConfiguration | undefined,
    events: PeerConnectionEvents,
    debug = false
  ) {
    this.peerId = peerId;
    this.events = events;
    this.debug = debug;
    this.pc = new RTCPeerConnection(config ?? RTC_CONFIG);

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.log(
          `ICE candidate peer=${peerId} type=${ev.candidate.type} ${ev.candidate.candidate.slice(0, 60)}`
        );
        if (this.onIceCandidate) {
          this.onIceCandidate(ev.candidate.toJSON());
        }
      } else {
        this.log(`ICE gathering complete peer=${peerId}`);
      }
    };

    this.pc.ondatachannel = (ev) => {
      this.log(`ondatachannel peer=${peerId} channel=${ev.channel.label}`);
      this.setupDataChannel(ev.channel);
    };

    this.pc.oniceconnectionstatechange = () => {
      this.log(`ICE state peer=${peerId}: ${this.pc.iceConnectionState}`);
    };

    this.pc.onconnectionstatechange = () => {
      this.log(`conn state peer=${peerId}: ${this.pc.connectionState}`);
    };
  }

  private log(msg: string): void {
    if (this.debug) console.log(`[PeerConnection] ${msg}`);
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    // Clear old data channel listeners before replacing
    if (this.dc) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onerror = null;
      this.dc.onmessage = null;
    }
    this.dc = dc;
    this.log(
      `setupDataChannel peer=${this.peerId} label=${dc.label} state=${dc.readyState}`
    );
    dc.onopen = () => {
      this.log(`DC OPEN peer=${this.peerId}`);
      this.events.onOpen();
    };
    dc.onclose = () => {
      this.log(`DC CLOSE peer=${this.peerId}`);
      this.events.onClose();
    };
    dc.onerror = (e) => {
      this.log(`DC ERROR peer=${this.peerId}`);
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
      this.log(`adding ICE candidate peer=${this.peerId} (remote desc set)`);
      await this.pc.addIceCandidate(candidate);
    } else {
      this.log(
        `buffering ICE candidate peer=${this.peerId} (no remote desc yet, queue=${this.candidateQueue.length + 1})`
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
    // Clear data channel listeners
    if (this.dc) {
      this.dc.onopen = null;
      this.dc.onclose = null;
      this.dc.onerror = null;
      this.dc.onmessage = null;
      this.dc.close();
    }
    // Clear RTCPeerConnection listeners
    this.pc.onicecandidate = null;
    this.pc.ondatachannel = null;
    this.pc.oniceconnectionstatechange = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
