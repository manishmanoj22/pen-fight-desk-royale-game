import { io, Socket } from 'socket.io-client';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

export type PenState = { x: number; y: number; angle: number };
export type DeskState = { player: PenState; ai: PenState };

// Where the game server is:
// - Deployed: set EXPO_PUBLIC_SERVER_URL (e.g. in frontend/.env) to its URL,
//   e.g. EXPO_PUBLIC_SERVER_URL=https://pen-fight-desk-royale.up.railway.app
// - Local development: the server runs on the same computer as Expo, on port
//   8000, so its address is worked out from where the app was loaded from
//   (the browser's address, or the Expo dev server's address on a phone).
const SERVER_PORT = 8000;

const resolveServerUrl = (): string => {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${SERVER_PORT}`;
  }

  // e.g. "192.168.1.15:8081" when running in Expo Go on a phone
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) return `http://${devHost}:${SERVER_PORT}`;

  return `http://localhost:${SERVER_PORT}`;
};

export const SERVER_URL = resolveServerUrl();

class OnlineService {
  private socket: Socket | null = null;
  public roomCode: string | null = null;
  public isPlayer1: boolean = false; // Player 1 creates the room, Player 2 joins

  connect() {
    if (!this.socket) {
      this.socket = io(SERVER_URL, {
        transports: ['websocket'],
      });

      this.socket.on('connect', () => {
        console.log('Connected to server with ID:', this.socket?.id);
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from server');
        this.roomCode = null;
      });
    }
    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.roomCode = null;
    }
  }

  createRoom(obstacles: any[], hostPen: any) {
    if (this.socket) {
      this.socket.emit('create_room', { obstacles, host_pen: hostPen });
      this.isPlayer1 = true;
    }
  }

  joinRoom(code: string, guestPen: any) {
    if (this.socket) {
      this.socket.emit('join_room', { room_code: code, guest_pen: guestPen });
      this.isPlayer1 = false;
      this.roomCode = code;
    }
  }

  sendFlick(flickData: { forceX: number; forceY: number; hitX: number; hitY: number; powerMultiplier: number }) {
    if (this.socket && this.roomCode) {
      this.socket.emit('flick_event', {
        room_code: this.roomCode,
        ...flickData,
      });
    }
  }

  onOpponentFlick(callback: (flickData: { forceX: number; forceY: number; hitX: number; hitY: number; powerMultiplier: number }) => void) {
    if (this.socket) {
      this.socket.on('opponent_flicked', callback);
    }
  }

  offOpponentFlick() {
    if (this.socket) {
      this.socket.off('opponent_flicked');
    }
  }

  // After a shot settles, the shooter sends where both pens ended up so the
  // two devices can't drift apart over a match
  sendDeskState(state: DeskState) {
    if (this.socket && this.roomCode) {
      this.socket.emit('desk_state', { room_code: this.roomCode, ...state });
    }
  }

  onOpponentDeskState(callback: (state: DeskState) => void) {
    this.socket?.on('opponent_desk_state', callback);
  }

  offOpponentDeskState() {
    this.socket?.off('opponent_desk_state');
  }

  onOpponentDisconnected(callback: () => void) {
    this.socket?.on('opponent_disconnected', callback);
  }

  offOpponentDisconnected() {
    this.socket?.off('opponent_disconnected');
  }
}

export const socketService = new OnlineService();
