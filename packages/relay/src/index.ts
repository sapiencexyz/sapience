export { MeshClient } from './mesh/MeshClient';
export { MeshTransport } from './mesh/MeshTransport';
export { GossipProtocol } from './gossip/GossipProtocol';
export { PeerManager } from './peer/PeerManager';
export { PeerConnection } from './peer/PeerConnection';

export type { MeshConfig, MessageHandler } from './mesh/MeshClient';
export type { GossipMessage, GossipConfig } from './gossip/GossipProtocol';
export type { PeerManagerConfig, PeerManagerEvents } from './peer/PeerManager';
export type { PeerConnectionEvents } from './peer/PeerConnection';
