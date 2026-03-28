import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface AimingUIProps {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  power: number; // 0-1
  maxPower: number;
  isAiming: boolean;
  trajectoryPoints: { x: number; y: number }[];
}

export const AimingUI: React.FC<AimingUIProps> = ({
  startX,
  startY,
  currentX,
  currentY,
  power,
  maxPower,
  isAiming,
  trajectoryPoints,
}) => {
  if (!isAiming) return null;
  
  const powerColor = power > 0.7 ? '#EF4444' : power > 0.4 ? '#F59E0B' : '#22C55E';
  
  return (
    <Svg style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="powerGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#22C55E" />
          <Stop offset="0.5" stopColor="#F59E0B" />
          <Stop offset="1" stopColor="#EF4444" />
        </LinearGradient>
      </Defs>
      
      {/* Pull-back line */}
      <Line
        x1={startX}
        y1={startY}
        x2={currentX}
        y2={currentY}
        stroke={powerColor}
        strokeWidth={3}
        strokeDasharray="8,4"
      />
      
      {/* Power indicator circle */}
      <Circle
        cx={currentX}
        cy={currentY}
        r={20 + power * 15}
        fill="none"
        stroke={powerColor}
        strokeWidth={3}
        opacity={0.7}
      />
      
      {/* Trajectory preview */}
      {trajectoryPoints.map((point, index) => (
        <Circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={4 - (index * 0.3)}
          fill="rgba(255, 255, 255, 0.6)"
          opacity={1 - (index * 0.1)}
        />
      ))}
      
      {/* Starting point indicator */}
      <Circle
        cx={startX}
        cy={startY}
        r={8}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2}
      />
    </Svg>
  );
};
