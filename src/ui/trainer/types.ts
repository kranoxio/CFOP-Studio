import type { CubeView } from '../../render/CubeView';

/** Gemeinsame Bühne, die der Trainer-Rahmen jedem Modus zur Verfügung stellt. */
export interface TrainerContext {
  view: CubeView;
  /** Oben links im 3D-Bereich (Timer, Status) */
  hudTop: HTMLElement;
  /** Unten im 3D-Bereich (Alg, Hinweise) */
  hudBottom: HTMLElement;
  /** Bedienleiste unter dem Würfel (im Einhand-Modus am Daumen) */
  actions: HTMLElement;
  /** Seitenpanel für Einstellungen und Statistik des Modus */
  side: HTMLElement;
}

export interface TrainerMode {
  readonly id: string;
  readonly label: string;
  start(ctx: TrainerContext): void;
  stop(): void;
  onKey?(e: KeyboardEvent): void;
}
