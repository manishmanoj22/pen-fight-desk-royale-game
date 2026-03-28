import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  PanResponder,
  TouchableOpacity,
  Modal,
  GestureResponderEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Rect, Text as SvgText, G, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse, ClipPath, Pattern } from 'react-native-svg';
import { useGameStore, PenStats } from '../src/store/gameStore';
import { GamePhysics } from '../src/engine/GamePhysics';
import { GameAI } from '../src/engine/GameAI';
import { Obstacle } from '../src/components/Desk';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Game constants
const DESK_MARGIN = 16;
const DESK_WIDTH = SCREEN_WIDTH - DESK_MARGIN * 2;
const DESK_HEIGHT = SCREEN_HEIGHT * 0.55;
const DESK_X = DESK_MARGIN;
const DESK_Y = 140;
const MAX_POWER = 1;
const POWER_SCALE = 150;
const PEN_LENGTH = 70;
const PEN_WIDTH = 14;

// Random number helper
const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

// Generate randomized obstacles with center barrier
const generateObstacles = (): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  
  // CENTER BARRIER - smaller ruler to slow down but not block completely
  obstacles.push({
    id: 'center-ruler',
    type: 'geometryBox',
    x: DESK_X + DESK_WIDTH / 2 - 30,
    y: DESK_Y + DESK_HEIGHT / 2 - 8,
    width: 60,
    height: 16,
    rotation: randomInRange(-8, 8),
  });
  
  // Geometry box - random position in top half
  obstacles.push({
    id: 'geometry-box',
    type: 'geometryBox',
    x: DESK_X + randomInRange(30, DESK_WIDTH - 120),
    y: DESK_Y + randomInRange(30, 80),
    width: 70,
    height: 30,
    rotation: randomInRange(-20, 20),
  });
  
  // Notebook - random position avoiding center
  const notebookSide = Math.random() > 0.5 ? 'left' : 'right';
  obstacles.push({
    id: 'notebook',
    type: 'notebook',
    x: notebookSide === 'left' 
      ? DESK_X + randomInRange(20, 80)
      : DESK_X + DESK_WIDTH - randomInRange(70, 120),
    y: DESK_Y + DESK_HEIGHT - randomInRange(60, 110),
    width: 55,
    height: 45,
    rotation: randomInRange(-15, 15),
  });
  
  // Eraser - random position
  obstacles.push({
    id: 'eraser',
    type: 'eraser',
    x: DESK_X + randomInRange(40, DESK_WIDTH - 60),
    y: DESK_Y + randomInRange(DESK_HEIGHT * 0.6, DESK_HEIGHT - 40),
    width: 28,
    height: 14,
    rotation: randomInRange(-30, 30),
  });
  
  // Second eraser for more obstacles
  obstacles.push({
    id: 'eraser-2',
    type: 'eraser',
    x: DESK_X + randomInRange(40, DESK_WIDTH - 60),
    y: DESK_Y + randomInRange(40, DESK_HEIGHT * 0.4),
    width: 24,
    height: 12,
    rotation: randomInRange(-25, 25),
  });
  
  return obstacles;
};

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
    hasRefillPower,
    capOn,
    gameStatus,
    toggleTurn,
    incrementPlayerScore,
    incrementAiScore,
    toggleCap,
    useRefillPower,
    setGameStatus,
    setWinner,
    resetGame,
  } = useGameStore();

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
  const [obstacles] = useState<Obstacle[]>(generateObstacles());
  const [message, setMessage] = useState('');
  const [roundStarter, setRoundStarter] = useState<'player' | 'ai'>('player'); // Track who starts each round

  // Refs
  const physicsRef = useRef<GamePhysics | null>(null);
  const aiRef = useRef<GameAI>(new GameAI('medium'));
  const gameLoopRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const penFellRef = useRef(false);
  
  // Touch tracking refs (for PanResponder closure)
  const touchStartRef = useRef({ x: 0, y: 0 });
  const hitPointRef = useRef({ x: 0, y: 0 });
  
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
      gameLoopRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const deltaTime = Math.min(timestamp - lastTimeRef.current, 16.67);
    lastTimeRef.current = timestamp;

    physicsRef.current.update(deltaTime);

    const newPlayerPos = physicsRef.current.getPenPosition(true);
    const newAiPos = physicsRef.current.getPenPosition(false);

    if (newPlayerPos) setPlayerPos(newPlayerPos);
    if (newAiPos) setAiPos(newAiPos);

    // Check if either pen has fallen off the desk
    if (!penFellRef.current && !showResult) {
      const playerOff = physicsRef.current.isPenOffDesk(true);
      const aiOff = physicsRef.current.isPenOffDesk(false);
      
      if (playerOff && aiOff) {
        // DRAW - both pens fell off
        penFellRef.current = true;
        handleDraw();
      } else if (playerOff) {
        // Player pen fell off - AI scores
        penFellRef.current = true;
        handlePenFallOff(true);
      } else if (aiOff) {
        // AI pen fell off - Player scores
        penFellRef.current = true;
        handlePenFallOff(false);
      }
    }

    // Check if pens have settled
    if (isAnimating && physicsRef.current.arePensSettled() && !penFellRef.current) {
      setIsAnimating(false);
      if (!showResult) {
        toggleTurn();
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

  // AI Turn
  useEffect(() => {
    if (!isPlayerTurn && !isAnimating && !showResult && physicsRef.current && !penFellRef.current) {
      setMessage('AI is thinking...');
      const aiTurnTimeout = setTimeout(() => {
        executeAITurn();
      }, 1200);
      return () => clearTimeout(aiTurnTimeout);
    } else if (isPlayerTurn && !isAnimating && !showResult) {
      setMessage('Your turn! Drag from your pen to flick');
    }
  }, [isPlayerTurn, isAnimating, showResult]);

  const executeAITurn = () => {
    if (!physicsRef.current) return;

    const currentAiPos = physicsRef.current.getPenPosition(false);
    const currentPlayerPos = physicsRef.current.getPenPosition(true);

    if (!currentAiPos || !currentPlayerPos) return;

    const decision = aiRef.current.calculateShot(
      currentAiPos,
      currentPlayerPos,
      { x: DESK_X, y: DESK_Y, width: DESK_WIDTH, height: DESK_HEIGHT },
      aiPen
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
      setMessage('Your pen fell off! AI scores!');
    } else {
      incrementPlayerScore();
      setRoundWinner('player');
      setMessage('AI pen knocked off! You score!');
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
    
    setMessage(nextStarter === 'player' ? 'New round! Your turn' : 'New round! AI starts');
  };

  // Check if touch is actually ON the pen body (not just near it)
  // Uses CURRENT physics position, not React state
  const isTouchOnPen = (touchX: number, touchY: number) => {
    // Get current position from physics engine
    const currentPos = physicsRef.current?.getPenPosition(true);
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
  const getHitPointOnPen = (touchX: number, touchY: number) => {
    // Get current position from physics engine
    const currentPos = physicsRef.current?.getPenPosition(true);
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

  // Pan responder for flicking
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        // Use refs for most up-to-date state values
        if (!isPlayerTurnRef.current || isAnimatingRef.current || showResultRef.current) {
          return false;
        }
        const touch = evt.nativeEvent;
        // Only start if touch is actually ON the pen
        return isTouchOnPen(touch.pageX, touch.pageY);
      },
      onMoveShouldSetPanResponder: () => {
        return isPlayerTurnRef.current && !isAnimatingRef.current && !showResultRef.current;
      },
      
      onPanResponderGrant: (evt) => {
        // Double-check it's still player's turn
        if (!isPlayerTurnRef.current || isAnimatingRef.current) {
          return;
        }
        
        const touch = evt.nativeEvent;
        const hit = getHitPointOnPen(touch.pageX, touch.pageY);
        
        // Store in refs for closure access
        touchStartRef.current = { x: touch.pageX, y: touch.pageY };
        hitPointRef.current = { x: hit.x, y: hit.y };
        
        setIsAiming(true);
        setTouchStart({ x: touch.pageX, y: touch.pageY });
        setTouchCurrent({ x: touch.pageX, y: touch.pageY });
        setHitPoint({ x: hit.x, y: hit.y });
        setPower(0);
        setMessage('Pull back and release to flick!');
      },
      
      onPanResponderMove: (evt) => {
        const touch = evt.nativeEvent;
        setTouchCurrent({ x: touch.pageX, y: touch.pageY });
        
        // Use ref for start position (refs work in closures)
        const startX = touchStartRef.current.x;
        const startY = touchStartRef.current.y;
        
        const dx = startX - touch.pageX;
        const dy = startY - touch.pageY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const newPower = Math.min(MAX_POWER, distance / POWER_SCALE);
        setPower(newPower);
      },
      
      onPanResponderRelease: (evt) => {
        const touch = evt.nativeEvent;
        
        // Use refs for start position and hit point
        const startX = touchStartRef.current.x;
        const startY = touchStartRef.current.y;
        const hitX = hitPointRef.current.x;
        const hitY = hitPointRef.current.y;
        
        const dx = startX - touch.pageX;
        const dy = startY - touch.pageY;
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
        
        // Calculate force direction and magnitude
        const forceMagnitude = currentPower * 20; // Increased force
        const forceX = (dx / distance) * forceMagnitude;
        const forceY = (dy / distance) * forceMagnitude;
        
        // Power multiplier
        const powerMultiplier = refillActive ? 1.5 : 1;
        
        // Execute flick - hitPoint determines spin
        physicsRef.current.flickPen(
          true,
          { x: hitX, y: hitY },
          { x: forceX, y: forceY },
          powerMultiplier
        );
        
        setIsAiming(false);
        setPower(0);
        setIsAnimating(true);
        setRefillActive(false);
        setMessage('');
      },

      onPanResponderTerminate: () => {
        setIsAiming(false);
        setPower(0);
      },
    })
  ).current;

  const handleRefillPower = () => {
    if (hasRefillPower && !refillActive) {
      useRefillPower();
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

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* Background */}
      <LinearGradient
        colors={['#2D1B0E', '#3D2817', '#4A3520']}
        style={styles.background}
      />

      {/* HUD */}
      <View style={styles.hud}>
        <TouchableOpacity style={styles.pauseBtn} onPress={() => setIsPaused(true)}>
          <Ionicons name="pause" size={24} color="#FFF" />
        </TouchableOpacity>

        <View style={styles.scoreContainer}>
          <View style={styles.scoreBox}>
            <View style={[styles.penIndicator, { backgroundColor: playerPen.color }]} />
            <Text style={styles.scoreName}>YOU</Text>
            <Text style={styles.scoreValue}>{playerScore}</Text>
          </View>
          
          <View style={styles.vsBox}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.roundText}>First to {roundsToWin}</Text>
          </View>
          
          <View style={styles.scoreBox}>
            <View style={[styles.penIndicator, { backgroundColor: aiPen.color }]} />
            <Text style={styles.scoreName}>AI</Text>
            <Text style={styles.scoreValue}>{aiScore}</Text>
          </View>
        </View>
      </View>

      {/* Turn indicator & Message */}
      <View style={[styles.turnIndicator, { backgroundColor: isPlayerTurn ? '#22C55E' : '#EF4444' }]}>
        <Text style={styles.turnText}>
          {message || (isPlayerTurn ? 'Your Turn' : 'AI Turn')}
        </Text>
      </View>

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
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.canvas}>
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
        <Line x1={DESK_X + DESK_WIDTH/2} y1={DESK_Y + DESK_HEIGHT/2 - 20} x2={DESK_X + DESK_WIDTH/2 + 30} y2={DESK_Y + DESK_HEIGHT/2 - 15} stroke="rgba(139, 69, 19, 0.15)" strokeWidth={1} />
        
        {/* Obstacles - Enhanced realistic school items */}
        {obstacles.map((obs) => {
          const cx = obs.x + obs.width/2;
          const cy = obs.y + obs.height/2;
          
          switch (obs.type) {
            case 'geometryBox':
              return (
                <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                  {/* Box shadow */}
                  <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.3)" rx={4} />
                  {/* Main box body */}
                  <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="url(#geoBoxGrad)" rx={4} />
                  {/* Box lid line */}
                  <Line x1={obs.x + 2} y1={obs.y + obs.height * 0.35} x2={obs.x + obs.width - 2} y2={obs.y + obs.height * 0.35} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
                  {/* Label area */}
                  <Rect x={obs.x + 5} y={obs.y + 4} width={obs.width - 10} height={8} fill="#FFFEF0" rx={1} />
                  {/* Label decoration (no brand) */}
                  <Line x1={obs.x + 8} y1={obs.y + 8} x2={obs.x + obs.width - 8} y2={obs.y + 8} stroke="rgba(30, 64, 175, 0.3)" strokeWidth={0.5} />
                  {/* Metallic clasp */}
                  <Rect x={obs.x + obs.width/2 - 4} y={obs.y + obs.height - 6} width={8} height={4} fill="url(#metallicSilver)" rx={1} />
                  {/* Edge highlight */}
                  <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} rx={4} />
                </G>
              );
            case 'notebook':
              return (
                <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                  {/* Shadow */}
                  <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.25)" rx={2} />
                  {/* Cover */}
                  <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="url(#paperGrad)" rx={2} />
                  {/* Red margin line */}
                  <Line x1={obs.x + 10} y1={obs.y + 2} x2={obs.x + 10} y2={obs.y + obs.height - 2} stroke="rgba(239, 68, 68, 0.5)" strokeWidth={1} />
                  {/* Blue ruled lines */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Line
                      key={i}
                      x1={obs.x + 3}
                      y1={obs.y + 8 + i * 8}
                      x2={obs.x + obs.width - 3}
                      y2={obs.y + 8 + i * 8}
                      stroke="rgba(59, 130, 246, 0.4)"
                      strokeWidth={0.5}
                    />
                  ))}
                  {/* Spiral binding holes */}
                  {[0, 1, 2].map((i) => (
                    <Circle key={i} cx={obs.x + 4} cy={obs.y + 10 + i * 14} r={2} fill="#8B4513" />
                  ))}
                  {/* Written text scribble */}
                  <SvgText x={obs.x + 14} y={obs.y + 14} fill="rgba(30, 64, 175, 0.5)" fontSize={4}>Notes</SvgText>
                </G>
              );
            case 'eraser':
              return (
                <G key={obs.id} transform={`rotate(${obs.rotation}, ${cx}, ${cy})`}>
                  {/* Shadow */}
                  <Rect x={obs.x + 1} y={obs.y + 1} width={obs.width} height={obs.height} fill="rgba(0,0,0,0.25)" rx={2} />
                  {/* Main eraser body */}
                  <Rect x={obs.x} y={obs.y} width={obs.width} height={obs.height} fill="url(#eraserGrad)" rx={2} />
                  {/* Paper sleeve */}
                  <Rect x={obs.x + 2} y={obs.y + 2} width={obs.width - 4} height={obs.height - 4} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={0.5} rx={1} />
                  {/* Simple marking line (no brand) */}
                  <Line x1={obs.x + 4} y1={cy} x2={obs.x + obs.width - 4} y2={cy} stroke="rgba(255,255,255,0.5)" strokeWidth={0.5} />
                  {/* Used edge - darker */}
                  <Rect x={obs.x} y={obs.y} width={4} height={obs.height} fill="rgba(0,0,0,0.15)" rx={2} />
                </G>
              );
            default:
              return null;
          }
        })}

        {/* Player Pen - Enhanced realistic pen */}
        <G transform={`rotate(${(playerPos.angle * 180) / Math.PI}, ${playerPos.x}, ${playerPos.y})`}>
          {/* Pen shadow */}
          <Ellipse cx={playerPos.x} cy={playerPos.y + 10} rx={PEN_LENGTH/2 - 5} ry={4} fill="rgba(0,0,0,0.2)" />
          
          {/* Main pen body */}
          <Rect
            x={playerPos.x - PEN_LENGTH/2}
            y={playerPos.y - PEN_WIDTH/2}
            width={PEN_LENGTH}
            height={PEN_WIDTH}
            fill={playerPen.id === 'classic' ? 'url(#penBlueGrad)' : 
                  playerPen.id === 'heavyweight' ? 'url(#penDarkGrad)' :
                  playerPen.id === 'acrobat' ? 'url(#penRedGrad)' :
                  playerPen.id === 'natraj' ? 'url(#penYellowGrad)' :
                  'url(#penGreenGrad)'}
            rx={PEN_WIDTH/2}
          />
          
          {/* Pen body highlight */}
          <Rect
            x={playerPos.x - PEN_LENGTH/2 + 2}
            y={playerPos.y - PEN_WIDTH/2 + 1}
            width={PEN_LENGTH - 4}
            height={3}
            fill="rgba(255,255,255,0.25)"
            rx={2}
          />
          
          {/* Grip section */}
          <Rect
            x={playerPos.x - 15}
            y={playerPos.y - PEN_WIDTH/2}
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
              y1={playerPos.y - PEN_WIDTH/2}
              x2={playerPos.x + offset}
              y2={playerPos.y + PEN_WIDTH/2}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
            />
          ))}
          
          {/* Cap or Tip */}
          {capOn ? (
            <G>
              {/* Cap body */}
              <Rect
                x={playerPos.x + PEN_LENGTH/2 - 8}
                y={playerPos.y - PEN_WIDTH/2 - 1}
                width={25}
                height={PEN_WIDTH + 2}
                fill={playerPen.id === 'heavyweight' ? 'url(#metallicGold)' : playerPen.secondaryColor}
                rx={PEN_WIDTH/2}
              />
              {/* Cap clip */}
              <Rect
                x={playerPos.x + PEN_LENGTH/2 + 5}
                y={playerPos.y - PEN_WIDTH/2 - 3}
                width={12}
                height={3}
                fill={playerPen.id === 'heavyweight' ? 'url(#metallicGold)' : playerPen.secondaryColor}
                rx={1}
              />
              {/* Cap ring */}
              <Line
                x1={playerPos.x + PEN_LENGTH/2 - 5}
                y1={playerPos.y - PEN_WIDTH/2}
                x2={playerPos.x + PEN_LENGTH/2 - 5}
                y2={playerPos.y + PEN_WIDTH/2}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2}
              />
            </G>
          ) : (
            <G>
              {/* Pen tip cone */}
              <Path
                d={`M ${playerPos.x + PEN_LENGTH/2 - 5} ${playerPos.y - PEN_WIDTH/2} 
                    L ${playerPos.x + PEN_LENGTH/2 + 15} ${playerPos.y} 
                    L ${playerPos.x + PEN_LENGTH/2 - 5} ${playerPos.y + PEN_WIDTH/2} Z`}
                fill="url(#metallicSilver)"
              />
              {/* Tip point */}
              <Circle cx={playerPos.x + PEN_LENGTH/2 + 14} cy={playerPos.y} r={1.5} fill="#333" />
            </G>
          )}
          
          {/* Back end of pen */}
          <Ellipse
            cx={playerPos.x - PEN_LENGTH/2}
            cy={playerPos.y}
            rx={3}
            ry={PEN_WIDTH/2}
            fill="rgba(0,0,0,0.2)"
          />
        </G>

        {/* AI Pen - Enhanced realistic pen */}
        <G transform={`rotate(${(aiPos.angle * 180) / Math.PI}, ${aiPos.x}, ${aiPos.y})`}>
          {/* Pen shadow */}
          <Ellipse cx={aiPos.x} cy={aiPos.y + 10} rx={PEN_LENGTH/2 - 5} ry={4} fill="rgba(0,0,0,0.2)" />
          
          {/* Main pen body */}
          <Rect
            x={aiPos.x - PEN_LENGTH/2}
            y={aiPos.y - PEN_WIDTH/2}
            width={PEN_LENGTH}
            height={PEN_WIDTH}
            fill={aiPen.id === 'classic' ? 'url(#penBlueGrad)' : 
                  aiPen.id === 'heavyweight' ? 'url(#penDarkGrad)' :
                  aiPen.id === 'acrobat' ? 'url(#penRedGrad)' :
                  aiPen.id === 'natraj' ? 'url(#penYellowGrad)' :
                  'url(#penGreenGrad)'}
            rx={PEN_WIDTH/2}
          />
          
          {/* Pen body highlight */}
          <Rect
            x={aiPos.x - PEN_LENGTH/2 + 2}
            y={aiPos.y - PEN_WIDTH/2 + 1}
            width={PEN_LENGTH - 4}
            height={3}
            fill="rgba(255,255,255,0.25)"
            rx={2}
          />
          
          {/* Grip section */}
          <Rect
            x={aiPos.x - 15}
            y={aiPos.y - PEN_WIDTH/2}
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
              y1={aiPos.y - PEN_WIDTH/2}
              x2={aiPos.x + offset}
              y2={aiPos.y + PEN_WIDTH/2}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1}
            />
          ))}
          
          {/* AI pen always has cap */}
          <G>
            {/* Cap body */}
            <Rect
              x={aiPos.x + PEN_LENGTH/2 - 8}
              y={aiPos.y - PEN_WIDTH/2 - 1}
              width={25}
              height={PEN_WIDTH + 2}
              fill={aiPen.id === 'heavyweight' ? 'url(#metallicGold)' : aiPen.secondaryColor}
              rx={PEN_WIDTH/2}
            />
            {/* Cap clip */}
            <Rect
              x={aiPos.x + PEN_LENGTH/2 + 5}
              y={aiPos.y - PEN_WIDTH/2 - 3}
              width={12}
              height={3}
              fill={aiPen.id === 'heavyweight' ? 'url(#metallicGold)' : aiPen.secondaryColor}
              rx={1}
            />
            {/* Cap ring */}
            <Line
              x1={aiPos.x + PEN_LENGTH/2 - 5}
              y1={aiPos.y - PEN_WIDTH/2}
              x2={aiPos.x + PEN_LENGTH/2 - 5}
              y2={aiPos.y + PEN_WIDTH/2}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth={2}
            />
          </G>
          
          {/* Back end of pen */}
          <Ellipse
            cx={aiPos.x - PEN_LENGTH/2}
            cy={aiPos.y}
            rx={3}
            ry={PEN_WIDTH/2}
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
      </Svg>

      {/* Power-ups */}
      {isPlayerTurn && !isAnimating && !showResult && (
        <View style={styles.powerUps}>
          <TouchableOpacity
            style={[styles.powerUpBtn, (!hasRefillPower || refillActive) && styles.powerUpDisabled]}
            onPress={handleRefillPower}
            disabled={!hasRefillPower || refillActive}
          >
            <Ionicons name="flash" size={20} color={hasRefillPower && !refillActive ? '#F59E0B' : '#666'} />
            <Text style={[styles.powerUpText, (!hasRefillPower || refillActive) && styles.powerUpTextDisabled]}>
              {refillActive ? 'Active!' : 'Refill'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.powerUpBtn} onPress={toggleCap}>
            <Ionicons name={capOn ? 'lock-closed' : 'lock-open'} size={20} color="#3B82F6" />
            <Text style={styles.powerUpText}>{capOn ? 'Cap On' : 'Cap Off'}</Text>
          </TouchableOpacity>
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
  },
  background: {
    ...StyleSheet.absoluteFillObject,
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
    position: 'absolute',
    top: 108,
    left: 0,
    right: 0,
    paddingVertical: 6,
    alignItems: 'center',
    zIndex: 100,
  },
  turnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  powerBar: {
    position: 'absolute',
    top: 145,
    left: 16,
    right: 16,
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
    position: 'absolute',
    bottom: 50,
    right: 16,
    gap: 8,
    zIndex: 100,
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
