import { PenStats } from '../store/gameStore';

export interface AIDecision {
  hitPoint: { x: number; y: number };
  force: { x: number; y: number };
  power: number;
}

export class GameAI {
  private difficulty: 'easy' | 'medium' | 'hard';
  
  constructor(difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
    this.difficulty = difficulty;
  }
  
  calculateShot(
    aiPenPos: { x: number; y: number; angle: number },
    playerPenPos: { x: number; y: number; angle: number },
    deskBounds: { x: number; y: number; width: number; height: number },
    aiPen: PenStats
  ): AIDecision {
    // Calculate direction to player pen
    const dx = playerPenPos.x - aiPenPos.x;
    const dy = playerPenPos.y - aiPenPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Normalize direction
    const dirX = dx / distance;
    const dirY = dy / distance;
    
    // Add some randomness based on difficulty
    const accuracy = this.getAccuracy();
    const randomAngle = (Math.random() - 0.5) * (1 - accuracy) * Math.PI / 4;
    
    const cos = Math.cos(randomAngle);
    const sin = Math.sin(randomAngle);
    const adjustedDirX = dirX * cos - dirY * sin;
    const adjustedDirY = dirX * sin + dirY * cos;
    
    // Calculate power based on distance and difficulty
    const basePower = this.calculatePower(distance, deskBounds);
    const power = basePower * (0.8 + Math.random() * 0.4);
    
    // Calculate hit point (slightly offset from center for spin)
    const spinOffset = (Math.random() - 0.5) * 20;
    const hitPoint = {
      x: aiPenPos.x - adjustedDirX * 20 + adjustedDirY * spinOffset,
      y: aiPenPos.y - adjustedDirY * 20 - adjustedDirX * spinOffset,
    };
    
    // Calculate force
    const forceMagnitude = power * 15 / aiPen.mass;
    const force = {
      x: adjustedDirX * forceMagnitude,
      y: adjustedDirY * forceMagnitude,
    };
    
    return {
      hitPoint,
      force,
      power,
    };
  }
  
  private getAccuracy(): number {
    switch (this.difficulty) {
      case 'easy':
        return 0.5;
      case 'medium':
        return 0.75;
      case 'hard':
        return 0.9;
      default:
        return 0.75;
    }
  }
  
  private calculatePower(distance: number, deskBounds: { width: number; height: number }): number {
    const maxDistance = Math.sqrt(deskBounds.width ** 2 + deskBounds.height ** 2);
    const normalizedDistance = distance / maxDistance;
    
    // Power scales with distance, but caps at 0.9
    let power = Math.min(0.9, normalizedDistance * 1.5 + 0.3);
    
    // Difficulty adjustment
    switch (this.difficulty) {
      case 'easy':
        power *= 0.7;
        break;
      case 'hard':
        power *= 1.1;
        break;
    }
    
    return Math.min(1, power);
  }
  
  // Decide if AI should try to knock player off edge or play defensively
  decideStrategy(
    aiPenPos: { x: number; y: number },
    playerPenPos: { x: number; y: number },
    deskBounds: { x: number; y: number; width: number; height: number }
  ): 'aggressive' | 'defensive' | 'edge-knock' {
    // Check if player is near edge
    const edgeThreshold = 50;
    const nearLeftEdge = playerPenPos.x < deskBounds.x + edgeThreshold;
    const nearRightEdge = playerPenPos.x > deskBounds.x + deskBounds.width - edgeThreshold;
    const nearTopEdge = playerPenPos.y < deskBounds.y + edgeThreshold;
    const nearBottomEdge = playerPenPos.y > deskBounds.y + deskBounds.height - edgeThreshold;
    
    if (nearLeftEdge || nearRightEdge || nearTopEdge || nearBottomEdge) {
      return 'edge-knock';
    }
    
    // Check if AI is near edge (play defensive)
    const aiNearEdge = 
      aiPenPos.x < deskBounds.x + edgeThreshold ||
      aiPenPos.x > deskBounds.x + deskBounds.width - edgeThreshold ||
      aiPenPos.y < deskBounds.y + edgeThreshold ||
      aiPenPos.y > deskBounds.y + deskBounds.height - edgeThreshold;
    
    if (aiNearEdge && this.difficulty !== 'easy') {
      return 'defensive';
    }
    
    return 'aggressive';
  }
}
