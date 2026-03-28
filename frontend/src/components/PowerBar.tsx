import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface PowerBarProps {
  power: number; // 0-1
  visible: boolean;
}

export const PowerBar: React.FC<PowerBarProps> = ({ power, visible }) => {
  if (!visible) return null;
  
  const powerPercent = Math.round(power * 100);
  const powerColor = power > 0.7 ? '#EF4444' : power > 0.4 ? '#F59E0B' : '#22C55E';
  
  return (
    <View style={styles.container}>
      <Text style={styles.label}>POWER</Text>
      <View style={styles.barContainer}>
        <View style={styles.barBackground}>
          <View 
            style={[
              styles.barFill,
              { width: `${powerPercent}%`, backgroundColor: powerColor }
            ]} 
          />
        </View>
        <Text style={[styles.percentage, { color: powerColor }]}>
          {powerPercent}%
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  barContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barBackground: {
    flex: 1,
    height: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  barFill: {
    height: '100%',
    borderRadius: 6,
  },
  percentage: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
