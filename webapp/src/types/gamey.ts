/**
 * Gamey Backend API Types
 * Shared interfaces and types for gamey backend communication
 */

export interface Coordinates {
  x: number;
  y: number;
  z: number;
}

export interface BotMoveResponse {
  api_version: string;
  bot_id: string;
  coords: Coordinates;
}

export interface GameState {
  size: number;
  turn: number;
  players: string[];
  layout: string;
}
