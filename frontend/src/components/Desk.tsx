import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, Path, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface DeskProps {
  width: number;
  height: number;
  obstacles: Obstacle[];
}

export interface Obstacle {
  id: string;
  type: 'calculator' | 'notebook' | 'ruler' | 'eraser';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export const Desk: React.FC<DeskProps> = ({ width, height, obstacles }) => {
  return (
    <View style={[styles.desk, { width, height }]}>
      <Svg width={width} height={height} style={styles.svg}>
        {/* Wood grain texture */}
        {Array.from({ length: 20 }).map((_, i) => (
          <Line
            key={`grain-${i}`}
            x1={0}
            y1={i * (height / 20)}
            x2={width}
            y2={i * (height / 20) + 5}
            stroke="rgba(139, 90, 43, 0.3)"
            strokeWidth={1}
          />
        ))}
        
        {/* Scribbles and doodles on desk */}
        <SvgText x={50} y={80} fill="rgba(70, 70, 200, 0.4)" fontSize={12}>
          A + B = ?
        </SvgText>
        <SvgText x={width - 100} y={150} fill="rgba(200, 50, 50, 0.3)" fontSize={10}>
          2024 ❤
        </SvgText>
        <Circle cx={width - 50} cy={80} r={15} fill="none" stroke="rgba(100, 100, 100, 0.3)" strokeWidth={1} />
        
        {/* Compass circle doodle */}
        <Circle cx={100} cy={height - 100} r={30} fill="none" stroke="rgba(50, 50, 150, 0.2)" strokeWidth={1} strokeDasharray="5,5" />
        
        {/* Obstacles */}
        {obstacles.map((obstacle) => renderObstacle(obstacle))}
      </Svg>
      
      {/* Desk edge shadow */}
      <View style={styles.edgeShadow} />
    </View>
  );
};

const renderObstacle = (obstacle: Obstacle) => {
  const { id, type, x, y, width, height, rotation } = obstacle;
  
  switch (type) {
    case 'geometryBox':
      return (
        <React.Fragment key={id}>
          <Rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="#2D5A8A"
            stroke="#1E3D5C"
            strokeWidth={2}
            rx={3}
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
          {/* Camlin logo area */}
          <Rect
            x={x + 5}
            y={y + 5}
            width={width - 10}
            height={15}
            fill="#F5F5DC"
            rx={2}
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
        </React.Fragment>
      );
      
    case 'notebook':
      return (
        <React.Fragment key={id}>
          <Rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="#F5F5DC"
            stroke="#8B4513"
            strokeWidth={1}
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
          {/* Ruled lines */}
          {Array.from({ length: 5 }).map((_, i) => (
            <Line
              key={`line-${id}-${i}`}
              x1={x + 5}
              y1={y + 10 + i * 8}
              x2={x + width - 5}
              y2={y + 10 + i * 8}
              stroke="rgba(100, 149, 237, 0.5)"
              strokeWidth={0.5}
              transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
            />
          ))}
          {/* Red margin */}
          <Line
            x1={x + 15}
            y1={y}
            x2={x + 15}
            y2={y + height}
            stroke="rgba(255, 0, 0, 0.4)"
            strokeWidth={1}
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
        </React.Fragment>
      );
      
    case 'eraser':
      return (
        <Rect
          key={id}
          x={x}
          y={y}
          width={width}
          height={height}
          fill="#FFB6C1"
          stroke="#FF69B4"
          strokeWidth={1}
          rx={2}
          transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
        />
      );
      
    case 'sharpener':
      return (
        <React.Fragment key={id}>
          <Rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill="#C0C0C0"
            stroke="#808080"
            strokeWidth={1}
            rx={2}
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
          <Circle
            cx={x + width/2}
            cy={y + height/2}
            r={width/4}
            fill="#404040"
            transform={`rotate(${rotation}, ${x + width/2}, ${y + height/2})`}
          />
        </React.Fragment>
      );
      
    default:
      return null;
  }
};

const styles = StyleSheet.create({
  desk: {
    backgroundColor: '#DEB887',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#8B4513',
  },
  svg: {
    position: 'absolute',
  },
  edgeShadow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
});
