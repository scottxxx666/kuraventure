import Phaser from 'phaser';
import { getItemById } from '../config/items';
import type { ItemId } from '../config/items';
import type { ExitDef, StageDef, TriggerDef } from '../config/stages';
import { eventBus } from '../core/EventBus';
import { inputService } from '../input/InputService';
import { setVirtualPadVisible } from '../input/VirtualPadSource';
import { i18nService } from '../services/I18nService';
import { progressService } from '../services/ProgressService';
import { createOverlayElement } from '../ui/domOverlay';
import { SceneKeys } from './keys';

const PLAYER_SPEED = 80; // px/s
const TILE_SIZE = 16; // fallback size for point-object triggers
const TOAST_MS = 2400; // pickup/blocked-exit feedback duration

interface TriggerZone {
    def: TriggerDef;
    flagId: string;
    zone: Phaser.GameObjects.Zone;
    marker: Phaser.GameObjects.Rectangle;
    /** Re-armed only after the player leaves the zone, so resuming inside it doesn't re-fire. */
    armed: boolean;
}

interface ExitZone {
    def: ExitDef;
    zone: Phaser.GameObjects.Zone;
    marker: Phaser.GameObjects.Rectangle;
    /** Re-armed only after the player leaves the zone, so a blocked exit doesn't spam toasts. */
    armed: boolean;
}

/**
 * THE reusable map scene (PLAN.md §3.9): builds itself from a StageDef —
 * one instance serves all stages, never subclassed per stage.
 * Placeholder textures (tiles, player) are generated at runtime until the
 * art direction is decided (PLAN.md §5).
 */
const TILES_TEXTURE = 'tiles-placeholder';
const PLAYER_TEXTURE = 'player-placeholder';

export class WorldScene extends Phaser.Scene {
    private stage!: StageDef;
    private player!: Phaser.Physics.Arcade.Sprite;
    private triggerZones: TriggerZone[] = [];
    private exitZones: ExitZone[] = [];
    private advanceUnsubscribe: (() => void) | null = null;
    private promptEl: HTMLDivElement | null = null;
    private toastEl: HTMLDivElement | null = null;
    private toastTimer: Phaser.Time.TimerEvent | null = null;

    constructor() {
        super(SceneKeys.World);
    }

    init(data: { stage?: StageDef }): void {
        if (!data.stage) {
            throw new Error('WorldScene needs a StageDef — start stages via FlowDirector.startStage');
        }
        this.stage = data.stage;
    }

    preload(): void {
        if (!this.cache.tilemap.exists(this.stage.tilemapKey)) {
            this.load.tilemapTiledJSON(this.stage.tilemapKey, this.stage.tilemapUrl);
        }
    }

    create(): void {
        this.ensurePlaceholderTextures();

        const map = this.make.tilemap({ key: this.stage.tilemapKey });
        const tileset = map.addTilesetImage('tiles', TILES_TEXTURE);
        if (!tileset) {
            throw new Error(`Stage "${this.stage.id}": tileset "tiles" not found in its map`);
        }
        map.createLayer('ground', tileset);
        const walls = map.createLayer('walls', tileset);
        if (!walls) {
            throw new Error(`Stage "${this.stage.id}": map has no "walls" layer`);
        }
        walls.setCollisionByProperty({ collides: true });

        const spawn = map.findObject('objects', (obj) => obj.name === this.stage.spawn.objectName);
        if (!spawn || spawn.x == null || spawn.y == null) {
            throw new Error(
                `Stage "${this.stage.id}": spawn object "${this.stage.spawn.objectName}" not found in its map`
            );
        }

        this.player = this.physics.add.sprite(spawn.x, spawn.y, PLAYER_TEXTURE);
        this.physics.add.collider(this.player, walls);
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);

        this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.cameras.main.startFollow(this.player);

        this.createTriggers(map);
        this.createExits(map);
        // Derived map state (PLAN.md §3.9): after an activity, consumed once-triggers disappear.
        // The DOM prompt/toast hide while paused — they would float above the running activity.
        const onResume = (): void => {
            this.refreshTriggers();
            if (this.promptEl) {
                this.promptEl.hidden = false;
            }
        };
        const onPause = (): void => {
            if (this.promptEl) {
                this.promptEl.hidden = true;
            }
            this.hideToast();
        };
        this.events.on(Phaser.Scenes.Events.RESUME, onResume);
        this.events.on(Phaser.Scenes.Events.PAUSE, onPause);

