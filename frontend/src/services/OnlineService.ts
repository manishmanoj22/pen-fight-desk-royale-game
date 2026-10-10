import { io, Socket } from 'socket.io-client';

// Change this to your deployed URL when pushing to Railway
// E.g., const SERVER_URL = 'https://pen-fight-desk-royale.up.railway.app';

// For local testing:
// If using iOS Simulator: 'http://localhost:8000'
// If using Android Emulator: 'http://10.0.2.2:8000'
// If using a physical phone with Expo Go: Use your Mac's IP address like 'http://192.168.1.15:8000'

const SERVER_URL = 'http://192.168.200.248:8000';

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
}

export const socketService = new OnlineService();
