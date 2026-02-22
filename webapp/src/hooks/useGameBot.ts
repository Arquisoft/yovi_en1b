/**
 * useGameBot Hook
 * Custom React hook for managing game bot interactions
 */

import { useState } from 'react';
import { getBotMove, createEmptyBoard, GameyApiError } from '../api/gameyApi';

export interface GameBotResult {
  result: string;
  loading: boolean;
  askBot: () => Promise<void>;
}

/**
 * Custom hook for interacting with the gamey bot API
 * 
 * @returns {GameBotResult} - result message, loading state, and askBot function
 */
export function useGameBot(): GameBotResult {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const askBot = async () => {
    setLoading(true);
    setResult('');
    
    try {
      const gameState = createEmptyBoard(3);
      const response = await getBotMove('random', gameState);
      
      const { x, y, z } = response.coords;
      setResult(
        `✅ Bot chose: (${x}, ${y}, ${z}) - API: ${response.api_version}, Bot: ${response.bot_id}`
      );
    } catch (err) {
      if (err instanceof GameyApiError) {
        setResult(`❌ Game engine error: ${err.message}`);
      } else if (err instanceof Error) {
        setResult(`❌ Network error: ${err.message}`);
      } else {
        setResult('❌ Unknown error');
      }
      console.error('Bot request error:', err);
    } finally {
      setLoading(false);
    }
  };

  return { result, loading, askBot };
}