/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScenePalette = "lagoon" | "raspberry" | "lime" | "sunset";
export type SealMode = "raft" | "slip" | "fall" | "swim";

/**
 * A scene snapshot uses the tide slider's -100 to 100 range and normalized environment values.
 */
export interface SceneState {
    palette: ScenePalette;
    paused: boolean;
    storm: boolean;
    tide: number;
    energy: number;
    seal: SealMode;
    capsized: boolean;
    wind: number;
    clarity: number;
    light: number;
}

/**
 * Semantic scene operations shared by the engine and its UI; GPU state stays inside the engine.
 */
export interface SceneApi {
    readonly ready: boolean;
    getState(): SceneState;
    setPalette(name: string): void;
    setPause(paused: boolean): void;
    setStorm(enabled: boolean): void;
    setTide(value: number): void;
    callWhale(): void;
    ripple(): void;
    reset(): void;
    resetView(): void;
    capture(): Promise<HTMLCanvasElement>;
}

declare global {
    interface Window {
        scene?: SceneApi;
        webkitAudioContext?: typeof AudioContext;
    }

    interface WindowEventMap {
        "scene:ready": CustomEvent<null>;
        "scene:change": CustomEvent<SceneState>;
        "scene:error": CustomEvent<{ message: string | null }>;
        "scene:whale": CustomEvent<null>;
    }
}
