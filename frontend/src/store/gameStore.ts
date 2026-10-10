import { create } from 'zustand';

export type PenClass = 'heavyweight' | 'acrobat' | 'classic';

export interface PenStats {
  id: string;
  name: string;
  class: PenClass;
  mass: number;
  friction: number;
  rotationSpeed: number;
  description: string;
  color: string;
  secondaryColor: string;
}

export const PEN_CATALOG: PenStats[] = [
  {
    id: 'classic',
    name: 'Classic Ballpoint',
    class: 'classic',
    mass: 1.0,
    friction: 0.5,
    rotationSpeed: 1.0,
    description: 'Balanced stats for beginners. The reliable choice.',
    color: '#1E40AF',
    secondaryColor: '#3B82F6',
  },
  {
    id: 'heavyweight',
    name: 'Executive Fountain',
    class: 'heavyweight',
    mass: 1.8,
    friction: 0.7,
    rotationSpeed: 0.5,
    description: 'High mass, hard to knock back. Low spin.',
    color: '#1F2937',
    secondaryColor: '#D4AF37',
  },
  {
    id: 'acrobat',
    name: 'Slim Rollerball',
    class: 'acrobat',
    mass: 0.7,
    friction: 0.4,
    rotationSpeed: 2.0,
    description: 'Light and fast. Perfect for trick shots.',
    color: '#DC2626',
    secondaryColor: '#FBBF24',
  },
  {
    id: 'pencil',
    name: 'HB Wood Pencil',
    class: 'classic',
    mass: 0.9,
    friction: 0.45,
    rotationSpeed: 1.2,
    description: 'The nostalgic pencil. Quick and precise.',
    color: '#F59E0B',
    secondaryColor: '#78350F',
  },
  {
    id: 'pilot',
    name: 'Pilot V7',
    class: 'acrobat',
    mass: 0.85,
    friction: 0.5,
    rotationSpeed: 1.8,
    description: 'Smooth glider with excellent control.',
    color: '#059669',
    secondaryColor: '#10B981',
  },
];

export interface GameState {
  // Player pen
  playerPen: PenStats;
  aiPen: PenStats;

  // Game state
  isPlayerTurn: boolean;
  playerScore: number;
  aiScore: number;
  roundsToWin: number;

  // Power-ups
  p1HasRefill: boolean;
  p2HasRefill: boolean;
  capOn: boolean;

  // Game status
  selectingPlayer: 1 | 2;
  gameMode: 'vs-ai' | 'local-multiplayer' | 'online-multiplayer';
  aiDifficulty: 'normal' | 'hard';
  gameStatus: 'menu' | 'selecting' | 'playing' | 'paused' | 'gameOver';
  winner: 'player' | 'ai' | null;

  // Actions
  setPlayerPen: (pen: PenStats) => void;
  setAiPen: (pen: PenStats) => void;
  toggleTurn: () => void;
  incrementPlayerScore: () => void;
  incrementAiScore: () => void;
  useRefillPower: (isPlayer1: boolean) => void;
  resetRefillPower: () => void;
  setSelectingPlayer: (player: 1 | 2) => void;
  setGameMode: (mode: GameState['gameMode']) => void;
  setAiDifficulty: (difficulty: GameState['aiDifficulty']) => void;
  setGameStatus: (status: GameState['gameStatus']) => void;
  setWinner: (winner: 'player' | 'ai' | null) => void;
  resetGame: () => void;
  
  onlineObstacles: any[] | null;
  setOnlineObstacles: (obstacles: any[] | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  playerPen: PEN_CATALOG[0],
  aiPen: PEN_CATALOG[1],
  isPlayerTurn: true,
  playerScore: 0,
  aiScore: 0,
  roundsToWin: 3,
  p1HasRefill: true,
  p2HasRefill: true,
  capOn: true,
  selectingPlayer: 1,
  gameMode: 'vs-ai',
  aiDifficulty: 'normal',
  gameStatus: 'menu',
  winner: null,
  onlineObstacles: null,

  setPlayerPen: (pen) => set({ playerPen: pen }),
  setAiPen: (pen) => set({ aiPen: pen }),
  toggleTurn: () => set((state) => ({ isPlayerTurn: !state.isPlayerTurn })),
  incrementPlayerScore: () => set((state) => ({ playerScore: state.playerScore + 1 })),
  incrementAiScore: () => set((state) => ({ aiScore: state.aiScore + 1 })),
  useRefillPower: (isPlayer1) => set((state) => isPlayer1 ? { p1HasRefill: false } : { p2HasRefill: false }),
  resetRefillPower: () => set({ p1HasRefill: true, p2HasRefill: true }),
  setSelectingPlayer: (player) => set({ selectingPlayer: player }),
  setGameMode: (mode) => set({ gameMode: mode }),
  setAiDifficulty: (difficulty) => set({ aiDifficulty: difficulty }),
  setGameStatus: (status) => set({ gameStatus: status }),
  setWinner: (winner) => set({ winner }),
  setOnlineObstacles: (obstacles) => set({ onlineObstacles: obstacles }),
  resetGame: () => set({
    isPlayerTurn: true,
    playerScore: 0,
    aiScore: 0,
    p1HasRefill: true,
    p2HasRefill: true,
    capOn: true,
    selectingPlayer: 1,
    gameStatus: 'menu',
    winner: null,
  }),
}));
