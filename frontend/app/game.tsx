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
import Svg, { Line, Circle, Rect, Text as SvgText, G, Path } from 'react-native-svg';
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

// Generate obstacles
const generateObstacles = (): Obstacle[] => {
  return [
    {
      id: 'geometry-box',
      type: 'geometryBox',
      x: DESK_X + DESK_WIDTH / 2 - 35,
      y: DESK_Y + 50,
      width: 70,
      height: 30,
      rotation: 12,
    },
    {
      id: 'notebook',
      type: 'notebook',
      x: DESK_X + DESK_WIDTH - 90,
      y: DESK_Y + DESK_HEIGHT - 90,
      width: 55,
      height: 45,
      rotation: -8,
    },
    {
      id: 'eraser',
      type: 'eraser',
      x: DESK_X + 40,
      y: DESK_Y + DESK_HEIGHT - 70,
      width: 28,
      height: 14,
      rotation: 20,
    },
  ];
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

  // Refs
  const physicsRef = useRef<GamePhysics | null>(null);
  const aiRef = useRef<GameAI>(new GameAI('medium'));
  const gameLoopRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const penFellRef = useRef(false);
  
  // Touch tracking refs (for PanResponder closure)
  const touchStartRef = useRef({ x: 0, y: 0 });
  const hitPointRef = useRef({ x: 0, y: 0 });

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
    setRoundWinner(null);
    setRefillActive(false);
    penFellRef.current = false;
    
    physicsRef.current?.resetPenPositions(DESK_X, DESK_Y, DESK_WIDTH, DESK_HEIGHT);
    setPlayerPos(initialPlayerPos);
    setAiPos(initialAiPos);
    
    if (!useGameStore.getState().isPlayerTurn) {
      toggleTurn();
    }
    setMessage('New round! Your turn');
  };

  // Check if touch is actually ON the pen body (not just near it)
  const isTouchOnPen = (touchX: number, touchY: number) => {
    // Transform touch point to pen's local coordinate system
    const penAngle = playerPos.angle;
    const penDirX = Math.cos(penAngle);
    const penDirY = Math.sin(penAngle);
    const perpX = -penDirY; // Perpendicular to pen axis
    const perpY = penDirX;
    
    // Vector from pen center to touch
    const toTouchX = touchX - playerPos.x;
    const toTouchY = touchY - playerPos.y;
    
    // Project onto pen axis (along the length)
    const alongPen = toTouchX * penDirX + toTouchY * penDirY;
    
    // Project onto perpendicular axis (across the width)
    const acrossPen = toTouchX * perpX + toTouchY * perpY;
    
    // Check if within pen bounds (with some padding for easier touch)
    const penHalfLength = (PEN_LENGTH / 2) + 15; // +15 for cap
    const penHalfWidth = (PEN_WIDTH / 2) + 10; // Padding for easier touch
    
    return Math.abs(alongPen) <= penHalfLength && Math.abs(acrossPen) <= penHalfWidth;
  };

  // Get the point on pen surface closest to touch - this is where the flick originates
  const getHitPointOnPen = (touchX: number, touchY: number) => {
    const penAngle = playerPos.angle;
    const penDirX = Math.cos(penAngle);
    const penDirY = Math.sin(penAngle);
    
    // Vector from pen center to touch
    const toTouchX = touchX - playerPos.x;
    const toTouchY = touchY - playerPos.y;
    
    // Project onto pen axis to find position along pen
    const alongPen = toTouchX * penDirX + toTouchY * penDirY;
    
    // Clamp to pen length (including cap)
    const halfLen = PEN_LENGTH / 2 + 10;
    const clampedAlong = Math.max(-halfLen, Math.min(halfLen, alongPen));
    
    // The hit point is on the pen's centerline at the clamped position
    return {
      x: playerPos.x + clampedAlong * penDirX,
      y: playerPos.y + clampedAlong * penDirY,
      alongOffset: clampedAlong,
    };
  };

  // Pan responder for flicking
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        if (!isPlayerTurn || isAnimating || showResult) return false;
        const touch = evt.nativeEvent;
        // Only start if touch is actually ON the pen
        return isTouchOnPen(touch.pageX, touch.pageY);
      },
      onMoveShouldSetPanResponder: () => isPlayerTurn && !isAnimating && !showResult,
      
      onPanResponderGrant: (evt) => {
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
        {/* Desk */}
        <Rect
          x={DESK_X}
          y={DESK_Y}
          width={DESK_WIDTH}
          height={DESK_HEIGHT}
          fill="#DEB887"
          stroke="#8B4513"
          strokeWidth={4}
          rx={8}
        />
        
        {/* Wood grain */}
        {Array.from({ length: 12 }).map((_, i) => (
          <Line
            key={`grain-${i}`}
            x1={DESK_X}
            y1={DESK_Y + i * (DESK_HEIGHT / 12)}
            x2={DESK_X + DESK_WIDTH}
            y2={DESK_Y + i * (DESK_HEIGHT / 12) + 4}
            stroke="rgba(139, 90, 43, 0.25)"
            strokeWidth={1}
          />
        ))}

        {/* Scribbles */}
        <SvgText x={DESK_X + 25} y={DESK_Y + 45} fill="rgba(70, 70, 200, 0.35)" fontSize={10}>A + B = ?</SvgText>
        <SvgText x={DESK_X + DESK_WIDTH - 70} y={DESK_Y + 85} fill="rgba(200, 50, 50, 0.25)" fontSize={8}>2024 ♥</SvgText>
        <Circle cx={DESK_X + DESK_WIDTH - 35} cy={DESK_Y + 55} r={10} fill="none" stroke="rgba(100, 100, 100, 0.25)" strokeWidth={1} />
        
        {/* Obstacles */}
        {obstacles.map((obs) => {
          switch (obs.type) {
            case 'geometryBox':
              return (
                <G key={obs.id}>
                  <Rect
                    x={obs.x}
                    y={obs.y}
                    width={obs.width}
                    height={obs.height}
                    fill="#2D5A8A"
                    stroke="#1E3D5C"
                    strokeWidth={2}
                    rx={3}
                    transform={`rotate(${obs.rotation}, ${obs.x + obs.width/2}, ${obs.y + obs.height/2})`}
                  />
                  <Rect
                    x={obs.x + 4}
                    y={obs.y + 4}
                    width={obs.width - 8}
                    height={10}
                    fill="#F5F5DC"
                    rx={2}
                    transform={`rotate(${obs.rotation}, ${obs.x + obs.width/2}, ${obs.y + obs.height/2})`}
                  />
                </G>
              );
            case 'notebook':
              return (
                <G key={obs.id}>
                  <Rect
                    x={obs.x}
                    y={obs.y}
                    width={obs.width}
                    height={obs.height}
                    fill="#F5F5DC"
                    stroke="#8B4513"
                    strokeWidth={1}
                    transform={`rotate(${obs.rotation}, ${obs.x + obs.width/2}, ${obs.y + obs.height/2})`}
                  />
                  {[0, 1, 2, 3].map((i) => (
                    <Line
                      key={i}
                      x1={obs.x + 5}
                      y1={obs.y + 8 + i * 9}
                      x2={obs.x + obs.width - 5}
                      y2={obs.y + 8 + i * 9}
                      stroke="rgba(100, 149, 237, 0.4)"
                      strokeWidth={0.5}
                      transform={`rotate(${obs.rotation}, ${obs.x + obs.width/2}, ${obs.y + obs.height/2})`}
                    />
                  ))}
                </G>
              );
            case 'eraser':
              return (
                <Rect
                  key={obs.id}
                  x={obs.x}
                  y={obs.y}
                  width={obs.width}
                  height={obs.height}
                  fill="#FFB6C1"
                  stroke="#FF69B4"
                  strokeWidth={1}
                  rx={2}
                  transform={`rotate(${obs.rotation}, ${obs.x + obs.width/2}, ${obs.y + obs.height/2})`}
                />
              );
            default:
              return null;
          }
        })}

        {/* Player Pen */}
        <G transform={`rotate(${(playerPos.angle * 180) / Math.PI}, ${playerPos.x}, ${playerPos.y})`}>
          <Rect
            x={playerPos.x - PEN_LENGTH/2}
            y={playerPos.y - PEN_WIDTH/2}
            width={PEN_LENGTH}
            height={PEN_WIDTH}
            fill={playerPen.color}
            rx={4}
          />
          {/* Grip lines */}
          <Line
            x1={playerPos.x - 10}
            y1={playerPos.y - PEN_WIDTH/2}
            x2={playerPos.x - 10}
            y2={playerPos.y + PEN_WIDTH/2}
            stroke={playerPen.secondaryColor}
            strokeWidth={2}
            opacity={0.6}
          />
          {/* Cap */}
          {capOn && (
            <Rect
              x={playerPos.x + PEN_LENGTH/2 - 5}
              y={playerPos.y - PEN_WIDTH/2}
              width={22}
              height={PEN_WIDTH}
              fill={playerPen.secondaryColor}
              rx={7}
            />
          )}
          {/* Tip when cap off */}
          {!capOn && (
            <Path
              d={`M ${playerPos.x + PEN_LENGTH/2} ${playerPos.y - PEN_WIDTH/2} 
                  L ${playerPos.x + PEN_LENGTH/2 + 15} ${playerPos.y} 
                  L ${playerPos.x + PEN_LENGTH/2} ${playerPos.y + PEN_WIDTH/2} Z`}
              fill={playerPen.secondaryColor}
            />
          )}
        </G>

        {/* AI Pen */}
        <G transform={`rotate(${(aiPos.angle * 180) / Math.PI}, ${aiPos.x}, ${aiPos.y})`}>
          <Rect
            x={aiPos.x - PEN_LENGTH/2}
            y={aiPos.y - PEN_WIDTH/2}
            width={PEN_LENGTH}
            height={PEN_WIDTH}
            fill={aiPen.color}
            rx={4}
          />
          {/* Grip lines */}
          <Line
            x1={aiPos.x - 10}
            y1={aiPos.y - PEN_WIDTH/2}
            x2={aiPos.x - 10}
            y2={aiPos.y + PEN_WIDTH/2}
            stroke={aiPen.secondaryColor}
            strokeWidth={2}
            opacity={0.6}
          />
          {/* Cap */}
          <Rect
            x={aiPos.x + PEN_LENGTH/2 - 5}
            y={aiPos.y - PEN_WIDTH/2}
            width={22}
            height={PEN_WIDTH}
            fill={aiPen.secondaryColor}
            rx={7}
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
