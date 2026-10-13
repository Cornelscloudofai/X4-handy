// Klänge des Spiels – Engine und Bibliothek liegen in src/audio; hier die bisherige Schnittstelle
import { settings, setOn } from '../audio/engine';
export { sfx } from '../audio/sounds';

export function soundEnabled(): boolean {
  return settings.on;
}

export function setSound(on: boolean): void {
  setOn(on);
}
