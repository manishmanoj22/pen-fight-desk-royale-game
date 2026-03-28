import React from 'react';
import { View, StyleSheet } from 'react-native';
import { PenStats } from '../store/gameStore';

interface PenProps {
  pen: PenStats;
  x: number;
  y: number;
  angle: number;
  scale?: number;
  capOn?: boolean;
}

export const Pen: React.FC<PenProps> = ({ pen, x, y, angle, scale = 1, capOn = true }) => {
  const penLength = 80 * scale;
  const penWidth = 12 * scale;
  const capLength = capOn ? 20 * scale : 0;
  
  return (
    <View
      style={[
        styles.penContainer,
        {
          left: x - penLength / 2,
          top: y - penWidth / 2,
          transform: [{ rotate: `${angle}rad` }],
        },
      ]}
    >
      {/* Pen body */}
      <View
        style={[
          styles.penBody,
          {
            width: penLength - capLength,
            height: penWidth,
            backgroundColor: pen.color,
            borderRadius: penWidth / 4,
          },
        ]}
      >
        {/* Grip pattern */}
        <View style={[styles.grip, { backgroundColor: pen.secondaryColor }]} />
        <View style={[styles.grip, { backgroundColor: pen.secondaryColor, left: '60%' }]} />
      </View>
      
      {/* Cap */}
      {capOn && (
        <View
          style={[
            styles.cap,
            {
              width: capLength,
              height: penWidth,
              backgroundColor: pen.secondaryColor,
              borderTopRightRadius: penWidth / 2,
              borderBottomRightRadius: penWidth / 2,
            },
          ]}
        />
      )}
      
      {/* Tip */}
      {!capOn && (
        <View
          style={[
            styles.tip,
            {
              borderLeftWidth: 15 * scale,
              borderTopWidth: penWidth / 2,
              borderBottomWidth: penWidth / 2,
              borderLeftColor: pen.secondaryColor,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  penContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
  penBody: {
    justifyContent: 'center',
    overflow: 'hidden',
  },
  grip: {
    position: 'absolute',
    width: 3,
    height: '100%',
    left: '30%',
    opacity: 0.5,
  },
  cap: {
    marginLeft: -2,
  },
  tip: {
    width: 0,
    height: 0,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    marginLeft: -2,
  },
});
