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
    name: 'Cello Gripper',
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
    name: 'Parker Fountain',
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
    name: 'Reynolds Slim',
    class: 'acrobat',
    mass: 0.6,
    friction: 0.3,
    rotationSpeed: 2.0,
    description: 'Light and fast. Perfect for trick shots.',
    color: '#DC2626',
    secondaryColor: '#FBBF24',
  },
  {
    id: 'natraj',
    name: 'Natraj 621',
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
    mass: 0.7,
    friction: 0.35,
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
  hasRefillPower: boolean;
  capOn: boolean;
  
  // Game status
  gameStatus: 'menu' | 'selecting' | 'playing' | 'paused' | 'gameOver';
  winner: 'player' | 'ai' | null;
  
  // Actions
  setPlayerPen: (pen: PenStats) => void;
  setAiPen: (pen: PenStats) => void;
  toggleTurn: () => void;
  incrementPlayerScore: () => void;
  incrementAiScore: () => void;
  toggleCap: () => void;
  useRefillPower: () => void;
  resetRefillPower: () => void;
  setGameStatus: (status: GameState['gameStatus']) => void;
  setWinner: (winner: 'player' | 'ai' | null) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  playerPen: PEN_CATALOG[0],
  aiPen: PEN_CATALOG[1],
  isPlayerTurn: true,
  playerScore: 0,
  aiScore: 0,
  roundsToWin: 3,
  hasRefillPower: true,
  capOn: true,
  gameStatus: 'menu',
  winner: null,
  
  setPlayerPen: (pen) => set({ playerPen: pen }),
  setAiPen: (pen) => set({ aiPen: pen }),
  toggleTurn: () => set((state) => ({ isPlayerTurn: !state.isPlayerTurn })),
  incrementPlayerScore: () => set((state) => ({ playerScore: state.playerScore + 1 })),
  incrementAiScore: () => set((state) => ({ aiScore: state.aiScore + 1 })),
  toggleCap: () => set((state) => ({ capOn: !state.capOn })),
  useRefillPower: () => set({ hasRefillPower: false }),
  resetRefillPower: () => set({ hasRefillPower: true }),
  setGameStatus: (status) => set({ gameStatus: status }),
  setWinner: (winner) => set({ winner }),
  resetGame: () => set({
    isPlayerTurn: true,
    playerScore: 0,
    aiScore: 0,
    hasRefillPower: true,
    capOn: true,
    gameStatus: 'menu',
    winner: null,
  }),
}));
