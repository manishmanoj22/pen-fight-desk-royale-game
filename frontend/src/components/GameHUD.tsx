import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PenStats } from '../store/gameStore';

interface GameHUDProps {
  playerPen: PenStats;
  aiPen: PenStats;
  playerScore: number;
  aiScore: number;
  roundsToWin: number;
  isPlayerTurn: boolean;
  hasRefillPower: boolean;
  capOn: boolean;
  onToggleCap: () => void;
  onUseRefill: () => void;
  onPause: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  playerPen,
  aiPen,
  playerScore,
  aiScore,
  roundsToWin,
  isPlayerTurn,
  hasRefillPower,
  capOn,
  onToggleCap,
  onUseRefill,
  onPause,
}) => {
  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.pauseButton} onPress={onPause}>
          <Ionicons name="pause" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        
        <View style={styles.scoreContainer}>
          <View style={styles.scoreBox}>
            <View style={[styles.penIndicator, { backgroundColor: playerPen.color }]} />
            <Text style={styles.scoreName}>YOU</Text>
            <Text style={styles.scoreText}>{playerScore}</Text>
          </View>
          
          <View style={styles.vsContainer}>
            <Text style={styles.vsText}>VS</Text>
            <Text style={styles.roundsText}>First to {roundsToWin}</Text>
          </View>
          
          <View style={styles.scoreBox}>
            <View style={[styles.penIndicator, { backgroundColor: aiPen.color }]} />
            <Text style={styles.scoreName}>AI</Text>
            <Text style={styles.scoreText}>{aiScore}</Text>
          </View>
        </View>
      </View>
      
      {/* Turn indicator */}
      <View style={[styles.turnIndicator, { backgroundColor: isPlayerTurn ? '#22C55E' : '#EF4444' }]}>
        <Text style={styles.turnText}>
          {isPlayerTurn ? '🎯 YOUR TURN - Drag to aim!' : '🤖 AI THINKING...'}
        </Text>
      </View>
      
      {/* Power-ups */}
      {isPlayerTurn && (
        <View style={styles.powerUpsContainer}>
          <TouchableOpacity
            style={[
              styles.powerUpButton,
              !hasRefillPower && styles.powerUpDisabled
            ]}
            onPress={onUseRefill}
            disabled={!hasRefillPower}
          >
            <Ionicons name="flash" size={20} color={hasRefillPower ? '#F59E0B' : '#666'} />
            <Text style={[styles.powerUpText, !hasRefillPower && styles.powerUpTextDisabled]}>
              Refill
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.powerUpButton}
            onPress={onToggleCap}
          >
            <Ionicons name={capOn ? 'lock-closed' : 'lock-open'} size={20} color="#3B82F6" />
            <Text style={styles.powerUpText}>
              {capOn ? 'Cap On' : 'Cap Off'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  pauseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreBox: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  penIndicator: {
    width: 30,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  scoreName: {
    color: '#AAA',
    fontSize: 10,
    fontWeight: '600',
  },
  scoreText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
  },
  vsContainer: {
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  vsText: {
    color: '#888',
    fontSize: 14,
    fontWeight: 'bold',
  },
  roundsText: {
    color: '#666',
    fontSize: 10,
  },
  turnIndicator: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  turnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  powerUpsContainer: {
    position: 'absolute',
    bottom: -80,
    right: 16,
    flexDirection: 'column',
    gap: 8,
  },
  powerUpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  powerUpDisabled: {
    opacity: 0.5,
  },
  powerUpText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  powerUpTextDisabled: {
    color: '#666',
  },
});