        // Stages with exits advance through their gated door instead of the prompt (§3.9).
        const hasExits = this.exitZones.length > 0;
        const offStageComplete = eventBus.on('stage:complete', ({ stageId }) => {
            if (stageId === this.stage.id && !hasExits) {
                this.showStageCompletePrompt();
            }
        });
        // Replaying an already-complete stage: offer the way out immediately.
        if (progressService.isStageComplete(this.stage.id) && !hasExits) {
            this.showStageCompletePrompt();
        }

        setVirtualPadVisible(true);
        // scene.events listeners survive scene restarts — remove them explicitly.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.events.off(Phaser.Scenes.Events.RESUME, onResume);
            this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
            offStageComplete();
            this.advanceUnsubscribe?.();
            this.advanceUnsubscribe = null;
            this.promptEl?.remove();
            this.promptEl = null;
            this.hideToast();
            setVirtualPadVisible(false);
        });
    }

    update(): void {
        const dir = inputService.direction();
        this.player.setVelocity(dir.x * PLAYER_SPEED, dir.y * PLAYER_SPEED);

        for (const t of this.triggerZones) {
            if (this.physics.overlap(this.player, t.zone)) {
                if (t.armed) {
                    t.armed = false;
                    this.fireTrigger(t.def);
                    return;
                }
            } else {
                t.armed = true;
            }
        }

        for (const e of this.exitZones) {
            if (this.physics.overlap(this.player, e.zone)) {
                if (e.armed) {
                    e.armed = false;
                    this.tryExit(e.def);
                    return;
                }
            } else {
                e.armed = true;
            }
        }
    }

    private createTriggers(map: Phaser.Tilemaps.Tilemap): void {
        this.triggerZones = [];
        for (const def of this.stage.triggers) {
            const flagId = `${this.stage.id}/${def.id}`;
            if (def.once && progressService.isCompleted(flagId)) {
                continue;
            }
            const { zone, marker } = this.buildZone(map, 'trigger', def.at.objectName, 0xffd700);
            this.triggerZones.push({ def, flagId, zone, marker, armed: true });
        }
    }

    private createExits(map: Phaser.Tilemaps.Tilemap): void {
        this.exitZones = (this.stage.exits ?? []).map((def) => {
            const { zone, marker } = this.buildZone(map, 'exit', def.at.objectName, 0x66ccff);
            return { def, zone, marker, armed: true };
        });
    }

    private buildZone(
        map: Phaser.Tilemaps.Tilemap,
        kind: 'trigger' | 'exit',
        objectName: string,
        markerColor: number
    ): { zone: Phaser.GameObjects.Zone; marker: Phaser.GameObjects.Rectangle } {
        const obj = map.findObject('objects', (o) => o.name === objectName);
        if (!obj || obj.x == null || obj.y == null) {
            throw new Error(
                `Stage "${this.stage.id}": ${kind} object "${objectName}" not found in its map`
            );
        }
        // Tiled rectangles anchor at top-left; point objects (no size) get a one-tile zone.
        const w = obj.width || TILE_SIZE;
        const h = obj.height || TILE_SIZE;
        const cx = obj.width ? obj.x + w / 2 : obj.x;
        const cy = obj.height ? obj.y + h / 2 : obj.y;
        const zone = this.add.zone(cx, cy, w, h);
        this.physics.add.existing(zone, true);
        // Placeholder visual until stages get real art (PLAN.md §5).
        const marker = this.add.rectangle(cx, cy, w, h, markerColor, 0.3);
        return { zone, marker };
    }

    /** What a trigger/exit still lacks (§3.9): unfinished same-stage triggers + unheld items. */
    private missingRequirements(def: { requiredTriggers?: string[]; requiredItems?: ItemId[] }): {
        triggers: string[];
        items: ItemId[];
    } {
        return {
            triggers: (def.requiredTriggers ?? []).filter(
                (id) => !progressService.isCompleted(`${this.stage.id}/${id}`)
            ),
            items: (def.requiredItems ?? []).filter((id) => !progressService.hasItem(id))
        };
    }

    /** Fires the trigger's activity, or its blocked feedback when requirements are unmet (§3.9). */
    private fireTrigger(def: TriggerDef): void {
        const missing = this.missingRequirements(def);
        if (missing.triggers.length === 0 && missing.items.length === 0) {
            const isPickup = def.activity.type === 'pickup';
            // FlowDirector pauses this scene and launches the activity (synchronously) —
            // except pickups, which it records immediately without pausing (§3.2).
            eventBus.emit('activity:start', { stageId: this.stage.id, trigger: def });
            if (isPickup) {
                this.onPickupCollected(def);
            }
            return;
        }
        if (def.blockedDialogue) {
            // Transient run: the dialogue plays but the trigger's flag is NOT recorded.
            eventBus.emit('activity:start', {
                stageId: this.stage.id,
                trigger: { ...def, activity: { type: 'dialogue', ...def.blockedDialogue } },
                transient: true
            });
            return;
        }
        this.showBlockedToast(missing.items);
    }

    /** The gate rule (§3.9): an exit opens iff every condition it lists is met. */
    private tryExit(def: ExitDef): void {
        const missing = this.missingRequirements(def);
        if (missing.triggers.length > 0 || missing.items.length > 0) {
            this.showBlockedToast(missing.items);
            return;
        }
        eventBus.emit('stage:advance', { stageId: this.stage.id, to: def.to });
    }

    /** Missing items are named; missing triggers only get the generic "still things to do". */
    private showBlockedToast(missingItems: ItemId[]): void {
        if (missingItems.length > 0) {
            const items = missingItems
                .map((id) => i18nService.t(getItemById(id).nameKey))
                .join(', ');
            this.showToast(i18nService.t('world.needsItems', { items }));
        } else {
            this.showToast(i18nService.t('world.tasksIncomplete'));
        }
    }

    /** FlowDirector already recorded the flag (emit is synchronous): show what was
        gained and remove the consumed zone without waiting for a pause/resume. */
    private onPickupCollected(def: TriggerDef): void {
        const names = (def.grantsItems ?? []).map((id) => i18nService.t(getItemById(id).nameKey));
        if (names.length > 0) {
            this.showToast(i18nService.t('world.itemObtained', { items: names.join(', ') }));
        }
        this.refreshTriggers();
    }

    /** Screen-space text → DOM overlay (PLAN.md §3.8). */
    private showStageCompletePrompt(): void {
        if (this.advanceUnsubscribe) {
            return;
        }
        this.promptEl = createOverlayElement('hud-prompt');
        this.promptEl.textContent = i18nService.t('world.stageComplete');
        this.advanceUnsubscribe = inputService.onPress('A', () => {
            // Not while paused: the same physical button also drives the running activity.
            if (this.scene.isActive()) {
                eventBus.emit('stage:advance', { stageId: this.stage.id });
            }
        });
    }

    /** Transient screen-space feedback (blocked exit / pickup) — DOM overlay (§3.8). */
    private showToast(text: string): void {
        this.hideToast();
        this.toastEl = createOverlayElement('hud-toast');
        this.toastEl.textContent = text;
        this.toastTimer = this.time.delayedCall(TOAST_MS, () => this.hideToast());
    }

    private hideToast(): void {
        this.toastTimer?.remove();
        this.toastTimer = null;
        this.toastEl?.remove();
        this.toastEl = null;
    }

    private refreshTriggers(): void {
        this.triggerZones = this.triggerZones.filter((t) => {
            if (t.def.once && progressService.isCompleted(t.flagId)) {
                t.zone.destroy();
                t.marker.destroy();
                return false;
            }
            return true;
        });
    }

    private ensurePlaceholderTextures(): void {
        if (!this.textures.exists(TILES_TEXTURE)) {
            // 2 tiles side by side: index 0 floor, index 1 wall (matches the map's tileset).
            const g = this.make.graphics({}, false);
            g.fillStyle(0x3a5f3a);
            g.fillRect(0, 0, 16, 16);
            g.fillStyle(0x466e46);
            g.fillRect(3, 3, 2, 2);
            g.fillRect(11, 9, 2, 2);
            g.fillStyle(0x6b4a3a);
            g.fillRect(16, 0, 16, 16);
            g.fillStyle(0x51382c);
            g.fillRect(16, 12, 16, 4);
            g.generateTexture(TILES_TEXTURE, 32, 16);
            g.destroy();
        }
        if (!this.textures.exists(PLAYER_TEXTURE)) {
            const g = this.make.graphics({}, false);
            g.fillStyle(0xf2d16b);
            g.fillRect(0, 0, 12, 12);
            g.fillStyle(0x2b2b2b);
            g.fillRect(3, 3, 2, 2);
            g.fillRect(7, 3, 2, 2);
            g.generateTexture(PLAYER_TEXTURE, 12, 12);
            g.destroy();
        }
    }
}
