import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

export default function HowToPlayScreen() {
  const router = useRouter();

  const instructions = [
    {
      icon: 'finger-print',
      title: 'Drag to Aim',
      description: 'Touch and drag from your pen to aim. A trajectory line will show where your pen will go.',
    },
    {
      icon: 'arrow-back',
      title: 'Pull Back for Power',
      description: 'The further you pull back, the stronger your flick. Watch the power meter!',
    },
    {
      icon: 'sync',
      title: 'Master the Spin',
      description: 'Hit the tip of the pen for wide spins, hit the center for straight shots.',
    },
    {
      icon: 'trophy',
      title: 'Ring Out to Win',
      description: 'Knock your opponent\'s pen off the desk to score. First to 3 wins!',
    },
    {
      icon: 'warning',
      title: 'Avoid Self Ring-Out',
      description: 'If your pen falls off without hitting the opponent, you lose the round!',
    },
    {
      icon: 'flash',
      title: 'Use Power-ups',
      description: 'Refill gives extra power. Cap Off changes your pen\'s center of gravity!',
    },
  ];

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
          <Text style={styles.title}>How to Play</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Instructions */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {instructions.map((item, index) => (
            <View key={index} style={styles.instructionCard}>
              <View style={styles.iconContainer}>
                <Ionicons name={item.icon as any} size={28} color="#e94560" />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.instructionTitle}>{item.title}</Text>
                <Text style={styles.instructionDescription}>{item.description}</Text>
              </View>
            </View>
          ))}

          {/* Pen Classes */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pen Classes</Text>
          </View>

          <View style={styles.penClassCard}>
            <Text style={styles.penClassName}>The Heavyweight</Text>
            <Text style={styles.penClassDescription}>
              Metal Fountain Pens - High mass, low spin. Hard to knock back but slow to recover.
            </Text>
          </View>

          <View style={styles.penClassCard}>
            <Text style={styles.penClassName}>The Acrobat</Text>
            <Text style={styles.penClassDescription}>
              Slim Ballpoints - Low mass, high spin. Perfect for trick shots and quick maneuvers.
            </Text>
          </View>

          <View style={styles.penClassCard}>
            <Text style={styles.penClassName}>The Classic</Text>
            <Text style={styles.penClassDescription}>
              Cello/Reynolds style - Balanced stats. Great for beginners learning the game.
            </Text>
          </View>
        </ScrollView>

        {/* Play Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.playButton}
            onPress={() => router.push('/select-pen')}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#e94560', '#c23a51']}
              style={styles.playGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.playText}>START PLAYING</Text>
              <Ionicons name="game-controller" size={24} color="#FFFFFF" />
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
    gap: 12,
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 16,
    gap: 16,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(233, 69, 96, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  instructionDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
  },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e94560',
  },
  penClassCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#e94560',
  },
  penClassName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  penClassDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
  },
  bottomContainer: {
    padding: 20,
  },
  playButton: {
    borderRadius: 30,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  playGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  playText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
});
