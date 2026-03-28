import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore, PEN_CATALOG, PenStats } from '../src/store/gameStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function PenCard({ pen, isSelected, onSelect }: { pen: PenStats; isSelected: boolean; onSelect: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.penCard, isSelected && styles.penCardSelected]}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <View style={styles.penVisual}>
        <View style={[styles.penBodyVisual, { backgroundColor: pen.color }]}>
          <View style={[styles.penGrip, { backgroundColor: pen.secondaryColor }]} />
        </View>
        <View style={[styles.penCapVisual, { backgroundColor: pen.secondaryColor }]} />
      </View>
      
      <Text style={styles.penName}>{pen.name}</Text>
      <Text style={styles.penClass}>{pen.class.toUpperCase()}</Text>
      <Text style={styles.penDescription}>{pen.description}</Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Mass</Text>
          <View style={styles.statBar}>
            <View style={[styles.statFill, { width: `${pen.mass * 50}%`, backgroundColor: '#3B82F6' }]} />
          </View>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Grip</Text>
          <View style={styles.statBar}>
            <View style={[styles.statFill, { width: `${pen.friction * 100}%`, backgroundColor: '#22C55E' }]} />
          </View>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Spin</Text>
          <View style={styles.statBar}>
            <View style={[styles.statFill, { width: `${pen.rotationSpeed * 50}%`, backgroundColor: '#F59E0B' }]} />
          </View>
        </View>
      </View>
      
      {isSelected && (
        <View style={styles.selectedBadge}>
          <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SelectPenScreen() {
  const router = useRouter();
  const { playerPen, setPlayerPen, setGameStatus } = useGameStore();
  const [selectedPen, setSelectedPen] = useState<PenStats>(playerPen);

  const handleConfirm = () => {
    setPlayerPen(selectedPen);
    // Randomly select AI pen (different from player)
    const availablePens = PEN_CATALOG.filter(p => p.id !== selectedPen.id);
    const aiPen = availablePens[Math.floor(Math.random() * availablePens.length)];
    useGameStore.getState().setAiPen(aiPen);
    setGameStatus('playing');
    router.push('/game');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Choose Your Pen</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Pen Selection */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {PEN_CATALOG.map((pen) => (
            <PenCard
              key={pen.id}
              pen={pen}
              isSelected={selectedPen.id === pen.id}
              onSelect={() => setSelectedPen(pen)}
            />
          ))}
        </ScrollView>

        {/* Confirm Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.confirmButton}
            onPress={handleConfirm}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#22C55E', '#16A34A']}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.confirmText}>START BATTLE</Text>
              <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  penCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  penCardSelected: {
    borderColor: '#22C55E',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  penVisual: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  penBodyVisual: {
    width: 100,
    height: 16,
    borderRadius: 4,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  penGrip: {
    position: 'absolute',
    left: '30%',
    width: 4,
    height: '100%',
    opacity: 0.5,
  },
  penCapVisual: {
    width: 25,
    height: 16,
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    marginLeft: -2,
  },
  penName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  penClass: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
    letterSpacing: 2,
  },
  penDescription: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 16,
    lineHeight: 20,
  },
  statsContainer: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statLabel: {
    width: 50,
    fontSize: 12,
    color: '#888',
  },
  statBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  statFill: {
    height: '100%',
    borderRadius: 4,
  },
  selectedBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  bottomContainer: {
    padding: 20,
  },
  confirmButton: {
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  confirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  confirmText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
});
