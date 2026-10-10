import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  TouchableOpacity,
  Modal,
  GestureResponderEvent,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Rect, Text as SvgText, G, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse, ClipPath, Pattern } from 'react-native-svg';
import { useGameStore, PenStats } from '../src/store/gameStore';
import { GamePhysics } from '../src/engine/GamePhysics';
import { GameAI } from '../src/engine/GameAI';
import { socketService } from '../src/services/OnlineService';
import { Obstacle } from '../src/components/Desk';
import { generateObstacles, DESK_WIDTH, DESK_HEIGHT, DESK_X, DESK_Y } from '../src/utils/deskGenerator';

// The game runs in a fixed world measured in its own units, not screen pixels
// (like a pool table defined in metres), so every device - and both players in
// an online match - simulate exactly the same desk. The renderer only scales it
// to fit, rotating it upright on tall screens (player 1 at the bottom) so the
// desk's long side follows the screen's long side.
const WORLD_WIDTH = DESK_WIDTH + DESK_X * 2;
const WORLD_HEIGHT = DESK_HEIGHT + DESK_Y * 2;

// Game constants
const MAX_POWER = 1;
const POWER_SCALE = 150;
const PEN_LENGTH = 70;
const PEN_WIDTH = 14;



interface PenPosition {
  x: number;
  y: number;
  angle: number;
}

