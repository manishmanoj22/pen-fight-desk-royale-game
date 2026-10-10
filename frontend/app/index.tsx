import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '../src/store/gameStore';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const resetGame = useGameStore((state) => state.resetGame);
  const setGameStatus = useGameStore((state) => state.setGameStatus);

  const handlePlay = () => {
    resetGame();
    setGameStatus('selecting');
    router.push('/select-pen');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradient}
      >
        {/* Decorative elements */}
        <View style={styles.decorativeCircle1} />
        <View style={styles.decorativeCircle2} />
        
        {/* Title Section */}
        <View style={styles.titleContainer}>
          <View style={styles.penIconContainer}>
            <View style={styles.penIcon}>
              <View style={styles.penBody} />
              <View style={styles.penTip} />
            </View>
          </View>
          
          <Text style={styles.title}>PEN STRIKE</Text>
          <Text style={styles.subtitle}>DESK ROYALE</Text>
          
          <View style={styles.taglineContainer}>
            <Text style={styles.tagline}>The Ultimate School Desk Battle</Text>
          </View>
        </View>

        {/* Menu Buttons */}
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={handlePlay}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#e94560', '#c23a51']}
              style={styles.playButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="play" size={28} color="#FFFFFF" />
              <Text style={styles.playButtonText}>PLAY</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => router.push('/how-to-play')}
            activeOpacity={0.7}
          >
            <Ionicons name="help-circle-outline" size={24} color="#FFFFFF" />
            <Text style={styles.menuButtonText}>How to Play</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => router.push('/select-pen')}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={24} color="#FFFFFF" />
            <Text style={styles.menuButtonText}>Customize Pen</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>A nostalgic 90s classroom experience</Text>
          <View style={styles.footerIcons}>
            <Ionicons name="school-outline" size={16} color="#888" />
            <Text style={styles.footerEmoji}> ✏️ </Text>
            <Ionicons name="book-outline" size={16} color="#888" />
          </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 40,
  },
  decorativeCircle1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(233, 69, 96, 0.1)',
  },
  decorativeCircle2: {
    position: 'absolute',
    bottom: -50,
    left: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(15, 52, 96, 0.3)',
  },
  titleContainer: {
    alignItems: 'center',
  },
  penIconContainer: {
    marginBottom: 20,
  },
  penIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    transform: [{ rotate: '-45deg' }],
  },
  penBody: {
    width: 80,
    height: 16,
    backgroundColor: '#e94560',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#c23a51',
  },
  penTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 20,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: '#FFD700',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  title: {
    fontSize: 48,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
    textShadowColor: 'rgba(233, 69, 96, 0.5)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#e94560',
    letterSpacing: 8,
    marginTop: 5,
  },
  taglineContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  tagline: {
    fontSize: 14,
    color: '#AAA',
    fontStyle: 'italic',
  },
  menuContainer: {
    width: '80%',
    maxWidth: 420,
    alignItems: 'center',
    gap: 16,
  },
  playButton: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  playButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  playButtonText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  menuButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 10,
  },
  menuButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  footerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerEmoji: {
    fontSize: 14,
    marginHorizontal: 8,
  },
});