export default function GameScreen() {
  const router = useRouter();
  const {
    playerPen,
    aiPen,
    isPlayerTurn,
    playerScore,
    aiScore,
    roundsToWin,
    p1HasRefill,
    p2HasRefill,
    gameMode,
    capOn,
    gameStatus,
    toggleTurn,
    incrementPlayerScore,
    incrementAiScore,
    useRefillPower,
    setGameStatus,
    setWinner,
    resetGame,
  } = useGameStore();

  // On wide screens the HUD and power-ups share one slim top bar so the desk
  // can use nearly the full height
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sideLayout = windowWidth > windowHeight * 1.3;
  const insets = useSafeAreaInsets();

  // How the world is scaled and placed on screen; updated whenever the board resizes
  const [board, setBoard] = useState({ scale: 1, offsetX: 0, offsetY: 0, rotated: false });
  const boardRef = useRef(board);

  const handleBoardLayout = (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    // Use whichever orientation lets the desk be drawn bigger
    const flatScale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
    const uprightScale = Math.min(width / WORLD_HEIGHT, height / WORLD_WIDTH);
    const rotated = uprightScale > flatScale;
    const scale = rotated ? uprightScale : flatScale;
    const viewWidth = (rotated ? WORLD_HEIGHT : WORLD_WIDTH) * scale;
    const viewHeight = (rotated ? WORLD_WIDTH : WORLD_HEIGHT) * scale;
    const next = {
      scale,
      offsetX: x + (width - viewWidth) / 2,
      offsetY: y + (height - viewHeight) / 2,
      rotated,
    };
    boardRef.current = next;
    setBoard(next);
  };

  // Convert a screen touch point into world coordinates
  const toWorld = (pageX: number, pageY: number) => {
    const { scale, offsetX, offsetY, rotated } = boardRef.current;
    const vx = (pageX - offsetX) / scale;
    const vy = (pageY - offsetY) / scale;
    // Upright view: world x runs bottom-to-top, world y runs left-to-right
    return rotated ? { x: WORLD_WIDTH - vy, y: vx } : { x: vx, y: vy };
  };

  // World position of a touch event; web release events can lack pageX/pageY,
  // so fall back to the last known position
  const eventToWorld = (evt: GestureResponderEvent) => {
    const { pageX, pageY } = evt.nativeEvent;
    if (typeof pageX !== 'number' || typeof pageY !== 'number') return touchCurrentRef.current;
    return toWorld(pageX, pageY);
  };

  // Initial positions
  const initialPlayerPos = { x: DESK_X + 80, y: DESK_Y + DESK_HEIGHT / 2, angle: 0 };
  const initialAiPos = { x: DESK_X + DESK_WIDTH - 80, y: DESK_Y + DESK_HEIGHT / 2, angle: Math.PI };

  // Game state
  const [playerPos, setPlayerPos] = useState<PenPosition>(initialPlayerPos);
  const [aiPos, setAiPos] = useState<PenPosition>(initialAiPos);

  // Aiming state
  const [isAiming, setIsAiming] = useState(false);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchCurrent, setTouchCurrent] = useState({ x: 0, y: 0 });
  const [hitPoint, setHitPoint] = useState({ x: 0, y: 0 }); // Where on the pen body we're hitting
  const [power, setPower] = useState(0);

  // Game flow state
  const [isPaused, setIsPaused] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [roundWinner, setRoundWinner] = useState<'player' | 'ai' | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [refillActive, setRefillActive] = useState(false);
  
  // Use online server overrides if available, otherwise spin up local gen
  const { onlineObstacles } = useGameStore();
  const [obstacles] = useState<Obstacle[]>(onlineObstacles || generateObstacles());
  
  const [message, setMessage] = useState('');
  const [roundStarter, setRoundStarter] = useState<'player' | 'ai'>('player');
  const [turnTimeLeft, setTurnTimeLeft] = useState(6); // 6-second shot clock

  // Refs
  const physicsRef = useRef<GamePhysics | null>(null);
  const aiRef = useRef<GameAI>(new GameAI('medium'));
  const gameLoopRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const penFellRef = useRef(false);
  const pensFellRef = useRef<Set<'player' | 'ai'>>(new Set());
  const penOffGraceRef = useRef<{ firstFall: 'player' | 'ai'; framesLeft: number } | null>(null);
  const turnTimerRef = useRef<ReturnType<typeof setInterval> | null>(null); // Shot clock interval

  // Touch tracking refs (for PanResponder closure)
  const touchStartRef = useRef({ x: 0, y: 0 });
  const hitPointRef = useRef({ x: 0, y: 0 });
  const touchCurrentRef = useRef({ x: 0, y: 0 });

  // Refs for game state (to use in PanResponder closure)
  const isPlayerTurnRef = useRef(true);
  const isAnimatingRef = useRef(false);
  const showResultRef = useRef(false);

  // Initialize physics engine
  useEffect(() => {
    physicsRef.current = new GamePhysics({
      deskWidth: DESK_WIDTH,
      deskHeight: DESK_HEIGHT,
      deskX: DESK_X,
      deskY: DESK_Y,
    });

    physicsRef.current.initialize(playerPen, aiPen, obstacles, capOn);

    // Note: We now check pen positions in the game loop instead of collision detection

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      physicsRef.current?.destroy();
    };
  }, []);

  // Keep refs in sync with state for PanResponder closure
  useEffect(() => {
    isPlayerTurnRef.current = isPlayerTurn;
  }, [isPlayerTurn]);

  useEffect(() => {
    isAnimatingRef.current = isAnimating;
  }, [isAnimating]);

  useEffect(() => {
    showResultRef.current = showResult;
  }, [showResult]);

  // Game loop
  const gameLoop = useCallback((timestamp: number) => {
    if (!physicsRef.current || isPaused) {
      lastTimeRef.current = timestamp; // Don't count paused time as elapsed
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // Real elapsed time; the physics advances it in fixed steps
    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    physicsRef.current.update(deltaTime);

    const newPlayerPos = physicsRef.current.getPenPosition(true);
    const newAiPos = physicsRef.current.getPenPosition(false);

    if (newPlayerPos) setPlayerPos(newPlayerPos);
    if (newAiPos) setAiPos(newAiPos);

    // ── Track which pens have left the desk during this move ─────────────────
    // We do NOT resolve the result here. We only record which pens fell.
    // Resolution happens after arePensSettled() so the full trajectory plays out.
    if (!penFellRef.current && !showResult) {
      if (physicsRef.current.isPenOffDesk(true))  pensFellRef.current.add('player');
      if (physicsRef.current.isPenOffDesk(false)) pensFellRef.current.add('ai');
    }

    // ── Resolve outcome once all motion has stopped ───────────────────────────
    if (isAnimating && physicsRef.current.arePensSettled() && !penFellRef.current && !showResult) {
      const playerFell = pensFellRef.current.has('player');
      const aiFell    = pensFellRef.current.has('ai');

      penFellRef.current = true;
      penOffGraceRef.current = null;

      if (playerFell && aiFell) {
        handleDraw();
      } else if (playerFell) {
        handlePenFallOff(true);   // player fell → AI scores
      } else if (aiFell) {
        handlePenFallOff(false);  // AI fell → player scores
      } else {
        // Nobody fell — normal end of move, pass the turn
        penFellRef.current = false; // reset so next move can track
        setIsAnimating(false);
        if (!showResult) toggleTurn();
      }
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [isPaused, isAnimating, showResult, toggleTurn]);

  useEffect(() => {
    lastTimeRef.current = performance.now();
    gameLoopRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameLoop]);

  // ── Turn processing & shot-clock ──────────────────────────────────────────
  const clearTurnTimer = () => {
    if (turnTimerRef.current) {
      clearInterval(turnTimerRef.current);
      turnTimerRef.current = null;
    }
  };

  useEffect(() => {
    clearTurnTimer();
    setTurnTimeLeft(6);

    const canAct = gameMode === 'online-multiplayer' 
      ? isPlayerTurn === socketService.isPlayer1 
      : (gameMode === 'local-multiplayer' ? true : isPlayerTurn);

    if (!canAct && !isAnimating && !showResult && physicsRef.current && !penFellRef.current) {
      if (gameMode === 'online-multiplayer') {
        setMessage("Opponent is aiming...");
      } else {
        setMessage('AI is thinking...');
        const aiTurnTimeout = setTimeout(() => {
          executeAITurn();
        }, 1200);
        return () => clearTimeout(aiTurnTimeout);
      }
    } else if (canAct && !isAnimating && !showResult && physicsRef.current && !penFellRef.current) {
      let p1Msg = 'Your turn!';
      if (gameMode === 'local-multiplayer') {
        p1Msg = isPlayerTurn ? "Player 1's turn! Drag from your pen to flick" : "Player 2's turn! Drag from your pen to flick";
        
        // Start shot clock for Local Multiplayer
        turnTimerRef.current = setInterval(() => {
          setTurnTimeLeft(prev => {
            if (prev <= 1) {
              clearTurnTimer();
              toggleTurn();
              return 6;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (gameMode === 'online-multiplayer') {
        p1Msg = "Your turn! Flick to strike!";
        // Online MP has NO shotclock timer locally to prevent network race conditions
      } else {
        // VS AI Shot clock
        turnTimerRef.current = setInterval(() => {
          setTurnTimeLeft(prev => {
            if (prev <= 1) {
              clearTurnTimer();
              toggleTurn();
              return 6;
            }
            return prev - 1;
          });
        }, 1000);
      }
      setMessage(p1Msg);
    }

    return () => clearTurnTimer();
  }, [isPlayerTurn, isAnimating, showResult, gameMode]);

  // ── Online Networking Listeners ──────────────────────────────────────────
  useEffect(() => {
    if (gameMode !== 'online-multiplayer') return;

    const handleOpponentFlick = (data: { forceX: number; forceY: number; hitX: number; hitY: number; powerMultiplier: number }) => {
      if (!physicsRef.current) return;
      
      const { forceX, forceY, hitX, hitY, powerMultiplier } = data;
      
      // Opponent is always the one that is NOT us
      // Therefore targetPrimary is the opposite of socketService.isPlayer1
      const targetPrimary = !socketService.isPlayer1;
      
      setMessage('Opponent fired!');
      physicsRef.current.flickPen(
        targetPrimary,
        { x: hitX, y: hitY },
        { x: forceX, y: forceY },
        powerMultiplier
      );
      
      setIsAiming(false);
      setPower(0);
      setIsAnimating(true);
      clearTurnTimer();
    };

    socketService.onOpponentFlick(handleOpponentFlick);

    return () => {
      socketService.offOpponentFlick();
    };
  }, [gameMode]);

  const executeAITurn = () => {
    if (!physicsRef.current) return;

    const currentAiPos = physicsRef.current.getPenPosition(false);
    const currentPlayerPos = physicsRef.current.getPenPosition(true);

    if (!currentAiPos || !currentPlayerPos) return;

    const decision = aiRef.current.calculateShot(
      currentAiPos,
      currentPlayerPos,
      { x: DESK_X, y: DESK_Y, width: DESK_WIDTH, height: DESK_HEIGHT },
      aiPen,
      obstacles
    );

    setMessage('AI flicks!');
    physicsRef.current.flickPen(false, decision.hitPoint, decision.force, decision.power);
    setIsAnimating(true);
  };

  // Handle draw - both pens fell off
  const handleDraw = () => {
    setIsAnimating(false);
    setRoundWinner(null);
    setMessage('DRAW! Both pens fell off - no points!');
    setShowResult(true);
  };

  const handlePenFallOff = (isPlayer: boolean) => {
    if (showResult) return;

    setIsAnimating(false);

    if (isPlayer) {
      incrementAiScore();
      setRoundWinner('ai');
      let msg = 'Your pen fell off! AI scores!';
      if (gameMode === 'local-multiplayer') msg = 'Player 1 pen fell off! Player 2 scores!';
      else if (gameMode === 'online-multiplayer') {
        msg = socketService.isPlayer1 ? 'Your pen fell off! Opponent scores!' : "Opponent's pen fell off! You score!";
      }
      setMessage(msg);
    } else {
      incrementPlayerScore();
      setRoundWinner('player');
      let msg = 'AI pen knocked off! You score!';
      if (gameMode === 'local-multiplayer') msg = 'Player 2 pen fell off! Player 1 scores!';
      else if (gameMode === 'online-multiplayer') {
        msg = socketService.isPlayer1 ? "Opponent's pen fell off! You score!" : 'Your pen fell off! Opponent scores!';
      }
      setMessage(msg);
    }

    setShowResult(true);

    const newPlayerScore = useGameStore.getState().playerScore;
    const newAiScore = useGameStore.getState().aiScore;

    if (newPlayerScore >= roundsToWin) {
      setWinner('player');
      setGameStatus('gameOver');
    } else if (newAiScore >= roundsToWin) {
      setWinner('ai');
      setGameStatus('gameOver');
    }
  };

  const handleNextRound = () => {
    setShowResult(false);
    setRefillActive(false);
    penFellRef.current = false;
    pensFellRef.current = new Set();
    penOffGraceRef.current = null;

    physicsRef.current?.resetPenPositions(DESK_X, DESK_Y, DESK_WIDTH, DESK_HEIGHT);
    setPlayerPos(initialPlayerPos);
    setAiPos(initialAiPos);

    // Alternate starting player: loser of last round starts next
    // If it was a draw, keep the same starter
    let nextStarter: 'player' | 'ai' = roundStarter;
    if (roundWinner === 'player') {
      nextStarter = 'ai'; // Player won, so AI starts next
    } else if (roundWinner === 'ai') {
      nextStarter = 'player'; // AI won, so Player starts next
    }
    // If draw (roundWinner === null), keep same starter

    setRoundStarter(nextStarter);
    setRoundWinner(null);

    // Set the turn based on who should start
    const currentTurn = useGameStore.getState().isPlayerTurn;
    if (nextStarter === 'player' && !currentTurn) {
      toggleTurn();
    } else if (nextStarter === 'ai' && currentTurn) {
      toggleTurn();
    }

    if (gameMode === 'local-multiplayer') {
      setMessage(nextStarter === 'player' ? 'New round! Player 1 starts' : 'New round! Player 2 starts');
    } else if (gameMode === 'online-multiplayer') {
      const isMyTurn = socketService.isPlayer1 ? (nextStarter === 'player') : (nextStarter === 'ai');
      setMessage(isMyTurn ? 'New round! Your turn' : 'New round! Opponent starts');
    } else {
      setMessage(nextStarter === 'player' ? 'New round! Your turn' : 'New round! AI starts');
    }
  };

  // Check if touch is actually ON the pen body (not just near it)
  // Uses CURRENT physics position, not React state
  const isTouchOnPen = (touchX: number, touchY: number, isPrimary: boolean) => {
    // Get current position from physics engine
    const currentPos = physicsRef.current?.getPenPosition(isPrimary);
    if (!currentPos) return false;

    // Transform touch point to pen's local coordinate system
    const penAngle = currentPos.angle;
    const penDirX = Math.cos(penAngle);
    const penDirY = Math.sin(penAngle);
    const perpX = -penDirY; // Perpendicular to pen axis
    const perpY = penDirX;

    // Vector from pen center to touch
    const toTouchX = touchX - currentPos.x;
    const toTouchY = touchY - currentPos.y;

    // Project onto pen axis (along the length)
    const alongPen = toTouchX * penDirX + toTouchY * penDirY;

    // Project onto perpendicular axis (across the width)
    const acrossPen = toTouchX * perpX + toTouchY * perpY;

    // Check if within pen bounds (with some padding for easier touch)
    const penHalfLength = (PEN_LENGTH / 2) + 15; // +15 for cap
    const penHalfWidth = (PEN_WIDTH / 2) + 10; // Padding for easier touch

    return Math.abs(alongPen) <= penHalfLength && Math.abs(acrossPen) <= penHalfWidth;
  };

  // Get the point on pen surface closest to touch - uses CURRENT physics position
  const getHitPointOnPen = (touchX: number, touchY: number, isPrimary: boolean) => {
    // Get current position from physics engine
    const currentPos = physicsRef.current?.getPenPosition(isPrimary);
    if (!currentPos) return { x: touchX, y: touchY, alongOffset: 0 };

    const penAngle = currentPos.angle;
    const penDirX = Math.cos(penAngle);
    const penDirY = Math.sin(penAngle);

    // Vector from pen center to touch
    const toTouchX = touchX - currentPos.x;
    const toTouchY = touchY - currentPos.y;

    // Project onto pen axis to find position along pen
    const alongPen = toTouchX * penDirX + toTouchY * penDirY;

    // Clamp to pen length (including cap)
    const halfLen = PEN_LENGTH / 2 + 10;
    const clampedAlong = Math.max(-halfLen, Math.min(halfLen, alongPen));

    // The hit point is on the pen's centerline at the clamped position
    return {
      x: currentPos.x + clampedAlong * penDirX,
      y: currentPos.y + clampedAlong * penDirY,
      alongOffset: clampedAlong,
    };
  };

  // Helper to determine touch permissions and targets
  const getInteractionState = () => {
    let canAct = false;
    let targetPrimary = true;

    if (gameMode === 'local-multiplayer') {
      canAct = true;
      targetPrimary = isPlayerTurnRef.current;
    } else if (gameMode === 'online-multiplayer') {
      canAct = (isPlayerTurnRef.current === socketService.isPlayer1);
      targetPrimary = socketService.isPlayer1;
    } else {
      // vs-ai
      canAct = isPlayerTurnRef.current;
      targetPrimary = true;
    }
    
    return { canAct, targetPrimary };
  };

  // Pan responder for flicking
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const { canAct, targetPrimary } = getInteractionState();

        if (!canAct || isAnimatingRef.current || showResultRef.current) {
          return false;
        }

        const touch = eventToWorld(evt);
        // Only start if touch is actually ON the correct pen
        return isTouchOnPen(touch.x, touch.y, targetPrimary);
      },
      onMoveShouldSetPanResponder: () => {
        const { canAct } = getInteractionState();
        return canAct && !isAnimatingRef.current && !showResultRef.current;
      },

      onPanResponderGrant: (evt) => {
        const { canAct, targetPrimary } = getInteractionState();

        // Double-check it's still allowed
        if (!canAct || isAnimatingRef.current) {
          return;
        }

        const touch = eventToWorld(evt);
        const hit = getHitPointOnPen(touch.x, touch.y, targetPrimary);

        // Store in refs for closure access
        touchStartRef.current = { x: touch.x, y: touch.y };
        touchCurrentRef.current = { x: touch.x, y: touch.y };
        hitPointRef.current = { x: hit.x, y: hit.y };

        setIsAiming(true);
        setTouchStart({ x: touch.x, y: touch.y });
        setTouchCurrent({ x: touch.x, y: touch.y });
        setHitPoint({ x: hit.x, y: hit.y });
        setPower(0);
        setMessage('Pull back and release to flick!');
      },

      onPanResponderMove: (evt) => {
        const touch = eventToWorld(evt);
        setTouchCurrent({ x: touch.x, y: touch.y });
        touchCurrentRef.current = { x: touch.x, y: touch.y };

        // Use ref for start position (refs work in closures)
        const startX = touchStartRef.current.x;
        const startY = touchStartRef.current.y;

        const dx = startX - touch.x;
        const dy = startY - touch.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const newPower = Math.min(MAX_POWER, distance / POWER_SCALE);
        setPower(newPower);
      },

      onPanResponderRelease: (evt) => {
        // Use refs for start position and hit point
        const startX = touchStartRef.current.x;
        const startY = touchStartRef.current.y;
        const hitX = hitPointRef.current.x;
        const hitY = hitPointRef.current.y;

        // On web, release events can lose pageX/pageY; eventToWorld falls back
        const { x: endX, y: endY } = eventToWorld(evt);

        const dx = startX - endX;
        const dy = startY - endY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If very short drag, just cancel - let user try again
        if (distance < 30) {
          setIsAiming(false);
          setPower(0);
          setMessage('Tap cancelled. Try dragging further to flick!');
          return;
        }

        if (!physicsRef.current) {
          setIsAiming(false);
          setPower(0);
          return;
        }

        // Calculate power from distance
        const currentPower = Math.min(MAX_POWER, distance / POWER_SCALE);

        // Since slide distance is proportional to velocity squared under kinetic friction,
        // we take the square root of the visual power bar value. This guarantees the actual sliding
        // distance corresponds linearly with the UI bar (100% slides exactly 2x as far as 50%)
        const physicsPower = Math.sqrt(currentPower);

        // Calculate force direction and magnitude
        const forceMagnitude = physicsPower * 20; // Increased force
        const forceX = (dx / distance) * forceMagnitude;
        const forceY = (dy / distance) * forceMagnitude;

        // Power multiplier
        const powerMultiplier = refillActive ? 1.5 : 1;

        // Target specific pen based on turn
        const { targetPrimary } = getInteractionState();

        // **ONLINE SYNC**: Sync the shot to the server if in online mode
        if (gameMode === 'online-multiplayer') {
          socketService.sendFlick({ forceX, forceY, hitX, hitY, powerMultiplier });
        }

        // Execute flick - hitPoint determines spin
        physicsRef.current.flickPen(
          targetPrimary,
          { x: hitX, y: hitY },
          { x: forceX, y: forceY },
          powerMultiplier
        );

        setIsAiming(false);
        setPower(0);
        setIsAnimating(true);
        setRefillActive(false);
        setMessage('');
        // Shot fired — cancel the shot clock immediately
        clearTurnTimer();
        setTurnTimeLeft(6);
      },

      onPanResponderTerminate: () => {
        setIsAiming(false);
        setPower(0);
        setMessage(''); // Fall back to the plain turn label instead of a stale prompt
      },
    })
  ).current;

  const handleRefillPower = () => {
    const isPrimary = isPlayerTurn;
    const canUseRefill = isPrimary ? p1HasRefill : p2HasRefill;

    if (canUseRefill && !refillActive) {
      useRefillPower(isPrimary);
      setRefillActive(true);
      setMessage('Refill boost activated!');
    }
  };

  const handlePlayAgain = () => {
    resetGame();
    setShowResult(false);
    setRoundWinner(null);
    penFellRef.current = false;
    physicsRef.current?.initialize(playerPen, aiPen, obstacles, capOn);
    physicsRef.current?.resetPenPositions(DESK_X, DESK_Y, DESK_WIDTH, DESK_HEIGHT);
    setPlayerPos(initialPlayerPos);
    setAiPos(initialAiPos);
    setGameStatus('playing');
  };

  const handleQuit = () => {
    resetGame();
    router.replace('/');
  };

  // Calculate aim visualization
  const aimDirection = isAiming ? {
    dx: touchStart.x - touchCurrent.x,
    dy: touchStart.y - touchCurrent.y,
  } : { dx: 0, dy: 0 };

  const aimLength = Math.sqrt(aimDirection.dx ** 2 + aimDirection.dy ** 2);
  const normalizedAim = aimLength > 0 ? {
    dx: aimDirection.dx / aimLength,
    dy: aimDirection.dy / aimLength,
  } : { dx: 0, dy: 0 };

  const powerColor = power > 0.7 ? '#EF4444' : power > 0.4 ? '#F59E0B' : '#22C55E';

  const activeHasRefill = isPlayerTurn ? p1HasRefill : p2HasRefill;

  const p1Label = gameMode === 'local-multiplayer' ? 'PLAYER 1' : (gameMode === 'online-multiplayer' ? (socketService.isPlayer1 ? 'YOU' : 'OPPONENT') : 'YOU');
  const p2Label = gameMode === 'local-multiplayer' ? 'PLAYER 2' : (gameMode === 'online-multiplayer' ? (socketService.isPlayer1 ? 'OPPONENT' : 'YOU') : 'AI');
  const turnLabel = message || (isPlayerTurn ? (gameMode === 'local-multiplayer' ? 'Player 1 Turn' : 'Your Turn') : (gameMode === 'local-multiplayer' ? 'Player 2 Turn' : 'AI Turn'));

  // Shot clock — only shown during active player turns
  const shotClock = !isAnimating && !showResult && (
    <View style={[styles.shotClock, {
      backgroundColor: turnTimeLeft <= 1 ? '#EF4444' : turnTimeLeft <= 2 ? '#F97316' : '#22C55E'
    }]}>
      <Text style={styles.shotClockText}>{turnTimeLeft}</Text>
    </View>
  );

  const showPowerUps = !isAnimating && !showResult &&
    ((gameMode === 'vs-ai' && isPlayerTurn) || gameMode === 'local-multiplayer');
  const powerUpButtons = (
    <TouchableOpacity
      style={[styles.powerUpBtn, (!activeHasRefill || refillActive) && styles.powerUpDisabled]}
      onPress={handleRefillPower}
      disabled={!activeHasRefill || refillActive}
    >
      <Ionicons name="flash" size={20} color={activeHasRefill && !refillActive ? '#F59E0B' : '#666'} />
      <Text style={[styles.powerUpText, (!activeHasRefill || refillActive) && styles.powerUpTextDisabled]}>
        {refillActive ? 'Active!' : 'Refill'}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Background */}
      <LinearGradient
        colors={['#2D1B0E', '#3D2817', '#4A3520']}
        style={styles.background}
      />

      {sideLayout ? (
        /* Landscape: one slim bar across the top, like mobile billiards games */
        <View style={[styles.topBar, { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right, paddingTop: 8 + insets.top }]}>
          <TouchableOpacity style={styles.pauseBtn} onPress={() => setIsPaused(true)}>
            <Ionicons name="pause" size={24} color="#FFF" />
          </TouchableOpacity>

          <View style={styles.compactScores}>
            <View style={styles.compactPlayer}>
              <View style={[styles.penIndicator, { backgroundColor: playerPen.color }]} />
              <Text style={styles.scoreName}>{p1Label}</Text>
            </View>
            <Text style={styles.compactScoreValue}>{playerScore}</Text>
            <View style={styles.vsBox}>
              <Text style={styles.vsText}>VS</Text>
              <Text style={styles.roundText}>First to {roundsToWin}</Text>
            </View>
            <Text style={styles.compactScoreValue}>{aiScore}</Text>
            <View style={styles.compactPlayer}>
              <View style={[styles.penIndicator, { backgroundColor: aiPen.color }]} />
              <Text style={styles.scoreName}>{p2Label}</Text>
            </View>
          </View>

          <View style={[styles.turnPill, { backgroundColor: isPlayerTurn ? '#22C55E' : '#EF4444' }]}>
            <Text style={styles.turnText} numberOfLines={2}>{turnLabel}</Text>
            {shotClock}
          </View>

          {/* Hidden rather than removed between turns so the bar doesn't shift */}
          <View style={[styles.topBarPowerUps, !showPowerUps && styles.invisible]} pointerEvents={showPowerUps ? 'auto' : 'none'}>
            {powerUpButtons}
          </View>
        </View>
      ) : (
        <>
          {/* HUD */}
          <View style={styles.hud}>
            <TouchableOpacity style={styles.pauseBtn} onPress={() => setIsPaused(true)}>
              <Ionicons name="pause" size={24} color="#FFF" />
            </TouchableOpacity>

            <View style={styles.scoreContainer}>
              <View style={styles.scoreBox}>
                <View style={[styles.penIndicator, { backgroundColor: playerPen.color }]} />
                <Text style={styles.scoreName}>{p1Label}</Text>
                <Text style={styles.scoreValue}>{playerScore}</Text>
              </View>

              <View style={styles.vsBox}>
                <Text style={styles.vsText}>VS</Text>
                <Text style={styles.roundText}>First to {roundsToWin}</Text>
              </View>

              <View style={styles.scoreBox}>
                <View style={[styles.penIndicator, { backgroundColor: aiPen.color }]} />
                <Text style={styles.scoreName}>{p2Label}</Text>
                <Text style={styles.scoreValue}>{aiScore}</Text>
              </View>
            </View>
          </View>

          {/* Turn indicator & Message */}
          <View style={[styles.turnIndicator, { backgroundColor: isPlayerTurn ? '#22C55E' : '#EF4444' }]}>
            <Text style={styles.turnText}>{turnLabel}</Text>
            {shotClock}
          </View>
        </>
      )}

      {/* Board - fills the space between HUD and power-ups; the world is scaled to fit */}
      <View style={styles.board} onLayout={handleBoardLayout}>
        {/* Power bar when aiming */}
        {isAiming && (
          <View style={styles.powerBar}>
            <Text style={styles.powerLabel}>POWER</Text>
            <View style={styles.powerBarOuter}>
              <View style={[styles.powerBarInner, { width: `${power * 100}%`, backgroundColor: powerColor }]} />
            </View>
            <Text style={[styles.powerPercent, { color: powerColor }]}>{Math.round(power * 100)}%</Text>
          </View>
        )}

        {/* Game Canvas - SVG for everything */}
        <Svg
          width={(board.rotated ? WORLD_HEIGHT : WORLD_WIDTH) * board.scale}
          height={(board.rotated ? WORLD_WIDTH : WORLD_HEIGHT) * board.scale}
          viewBox={board.rotated ? `0 0 ${WORLD_HEIGHT} ${WORLD_WIDTH}` : `0 0 ${WORLD_WIDTH} ${WORLD_HEIGHT}`}
        >
          {/* Definitions for gradients and patterns */}
          <Defs>
            {/* Wood grain pattern */}
            <SvgLinearGradient id="woodGradient" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#D4A574" />
              <Stop offset="0.3" stopColor="#C49A6C" />
              <Stop offset="0.6" stopColor="#B8916A" />
              <Stop offset="1" stopColor="#A67C52" />
            </SvgLinearGradient>

            {/* Desk edge shadow */}
            <SvgLinearGradient id="deskEdge" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#8B5A2B" />
              <Stop offset="1" stopColor="#5D3A1A" />
            </SvgLinearGradient>

            {/* Pen body gradients */}
            <SvgLinearGradient id="penBlueGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#4A7CB8" />
              <Stop offset="0.5" stopColor="#1E40AF" />
              <Stop offset="1" stopColor="#1E3A8A" />
            </SvgLinearGradient>

            <SvgLinearGradient id="penDarkGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#4A4A4A" />
              <Stop offset="0.5" stopColor="#1F2937" />
              <Stop offset="1" stopColor="#111827" />
            </SvgLinearGradient>

            <SvgLinearGradient id="penRedGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EF4444" />
              <Stop offset="0.5" stopColor="#DC2626" />
              <Stop offset="1" stopColor="#B91C1C" />
            </SvgLinearGradient>

            <SvgLinearGradient id="penGreenGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#10B981" />
              <Stop offset="0.5" stopColor="#059669" />
              <Stop offset="1" stopColor="#047857" />
            </SvgLinearGradient>

            <SvgLinearGradient id="penYellowGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FBBF24" />
              <Stop offset="0.5" stopColor="#F59E0B" />
              <Stop offset="1" stopColor="#D97706" />
            </SvgLinearGradient>

            {/* Metallic cap gradient */}
            <SvgLinearGradient id="metallicGold" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFD700" />
              <Stop offset="0.3" stopColor="#DAA520" />
              <Stop offset="0.6" stopColor="#B8860B" />
              <Stop offset="1" stopColor="#8B6914" />
            </SvgLinearGradient>

            <SvgLinearGradient id="metallicSilver" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#E8E8E8" />
              <Stop offset="0.3" stopColor="#C0C0C0" />
              <Stop offset="0.6" stopColor="#A0A0A0" />
              <Stop offset="1" stopColor="#808080" />
            </SvgLinearGradient>

            {/* Geometry box gradient */}
            <SvgLinearGradient id="geoBoxGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3B82F6" />
              <Stop offset="0.5" stopColor="#2563EB" />
              <Stop offset="1" stopColor="#1D4ED8" />
            </SvgLinearGradient>

            {/* Eraser gradient */}
            <SvgLinearGradient id="eraserGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FDA4AF" />
              <Stop offset="0.5" stopColor="#FB7185" />
              <Stop offset="1" stopColor="#F43F5E" />
            </SvgLinearGradient>

            {/* Notebook paper */}
            <SvgLinearGradient id="paperGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFEF0" />
              <Stop offset="1" stopColor="#F5F0DC" />
            </SvgLinearGradient>
          </Defs>

          {/* Upright view: turn the desk so player 1's end (world left) is at the bottom */}
          <G transform={board.rotated ? `matrix(0 -1 1 0 0 ${WORLD_WIDTH})` : undefined}>

            {/* Desk shadow */}
            <Rect
              x={DESK_X + 4}
              y={DESK_Y + 4}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
              fill="rgba(0,0,0,0.3)"
              rx={10}
            />

            {/* Desk main surface */}
            <Rect
              x={DESK_X}
              y={DESK_Y}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
              fill="url(#woodGradient)"
              rx={8}
            />

            {/* Desk border/edge */}
            <Rect
              x={DESK_X}
              y={DESK_Y}
              width={DESK_WIDTH}
              height={DESK_HEIGHT}
              fill="none"
              stroke="url(#deskEdge)"
              strokeWidth={5}
              rx={8}
            />

            {/* Wood grain texture - horizontal lines */}
            {Array.from({ length: 20 }).map((_, i) => (
              <Line
                key={`grain-h-${i}`}
                x1={DESK_X + 5}
                y1={DESK_Y + 10 + i * (DESK_HEIGHT / 20)}
                x2={DESK_X + DESK_WIDTH - 5}
                y2={DESK_Y + 10 + i * (DESK_HEIGHT / 20) + (Math.sin(i) * 3)}
                stroke="rgba(139, 69, 19, 0.15)"
                strokeWidth={1}
              />
            ))}

            {/* Wood knots */}
            <Ellipse cx={DESK_X + 60} cy={DESK_Y + 120} rx={12} ry={8} fill="rgba(101, 67, 33, 0.25)" />
            <Ellipse cx={DESK_X + DESK_WIDTH - 80} cy={DESK_Y + DESK_HEIGHT - 100} rx={10} ry={6} fill="rgba(101, 67, 33, 0.2)" />

            {/* Scribbles and doodles - more realistic school doodles */}
            <SvgText x={DESK_X + 20} y={DESK_Y + 40} fill="rgba(30, 64, 175, 0.4)" fontSize={9} fontFamily="serif">
              a² + b² = c²
            </SvgText>
            <SvgText x={DESK_X + DESK_WIDTH - 85} y={DESK_Y + 75} fill="rgba(220, 38, 38, 0.35)" fontSize={10}>
              ♥ BFF ♥
            </SvgText>
            <SvgText x={DESK_X + 30} y={DESK_Y + DESK_HEIGHT - 40} fill="rgba(22, 163, 74, 0.3)" fontSize={8}>
              Class X-B
            </SvgText>

            {/* Compass circle doodle */}
            <Circle cx={DESK_X + DESK_WIDTH - 50} cy={DESK_Y + 50} r={15} fill="none" stroke="rgba(75, 85, 99, 0.25)" strokeWidth={1} strokeDasharray="2,2" />
            <Circle cx={DESK_X + DESK_WIDTH - 50} cy={DESK_Y + 50} r={2} fill="rgba(75, 85, 99, 0.3)" />

            {/* Scratches on desk */}
            <Line x1={DESK_X + 100} y1={DESK_Y + 80} x2={DESK_X + 140} y2={DESK_Y + 85} stroke="rgba(139, 69, 19, 0.2)" strokeWidth={1} />
            <Line x1={DESK_X + DESK_WIDTH / 2} y1={DESK_Y + DESK_HEIGHT / 2 - 20} x2={DESK_X + DESK_WIDTH / 2 + 30} y2={DESK_Y + DESK_HEIGHT / 2 - 15} stroke="rgba(139, 69, 19, 0.15)" strokeWidth={1} />

            {/* Obstacles - Enhanced realistic school items */}
            {obstacles.map((obs) => {
              const cx = obs.x + obs.width / 2;
              const cy = obs.y + obs.height / 2;

              switch (obs.type) {
                case 'calculator': {
                  const padX = obs.x + 6;
                  const padY = obs.y + 30;
                  const keySize = 9;
                  const gap = 3;
                  const labels = ['7', '8', '9', '÷', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=', ''];
                  return (
                    <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                      {/* Shadow */}
                      <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.35)" rx={3} />
                      {/* Base Body - Beige */}
                      <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="#E2DAC0" stroke="#B8AE8F" strokeWidth={1} rx={3} />

                      {/* Inner bevel line */}
                      <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width - 4} height={obs.height - 4} fill="none" stroke="#F1EAD4" strokeWidth={1} rx={2} />

                      {/* Screen Frame Bezel - Thick Dark Green/Grey */}
                      <Rect x={obs.x + 5} y={obs.y + 5} width={obs.width - 10} height={18} fill="#272722" rx={1} />
                      {/* Digital Screen - Pale Olive LCD */}
                      <Rect x={obs.x + 6} y={obs.y + 6} width={obs.width - 25} height={16} fill="#A2AC8B" rx={1} />

                      {/* Solar Panel */}
                      <Rect x={obs.x + obs.width - 17} y={obs.y + 6} width={11} height={16} fill="#352415" rx={0.5} />

                      {/* Digital Digits "12345" drawn manually for curveless 7-segment style to be smaller */}
                      <G transform={`translate(${obs.x + 10}, ${obs.y + 10})`} stroke="#182012" strokeWidth={1} fill="none" strokeLinecap="square" strokeLinejoin="miter">
                        <Path d="M 2 0 L 2 7" /> {/* 1 */}
                        <Path d="M 5 0 L 9 0 L 9 3.5 L 5 3.5 L 5 7 L 9 7" /> {/* 2 */}
                        <Path d="M 11 0 L 15 0 L 15 3.5 L 11 3.5 M 15 3.5 L 15 7 L 11 7" /> {/* 3 */}
                        <Path d="M 17 0 L 17 3.5 L 21 3.5 M 21 0 L 21 7" /> {/* 4 */}
                        <Path d="M 27 0 L 23 0 L 23 3.5 L 27 3.5 L 27 7 L 23 7" /> {/* 5 */}
                      </G>

                      {/* Keys grid */}
                      {[0, 1, 2, 3].map(row =>
                        [0, 1, 2, 3].map(col => {
                          const idx = row * 4 + col;
                          if (!labels[idx]) return null;

                          const isPlus = labels[idx] === '+';
                          const keyH = isPlus ? (keySize * 2 + gap) : keySize;

                          return (
                            <G key={`key-${idx}`}>
                              {/* Key body */}
                              <Rect
                                x={padX + col * (keySize + gap)}
                                y={padY + row * (keySize + gap)}
                                width={keySize}
                                height={keyH}
                                fill="#679A57"
                                stroke="#365C2B"
                                strokeWidth={0.5}
                                rx={1.5}
                              />
                              {/* Key Reflection/Highlight */}
                              <Line
                                x1={padX + col * (keySize + gap) + 1}
                                y1={padY + row * (keySize + gap) + 1.5}
                                x2={padX + col * (keySize + gap) + keySize - 1}
                                y2={padY + row * (keySize + gap) + 1.5}
                                stroke="rgba(255,255,255,0.2)"
                                strokeWidth={1}
                              />

                              {/* Key text */}
                              <SvgText
                                x={padX + col * (keySize + gap) + keySize / 2}
                                y={padY + row * (keySize + gap) + (keyH / 2)}
                                fill="#F2EFDD"
                                fontSize={5}
                                fontWeight="bold"
                                textAnchor="middle"
                                alignmentBaseline="middle"
                              >
                                {labels[idx]}
                              </SvgText>
                            </G>
                          );
                        })
                      )}
                    </G>
                  );
                }
                case 'notebook': {
                  const coverColor = "#3E74A6";
                  return (
                    <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                      {/* Base Page Shadow */}
                      <Rect x={obs.x + 3} y={obs.y + 3} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.3)" rx={2} />
                      {/* Back/Page bundle layer */}
                      <Rect x={obs.x + 1} y={obs.y + 1} width={obs.width} height={obs.height} fill="#F4F4E6" rx={2} />
                      {/* Main Cover */}
                      <Rect x={obs.x + 3} y={obs.y} width={obs.width - 3} height={obs.height} fill={coverColor} stroke="#2D5A85" strokeWidth={1} />

                      {/* Solid cover with removed brand logo */}

                      {/* Spirals */}
                      {Array.from({ length: 10 }).map((_, i) => (
                        <G key={`spiral-${i}`}>
                          {/* Hole */}
                          <Circle cx={obs.x + 4} cy={obs.y + 8 + i * 9.5} r={2} fill="#2D1B0E" />
                          {/* Wire Loop */}
                          <Path
                            d={`M ${obs.x - 1} ${obs.y + 7 + i * 9.5} 
                                C ${obs.x + 6} ${obs.y + 5 + i * 9.5}, 
                                  ${obs.x + 6} ${obs.y + 11 + i * 9.5}, 
                                  ${obs.x - 1} ${obs.y + 9 + i * 9.5}`}
                            stroke="#333" strokeWidth={1.5} fill="none"
                          />
                        </G>
                      ))}
                    </G>
                  );
                }
                case 'ruler': {
                  const tickCount = 15;
                  return (
                    <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                      {/* Shadow */}
                      <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.15)" rx={1} />
                      {/* Transparent yellow plastic body - Darkened */}
                      <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="rgba(230, 180, 20, 0.85)" stroke="rgba(180, 140, 10, 0.9)" strokeWidth={1} rx={1} />

                      {/* Measuring lines on top */}
                      {Array.from({ length: tickCount + 1 }).map((_, i) => {
                        const tx = obs.x + 5 + (i * (obs.width - 10) / tickCount);
                        return (
                          <G key={`tick-cm-${i}`}>
                            <Line x1={tx} y1={obs.y} x2={tx} y2={obs.y + 4} stroke="#444" strokeWidth={0.5} />
                            {i % 2 === 0 && (
                              <SvgText x={tx} y={obs.y + 10} fill="#444" fontSize={4} textAnchor="middle">
                                {i}
                              </SvgText>
                            )}
                            {/* Smaller mm ticks */}
                            {i < tickCount && [1, 2, 3, 4].map(st => (
                              <Line key={`subtick-${st}`}
                                x1={tx + st * ((obs.width - 10) / tickCount / 5)} y1={obs.y}
                                x2={tx + st * ((obs.width - 10) / tickCount / 5)} y2={obs.y + 2}
                                stroke="#777" strokeWidth={0.5}
                              />
                            ))}
                          </G>
                        );
                      })}

                      {/* Inches on bottom */}
                      {Array.from({ length: 7 }).map((_, i) => {
                        const rx = obs.x + 5 + (i * (obs.width - 10) / 6);
                        return (
                          <G key={`tick-in-${i}`}>
                            <Line x1={rx} y1={obs.y + obs.height} x2={rx} y2={obs.y + obs.height - 4} stroke="#444" strokeWidth={0.5} />
                            <SvgText x={rx} y={obs.y + obs.height - 6} fill="#444" fontSize={4} textAnchor="middle">
                              {i}
                            </SvgText>
                          </G>
                        );
                      })}
                      <SvgText x={obs.x + obs.width - 10} y={obs.y + 10} fill="#666" fontSize={3}>inch 6</SvgText>
                      <SvgText x={obs.x + 15} y={obs.y + 10} fill="#666" fontSize={3}>0 cm</SvgText>
                    </G>
                  );
                }
                case 'eraser': {
                  return (
                    <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                      {/* Shadow */}
                      <Rect x={obs.x + 1} y={obs.y + 1} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.25)" rx={2} />
                      {/* Main eraser body */}
                      <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="#E1E5E7" stroke="#BDC3C7" strokeWidth={1} rx={2} />
                      {/* Paper sleeve */}
                      <Rect x={obs.x + 8} y={obs.y} width={14} height={obs.height} fill="#2980B9" rx={0.5} />
                      {/* Sleeve stripes */}
                      <Rect x={obs.x + 8} y={obs.y} width={14} height={3} fill="#2C3E50" />
                      <Rect x={obs.x + 8} y={obs.y + obs.height - 3} width={14} height={3} fill="#2C3E50" />
                      {/* Text removed per request */}
                    </G>
                  );
                }
                default:
                  return null;
              }
            })}

            {/* Player Pen - Enhanced realistic pen */}
            <G transform={`rotate(${(playerPos.angle * 180) / Math.PI}, ${playerPos.x}, ${playerPos.y})`}>
              {/* Pen shadow */}
              <Ellipse cx={playerPos.x} cy={playerPos.y + 10} rx={PEN_LENGTH / 2 - 5} ry={4} fill="rgba(0,0,0,0.2)" />

              {/* Main pen body */}
              <Rect
                x={playerPos.x - PEN_LENGTH / 2}
                y={playerPos.y - PEN_WIDTH / 2}
                width={PEN_LENGTH}
                height={PEN_WIDTH}
                fill={playerPen.id === 'classic' ? 'url(#penBlueGrad)' :
                  playerPen.id === 'heavyweight' ? 'url(#penDarkGrad)' :
                    playerPen.id === 'acrobat' ? 'url(#penRedGrad)' :
                      playerPen.id === 'natraj' ? 'url(#penYellowGrad)' :
                        'url(#penGreenGrad)'}
                rx={PEN_WIDTH / 2}
              />

              {/* Pen body highlight */}
              <Rect
                x={playerPos.x - PEN_LENGTH / 2 + 2}
                y={playerPos.y - PEN_WIDTH / 2 + 1}
                width={PEN_LENGTH - 4}
                height={3}
                fill="rgba(255,255,255,0.25)"
                rx={2}
              />

              {/* Grip section */}
              <Rect
                x={playerPos.x - 15}
                y={playerPos.y - PEN_WIDTH / 2}
                width={25}
                height={PEN_WIDTH}
                fill="rgba(0,0,0,0.15)"
                rx={2}
              />
              {/* Grip ridges */}
              {[-12, -8, -4, 0, 4, 8].map((offset, i) => (
                <Line
                  key={i}
                  x1={playerPos.x + offset}
                  y1={playerPos.y - PEN_WIDTH / 2}
                  x2={playerPos.x + offset}
                  y2={playerPos.y + PEN_WIDTH / 2}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1}
                />
              ))}

              {/* Cap or Tip */}
              {capOn ? (
                <G>
                  {/* Cap body */}
                  <Rect
                    x={playerPos.x + PEN_LENGTH / 2 - 8}
                    y={playerPos.y - PEN_WIDTH / 2 - 1}
                    width={25}
                    height={PEN_WIDTH + 2}
                    fill={playerPen.id === 'heavyweight' ? 'url(#metallicGold)' : playerPen.secondaryColor}
                    rx={PEN_WIDTH / 2}
                  />
                  {/* Cap clip */}
                  <Rect
                    x={playerPos.x + PEN_LENGTH / 2 + 5}
                    y={playerPos.y - PEN_WIDTH / 2 - 3}
                    width={12}
                    height={3}
                    fill={playerPen.id === 'heavyweight' ? 'url(#metallicGold)' : playerPen.secondaryColor}
                    rx={1}
                  />
                  {/* Cap ring */}
                  <Line
                    x1={playerPos.x + PEN_LENGTH / 2 - 5}
                    y1={playerPos.y - PEN_WIDTH / 2}
                    x2={playerPos.x + PEN_LENGTH / 2 - 5}
                    y2={playerPos.y + PEN_WIDTH / 2}
                    stroke="rgba(255,255,255,0.4)"
                    strokeWidth={2}
                  />
                </G>
              ) : (
                <G>
                  {/* Pen tip cone */}
                  <Path
                    d={`M ${playerPos.x + PEN_LENGTH / 2 - 5} ${playerPos.y - PEN_WIDTH / 2} 
                        L ${playerPos.x + PEN_LENGTH / 2 + 15} ${playerPos.y} 
                        L ${playerPos.x + PEN_LENGTH / 2 - 5} ${playerPos.y + PEN_WIDTH / 2} Z`}
                    fill="url(#metallicSilver)"
                  />
                  {/* Tip point */}
                  <Circle cx={playerPos.x + PEN_LENGTH / 2 + 14} cy={playerPos.y} r={1.5} fill="#333" />
                </G>
              )}

              {/* Back end of pen */}
              <Ellipse
                cx={playerPos.x - PEN_LENGTH / 2}
                cy={playerPos.y}
                rx={3}
                ry={PEN_WIDTH / 2}
                fill="rgba(0,0,0,0.2)"
              />
            </G>

            {/* AI Pen - Enhanced realistic pen */}
            <G transform={`rotate(${(aiPos.angle * 180) / Math.PI}, ${aiPos.x}, ${aiPos.y})`}>
              {/* Pen shadow */}
              <Ellipse cx={aiPos.x} cy={aiPos.y + 10} rx={PEN_LENGTH / 2 - 5} ry={4} fill="rgba(0,0,0,0.2)" />

              {/* Main pen body */}
              <Rect
                x={aiPos.x - PEN_LENGTH / 2}
                y={aiPos.y - PEN_WIDTH / 2}
                width={PEN_LENGTH}
                height={PEN_WIDTH}
                fill={aiPen.id === 'classic' ? 'url(#penBlueGrad)' :
                  aiPen.id === 'heavyweight' ? 'url(#penDarkGrad)' :
                    aiPen.id === 'acrobat' ? 'url(#penRedGrad)' :
                      aiPen.id === 'natraj' ? 'url(#penYellowGrad)' :
                        'url(#penGreenGrad)'}
                rx={PEN_WIDTH / 2}
              />

              {/* Pen body highlight */}
              <Rect
                x={aiPos.x - PEN_LENGTH / 2 + 2}
                y={aiPos.y - PEN_WIDTH / 2 + 1}
                width={PEN_LENGTH - 4}
                height={3}
                fill="rgba(255,255,255,0.25)"
                rx={2}
              />

              {/* Grip section */}
              <Rect
                x={aiPos.x - 15}
                y={aiPos.y - PEN_WIDTH / 2}
                width={25}
                height={PEN_WIDTH}
                fill="rgba(0,0,0,0.15)"
                rx={2}
              />
              {/* Grip ridges */}
              {[-12, -8, -4, 0, 4, 8].map((offset, i) => (
                <Line
                  key={i}
                  x1={aiPos.x + offset}
                  y1={aiPos.y - PEN_WIDTH / 2}
                  x2={aiPos.x + offset}
                  y2={aiPos.y + PEN_WIDTH / 2}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={1}
                />
              ))}

              {/* AI pen always has cap */}
              <G>
                {/* Cap body */}
                <Rect
                  x={aiPos.x + PEN_LENGTH / 2 - 8}
                  y={aiPos.y - PEN_WIDTH / 2 - 1}
                  width={25}
                  height={PEN_WIDTH + 2}
                  fill={aiPen.id === 'heavyweight' ? 'url(#metallicGold)' : aiPen.secondaryColor}
                  rx={PEN_WIDTH / 2}
                />
                {/* Cap clip */}
                <Rect
                  x={aiPos.x + PEN_LENGTH / 2 + 5}
                  y={aiPos.y - PEN_WIDTH / 2 - 3}
                  width={12}
                  height={3}
                  fill={aiPen.id === 'heavyweight' ? 'url(#metallicGold)' : aiPen.secondaryColor}
                  rx={1}
                />
                {/* Cap ring */}
                <Line
                  x1={aiPos.x + PEN_LENGTH / 2 - 5}
                  y1={aiPos.y - PEN_WIDTH / 2}
                  x2={aiPos.x + PEN_LENGTH / 2 - 5}
                  y2={aiPos.y + PEN_WIDTH / 2}
                  stroke="rgba(255,255,255,0.4)"
                  strokeWidth={2}
                />
              </G>

              {/* Back end of pen */}
              <Ellipse
                cx={aiPos.x - PEN_LENGTH / 2}
                cy={aiPos.y}
                rx={3}
                ry={PEN_WIDTH / 2}
                fill="rgba(0,0,0,0.2)"
              />
            </G>

            {/* Aiming UI */}
            {isAiming && (
              <G>
                {/* Touch point indicator */}
                <Circle
                  cx={hitPoint.x}
                  cy={hitPoint.y}
                  r={12}
                  fill="none"
                  stroke="#FFF"
                  strokeWidth={2}
                  opacity={0.8}
                />

                {/* Pull-back line */}
                <Line
                  x1={hitPoint.x}
                  y1={hitPoint.y}
                  x2={touchCurrent.x}
                  y2={touchCurrent.y}
                  stroke={powerColor}
                  strokeWidth={4}
                  strokeDasharray="10,5"
                  opacity={0.9}
                />

                {/* Direction arrow (where pen will go) */}
                {power > 0.1 && (
                  <>
                    <Line
                      x1={hitPoint.x}
                      y1={hitPoint.y}
                      x2={hitPoint.x + normalizedAim.dx * 80 * power}
                      y2={hitPoint.y + normalizedAim.dy * 80 * power}
                      stroke="#FFF"
                      strokeWidth={3}
                      opacity={0.8}
                    />
                    {/* Arrow head */}
                    <Circle
                      cx={hitPoint.x + normalizedAim.dx * 80 * power}
                      cy={hitPoint.y + normalizedAim.dy * 80 * power}
                      r={6}
                      fill="#FFF"
                      opacity={0.8}
                    />

                    {/* Trajectory dots */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Circle
                        key={i}
                        cx={hitPoint.x + normalizedAim.dx * (80 + i * 25) * power}
                        cy={hitPoint.y + normalizedAim.dy * (80 + i * 25) * power}
                        r={4 - i * 0.5}
                        fill="#FFF"
                        opacity={0.6 - i * 0.1}
                      />
                    ))}
                  </>
                )}

                {/* Power indicator at touch point */}
                <Circle
                  cx={touchCurrent.x}
                  cy={touchCurrent.y}
                  r={25 + power * 20}
                  fill="none"
                  stroke={powerColor}
                  strokeWidth={3}
                  opacity={0.7}
                />
              </G>
            )}
          </G>
        </Svg>
      </View>

      {/* Power-ups - the row always keeps its space so the board doesn't jump between turns */}
      {!sideLayout && (
        <View style={styles.powerUps}>
          {showPowerUps && powerUpButtons}
        </View>
      )}

      {/* Round Result Modal */}
      <Modal visible={showResult && gameStatus === 'playing'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.resultModal}>
            <Text style={styles.resultTitle}>
              {roundWinner === 'player' ? '🎉 You Scored!' :
                roundWinner === 'ai' ? '😔 AI Scored!' :
                  '🤝 Draw!'}
            </Text>
            <Text style={styles.resultScore}>{playerScore} - {aiScore}</Text>
            {roundWinner === null && (
              <Text style={styles.drawText}>Both pens fell off - no points</Text>
            )}
            <TouchableOpacity style={styles.nextRoundBtn} onPress={handleNextRound}>
              <Text style={styles.nextRoundText}>Next Round</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Game Over Modal */}
      <Modal visible={gameStatus === 'gameOver'} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.gameOverModal}>
            <Text style={styles.gameOverTitle}>
              {useGameStore.getState().winner === 'player' ? '🏆 VICTORY!' : '💔 DEFEAT'}
            </Text>
            <Text style={styles.gameOverScore}>Final: {playerScore} - {aiScore}</Text>

            <TouchableOpacity style={styles.playAgainBtn} onPress={handlePlayAgain}>
              <LinearGradient colors={['#22C55E', '#16A34A']} style={styles.playAgainGradient}>
                <Text style={styles.playAgainText}>Play Again</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.homeBtn} onPress={handleQuit}>
              <Text style={styles.homeBtnText}>Back to Menu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pause Modal */}
      <Modal visible={isPaused} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pauseModal}>
            <Text style={styles.pauseTitle}>PAUSED</Text>

            <TouchableOpacity style={styles.resumeBtn} onPress={() => setIsPaused(false)}>
              <Text style={styles.resumeText}>Resume</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quitBtn} onPress={handleQuit}>
              <Text style={styles.quitText}>Quit Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // @ts-ignore - needed for web dragging to work without selecting text
    userSelect: 'none',
    touchAction: 'none',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  board: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  compactScores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compactPlayer: {
    alignItems: 'center',
  },
  compactScoreValue: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  turnPill: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  topBarPowerUps: {
    flexDirection: 'row',
    gap: 8,
  },
  invisible: {
    opacity: 0,
  },
  hud: {
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
  },
  pauseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreBox: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  penIndicator: {
    width: 28,
    height: 6,
    borderRadius: 3,
    marginBottom: 3,
  },
  scoreName: {
    color: '#AAA',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreValue: {
    color: '#FFF',
    fontSize: 26,
    fontWeight: 'bold',
  },
  vsBox: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  vsText: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
  },
  roundText: {
    color: '#666',
    fontSize: 9,
  },
  turnIndicator: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    zIndex: 100,
  },
  turnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  shotClock: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  shotClockText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  powerBar: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: '92%',
    maxWidth: 480,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    padding: 8,
  },
  powerLabel: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    marginRight: 8,
  },
  powerBarOuter: {
    flex: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  powerBarInner: {
    height: '100%',
    borderRadius: 5,
  },
  powerPercent: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 40,
  },
  powerUps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    minHeight: 44,
    marginTop: 8,
    marginBottom: 24,
  },
  powerUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    gap: 6,
  },
  powerUpDisabled: {
    opacity: 0.5,
  },
  powerUpText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  powerUpTextDisabled: {
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '80%',
    maxWidth: 360,
  },
  resultTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  resultScore: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#e94560',
    marginBottom: 10,
  },
  drawText: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 20,
    textAlign: 'center',
  },
  nextRoundBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 24,
  },
  nextRoundText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gameOverModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '80%',
    maxWidth: 360,
  },
  gameOverTitle: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 8,
  },
  gameOverScore: {
    fontSize: 18,
    color: '#AAA',
    marginBottom: 24,
  },
  playAgainBtn: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
  },
  playAgainGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  playAgainText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  homeBtn: {
    paddingVertical: 12,
  },
  homeBtnText: {
    color: '#888',
    fontSize: 14,
  },
  pauseModal: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '70%',
    maxWidth: 320,
  },
  pauseTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 24,
  },
  resumeBtn: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 24,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  resumeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  quitBtn: {
    paddingVertical: 12,
  },
  quitText: {
    color: '#EF4444',
    fontSize: 14,
  },
});
