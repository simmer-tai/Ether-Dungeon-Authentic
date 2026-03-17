import { InputHandler, Camera, Entity, getCachedImage, filterInPlace } from './utils.js';
import { Map } from './map.js';
import { Player } from './player.js';
import { Enemy, Slime, Bat, Goblin, SkeletonArcher, Ghost, AetherSentinel, AetherPrime, Boss, Chest, Statue, BloodAltar, ShopNPC, WoodCrate, ScrapHeap, SpikeTrap, LabNPC, SkillPedestal, TrainingDummy } from './entities.js';
import { createSkill } from './skills/index.js';
import { drawUI, showSkillSelection, hideSkillSelection, showBlessingSelection, hideBlessingSelection, drawDialogue, hideDialogue, initSettingsUI, initRankingUI, showNicknameInput, showStageSettings, hideStageSettings } from './ui.js';
import { skillsDB } from '../data/skills_db.js';
import { SaveManager } from './SaveManager.js';
import { initFirebase, submitScore } from './firebase_manager.js';
import { firebaseConfig } from './firebase_config.js';

import { CollectionUI } from './ui/CollectionUI.js';
import { LabUI } from './ui/LabUI.js';
import { DungeonCircuitUI } from './ui/DungeonCircuitUI.js';
import { InventoryUI } from './ui/InventoryUI.js';
import { CONFIG } from './config.js';

const _debugLog = (msg) => {
    // console.log(msg);
    // User requested to remove on-screen log
};

_debugLog("Script loaded");

// Cached visuals for memory optimization
const SLASH_PATH_DATA = "M130.46,271.33c-25.21,9.4-54.77,3.01-76.26-13.02-22.49-16.38-37.73-41.21-46.03-67.37C-6.56,143.72-1.7,89.69,25.43,47.81,47.86,13.02,89.47-10.3,130.46,4.56c0,0,0,1,0,1-7.79,3.04-14.94,6.23-21.35,10.06-42.26,24.78-54.05,76.64-54.67,122.33.33,38.82,8.62,81.7,37.57,109.75,10.75,10.21,23.94,17.24,38.45,22.64,0,0,0,1,0,1h0Z";
const SLASH_PATH = new Path2D(SLASH_PATH_DATA);

// Enemy class moved to entities.js
class Game {
    constructor() {
        _debugLog("Game Constructor Start");
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        this.zoom = CONFIG.GAME.BASE_ZOOM;
        // Check for debug mode in URL: index.html?debug=true
        this.debugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
        this.isDemo = true; // Demo Version Flag
        this.gameState = 'TITLE'; // TITLE, PLAYING, REWARD_SELECT, GAME_OVER
        this.rewardOptions = null; // Array of 3 options
        this.images = {}; // Asset Check
        this.currentFloor = 1;
        this.score = 0;
        this.difficulty = 'normal'; // easy, normal or hard
        this.highScore = SaveManager.getSaveData().stats.highScore || 0;
        
        this.solidEntities = []; // Optimized list for collision checks
        this.currentInteractable = null;
        this.interactCooldown = 0;

        // Cinematic Start State
        this.cameraZoom = 1.0;
        this.targetCameraZoom = 1.0;
        this.worldFadeAlpha = 0;
        this.isHUDVisible = true;
        this.isDungeonStarting = false;

        // Transition State
        this.isTransitioning = false;
        this.transitionType = 'none'; // 'fade-out', 'fade-in'
        this.transitionTimer = 0;
        this.transitionDuration = 0.5; // 0.5s fade
        this.transitionAlpha = 0;
        this.titleFadeAlpha = 1.0; // Fade in background on startup

        this.bossOverride = null; // Debug override: 'golem' or 'prime'

        // Camera Offset (for cinematic effect)
        this.cameraOffsetX = 0;
        this.cameraOffsetY = 0;
        this.targetCameraOffsetX = 0;
        this.targetCameraOffsetY = 0;

        // Time Scale (Slow Motion)
        this.timeScale = 1.0;
        this.targetTimeScale = 1.0;
        this.slowMotionTimer = 0; // In Real Time
        this.slowMotionDuration = 0;
        this.slowMotionStartScale = 1.0;

        this.input = new InputHandler();
        this.lastTime = performance.now();
        this.accumulator = 0;
        this.step = CONFIG.GAME.TICK_RATE;

        // Global Click Handler for UI Overlay (Removed Canvas-based Reward Click)
        this.canvas.addEventListener('mousedown', (e) => {
            // ...
        });

        try {
            // Initially stay in TITLE state, but prepare to load assets
            this.gameState = 'TITLE';

            // Start single initialization sequence
            this.startTitleSequence();
        } catch (e) {
            _debugLog("Init Error: " + e.message);
            console.error(e);
        }

        this.loop = this.loop.bind(this);

        // Expose game instance for UI access
        window._gameInstance = this;

        // Shop close button removal - handled by deleting the DOM element in index.html,
        // but removing the listener setup here for clean up.

        // Responsive Resizing
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize(); // Initial call

        this.initTitleListeners();

        initSettingsUI(this);

        requestAnimationFrame(this.loop);
        _debugLog("Game Loop Started");
    }

    getEnemyLevel() {
        // Base level by difficulty
        let baseLevel = 5;
        if (this.difficulty === 'hard') baseLevel = 15;
        else if (this.difficulty === 'easy') baseLevel = 1;

        // Level increases by floor
        const floorBonus = (this.currentFloor - 1) * 2;
        const targetLevel = baseLevel + floorBonus;

        // Final level with ±1 randomness
        const variance = Math.floor(Math.random() * 3) - 1;
        return Math.max(1, targetLevel + variance);
    }

    handleResize() {
        const maxW = window.innerWidth;
        const maxH = window.innerHeight;

        // Calculate the largest 16:9 area that fits within the viewport
        let targetW = maxW;
        let targetH = targetW * (9 / 16);

        if (targetH > maxH) {
            targetH = maxH;
            targetW = targetH * (16 / 9);
        }

        this.width = targetW;
        this.height = targetH;

        this.canvas.width = this.width;
        this.canvas.height = this.height;

        // Dynamic Zoom to maintain fixed Field of View (FOV)
        // Base resolution width is 800. 
        this.zoom = this.width / 800;

        // Re-calculate camera bounds to match the new zoom level
        if (this.camera) {
            this.camera.width = this.width / this.zoom;   // Always 800
            this.camera.height = this.height / this.zoom; // Scales with ratio (450 for 16:9)
        }

        // --- Scale UI Layer ---
        const uiWrapper = document.getElementById('game-ui-wrapper');
        if (uiWrapper) {
            uiWrapper.style.transform = `scale(${this.zoom})`;
        }

        console.log(`Resized to fit 16:9: ${this.width.toFixed(0)}x${this.height.toFixed(0)}, UI Scale: ${this.zoom.toFixed(2)}`);
    }


    prepareTitleScreenUI() {
        // UI Layer visibility is now managed via CSS sibling selector
        // based on #title-screen display state.

        // --- Initialize Firebase ---
        initFirebase(firebaseConfig);

        // --- Initialize Ranking UI ---
        initRankingUI(this);

        // --- Initialize Lab & Inventory UI ---
        LabUI.init(this);
        DungeonCircuitUI.init(this);
        InventoryUI.init(this);

        // --- Show High Score on Title ---
        const hsValue = document.getElementById('title-highscore-value');
        if (hsValue) {
            const data = SaveManager.getSaveData();
            hsValue.textContent = Math.floor(data.stats.highScore || 0);
        }

        this.traps = [];
        this.enemyProjectiles = [];
        this.entities = [];
        this.labNPCs = [];
        this.skillPedestals = [];
    }

    async startTitleSequence() {
        this.showLoading();
        await this.preloadAllAssets();

        // Setup UI and Firebase after assets are ready (or in parallel)
        this.prepareTitleScreenUI();

        // Generate a sample dungeon for background
        await this.init(false, 'normal', null);
        this.gameState = 'TITLE';

        // Setup initial camera cinematic state
        this.cameraZoom = 1.0;
        this.targetCameraZoom = 1.0;
        this.isHUDVisible = false;

        this.hideLoading();

        // Fade in the world
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) {
            titleScreen.style.background = 'radial-gradient(circle at center, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.6) 100%)';
        }
    }

    initTitleListeners() {
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.onclick = () => {
                // Hide only the menu, keep background/video
                const titleMenu = document.querySelector('.title-menu');
                if (titleMenu) titleMenu.style.display = 'none';

                const highscoreContainer = document.getElementById('title-highscore-container');
                if (highscoreContainer) highscoreContainer.style.display = 'none';

                const titleHeader = document.querySelector('.title-header');
                if (titleHeader) titleHeader.style.display = 'none';

                const sideMenu = document.querySelector('.title-side-menu');
                if (sideMenu) sideMenu.style.display = 'none';

                // --- Transition Directly to Lobby ---
                // Setup Camera/UI state for gameplay
                this.targetCameraZoom = 1.0;
                this.targetCameraOffsetX = 0;
                this.targetCameraOffsetY = 0;
                this.isHUDVisible = true;
                this.isDungeonStarting = false;
                this.worldFadeAlpha = 0;

                this.showLoading();

                // Small delay to allow browser to render the loading screen
                setTimeout(async () => {
                    const titleScreen = document.getElementById('title-screen');
                    if (titleScreen) titleScreen.style.display = 'none';

                    // Ensure assets are preloaded before entering lobby
                    await this.preloadAllAssets();

                    // Re-init for Lobby (Floor 0), reusing existing sample map if appropriate 
                    // but usually better to re-init fresh for lobby.
                    await this.init(false, 'normal', null, true);

                    // --- Cinematic Trigger (Short flash or zoom if desired) ---
                    this.targetCameraZoom = 1.0; 
                    this.isHUDVisible = true;

                    this.hideLoading();
                }, 100);
            };
        }

        const openCollectionBtn = document.getElementById('btn-open-collection');
        if (openCollectionBtn) {
            openCollectionBtn.onclick = () => CollectionUI.open();
        }

        const closeCollectionBtn = document.getElementById('btn-close-collection');
        if (closeCollectionBtn) {
            closeCollectionBtn.onclick = () => CollectionUI.close();
        }

        const openLabBtn = document.getElementById('btn-open-lab');
        if (openLabBtn) {
            openLabBtn.onclick = () => LabUI.open();
        }

        // --- Hidden Menu Toggle ---
        const gameTitle = document.querySelector('.game-title');
        const sideMenu = document.querySelector('.title-side-menu');
        if (gameTitle && sideMenu) {
            gameTitle.onclick = () => {
                const isHidden = sideMenu.style.display === 'none' || sideMenu.style.display === '';
                sideMenu.style.display = isHidden ? 'flex' : 'none';
            };
        }
    }

    spawnScrapHeapInRoom(room) {
        // Pick one random corner (with margin 2)
        const corners = [
            { rx: room.x + 2, ry: room.y + 2 },
            { rx: room.x + room.w - 3, ry: room.y + 2 },
            { rx: room.x + 2, ry: room.y + room.h - 3 },
            { rx: room.x + room.w - 3, ry: room.y + room.h - 3 }
        ];
        const corner = corners[Math.floor(Math.random() * corners.length)];

        // Ensure target is floor
        if (this.map.isValid(corner.rx, corner.ry) && this.map.tiles[corner.ry][corner.rx] === 0) {
            const scrap = new ScrapHeap(this, corner.rx * this.map.tileSize, corner.ry * this.map.tileSize);
            this.enemies.push(scrap);
        }
    }

    showLoading() {
        const screen = document.getElementById('loading-screen');
        const fill = document.querySelector('.loading-bar-fill');
        
        // Clear any pending hide timeouts
        if (this._loadingHideTimeout1) {
            clearTimeout(this._loadingHideTimeout1);
            this._loadingHideTimeout1 = null;
        }
        if (this._loadingHideTimeout2) {
            clearTimeout(this._loadingHideTimeout2);
            this._loadingHideTimeout2 = null;
        }

        if (screen) {
            screen.style.display = 'flex';
            screen.style.opacity = '1';
            screen.style.animation = ''; // Reset fadeOutTitle animation
            if (fill) fill.style.width = '0%';
        }
    }

    updateLoadingProgress(progress, statusText) {
        const fill = document.querySelector('.loading-bar-fill');
        if (fill) {
            fill.style.width = `${progress}%`;
        }
        if (statusText) {
            const textEl = document.querySelector('.loading-text');
            if (textEl) textEl.textContent = statusText;
        }
    }

    hideLoading() {
        const screen = document.getElementById('loading-screen');
        const fill = document.querySelector('.loading-bar-fill');
        if (fill) fill.style.width = '100%';

        // Clear any previous timeouts to avoid overlapping transitions
        if (this._loadingHideTimeout1) clearTimeout(this._loadingHideTimeout1);
        if (this._loadingHideTimeout2) clearTimeout(this._loadingHideTimeout2);

        this._loadingHideTimeout1 = setTimeout(() => {
            if (screen) {
                screen.style.animation = 'fadeOutTitle 0.3s forwards';
                this._loadingHideTimeout2 = setTimeout(() => {
                    screen.style.display = 'none';
                    screen.style.animation = '';
                    this._loadingHideTimeout1 = null;
                    this._loadingHideTimeout2 = null;
                }, 300);
            }
        }, 300);
    }

    async preloadAllAssets() {
        console.log("Preloading started...");
        const assets = [
            'assets/player/player_sprites.png',
            'assets/player/player_run_yoko.png',
            'assets/player/player_run_sita.png',
            'assets/player/player_run_ue.png',
            'assets/player/player_idol_yoko.png',
            'assets/player/player_idol_sita.png',
            'assets/player/player_idol_ue.png',
            'assets/map/floor.png',
            'assets/map/portal_stairs.png',
            'assets/ui/aether_shard.png',
            'assets/map/chest_closed.png',
            'assets/map/chest_open.png',
            'assets/ui/bg_angel_blessing.png',
            'assets/ui/bg_blood_blessing.png',
            'assets/enemies/slime.png',
            'assets/enemies/bat.png',
            'assets/enemies/goblin.png',
            'assets/enemies/skeleton_archer.png',
            'assets/skills/icons/icon_bleed.png',
            'assets/skills/icons/icon_ice.png',
            'assets/skills/icons/icon_burn.png',
            'assets/skills/icons/icon_crimson_cross.png',
            'assets/skills/icons/icon_dash.png',
            'assets/skills/vfx/flame_fan.png',
            'assets/skills/icons/icon_flame_fan.png',
            'assets/skills/icons/icon_slash.png',
            'assets/skills/icons/icon_blood_scythe.png',
            'assets/skills/vfx/ice_spike.png',
            'assets/skills/icons/icon_needle.png',
            'assets/skills/icons/icon_fireball.png',
            'assets/skills/vfx/fireball_sheet.png',
            'assets/skills/icons/icon_thunder_burst.png',
            'assets/skills/vfx/thunder_burst.png',
            'assets/skills/icons/icon_bounce.png',
            'assets/skills/icons/icon_ember_strike.png',
            'assets/skills/vfx/blood_scythe.png',
            'assets/skills/icons/icon_ice_spike.png',
            'assets/skills/icons/icon_ice_garden.png',
            'assets/skills/icons/icon_wind.png',
            'assets/skills/icons/icon_chain.png',
            'assets/skills/icons/icon_thunder_fall.png',
            'assets/skills/icons/icon_thunder_god.png',
            'assets/skills/icons/icon_glacial_lotus.png',
            'assets/skills/vfx/phoenix_aura.png',
            'assets/skills/icons/icon_magma_spear.png',
            'assets/skills/vfx/magma_spear.png',
            'assets/skills/vfx/magma_core.png',
            'assets/skills/vfx/tornado.png',
            'assets/skills/vfx/projectile_arrow.png',
            'assets/skills/vfx/meteor_rock1.png',
            'assets/skills/vfx/meteor_rock2.png',
            'assets/skills/vfx/meteor_rock3.png',
            'assets/map/trap_spike.png',
            'assets/map/wood_crate.png',
            'assets/entities/shop_npc.png',
            'assets/entities/statue_angel.png',
            'assets/entities/blood_altar.png',
            'assets/enemies/aether_prime/aether_prime.png',
            'assets/enemies/aether_prime/aether_prime_drone.png',
            'assets/enemies/aether_sentinel.png',
            'assets/skills/vfx/lightning_part_01.png',
            'assets/skills/vfx/lightning_part_02.png',
            'assets/skills/vfx/lightning_part_03.png',
            'assets/skills/vfx/lightning_part_04.png',
            'assets/skills/vfx/lightning_part_05.png',
            'assets/skills/vfx/lightning_part_06.png',
            'assets/skills/vfx/lightning_part_07.png',
            'assets/skills/vfx/lightning_part_08.png',
            'assets/skills/vfx/lightning_part_09.png',
            'assets/skills/vfx/lightning_part_10.png'
        ];

        // Also add any icons/spriteSheets from skillsDB that aren't manually listed
        skillsDB.forEach(s => {
            if (s.icon && !assets.includes(s.icon)) assets.push(s.icon);
            if (s.params?.spriteSheet && !assets.includes(s.params.spriteSheet)) assets.push(s.params.spriteSheet);
            if (s.params?.spriteData && !assets.includes(s.params.spriteData)) assets.push(s.params.spriteData);
        });

        let loadedCount = 0;
        const total = assets.length;

        const promises = assets.map(src => {
            return new Promise((resolve) => {
                const img = getCachedImage(src);
                // Check if already loaded or failed (complete is true in both cases if it has a source)
                // We check naturalWidth to see if it actually loaded successfully, but in both cases 
                // if .complete is true, the listeners won't fire again.
                if (img.complete) {
                    loadedCount++;
                    this.updateLoadingProgress((loadedCount / total) * 100);
                    resolve();
                    return;
                }

                img.onload = () => {
                    loadedCount++;
                    this.updateLoadingProgress((loadedCount / total) * 100);
                    resolve();
                };
                img.onerror = () => {
                    console.error("Asset preload failed:", src);
                    loadedCount++; // Still resolve to avoid hanging
                    this.updateLoadingProgress((loadedCount / total) * 100);
                    resolve();
                };
            });
        });

        await Promise.all(promises);
        console.log("Preloading complete.");
    }

    async startGame() {
        const titleScreen = document.getElementById('title-screen');
        if (titleScreen) {
            titleScreen.style.animation = 'fadeOutTitle 0.5s forwards';
            setTimeout(async () => {
                titleScreen.style.display = 'none';

                this.showLoading();

                // 1. Preload Assets
                await this.preloadAllAssets();

                // 2. Initialize Map (Heavy work)
                // Small delay to ensure the progress bar hit 100% and rendered before blocking
                setTimeout(async () => {
                    // Show core game UI
                    const uiLayer = document.getElementById('ui-layer');
                    if (uiLayer) uiLayer.style.display = 'block';

                    // Initialize game session
                    await this.init();

                    this.score = 0; // Reset score
                    this.gameState = 'PLAYING';
                    this.hideLoading();
                }, 100);
            }, 500);
        }
    }


    get isInteracting() {
        return this.showStairPrompt ||
            this.chests.some(c => c.showPrompt) ||
            this.statues.some(s => s.showPrompt) ||
            this.bloodAltars.some(a => a.showPrompt) ||
            this.shopNPCs.some(n => n.showPrompt) ||
            this.labNPCs.some(n => n.showPrompt) ||
            this.skillPedestals.some(p => p.showPrompt);
    }

    addScore(amount) {
        let multiplier = 1;
        if (this.difficulty === 'hard') multiplier = 2;
        else if (this.difficulty === 'easy') multiplier = 0.2;

        this.score += amount * multiplier;
    }

    async init(isNextFloor = false, difficulty = 'normal', startingSkills = null, reuseExisting = false) {
        this.difficulty = difficulty;
        this.gameState = 'PLAYING';

        const setStatus = (msg) => {
            this.updateLoadingProgress(100, msg);
        };

        // Reset Camera Targets for Gameplay (allow smooth transition from title/cinematic)
        this.targetCameraOffsetX = 0;
        this.targetCameraOffsetY = 0;
        this.targetCameraZoom = 1.0;

        if (!isNextFloor) {
            this.currentFloor = 0; // Start at Lobby
        }

        // --- Map Preparation ---
        if (!reuseExisting || !this.map) {
            if (this.currentFloor === 0) {
                this.map = new Map(40, 40, 40);
                await this.map.generateLobby();
                _debugLog("Lobby Generated");
            } else {
                // Larger Map: 110x110 tiles
                this.map = new Map(110, 110, 40);
                await this.map.generate(setStatus);
                _debugLog("Map Generated");
            }
        } else {
            _debugLog("Reusing existing map from title screen");
        }

        this.traps = [];

        // --- Camera Preparation ---
        if (!reuseExisting || !this.camera) {
            this.camera = new Camera(this.width / this.zoom, this.height / this.zoom, this.map.pixelWidth, this.map.pixelHeight);
        } else {
            _debugLog("Reusing existing camera from title screen");
        }

        const startRoom = this.map.rooms.find(r => r.type === 'start') || this.map.rooms[0];
        console.log("Start Room:", startRoom);

        // Persistence Logic
        const oldPlayer = this.player;
        if (startRoom) {
            this.player = new Player(this, (startRoom.x + startRoom.w / 2) * 40, (startRoom.y + startRoom.h / 2) * 40);

            if (isNextFloor && oldPlayer) {
                // Restore skills and inventory
                this.player.inventory = oldPlayer.inventory || [];
                this.player.equippedSkills = oldPlayer.equippedSkills || {
                    [SkillType.NORMAL]: null,
                    'primary1': null,
                    'primary2': null,
                    [SkillType.SECONDARY]: null,
                    [SkillType.ULTIMATE]: null
                };
                this.player.dungeonCoins = oldPlayer.dungeonCoins || 0;
                this.player.aetherShards = oldPlayer.aetherShards || 0;
                this.player.aetherFragments = oldPlayer.aetherFragments || 0;
                this.player.hp = oldPlayer.hp;
                this.player.maxHp = oldPlayer.maxHp;
                this.player.aether = 0; // Reset aether rush on floor change
                this.player.bloodBlessings = []; // Reset Blood Altar buffs on floor change
                this.player.aetherResonance = oldPlayer.aetherResonance || 0; // Carry over resonance between floors
            } else if (this.debugMode) {
                // Initial floor in debug mode
                this.player.unlockAllSkills();
            }
        } else {
            console.error("CRITICAL: No rooms found to spawn player!");
            this.player = new Player(this, 100, 100); // Emergency fallback
        }

        console.log("Player Spawned at:", this.player.x, this.player.y);
        if (!reuseExisting) {
            this.camera.follow(this.player);
        }

        // --- Load Starting Skills ---
        if (!isNextFloor) {
            if (startingSkills) {
                // startingSkills is an object: { normal: 'id', primary1: 'id', ... }
                for (const slot in startingSkills) {
                    const skillId = startingSkills[slot];
                    if (!skillId) continue;

                    const skillData = skillsDB.find(s => s.id === skillId);
                    if (skillData) {
                        const skill = createSkill(skillData);
                        if (skill) {
                            this.player.acquireSkill(skill);
                            // Ensure we map primary1/primary2 slots correctly if needed, 
                            // but equipSkill(skill, slot) usually handles it.
                            this.player.equipSkill(skill, slot);
                        }
                    }
                }
            } else {
                // Fallback (should not happen with new UI)
                const firstNormal = skillsDB.find(s => s.type === 'normal');
                if (firstNormal) {
                    const skill = createSkill(firstNormal);
                    this.player.acquireSkill(skill);
                    this.player.equipSkill(skill);
                }
            }
        }
        this.enemies = [];
        this.traps = [];
        this.enemyProjectiles = [];
        this.chests = [];
        this.statues = [];
        this.bloodAltars = [];
        this.shopNPCs = [];
        this.labNPCs = [];
        this.skillPedestals = [];
        this.activeStatue = null;
        this.activeAltar = null;
        this.entities = [];
        this.animations = [];
        this.projectiles = [];
        this.isGameOver = false;

        for (let i = 0; i < this.map.rooms.length; i++) { // Include room 0 now as it might be treasure
            const room = this.map.rooms[i];

            // Skip spawning enemies in the very first room (Start Room) 
            // We'll treat index 0 as start room? Or we should pick a start room.
            // Current map gen: placePresetRoom (Treasure) is first added?
            // Wait, generate() calls: place preset, then random.
            // So rooms[0] is likely the Treasure Room.

            if (room.type === 'statue') {
                // Spawn Statue in center
                const sx = (room.x + Math.floor(room.w / 2)) * this.map.tileSize;
                const sy = (room.y + Math.floor(room.h / 2)) * this.map.tileSize;
                this.statues.push(new Statue(this, sx, sy));
                continue;
            }

            if (room.type === 'altar') {
                const sx = (room.x + Math.floor(room.w / 2)) * this.map.tileSize;
                const sy = (room.y + Math.floor(room.h / 2)) * this.map.tileSize;
                this.bloodAltars.push(new BloodAltar(this, sx, sy));
                continue;
            }

            if (room.type === 'shop') {
                const sx = (room.x + Math.floor(room.w / 2)) * this.map.tileSize;
                const sy = (room.y + Math.floor(room.h / 2)) * this.map.tileSize;
                this.shopNPCs.push(new ShopNPC(this, sx, sy));
                continue;
            }

            // --- Spawn Wood Crates (50% chance) ---
            if (room.type !== 'start' && room.type !== 'staircase') {
                if (Math.random() < 0.5) {
                    this.spawnCratesInRoom(room);
                }

                // --- Spawn Scrap Heap (only in large rooms, one in a corner) ---
                if (room.w * room.h >= 100) {
                    this.spawnScrapHeapInRoom(room);
                }

                // --- Spawn Spike Traps (30% chance) ---
                if (Math.random() < 0.3) {
                    const trapCount = 2 + Math.floor(Math.random() * 3);
                    for (let i = 0; i < trapCount; i++) {
                        let attempts = 0;
                        while (attempts < 20) {
                            attempts++;
                            const tx = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
                            const ty = room.y + 1 + Math.floor(Math.random() * (room.h - 2));
                            if (this.map.tiles[ty] && this.map.tiles[ty][tx] === 0) {
                                const trapX = tx * this.map.tileSize;
                                const trapY = ty * this.map.tileSize;
                                // In init, we can't check dist to player easily as player might not be fully placed yet
                                // but we skip start room anyway.
                                this.traps.push(new SpikeTrap(this, trapX, trapY));
                                break;
                            }
                        }
                    }
                }

                if (room.type === 'boss') {
                    this.map.hasBoss = true;
                    this.map.bossDefeated = false;
                }
            }
        }

        // --- Lobby Specific Entities ---
        if (this.currentFloor === 0) {
            const startRoom = this.map.rooms.find(r => r.type === 'start');
            if (startRoom) {
                // Place Lab NPC (Bottom Left)
                this.labNPCs.push(new LabNPC(this, (startRoom.x + 2) * this.map.tileSize, (startRoom.y + startRoom.h - 3) * this.map.tileSize));
                // Place Skill Pedestal (Bottom Right)
                this.skillPedestals.push(new SkillPedestal(this, (startRoom.x + startRoom.w - 3) * this.map.tileSize, (startRoom.y + startRoom.h - 3) * this.map.tileSize));
                
                // --- Training Dummy (Center Area) ---
                const dummyX = (startRoom.x + startRoom.w / 2) * this.map.tileSize;
                const dummyY = (startRoom.y + 4) * this.map.tileSize; // Positioned for testing
                this.enemies.push(new TrainingDummy(this, dummyX, dummyY));
                this.enemies.push(new TrainingDummy(this, dummyX - 96, dummyY)); // Left dummy
                this.enemies.push(new TrainingDummy(this, dummyX + 96, dummyY)); // Right dummy
            }
        }

        this.lastTime = performance.now();
        this.accumulator = 0;
        this.step = 1 / 60;

        this.uiHp = document.getElementById('hp-value');
        this.uiHpMax = document.getElementById('hp-max');
        this.uiHpBar = document.getElementById('health-bar-fill');
        this.uiFloorValue = document.getElementById('floor-value');
        this.uiScoreValue = document.getElementById('score-value');
        this.lastHp = null;
        this.lastMaxHp = null;
        if (this.player) {
            this.player.scale = 1.0;
            this.player.alpha = 1.0;
        }
        InventoryUI.init(this);
    }

    spawnCratesInRoom(room) {
        const templates = ['RANDOM', 'CORNERS', 'BORDERS', 'DIVIDER_H', 'DIVIDER_V'];
        const weights = [0.4, 0.2, 0.2, 0.1, 0.1];

        let r = Math.random();
        let cumulative = 0;
        let selectedTemplate = 'RANDOM';
        for (let i = 0; i < templates.length; i++) {
            cumulative += weights[i];
            if (r < cumulative) {
                selectedTemplate = templates[i];
                break;
            }
        }

        const usedTiles = new Set();
        const addCrate = (rx, ry) => {
            const tileKey = `${rx},${ry}`;
            if (usedTiles.has(tileKey)) return;
            usedTiles.add(tileKey);

            const crate = new WoodCrate(this, rx * this.map.tileSize, ry * this.map.tileSize);
            
            if (!this.map.isWall(crate.x, crate.y)) {
                this.enemies.push(crate);
            }
        };

        const margin = 2;
        switch (selectedTemplate) {
            case 'CORNERS':
                addCrate(room.x + margin, room.y + margin);
                addCrate(room.x + room.w - 1 - margin, room.y + margin);
                addCrate(room.x + margin, room.y + room.h - 1 - margin);
                addCrate(room.x + room.w - 1 - margin, room.y + room.h - 1 - margin);
                break;
            case 'BORDERS':
                // Horizontal lines at offset 2
                for (let tx = room.x + margin; tx < room.x + room.w - margin; tx++) {
                    if (Math.random() < 0.7) addCrate(tx, room.y + margin);
                    if (Math.random() < 0.7) addCrate(tx, room.y + room.h - 1 - margin);
                }
                // Vertical lines at offset 2
                for (let ty = room.y + margin + 1; ty < room.y + room.h - margin - 1; ty++) {
                    if (Math.random() < 0.7) addCrate(room.x + margin, ty);
                    if (Math.random() < 0.7) addCrate(room.x + room.w - 1 - margin, ty);
                }
                break;
            case 'DIVIDER_H':
                const my = room.y + Math.floor(room.h / 2);
                for (let tx = room.x + margin; tx < room.x + room.w - margin; tx++) {
                    if (Math.random() < 0.8) addCrate(tx, my);
                }
                break;
            case 'DIVIDER_V':
                const mx = room.x + Math.floor(room.w / 2);
                for (let ty = room.y + margin; ty < room.y + room.h - margin; ty++) {
                    if (Math.random() < 0.8) addCrate(mx, ty);
                }
                break;
            case 'RANDOM':
            default:
                const crateCount = Math.floor(Math.random() * 4) + 2;
                for (let j = 0; j < crateCount; j++) {
                    const rx = room.x + margin + Math.floor(Math.random() * (room.w - margin * 2));
                    const ry = room.y + margin + Math.floor(Math.random() * (room.h - margin * 2));
                    addCrate(rx, ry);
                }
                break;
        }
    }

    /**
     * Updates the player's equipped skills based on a provided startingSkills object.
     * Does not reset the floor or teleport the player.
     * @param {Object} startingSkills { normal: 'id', primary1: 'id', ... }
     */
    updateStartingSkills(startingSkills) {
        if (!this.player || !startingSkills) return;

        // Clear existing skills to be safe, or just overwrite slots
        for (const slot in startingSkills) {
            const skillId = startingSkills[slot];
            if (!skillId) {
                // If it's a slot like 'secondary' or 'ultimate', allow clearing if null?
                // For now, let's just skip nulls to avoid removing defaults if not intended.
                continue;
            }

            const skillData = skillsDB.find(s => s.id === skillId);
            if (skillData) {
                const skill = createSkill(skillData); // Fixed typo
                if (skill) {
                    this.player.acquireSkill(skill);
                    this.player.equipSkill(skill, slot);
                }
            }
        }
        
        console.log("Starting skills updated in lobby");
    }

    spawnParticles(x, y, count, color, baseVx = 0, baseVy = 0, options = {}) {
        for (let i = 0; i < count; i++) {
            this.animations.push({
                type: 'particle',
                x: x, y: y,
                w: options.size || 4,
                h: options.size || 4,
                life: 0.3 + Math.random() * 0.2,
                maxLife: 0.5,
                color: color,
                vx: baseVx + (Math.random() - 0.5) * 200,
                vy: baseVy + (Math.random() - 0.5) * 200,
                shape: options.shape || 'square',
                shrink: options.shrink || false
            });
        }
    }

    spawnFloatingText(text, x, y, color = 'white', options = {}) {
        const life = options.life || 1.2;
        this.animations.push({
            type: 'text',
            text: text,
            x: x,
            y: y,
            vx: options.vx || (Math.random() - 0.5) * 40,
            vy: options.vy || -120, // Upward drift
            life: life,
            maxLife: life,
            color: color,
            font: options.font || "bold 20px 'Meiryo', sans-serif",
            update: function (dt) {
                // Stop rising after 30% of lifetime (suppressing total ascent)
                if (this.life < this.maxLife * 0.7) {
                    this.vx = 0;
                    this.vy = 0;
                }
            }
        });
    }

    applyReward(opt) {
        // console.log("Applying Reward:", opt.name);
        const p = this.player;

        if (opt.id === 'hp_up') {
            p.maxHp += 20;
            p.hp += 20;
            _debugLog('祝福: 最大HP +20!');
        } else if (opt.id === 'full_heal') {
            p.hp = p.maxHp;
            _debugLog('祝福: HP全回復!');
        } else if (opt.id === 'shards') {
            p.addAetherShards(50);
            _debugLog('祝福: エーテルシャード50個を獲得!');
        } else if (opt.id === 'random_skill_grant') {
            // Pick a random skill now
            import('./skills/index.js').then(m => {
                const shuffled = [...skillsDB].sort(() => 0.5 - Math.random());
                const skillData = shuffled[0];
                const skill = m.createSkill(skillData);

                if (skill) {
                    const success = p.acquireSkill(skill);
                    if (success) {
                        _debugLog(`祝福: ${skill.name} を習得!`);
                    } else {
                        _debugLog(`祝福: ${skill.name} は既に持っています! (シャード+20)`);
                        p.addAetherShards(20); // Small compensation for duplicate
                    }
                }
            });
        } else if (opt.id.startsWith('skill_')) {
            // ... (Keep for legacy or specific skills if needed)    
            import('./skills/index.js').then(m => {
                const skill = m.createSkill(opt.data);
                if (skill) {
                    const success = p.acquireSkill(skill);
                    if (success) {
                        _debugLog(`Blessing: Acquired ${skill.name}!`);
                    } else {
                        _debugLog(`Blessing: Already possess ${skill.name}!`);
                    }
                }
            });
        }

        // Mark statue used
        if (this.activeStatue) {
            this.activeStatue.used = true;
            this.activeStatue = null;
        }

        // Close UI via helper (though click handler does it, good to ensure state)
        hideBlessingSelection();

        this.gameState = 'PLAYING';
        this.rewardOptions = null;
    }

    logToScreen(msg) {
        _debugLog(msg);
    }

    drawRewardUI() {
        // Handled by DOM now
    }

    activateSlowMotion(durationRealSeconds, scale) {
        this.slowMotionTimer = durationRealSeconds;
        this.slowMotionDuration = durationRealSeconds;
        this.slowMotionStartScale = scale;
        this.targetTimeScale = 1.0; // Goal is to return to normal
        this.timeScale = scale; // Instant slow
        console.log(`Slow Motion Activated: ${scale}x for ${durationRealSeconds}s (Real Time)`);
    }

    enterTrainingMode() {
        this.gameState = 'TRAINING';
        console.log('Entering Training Mode...');

        // 1. Generate Training Map
        this.map.generateTraining();
        this.camera = new Camera(this.width / this.zoom, this.height / this.zoom, this.map.pixelWidth, this.map.pixelHeight);

        // 2. Reset Player to Center
        this.player.x = (this.map.width / 2) * this.map.tileSize;
        this.player.y = (this.map.height / 2) * this.map.tileSize;
        this.camera.follow(this.player);

        // 3. Clear Entities
        this.enemies = [];
        this.chests = [];
        this.statues = [];
        this.projectiles = [];
        this.animations = [];
        this.entities = []; // Drops

        // 4. Spawn 5x5 Grid of Dummies
        const startX = this.player.x - 200; // Center the grid roughly (5 * 80 = 400 width)
        const startY = this.player.y - 400; // In front (Up)

        const rows = 5;
        const cols = 5;
        const spacing = 80;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const ex = startX + c * spacing;
                const ey = startY + r * spacing;

                if (ex > 0 && ex < this.map.pixelWidth && ey > 0 && ey < this.map.pixelHeight) {
                    const dummy = new Goblin(this, ex, ey);
                    dummy.speed = 0;
                    dummy.hp = 10000;
                    dummy.maxHp = 10000;
                    dummy.damage = 0; // Harmless
                    this.enemies.push(dummy);
                    this.spawnParticles(ex, ey, 10, '#ffff00');
                }
            }
        }

        _debugLog(`Training Mode Started. Spawned ${this.enemies.length} Dummies.`);
    }

    updateCamera(dt) {
        if (!this.player || !this.camera) return;

        // Frame-rate independent lerp factors
        const zoomFactor = 1.0 - Math.exp(-3.0 * dt);
        const offsetFactor = 1.0 - Math.exp(-5.0 * dt);

        if (Math.abs(this.targetCameraZoom - this.cameraZoom) > 0.001) {
            this.cameraZoom += (this.targetCameraZoom - this.cameraZoom) * zoomFactor;
        } else {
            this.cameraZoom = this.targetCameraZoom;
        }

        if (Math.abs(this.targetCameraOffsetX - this.cameraOffsetX) > 0.1) {
            this.cameraOffsetX += (this.targetCameraOffsetX - this.cameraOffsetX) * offsetFactor;
        } else {
            this.cameraOffsetX = this.targetCameraOffsetX;
        }

        if (Math.abs(this.targetCameraOffsetY - this.cameraOffsetY) > 0.1) {
            this.cameraOffsetY += (this.targetCameraOffsetY - this.cameraOffsetY) * offsetFactor;
        } else {
            this.cameraOffsetY = this.targetCameraOffsetY;
        }

        let finalOffsetX = this.cameraOffsetX;
        let finalOffsetY = this.cameraOffsetY;

        if (this.gameState === 'DIALOGUE') {
            finalOffsetX += 115; // Maintain dialogue shift
        }

        const isCinematicTransition = this.targetCameraZoom !== 1.0 || this.targetCameraOffsetX !== 0;
        const followSmoothness = isCinematicTransition ? 10 : 5;

        this.camera.follow(this.player, dt, finalOffsetX, finalOffsetY, this.cameraZoom, followSmoothness);
    }

    spawnDeathEffect(entity) {
        // 1. White Silhouette (Ghost)
        this.animations.push({
            type: 'ghost',
            x: entity.x,
            y: entity.y,
            w: entity.width,
            h: entity.height,
            image: entity.image, // Use same sprite
            spriteData: null, // Simple image for now, unless animated
            life: 0.5,
            maxLife: 0.5,
            isWhite: true, // Special flag for white silhouette
            scale: 1.0
        });

        // 2. Circular Explosion
        const particleCount = 16;
        const angleStep = (Math.PI * 2) / particleCount;
        const speed = 300; // Doubled from 150
        const cx = entity.x + entity.width / 2;
        const cy = entity.y + entity.height / 2;

        for (let i = 0; i < particleCount; i++) {
            const angle = i * angleStep;
            this.animations.push({
                type: 'particle',
                x: cx,
                y: cy,
                w: 6, h: 6,
                life: 0.6 + Math.random() * 0.2,
                maxLife: 0.8,
                color: 'white', // White particles
                vx: Math.cos(angle) * speed * (0.8 + Math.random() * 0.4),
                vy: Math.sin(angle) * speed * (0.8 + Math.random() * 0.4)
            });
        }
    }

    update(dt) {
        if (!this.player || !this.camera) return;

        // --- Background Fade-In (Dungeon Start) ---
        if (this.isDungeonStarting && this.worldFadeAlpha > 0) {
            this.worldFadeAlpha -= dt * 1.5; // Fade over ~0.66s
            if (this.worldFadeAlpha < 0) this.worldFadeAlpha = 0;
        }

        // --- Essential Entity/Visual Updates (Available in all states) ---
        this.player.update(dt);

        // Update Animations
        this.animations.forEach(a => {
            a.life -= dt;
            if (a.type === 'particle' || a.type === 'text') {
                a.x += a.vx * dt;
                a.y += a.vy * dt;
                if (a.isDamageText) {
                    a.vy += 450 * dt; // Gravity pulls the text down after the initial pop
                }
            }
            if (a.update) a.update(dt);
        });
        filterInPlace(this.animations, a => a.life > 0);

        // Camera updates have been moved to loop() to prevent physics stutter

        if (this.gameState === 'TITLE') {
            return;
        }
        // --- Transition Logic ---
        if (this.isTransitioning) {
            this.transitionTimer += dt;
            if (this.transitionType === 'fade-out') {
                this.transitionAlpha = Math.min(1, this.transitionTimer / this.transitionDuration);
                if (this.transitionTimer >= this.transitionDuration) {
                    // Prevent multiple calls to this block while timer continues to tick
                    this.transitionType = 'loading-next-floor';
                    this.showLoading();

                    setTimeout(async () => {
                        await this.preloadAllAssets();
                        await this.init(true);
                        this.transitionType = 'fade-in';
                        this.transitionTimer = 0;
                        this.transitionAlpha = 1;
                        this.hideLoading();
                    }, 100);
                }
            } else if (this.transitionType === 'entering-portal') {
                const duration = 0.4; // Total sequence duration

                // At the very start, spawn the snappy shockwave and particle burst
                if (this.transitionTimer <= dt) {
                    this.animations.push({
                        type: 'ring',
                        x: this.portalTargetX,
                        y: this.portalTargetY,
                        radius: 10,
                        maxRadius: 200, // Slightly more spread
                        width: 40,
                        life: 0.15, // Doubled speed (half duration)
                        maxLife: 0.15,
                        color: 'rgba(255, 255, 255, 0.9)'
                    });
                    this.spawnParticles(this.portalTargetX, this.portalTargetY, 20, '#00ffff');
                    this.camera.shake(0.2, 10);
                }

                const progress = Math.min(1, this.transitionTimer / duration);
                const fadeProgress = Math.min(1, this.transitionTimer / 0.2); // Fade faster than the whole sequence

                // Snap player to portal center
                if (this.portalTargetX !== undefined) {
                    this.player.x += (this.portalTargetX - this.player.width / 2 - this.player.x) * 0.4;
                    this.player.y += (this.portalTargetY - this.player.height / 2 - this.player.y) * 0.4;
                }

                // Transparency ONLY (No Scale as requested)
                this.player.alpha = 1 - fadeProgress;
                this.player.scale = 1.0; // Reset scale to default

                if (this.transitionTimer >= duration) {
                    // Add Floor Transition Score Reward
                    const floorScore = CONFIG.GAME.FLOOR_SCORE_REWARD;
                    if (this.currentFloor > 0) this.addScore(floorScore); // No reward for leaving lobby

                    this.currentFloor++;
                    this.transitionType = 'fade-out';
                    this.transitionTimer = 0;
                    this.transitionAlpha = 0;
                }
            } else if (this.transitionType === 'fade-in') {
                this.transitionAlpha = 1 - Math.min(1, this.transitionTimer / this.transitionDuration);
                if (this.transitionTimer >= this.transitionDuration) {
                    // Fade In Complete
                    this.isTransitioning = false;
                    this.transitionType = 'none';
                    this.transitionAlpha = 0;
                }
            }

            // --- Update Animations during Transition ---
            // This ensures Rings, Particles, etc spawned for the effect actually animate
            this.animations.forEach(a => {
                a.life -= dt;
                if (a.type === 'particle' || a.type === 'text') {
                    a.x += a.vx * dt;
                    a.y += a.vy * dt;
                    if (a.isDamageText) {
                        a.vy += 450 * dt; // Gravity pulls the text down
                    }
                }
                if (a.update) a.update(dt);
            });
            filterInPlace(this.animations, a => a.life > 0);

            return; // Pause other game updates (enemies, player input, etc)
        }

        // Toggle Circuit (Lab) UI
        if (this.input.isDown('KeyC')) {
            if (!this.input.circuitPressed) {
                this.input.circuitPressed = true;
                if (this.currentFloor === 0) {
                    const modal = document.getElementById('lab-modal');
                    if (modal && modal.style.display === 'flex') {
                        LabUI.close();
                    } else {
                        LabUI.open();
                    }
                } else {
                    const modal = document.getElementById('dungeon-circuit-modal');
                    if (modal && modal.style.display === 'flex') {
                        DungeonCircuitUI.close();
                    } else {
                        DungeonCircuitUI.open();
                    }
                }
            }
        } else {
            this.input.circuitPressed = false;
        }

        // Toggle Inventory
        if (this.input.isDown('KeyB') || this.input.isDown('KeyI') || this.input.isDown('Tab')) {
            if (!this.input.inventoryPressed) {
                this.input.inventoryPressed = true;
                if (InventoryUI.modal && InventoryUI.modal.style.display === 'flex') {
                    InventoryUI.close();
                } else {
                    InventoryUI.open();
                }
            }
        } else {
            this.input.inventoryPressed = false;
        }

        // Training Mode Input (Spawn logic moved to enterTrainingMode)
        if (this.gameState === 'TRAINING') {
            // No manual spawn keys for now
        }

        // Dialogue Input
        if (this.gameState === 'DIALOGUE') {
            if (this.input.isDown('Space')) {
                if (!this.input.spacePressed) {
                    if (this.activeStatue) {
                        this.activeStatue.presentRewards();
                    } else if (this.activeAltar) {
                        this.activeAltar.presentChoice();
                    }
                    this.input.spacePressed = true;
                }
            } else {
                this.input.spacePressed = false;
            }
            return; // Pause game during dialogue
        }

        // Reward Select Pause
        if (this.gameState === 'REWARD_SELECT') {
            return;
        }


        if (this.isPaused) return; // Pause game when modal is open

        if (this.isGameOver) {
            if (this.input.isDown('Space')) {
                window.location.reload();
            }
            return;
        }

        // Minimap Fog of War logic here...
        // ... (rest of update)

        // Update Minimap (Fog of War)
        const ptx = Math.floor((this.player.x + this.player.width / 2) / this.map.tileSize);
        const pty = Math.floor((this.player.y + this.player.height / 2) / this.map.tileSize);
        this.map.markExplored(ptx, pty, 6); // Radius of 6 tiles

        if (this.player.markedForDeletion) {
            if (!this.isGameOver) {
                this.isGameOver = true;
                // Save Aether shards and fragments on Game Over
                if (this.player.saveAetherData) {
                    console.log("[Game] Saving Aether data upon Game Over...");
                    this.player.saveAetherData();
                }
                // Update local high score
                const isNewRecord = SaveManager.updateHighScore(this.score);
                if (isNewRecord) {
                    this.highScore = this.score;
                    console.log(`[Game] New High Score: ${this.highScore}`);

                    // Show Nickname Input for Online Ranking
                    setTimeout(() => {
                        showNicknameInput(async (name) => {
                            try {
                                await submitScore(name, this.score);
                                console.log("[Game] Online score submitted successfully.");
                            } catch (e) {
                                console.error("[Game] Failed to submit online score:", e);
                            }
                        });
                    }, 1500); // Small delay to let game over screen settle
                }
            }
        }

        // --- Room Encounter Logic ---

        // Find current room (Pixel-based with 10px margin to prevent getting stuck in doors)
        const margin = 5;
        const pts = this.map.tileSize;
        const currentRoom = this.map.rooms.find(r => {
            const rx = (r.x + 1) * pts + margin;
            const ry = (r.y + 1) * pts + margin;
            const rw = (r.w - 2) * pts - margin * 2;
            const rh = (r.h - 2) * pts - margin * 2;

            // Check if player bounding box is fully within the margined floor area
            return this.player.x >= rx && this.player.x + this.player.width <= rx + rw &&
                this.player.y >= ry && this.player.y + this.player.height <= ry + rh;
        });

        if (currentRoom && this.gameState === 'PLAYING') {
            // Trigger Encounter
            if (!currentRoom.cleared && !currentRoom.active) {
                currentRoom.active = true;
                this.map.closeRoom(currentRoom);

                if (currentRoom.type === 'boss') {
                    const bx = (currentRoom.x + currentRoom.w / 2) * this.map.tileSize - 60;
                    const by = (currentRoom.y + currentRoom.h / 2) * this.map.tileSize - 60;

                    // Randomly pick unless overridden
                    let bossClass = Math.random() < 0.5 ? Boss : AetherPrime;
                    if (this.bossOverride === 'golem') bossClass = Boss;
                    if (this.bossOverride === 'prime') bossClass = AetherPrime;
                    this.bossOverride = null; // Reset after use

                    this.enemies.push(new bossClass(this, bx, by, this.getEnemyLevel()));

                    this.camera.shake(0.5, 10);
                    this.logToScreen("WARNING: BOSS DETECTED!");
                    return;
                }

                if (currentRoom.type !== 'normal') {
                    // Non-combat room — clear immediately
                    currentRoom.active = false;
                    currentRoom.cleared = true;
                    this.map.openRoom(currentRoom);
                    return;
                }

                // Cost-based spawning: rooms have a budget, enemies have a cost.
                const area = currentRoom.w * currentRoom.h;
                let budget = Math.max(8, Math.floor(area / 15) + Math.floor(Math.random() * 5));

                const monsterTypes = [
                    { type: 'bat', cost: 1, ew: 24, eh: 24, Class: Bat },
                    { type: 'slime', cost: 2, ew: 32, eh: 32, Class: Slime },
                    { type: 'goblin', cost: 4, ew: 64, eh: 64, Class: Goblin },
                    { type: 'skeleton', cost: 3, ew: 40, eh: 48, Class: SkeletonArcher },
                    { type: 'ghost', cost: 5, ew: 40, eh: 48, Class: Ghost },
                    { type: 'sentinel', cost: 6, ew: 48, eh: 48, Class: AetherSentinel }
                ];

                while (budget > 0) {
                    // Filter monster types affordable within current budget
                    const affordable = monsterTypes.filter(m => m.cost <= budget);
                    if (affordable.length === 0) break;

                    const monster = affordable[Math.floor(Math.random() * affordable.length)];
                    budget -= monster.cost;

                    let ex, ey;
                    let validSpawn = false;
                    let attempts = 0;

                    while (!validSpawn && attempts < 30) {
                        attempts++;
                        const spawnW = Math.max(1, currentRoom.w - 2);
                        const spawnH = Math.max(1, currentRoom.h - 2);
                        const tx = currentRoom.x + 1 + Math.floor(Math.random() * spawnW);
                        const ty = currentRoom.y + 1 + Math.floor(Math.random() * spawnH);

                        if (this.map.tiles[ty][tx] === 0) {
                            // Center enemy on tile
                            ex = (tx + 0.5) * this.map.tileSize - monster.ew / 2;
                            ey = (ty + 0.5) * this.map.tileSize - monster.eh / 2;

                            // Check all 4 corners for wall collision
                            const hitsWall = this.map.isWall(ex, ey) ||
                                this.map.isWall(ex + monster.ew, ey) ||
                                this.map.isWall(ex, ey + monster.eh) ||
                                this.map.isWall(ex + monster.ew, ey + monster.eh);

                            // Check collision with existing solid entities (Crates, etc.)
                            const hitsEntity = this.enemies.some(other => {
                                return other.isSolid &&
                                    ex < other.x + other.width &&
                                    ex + monster.ew > other.x &&
                                    ey < other.y + other.height &&
                                    ey + monster.eh > other.y;
                            });

                            if (!hitsWall && !hitsEntity) {
                                validSpawn = true;
                            }
                        }
                    }

                    if (validSpawn) {
                        this.enemies.push(new monster.Class(this, ex, ey, this.getEnemyLevel()));
                    }
                }

                // Screen Shake for drama
                this.camera.shake(0.3, 5);

                // Optional: Text notification?
            }

            // Monitor Encounter
            if (currentRoom.active) {
                // Count enemies inside this room
                const enemiesInRoom = this.enemies.filter(e =>
                    !e.isPassive &&
                    e.x >= currentRoom.x * this.map.tileSize &&
                    e.x < (currentRoom.x + currentRoom.w) * this.map.tileSize &&
                    e.y >= currentRoom.y * this.map.tileSize &&
                    e.y < (currentRoom.y + currentRoom.h) * this.map.tileSize
                );

                if (enemiesInRoom.length === 0) {
                    // Room Cleared!
                    currentRoom.active = false;
                    currentRoom.cleared = true;
                    this.map.openRoom(currentRoom);

                    // Reward?
                    if (Math.random() < 0.3) { // 30% chance for chest
                        const rawCx = (currentRoom.x + Math.floor(currentRoom.w / 2)) * this.map.tileSize;
                        const rawCy = (currentRoom.y + Math.floor(currentRoom.h / 2)) * this.map.tileSize;
                        const { x: cx, y: cy } = Chest.getSafeSpawnPosition(this, rawCx, rawCy);
                        this.chests.push(new Chest(this, cx, cy));
                    }
                }
            }
        }

        // --- Update Traps ---
        this.traps.forEach(trap => trap.update(dt));

        // Staircase Interaction (Lobby/Dungeon)
        if (currentRoom && currentRoom.type === 'staircase') {
            const cx = (currentRoom.x + currentRoom.w / 2) * this.map.tileSize;
            const cy = (currentRoom.y + currentRoom.h / 2) * this.map.tileSize;
            const dist = Math.sqrt((this.player.x - cx) ** 2 + (this.player.y - cy) ** 2);

            const isPortalLocked = this.map.hasBoss && !this.map.bossDefeated;
            if (dist < CONFIG.PLAYER.INTERACT_RANGE && !isPortalLocked) {
                this.showStairPrompt = true;
                this.stairPromptX = cx;
                this.stairPromptY = cy;

                if (this.input.isDown('Space') && this.interactCooldown <= 0) {
                    this.interactCooldown = 0.5;
                    this.logToScreen("Entering Portal Animation...");
                    this.isTransitioning = true;
                    this.transitionType = 'entering-portal';
                    this.transitionTimer = 0;
                    this.transitionAlpha = 0;
                    this.portalTargetX = cx;
                    this.portalTargetY = cy;
                    return;
                }
            } else {
                this.showStairPrompt = false;
            }
        } else {
            this.showStairPrompt = false;
        }

        // --- Unified Interaction System ---
        if (this.interactCooldown > 0) this.interactCooldown -= dt;

        // Collect all interactable entities
        const interactables = [
            ...this.chests,
            ...this.statues,
            ...this.bloodAltars,
            ...this.shopNPCs,
            ...this.labNPCs,
            ...this.skillPedestals
        ];

        let nearest = null;
        let minDist = CONFIG.PLAYER.INTERACT_RANGE;

        interactables.forEach(obj => {
            const dist = Math.sqrt((this.player.x - obj.x) ** 2 + (this.player.y - obj.y) ** 2);
            if (dist < minDist) {
                minDist = dist;
                nearest = obj;
            }
            // Clear all prompts first (entities might draw their own)
            if (obj.showPrompt !== undefined) obj.showPrompt = false;
        });

        this.currentInteractable = nearest;
        if (this.currentInteractable) {
            // Set prompt state if the entity uses it for internal drawing
            if (this.currentInteractable.showPrompt !== undefined) {
                this.currentInteractable.showPrompt = true;
            }

            // Global Space key for interaction
            if (this.input.isDown('Space') && this.interactCooldown <= 0) {
                this.interactCooldown = 0.3; // Prevent double-trigger
                if (this.currentInteractable.interact) {
                    this.currentInteractable.interact();
                } else if (this.currentInteractable.use) {
                    this.currentInteractable.use();
                }
            }
        }

        // Camera update handled at the top of update() now.

        const hadBoss = this.enemies.some(e => e.isBoss);
        this.enemies.forEach(enemy => enemy.update(dt));
        filterInPlace(this.enemies, e => !e.markedForDeletion);
        
        this.updateSolidEntities();

        if (hadBoss && !this.enemies.some(e => e.isBoss)) {
            // Boss was just defeated
            this.map.bossDefeated = true;
            this.logToScreen("PORTAL ACTIVATED!");
            this.camera.shake(0.5, 15);
        }

        // --- Update Enemy Projectiles (Global) ---
        this.enemyProjectiles.forEach(p => p.update(dt, this));
        filterInPlace(this.enemyProjectiles, p => p.life > 0);

        // Update Chests (Interaction)
        this.chests.forEach(chest => chest.update(dt));

        // Update Statues (Interaction)
        this.statues.forEach(statue => statue.update(dt));

        this.labNPCs.forEach(npc => npc.update(dt));

        this.skillPedestals.forEach(p => p.update(dt));

        this.bloodAltars.forEach(altar => altar.update(dt));

        if (!this.input.isDown('Space')) this.input.spacePressed = false;

        // Portal Particles (Stairs)
        const stairRoom = this.map.rooms.find(r => r.type === 'staircase');
        const showPortalFX = stairRoom && (!this.map.hasBoss || this.map.bossDefeated);
        if (showPortalFX) {
            // Check visibility (optimization)
            const sx = (stairRoom.x + stairRoom.w / 2) * this.map.tileSize;
            const sy = (stairRoom.y + stairRoom.h / 2) * this.map.tileSize;

            if (Math.random() < 0.3) { // 30% chance per frame (approx 20 particles/sec)
                // Spawn particle around the center (radius 30-40)
                const angle = Math.random() * Math.PI * 2;
                const dist = 30 + Math.random() * 20;
                const px = sx + Math.cos(angle) * dist;
                const py = sy + Math.sin(angle) * dist;

                this.animations.push({
                    type: 'particle',
                    x: px,
                    y: py,
                    w: 4, h: 4,
                    life: 0.5 + Math.random() * 0.5,
                    maxLife: 1.0,
                    color: '#00ffff', // Cyan
                    vx: (Math.random() - 0.5) * 20, // Slow drift
                    vy: (Math.random() - 0.5) * 20 - 30, // Slight upward drift
                    shape: 'circle' // Circular particles
                });
            }
        }

        // Update Generic Entities (e.g., Drops)
        this.entities.forEach(e => e.update(dt));
        filterInPlace(this.entities, e => !e.markedForDeletion);
        
        this.updateSolidEntities();

        // Update Animations (Removed from here - now at the top of update)
        // No change needed here if already removed or just cleaning up.
        // I'll remove the redundant block below.

        // Update Projectiles
        this.projectiles.forEach(p => {
            if (p.startDelay > 0) {
                p.startDelay -= dt;
                return;
            }

            p.update(dt);

            if (p.isEnemy) {
                // --- Enemy Projectile Logic: Hits Player ---
                const padX = this.player.width * 0.2;
                const padY = this.player.height * 0.2;

                if (p.x < this.player.x + this.player.width - padX && p.x + p.w > this.player.x + padX &&
                    p.y < this.player.y + this.player.height - padY && p.y + p.h > this.player.y + padY) {

                    // Prevent multi-hits if needed (optional for player hits, but good for consistency)
                    p.hitPool = p.hitPool || new Set();
                    if (p.hitPool.has(this.player)) return;
                    p.hitPool.add(this.player);

                    if (p.onHitPlayer) {
                        p.onHitPlayer(this.player, this, dt);
                    } else {
                        this.player.takeDamage(p.damage || 10);

                        // Destroy projectile unless it has pierce
                        if (!p.pierce || p.pierce <= 1) {
                            p.life = 0;
                        } else if (typeof p.pierce === 'number') {
                            p.pierce--;
                        }

                        if (!p.noHitParticles) {
                            this.spawnParticles(p.x, p.y, 8, 'red');
                        }
                    }
                }
            } else {
                // --- Player Projectile Logic: Hits Enemies ---
                this.enemies.forEach(e => {
                    const padX = e.width * 0.15;
                    const padY = e.height * 0.15;
                    if (p.x < e.x + e.width - padX && p.x + p.w > e.x + padX &&
                        p.y < e.y + e.height - padY && p.y + p.h > e.y + padY) {

                        // Prevent multi-hits per enemy
                        p.hitPool = p.hitPool || new Set();
                        if (p.hitPool.has(e)) return;
                        p.hitPool.add(e);

                        // Screen Shake - Only on successful hit
                        if (!p.noShake) {
                            this.camera.shake(0.15, 3.5);
                        }

                        if (p.onHitEnemy) {
                            p.onHitEnemy(e, this, dt);
                        } else {
                            // Critical hit roll (Unified Calculation)
                            const isCrit = p.critChance > 0 && Math.random() < p.critChance;
                            const critMult = p.critMultiplier + this.player.critDamageBonus;
                            const finalDamage = isCrit ? p.damage * critMult : p.damage;

                            // Knockback calculation
                            let kx = 0, ky = 0;
                            if (p.knockback) {
                                const dx = (e.x + e.width / 2) - (p.x + p.w / 2);
                                const dy = (e.y + e.height / 2) - (p.y + p.h / 2);
                                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                                kx = (dx / dist) * p.knockback;
                                ky = (dy / dist) * p.knockback;
                            }

                            e.takeDamage(finalDamage, p.damageColor, p.aetherCharge, isCrit, kx, ky);

                            // Apply Status (Standard Projectiles)
                            if (p.statusEffect && (!p.statusChance || Math.random() < p.statusChance)) {
                                if (e.statusManager) {
                                    e.statusManager.applyStatus(p.statusEffect, 5.0);
                                }
                            }

                            if (!p.pierce || p.pierce <= 1) {
                                p.life = 0; // Destroy projectile
                            } else {
                                if (typeof p.pierce === 'number') p.pierce--;
                            }
                            if (!p.noHitParticles) {
                                const particleColor = isCrit ? '#FFD700' : 'orange';
                                this.spawnParticles(p.x, p.y, isCrit ? 12 : 8, particleColor);
                            }
                        }
                    }
                });

                // --- Player Projectile Logic: Hits Destructible Enemy Projectiles (Crystals, etc.) ---
                this.enemyProjectiles.forEach(ep => {
                    if (ep.hp !== undefined || ep.takeDamage) {
                        const epPadX = (ep.w || 20) * 0.1;
                        const epPadY = (ep.h || 20) * 0.1;

                        if (p.x < ep.x + (ep.w || 20) - epPadX && p.x + (p.w || 10) > ep.x + epPadX &&
                            p.y < ep.y + (ep.h || 20) - epPadY && p.y + (p.h || 10) > ep.y + epPadY) {

                            p.hitPool = p.hitPool || new Set();
                            if (p.hitPool.has(ep)) return;
                            p.hitPool.add(ep);

                            if (ep.takeDamage) {
                                ep.takeDamage(p.damage || 1);
                            } else if (ep.hp !== undefined) {
                                ep.hp -= (p.damage || 1);
                                if (ep.hp <= 0) ep.life = 0;
                            }

                            if (!p.pierce || p.pierce <= 1) {
                                p.life = 0;
                            } else if (typeof p.pierce === 'number') {
                                p.pierce--;
                            }
                        }
                    }
                });
            }

            // Check wall collision
            if (!p.ignoreWallDestruction && this.map.isWall(p.x + p.w / 2, p.y + p.h / 2)) {
                if (p.onHitWall) {
                    p.onHitWall(this);
                } else {
                    p.life = 0;
                    this.spawnParticles(p.x, p.y, 5, 'gray');
                }
            }
        });
        filterInPlace(this.projectiles, p => p.life > 0);


        const hp = Math.ceil(this.player.hp);
        const maxHp = Math.ceil(this.player.maxHp);

        if (hp !== this.lastHp || maxHp !== this.lastMaxHp) {
            if (this.uiHp) this.uiHp.textContent = hp;
            if (this.uiHpMax) this.uiHpMax.textContent = maxHp;
            if (this.uiHpBar) {
                const pct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
                this.uiHpBar.style.width = `${pct}%`;
            }
            this.lastHp = hp;
            this.lastMaxHp = maxHp;
        }

        if (this.uiFloorValue) {
            this.uiFloorValue.textContent = this.currentFloor;
        }

        // Update Score UI
        if (this.uiScoreValue) {
            this.uiScoreValue.textContent = Math.floor(this.score);
        }
    }



    drawProjectile(p, alpha = 1) {
        if (p.draw) {
            this.ctx.save();
            p.draw(this.ctx, alpha, this); // Added 'this' for game context if needed
            this.ctx.restore();
            return;
        }

        let drawn = false;
        const interpX = p.prevX !== undefined ? p.prevX + (p.x - p.prevX) * alpha : p.x;
        const interpY = p.prevY !== undefined ? p.prevY + (p.y - p.prevY) * alpha : p.y;

        this.ctx.save();
        // Fade out in the last 30% of life, or if no maxLife, standard
        let drawAlpha = 1;
        if (p.maxLife) {
            // Fade out when life < 30% of maxLife
            const fadeThreshold = p.maxLife * 0.3;
            if (p.life < fadeThreshold) {
                drawAlpha = p.life / fadeThreshold;
            }
        }
        this.ctx.globalAlpha = drawAlpha;

        this.ctx.fillStyle = p.color;
        if (p.image) {
            if (p.image.complete && p.image.naturalWidth !== 0) {
                // Draw Sprite Projectile
                let sx, sy, sw, sh;

                if (p.spriteFrames && p.spriteFrames.length > 0) {
                    const frameData = p.spriteFrames[p.frameX % p.spriteFrames.length];
                    sx = frameData.x;
                    sy = frameData.y;
                    sw = frameData.w;
                    sh = frameData.h;
                } else {
                    sw = p.image.width / p.frames;
                    sh = p.image.height;
                    sx = p.frameX * sw;
                    sy = 0;
                }

                this.ctx.save();
                // Anchor Point Support (Default Center 0.5)
                const anchorX = p.anchorX !== undefined ? p.anchorX : 0.5;
                const anchorY = p.anchorY !== undefined ? p.anchorY : 0.5;

                this.ctx.translate(p.x + p.w * anchorX, p.y + p.h * anchorY);
                if (p.spinning) {
                    this.ctx.rotate(p.rotation);
                } else {
                    // Start with rotation if provided (for static visuals), otherwise calculate from velocity if moving
                    let angle = p.rotation || 0;
                    if (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1) {
                        angle = Math.atan2(p.vy, p.vx);
                    }
                    this.ctx.rotate(angle + (p.rotationOffset || 0));
                }

                // Default to natural dimensions
                let destW = p.w;
                let destH = p.h;

                // If moving and not spinning, assume sprite is horizontal and we rotate to velocity
                // So we draw "long side" along X axis
                // UNLESS fixedOrientation is true
                if (!p.spinning && !p.fixedOrientation && (Math.abs(p.vx) > 0.1 || Math.abs(p.vy) > 0.1)) {
                    destW = Math.max(p.w, p.h);
                    destH = Math.min(p.w, p.h);
                }

                this.ctx.drawImage(
                    p.image,
                    sx, sy, sw, sh,
                    -destW * anchorX, -destH * anchorY, destW, destH
                );
                this.ctx.restore();
                drawn = true;
            }
        }

        // Fallback Rendering
        // If NOT drawn, check if we should show fallback or hide it (e.g. while loading)
        if (!drawn) {
            // If hideWhileLoading is TRUE and image exists (but failed/loading), SKIP drawing.
            // If hideWhileLoading is FALSE (or undefined), DRAW fallback.
            const shouldHide = p.image && p.hideWhileLoading;
            if (!shouldHide) {
                if (p.shape === 'triangle') {
                    // Triangle (World Coords)
                    this.ctx.save();
                    const j = () => (Math.random() - 0.5) * 4; // Pixel jitter for triangle edges
                    this.ctx.fillStyle = p.color;

                    if (p.fixedOrientation) {
                        // Advanced: Rotated Triangle
                        const cx = p.x + p.w / 2;
                        const cy = p.y + p.h / 2;
                        const angle = p.rotation !== undefined ? p.rotation : Math.atan2(p.vy, p.vx);
                        
                        this.ctx.translate(cx, cy);
                        this.ctx.rotate(angle);
                        
                        this.ctx.beginPath();
                        // Pointy end is at (p.w/2, 0) in local space
                        this.ctx.moveTo(-p.w / 2 + j(), -p.h / 2 + j());
                        this.ctx.lineTo(p.w / 2 + j(), 0 + j());
                        this.ctx.lineTo(-p.w / 2 + j(), p.h / 2 + j());
                        this.ctx.fill();
                    } else {
                        // Legacy: Cardinal Triangle
                        this.ctx.beginPath();
                        if (p.w > p.h) {
                            if (p.vx > 0) { // Right
                                this.ctx.moveTo(p.x + j(), p.y + j());
                                this.ctx.lineTo(p.x + p.w + j(), p.y + p.h / 2 + j());
                                this.ctx.lineTo(p.x + j(), p.y + p.h + j());
                            } else { // Left
                                this.ctx.moveTo(interpX + j(), interpY + p.h / 2 + j());
                                this.ctx.lineTo(interpX + p.w + j(), interpY + j());
                                this.ctx.lineTo(interpX + p.w + j(), interpY + p.h + j());
                            }
                        } else {
                            const j = () => (Math.random() - 0.5) * 5;
                            this.ctx.beginPath();
                            if (Math.random() > 0.5) { // Down
                                this.ctx.moveTo(interpX + j(), interpY + j());
                                this.ctx.lineTo(interpX + p.w / 2 + j(), interpY + p.h + j());
                                this.ctx.lineTo(interpX + p.w + j(), interpY + j());
                            } else { // Up
                                this.ctx.moveTo(interpX + j(), interpY + p.h + j());
                                this.ctx.lineTo(interpX + p.w / 2 + j(), interpY + j());
                                this.ctx.lineTo(interpX + p.w + j(), interpY + p.h + j());
                            }
                        }
                        this.ctx.fill();
                    }
                    this.ctx.restore();

                } else if (p.shape === 'slash') {
                    // Slash (Procedural Crescent/Wind Blade with Swipe Animation)
                    const cx = interpX + p.w / 2;
                    const cy = interpY + p.h / 2;
                    const angle = p.rotation !== undefined ? p.rotation : Math.atan2(p.vy, p.vx);

                    this.ctx.save();
                    this.ctx.translate(cx, cy);
                    this.ctx.rotate(angle);

                    // Dimensions
                    // Size: Use aggressive scaling for small slashes, modest scaling for large ones
                    const span = p.h > 40 ? p.h * 1.1 : Math.max(p.h, 20) * 2.1;
                    const thickness = p.w > 20 ? p.w * 1.1 : Math.max(p.w, 10) * 3.5;

                    // Animation Progress
                    const maxLife = p.maxLife || 0.3;
                    const progress = 1.0 - (p.life / maxLife);

                    // Dynamic Gradient for Swipe Effect
                    // Move a "light band" from top to bottom
                    // The band has a transparent head and tail.

                    // Compute gradient in SVG Space (height ~272) so it covers the full shape
                    const svgHeight = 272;
                    const bandWidth = svgHeight * 1.2; // Wide band in SVG units
                    const totalTravel = svgHeight + bandWidth;
                    const startY = -svgHeight / 2 - bandWidth / 2;

                    const currentCenter = startY + (totalTravel * progress);
                    const gStart = currentCenter - bandWidth / 2;
                    const gEnd = currentCenter + bandWidth / 2;

                    const color = p.color || '#ffffff';
                    const isHex = color.startsWith('#');
                    const transparentColor = isHex ? color + '00' : 'rgba(255,255,255,0)';
                    const peakColor = isHex ? color + 'ff' : color;

                    const grad = this.ctx.createLinearGradient(0, gStart, 0, gEnd);
                    grad.addColorStop(0, transparentColor);
                    grad.addColorStop(0.2, isHex ? color + '33' : transparentColor);
                    grad.addColorStop(0.5, peakColor); // Peak opacity
                    grad.addColorStop(0.8, isHex ? color + '33' : transparentColor);
                    grad.addColorStop(1, transparentColor);

                    this.ctx.fillStyle = grad;


                    // SVG dimensions (approx based on coords) are roughly 130x272
                    // We need to scale this to fit our projectile dimensions (thickness x span)
                    // The SVG is vertical-ish (Height ~270, Width ~130)
                    // Our standard orientation is "facing right", so we might need to rotate or just scale

                    this.ctx.save();
                    // Center the path drawing - SVG origin seems to be top-leftish relative to shape?
                    // Bounding box of SVG path is approx: x: -6 to 130, y: -10 to 271.
                    // Center is roughly 65, 130.

                    // Flip X (negative scale) to fix "reversed" orientation
                    const scaleX = -thickness / 130;
                    const scaleY = span / 270;

                    this.ctx.scale(scaleX, scaleY);
                    this.ctx.translate(-65, -135); // Center the shape

                    this.ctx.fill(SLASH_PATH);
                    this.ctx.restore();

                    this.ctx.restore();

                } else if (p.shape === 'orb') {
                    // Orb (World Coords)
                    const cx = interpX + p.w / 2;
                    const cy = interpY + p.h / 2;
                    const radius = p.w / 2;

                    this.ctx.save();
                    const grad = this.ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
                    grad.addColorStop(0, 'white');
                    grad.addColorStop(1, p.color || 'yellow');
                    this.ctx.fillStyle = grad;
                    this.ctx.beginPath();
                    this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                    this.ctx.fill();
                    this.ctx.restore();

                } else {
                    // Default Rectangle (Centered for Rotation)
                    this.ctx.save();
                    this.ctx.translate(interpX + p.w / 2, interpY + p.h / 2);
                    this.ctx.rotate((p.rotation || 0) * Math.PI / 180);
                    if (p.drawAlpha !== undefined) this.ctx.globalAlpha = p.drawAlpha;
                    this.ctx.fillStyle = p.color;
                    this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    this.ctx.restore();
                }
            }
        }
        this.ctx.restore();
    }

    draw(alpha = 1) {
        this.ctx.clearRect(0, 0, this.width, this.height);

        if (!this.camera || !this.player) return;

        // --- Camera Space ---
        this.ctx.save();
        // Use true for interpolation-based smooth movement
        this.ctx.imageSmoothingEnabled = true;

        // Base Zoom * Cinematic Zoom
        const finalZoom = this.zoom * this.camera.zoom;
        this.ctx.scale(finalZoom, finalZoom);

        this.ctx.translate(-this.camera.x, -this.camera.y);

        this.map.draw(this.ctx, this.camera, this.player, this.debugMode);

        // Draw Traps (Floor layer)
        this.traps.forEach(trap => {
            if (this.camera.isVisible(trap.x, trap.y, trap.width, trap.height)) {
                trap.draw(this.ctx);
            }
        });

        // Draw 'bottom' layer animations (Background effects like Ice Garden AND Ghosts)
        this.animations.forEach(a => {
            if (a.layer === 'bottom' || a.type === 'ghost') {
                if (a.draw) {
                    this.ctx.save();
                    a.draw(this.ctx);
                    this.ctx.restore();
                }
            }
        });

        // Draw 'bottom' layer projectiles (Ice Garden Spikes)
        this.projectiles.forEach(p => {
            if (p.layer === 'bottom' && p.active !== false) {
                const interpX = p.prevX !== undefined ? p.prevX + (p.x - p.prevX) * alpha : p.x;
                const interpY = p.prevY !== undefined ? p.prevY + (p.y - p.prevY) * alpha : p.y;
                if (!this.camera.isVisible(interpX, interpY, p.w || 10, p.h || 10)) return;
                this.drawProjectile(p, alpha);
            }
        });

        // Create Render List for Depth Sorting (Memory Optimized)
        const renderList = this._renderList || (this._renderList = []);
        let renderIndex = 0;

        // Optimized helper: Reuses existing objects in the array to avoid GC
        const getRenderItem = () => {
            if (renderIndex < renderList.length) {
                return renderList[renderIndex++];
            }
            const newItem = { entity: null, type: 0, z: 0 };
            renderList.push(newItem);
            renderIndex++;
            return newItem;
        };

        // 1. Chests
        for (const chest of this.chests) {
            if (this.camera.isVisible(chest.x, chest.y, chest.width, chest.height)) {
                const item = getRenderItem();
                const interpY = chest.prevY + (chest.y - chest.prevY) * alpha;
                item.entity = chest; item.type = 1; item.z = interpY + chest.height;
            }
        }

        // 1.5 Statues
        for (const statue of this.statues) {
            if (this.camera.isVisible(statue.x, statue.y, statue.width, statue.height)) {
                const item = getRenderItem();
                const interpY = statue.prevY + (statue.y - statue.prevY) * alpha;
                item.entity = statue; item.type = 2; item.z = interpY + statue.height;
            }
        }

        // 1.6 Blood Altars
        for (const altar of this.bloodAltars) {
            if (this.camera.isVisible(altar.x, altar.y, altar.width, altar.height)) {
                const item = getRenderItem();
                const interpY = altar.prevY + (altar.y - altar.prevY) * alpha;
                item.entity = altar; item.type = 3; item.z = interpY + altar.height;
            }
        }

        // 1.7 Shop NPCs
        for (const npc of this.shopNPCs) {
            if (this.camera.isVisible(npc.x, npc.y, npc.width, npc.height)) {
                const item = getRenderItem();
                const interpY = npc.prevY + (npc.y - npc.prevY) * alpha;
                item.entity = npc; item.type = 4; item.z = interpY + npc.height;
            }
        }

        // 1.8 Lobby Entities
        for (const npc of this.labNPCs) {
            if (this.camera.isVisible(npc.x, npc.y, npc.width, npc.height)) {
                const item = getRenderItem();
                const interpY = npc.prevY + (npc.y - npc.prevY) * alpha;
                item.entity = npc; item.type = 4; item.z = interpY + npc.height;
            }
        }

        for (const p of this.skillPedestals) {
            if (this.camera.isVisible(p.x, p.y, p.width, p.height)) {
                const item = getRenderItem();
                const interpY = p.prevY + (p.y - p.prevY) * alpha;
                item.entity = p; item.type = 4; item.z = interpY + p.height;
            }
        }

        // 2. Player
        const pItem = getRenderItem();
        const pInterpY = this.player.prevY + (this.player.y - this.player.prevY) * alpha;
        pItem.entity = this.player; pItem.type = 5; pItem.z = pInterpY + this.player.height;

        // 3. Enemies
        for (const enemy of this.enemies) {
            if (this.camera.isVisible(enemy.x, enemy.y, enemy.width, enemy.height)) {
                const item = getRenderItem();
                const interpY = enemy.prevY + (enemy.y - enemy.prevY) * alpha;
                item.entity = enemy; item.type = 6; item.z = interpY + enemy.height;
            }
        }

        // 3.5 Generic Entities (Drops)
        for (const entity of this.entities) {
            if (this.camera.isVisible(entity.x, entity.y, entity.width, entity.height)) {
                const item = getRenderItem();
                const interpY = entity.prevY + (entity.y - entity.prevY) * alpha;
                item.entity = entity; item.type = 7; item.z = interpY + entity.height;
            }
        }

        // 4. Projectiles (Foreground/Standard)
        for (const p of this.projectiles) {
            if (p.startDelay > 0 || p.layer === 'bottom') continue;
            if (!this.camera.isVisible(p.x, p.y, p.w || 10, p.h || 10)) continue;
            const item = getRenderItem();
            item.entity = p; item.type = 8; item.z = p.y + (p.h || 10);
        }

        // 5. Enemy Projectiles
        for (const p of this.enemyProjectiles) {
            if (!this.camera.isVisible(p.x, p.y, 10, 10)) continue;
            const item = getRenderItem();
            item.entity = p; item.type = 9; item.z = p.y;
        }

        // Sort by Z (Lower Y value [Top of screen] -> Lower Z -> Drawn First -> Behind)
        // We only sort the active portion of the list
        const activeList = renderList.slice(0, renderIndex);
        activeList.sort((a, b) => a.z - b.z);

        // Draw All based on type
        for (let i = 0; i < activeList.length; i++) {
            const item = activeList[i];
            const e = item.entity;
            switch (item.type) {
                case 1: // Chest
                    e.draw(this.ctx, alpha);
                    if (e.showPrompt) {
                        this.ctx.fillStyle = 'white';
                        this.ctx.font = "14px 'Meiryo', sans-serif";
                        this.ctx.textAlign = 'center';
                        const interpX = e.prevX + (e.x - e.prevX) * alpha;
                        const interpY = e.prevY + (e.y - e.prevY) * alpha;
                        this.ctx.fillText("[SPACE] 開く", interpX + e.width / 2, interpY - 10);
                    }
                    break;
                case 2: // Statue
                    e.draw(this.ctx, alpha);
                    break;
                case 3: // Altar
                    e.draw(this.ctx, alpha);
                    break;
                case 4: // Shop NPC
                    e.draw(this.ctx, alpha);
                    break;
                case 5: // Player
                    e.draw(this.ctx, alpha);
                    break;
                case 6: // Enemy
                    e.draw(this.ctx, alpha);
                    break;
                case 7: // Generic Entity
                    e.draw(this.ctx, alpha);
                    break;
                case 8: // Projectile
                    this.drawProjectile(e, alpha);
                    break;
                case 9: // Enemy Projectile
                    e.draw(this.ctx, alpha);
                    break;
            }
        }

        // Draw Stair Prompt (Always on top of entities?)
        if (this.showStairPrompt) {
            this.ctx.fillStyle = 'white';
            this.ctx.font = "14px 'Meiryo', sans-serif";
            this.ctx.textAlign = 'center';
            this.ctx.fillText("[SPACE] 進む", this.stairPromptX, this.stairPromptY - 20);
        }

        // Draw Animations (Foreground)
        for (const a of this.animations) {
            if (a.layer === 'bottom' || a.type === 'ghost') continue;

            if (a.draw) {
                a.draw(this.ctx);
                continue;
            }

            // Culling: Animations (Particles, Text, etc)
            const aw = a.w || 20;
            const ah = a.h || 20;
            if (!this.camera.isVisible(a.x, a.y, aw, ah)) continue;

            this.ctx.save();
            let alpha = a.life / a.maxLife; // Linear 0 to 1

            if (a.type === 'slash') {
                alpha = Math.min(1, alpha * 3);
            }

            this.ctx.globalAlpha = Math.max(0, alpha);

            if (a.type === 'slash') {
                const progress = 1 - (a.life / a.maxLife);
                const currentAngle = a.startAngle + (a.endAngle - a.startAngle) * progress;
                const trailLength = Math.PI / 3;
                let trailStart = currentAngle - trailLength;
                let trailEnd = currentAngle;

                if (a.endAngle < a.startAngle) {
                    trailStart = currentAngle;
                    trailEnd = currentAngle + trailLength;
                }

                const color = a.color || '#ffffff';
                const isHex = color.startsWith('#');
                const transparentColor = isHex ? color + '00' : 'rgba(255,255,255,0)';

                const startX = a.x + Math.cos(trailStart) * a.radius;
                const startY = a.y + Math.sin(trailStart) * a.radius;
                const endX = a.x + Math.cos(trailEnd) * a.radius;
                const endY = a.y + Math.sin(trailEnd) * a.radius;

                const grad = this.ctx.createLinearGradient(startX, startY, endX, endY);
                grad.addColorStop(0, transparentColor);
                grad.addColorStop(1, color);

                this.ctx.strokeStyle = grad;
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, a.radius, trailStart, trailEnd);
                this.ctx.stroke();

                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, a.radius - 5, trailStart + 0.1, trailEnd - 0.1);
                this.ctx.stroke();

            } else if (a.type === 'particle') {
                this.ctx.fillStyle = a.color || 'white';
                let currentW = a.w;
                let currentH = a.h;

                if (a.shrink) {
                    const progress = a.life / a.maxLife;
                    currentW *= progress;
                    currentH *= progress;
                }

                if (a.shape === 'circle') {
                    this.ctx.beginPath();
                    const radius = (currentW + currentH) / 4;
                    this.ctx.arc(a.x + a.w / 2, a.y + a.h / 2, radius, 0, Math.PI * 2);
                    this.ctx.fill();
                } else {
                    this.ctx.fillRect(a.x + (a.w - currentW) / 2, a.y + (a.h - currentH) / 2, currentW, currentH);
                }
            } else if (a.type === 'ghost') {
                this.ctx.save();
                this.ctx.globalAlpha = a.life / a.maxLife;

                const cx = a.x + a.w / 2;
                const cy = a.y + a.h / 2;
                this.ctx.translate(cx, cy);
                if (a.rotation) this.ctx.rotate(a.rotation);

                if (a.image) {
                    let sx = 0, sy = 0, sw = a.image.width, sh = a.image.height;
                    if (a.spriteData) {
                        const frameIndex = (this.frameY || 0) * 4 + (this.frameX || 0); // Corrected this.frameX to a.frameX potentially
                        // Wait, previous code used (a.frameY || 0) * 4 + (a.frameX || 0). Let's keep that.
                        const fX = a.frameX || 0;
                        const fY = a.frameY || 0;
                        const fIdx = fY * 4 + fX;

                        if (a.spriteData.frames && a.spriteData.frames[fIdx]) {
                            const frameData = a.spriteData.frames[fIdx].frame;
                            sx = frameData.x; sy = frameData.y; sw = frameData.w; sh = frameData.h;
                        }
                    } else if (a.frames > 1) {
                        sw = a.image.width / a.frames;
                        sh = a.image.height;
                        sx = (a.frameX || 0) * sw;
                    }
                    this.ctx.drawImage(a.image, sx, sy, sw, sh, -a.w / 2, -a.h / 2, a.w, a.h);
                } else {
                    this.ctx.fillStyle = a.color || 'white';
                    this.ctx.fillRect(-a.w / 2, -a.h / 2, a.w, a.h);
                }
                this.ctx.restore();
            } else if (a.type === 'ring') {
                const progress = 1 - (a.life / a.maxLife);
                const currentRadius = a.radius + (a.maxRadius - a.radius) * progress;
                this.ctx.strokeStyle = a.color;
                this.ctx.lineWidth = a.width * (1 - progress);
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, currentRadius, 0, Math.PI * 2);
                this.ctx.stroke();
            } else if (a.type === 'text') {
                this.ctx.save();
                
                let scale = 1.0;
                let alpha = 1.0;
                
                if (a.isDamageText) {
                    const progress = 1 - (a.life / a.maxLife); // 0 to 1
                    if (progress < 0.25) {
                        // First 25%: pop up and scale from 0.5 to 1.5
                        const p2 = progress / 0.25;
                        scale = 0.5 + (1.0 * Math.sin(p2 * Math.PI / 2));
                        alpha = 1.0;
                    } else {
                        // Remaining 75%: scale down from 1.5 to 0.7 and fade out RAPIDLY
                        const p2 = (progress - 0.25) / 0.75;
                        scale = 1.5 - (p2 * 0.8);
                        // Make alpha drop much faster (cubic falloff)
                        alpha = 1.0 - (p2 * p2 * p2); 
                    }
                } else {
                    alpha = Math.min(1.0, a.life / (a.maxLife * 0.5)); // Fade out in the last 50% of life
                }

                this.ctx.globalAlpha = Math.max(0, alpha);
                this.ctx.font = a.font || "16px sans-serif";
                this.ctx.fillStyle = a.color || 'white';
                this.ctx.strokeStyle = 'black';
                this.ctx.lineWidth = 2;
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                
                const textWidth = this.ctx.measureText(a.text).width;
                const iconSize = a.iconSize || 22;
                const spacing = 4;
                let iconsTotalWidth = 0;
                
                const validIcons = (a.icons || []).filter(icon => icon && icon.complete && icon.naturalWidth !== 0);
                if (validIcons.length > 0) {
                    iconsTotalWidth = validIcons.length * (iconSize + spacing) - spacing;
                }
                
                const totalWidth = textWidth + (iconsTotalWidth > 0 ? spacing + iconsTotalWidth : 0);
                
                // If we need to scale, we must translate to the center first
                if (scale !== 1.0) {
                    this.ctx.translate(a.x, a.y);
                    this.ctx.scale(scale, scale);
                    this.ctx.translate(-a.x, -a.y);
                }

                const startX = Math.floor(a.x - totalWidth / 2);
                const drawY = Math.floor(a.y);

                // Draw Shadow/Stroke for better readability
                this.ctx.strokeText(a.text, startX, drawY);
                this.ctx.fillText(a.text, startX, drawY);

                // Draw Icons if provided
                if (validIcons.length > 0) {
                    let currentIconX = startX + textWidth + spacing;
                    for (const icon of validIcons) {
                        this.ctx.drawImage(icon, Math.floor(currentIconX), Math.floor(drawY - iconSize / 2), iconSize, iconSize);
                        currentIconX += iconSize + spacing;
                    }
                }
                this.ctx.restore();
            } else if (a.type === 'visual_projectile') {
                this.ctx.fillStyle = a.color;
                if (a.image && a.image.complete && a.image.naturalWidth !== 0) {
                    let sx, sy, sw, sh;
                    if (a.spriteFrames && a.spriteFrames.length > 0) {
                        const frameData = a.spriteFrames[a.frameX % a.spriteFrames.length];
                        sx = frameData.x; sy = frameData.y; sw = frameData.w; sh = frameData.h;
                    } else {
                        sw = a.image.width / a.frames;
                        sh = a.image.height;
                        sx = a.frameX * sw;
                        sy = 0;
                    }
                    this.ctx.save();
                    if (a.blendMode) this.ctx.globalCompositeOperation = a.blendMode;
                    this.ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
                    if (a.rotation) this.ctx.rotate(a.rotation);
                    if (a.filter) this.ctx.filter = a.filter;

                    let destW = a.w, destH = a.h;
                    if (a.scale) {
                        destW = sw * a.scale; destH = sh * a.scale;
                    } else if (sw > 0 && sh > 0) {
                        const ratio = sw / sh;
                        destW = a.w; destH = destW / ratio;
                        if (destH > a.h) { destH = a.h; destW = destH * ratio; }
                    }
                    this.ctx.drawImage(a.image, sx, sy, sw, sh, -destW / 2, -destH / 2, destW, destH);
                    this.ctx.restore();
                }
            } else if (a.type === 'lightning_bolt') {
                const x1 = a.x1;
                const y1 = a.y1;
                const x2 = a.x2;
                const y2 = a.y2;
                
                const dx = x2 - x1;
                const dy = y2 - y1;
                const dist = Math.hypot(dx, dy);
                if (dist > 0) {
                    const segments = Math.max(2, Math.floor(dist / 12));
                    this.ctx.save();
                    this.ctx.strokeStyle = a.color || '#ffff00';
                    this.ctx.lineWidth = a.width || 2;
                    this.ctx.globalAlpha = Math.min(1.0, (a.life / a.maxLife) * 2); // Stay bright then fade
                    
                    this.ctx.shadowBlur = 8;
                    this.ctx.shadowColor = a.color || '#ffff00';
                    
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);
                    
                    const vx = -(y2 - y1) / dist;
                    const vy = (x2 - x1) / dist;
                    
                    for (let i = 1; i < segments; i++) {
                        const t = i / segments;
                        const px = x1 + (x2 - x1) * t;
                        const py = y1 + (y2 - y1) * t;
                        const jitter = (Math.random() - 0.5) * 15;
                        this.ctx.lineTo(px + vx * jitter, py + vy * jitter);
                    }
                    
                    this.ctx.lineTo(x2, y2);
                    this.ctx.stroke();
                    
                    // White core
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = this.ctx.lineWidth / 2;
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            } else {
                this.ctx.fillStyle = a.color || 'white';
                this.ctx.fillRect(a.x, a.y, a.w, a.h);
            }
            this.ctx.restore();
        }

        this.ctx.restore();

        // --- Cinematic Fade Overlay ---
        if (this.worldFadeAlpha > 0) {
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Screen space
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.worldFadeAlpha})`;
            this.ctx.fillRect(0, 0, (this.canvas.width || this.width), (this.canvas.height || this.height));
            this.ctx.restore();
        }

        // --- UI Space ---
        drawUI(this.ctx, this, this.width, this.height);

        // Draw Boss Health Bar if active
        let activeBoss = null;
        for (const enemy of this.enemies) {
            if (enemy.isBoss && !enemy.markedForDeletion) {
                activeBoss = enemy;
                break;
            }
        }
        if (activeBoss) {
            this.drawBossHealthBar(activeBoss);
        }

        this.drawRewardUI();

        if (this.gameState === 'DIALOGUE') {
            // console.log("State is DIALOGUE, drawing...");
            drawDialogue(this, this.dialogueText);
        } else {
            hideDialogue();
        }

        // --- Transition Overlay ---
        if (this.transitionAlpha > 0) {
            this.ctx.save();
            this.ctx.fillStyle = `rgba(0, 0, 0, ${this.transitionAlpha})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
        }
    }

    drawBossHealthBar(boss) {
        const barW = 600;
        const barH = 20;
        const x = (this.width - barW) / 2;
        const y = 50;

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // HUD space

        // Shadow/Background
        this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
        this.ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);

        // Name
        this.ctx.fillStyle = 'white';
        this.ctx.font = "bold 20px 'Meiryo', 'Hiragino Kaku Gothic ProN', 'MS PGothic', sans-serif";
        this.ctx.textAlign = 'center';
        this.ctx.shadowColor = 'black';
        this.ctx.shadowBlur = 4;
        this.ctx.fillText(boss.displayName, this.width / 2, y - 15);

        // HP Bar
        const ratio = boss.hp / boss.maxHp;
        this.ctx.fillStyle = '#330000';
        this.ctx.fillRect(x, y, barW, barH);

        const grad = this.ctx.createLinearGradient(x, y, x, y + barH);
        grad.addColorStop(0, '#ff0044');
        grad.addColorStop(1, '#880022');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x, y, barW * ratio, barH);

        // Glass reflection
        this.ctx.fillStyle = 'rgba(255,255,255,0.1)';
        this.ctx.fillRect(x, y, barW, barH / 2);

        this.ctx.restore();
    }

    triggerSkillSelection(skills) {
        this.isPaused = true;
        showSkillSelection(skills, (selectedSkill) => {
            this.handleSkillSelected(selectedSkill);
        });
    }

    cheatForcedChest() {
        // Pick 3 random unique skills
        const shuffled = [...skillsDB].sort(() => 0.5 - Math.random());
        const selectedOptions = shuffled.slice(0, 3);
        this.triggerSkillSelection(selectedOptions);
    }

    handleSkillSelected(skillData) {
        this.isPaused = false;
        // Create the actual skill instance
        const skill = createSkill(skillData);
        if (skill) {
            const success = this.player.acquireSkill(skill);

            if (success) {
                console.log(`Selected skill: ${skill.name}`);
                SaveManager.unlockSkill(skillData.id); // Permanently unlock in collection

                // Notification
                this.animations.push({
                    type: 'text',
                    text: `習得: ${skill.name}`,
                    x: this.player.x,
                    y: this.player.y - 20,
                    vx: 0,
                    vy: -50,
                    life: 2.0,
                    color: '#ffff00',
                    font: "bold 16px 'Meiryo', sans-serif"
                });

                this.spawnParticles(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 20, '#ffff00');
            } else {
                this.logToScreen(`${skill.name} は既に所持しています。`);
                this.player.addDungeonCoins(50); // Refund/Compensation
            }
        }
    }

    loop(timestamp) {
        if (!this.player || !this.camera) {
            requestAnimationFrame(this.loop);
            return;
        }

        let deltaTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (deltaTime > 0.25) deltaTime = 0.25;

        // Apply Time Scale
        // If slow motion active, reduce deltaTime
        if (this.slowMotionTimer > 0) {
            // Update timer using REAL delta time (deltaTime is unscaled here)
            this.slowMotionTimer -= deltaTime;
            if (this.slowMotionTimer <= 0) {
                this.timeScale = 1.0;
                this.slowMotionTimer = 0;
                console.log("Slow Motion Ended");
            } else {
                // Multi-stage Recovery
                const elapsed = this.slowMotionDuration - this.slowMotionTimer;

                if (elapsed < 0.3) {
                    // Phase 1: 0.0 -> 0.2 (Linear over first 0.3s)
                    const p = elapsed / 0.3;
                    this.timeScale = this.slowMotionStartScale + (0.2 - this.slowMotionStartScale) * p;
                } else {
                    // Phase 2: 0.2 -> 1.0 (Exponential over remaining time)
                    // Assuming duration is > 0.3 (it is 1.0)
                    const remainingDuration = this.slowMotionDuration - 0.3;
                    if (remainingDuration > 0) {
                        const p = (elapsed - 0.3) / remainingDuration;
                        // Exponential curve from 0.2 to 1.0: y = 0.2 * Math.pow(5, p)
                        // x=0 -> y=0.2, x=1 -> y=1.0
                        this.timeScale = 0.2 * Math.pow(5, p);
                    } else {
                        this.timeScale = 1.0;
                    }
                }
            }
            // Now apply scale to delta
            deltaTime = deltaTime * this.timeScale;
        } else {
            // Ensure reset if drifted
            if (this.timeScale !== 1.0) this.timeScale = 1.0;
        }

        this.accumulator += deltaTime;

        // --- P Key Toggle for Settings/Cheat Menu ---
        if (this.input.isPressed('KeyP')) {
            const settingsBtn = document.getElementById('settings-btn');
            if (settingsBtn) settingsBtn.click();
        }

        // Dynamic Step Size for Smooth Slow Motion
        // Use scaled step size to ensure updates run every frame even at low time scales
        let activeStep = this.step;
        if (this.timeScale < 1.0) {
            // If timeScale is 0, we effectively pause simulation
            // If timeScale is small, step size becomes small
            activeStep = this.step * this.timeScale;
        }

        // Prevent infinite loop if step size is too close to zero
        if (activeStep > 0.0001) {
            let updateMax = 10;
            while (this.accumulator >= activeStep && updateMax > 0) {
                // Save previous positions for all entities before update
                this.player.savePrevPos();
                this.enemies.forEach(e => e.savePrevPos());
                this.entities.forEach(e => e.savePrevPos());
                this.projectiles.forEach(p => p.savePrevPos && p.savePrevPos());
                this.enemyProjectiles.forEach(p => p.savePrevPos && p.savePrevPos());
                if (this.traps) this.traps.forEach(t => t.savePrevPos());

                this.update(activeStep);
                this.accumulator -= activeStep;
                updateMax--;
            }
            if (updateMax === 0) {
                this.accumulator = 0;
            }
        } else {
            // Time is stopped (0.0 scale)
            // Accumulator just holds pending time until scale increases
        }

        // Calculate interpolation alpha (0.0 to 1.0)
        const alpha = activeStep > 0 ? this.accumulator / activeStep : 0;

        // --- Interpolated Camera Update ---
        // We follow a virtual position for the player that is interpolated
        const interpPlayer = {
            x: this.player.prevX + (this.player.x - this.player.prevX) * alpha,
            y: this.player.prevY + (this.player.y - this.player.prevY) * alpha,
            width: this.player.width,
            height: this.player.height
        };
        this.updateCamera(deltaTime, interpPlayer);

        this.draw(alpha);
        this.input.update();
        requestAnimationFrame(this.loop);
    }

    updateSolidEntities() {
        // Rebuild the solid entities list periodically or after filtering
        // This avoids creating a new array every frame in checkCollision
        this.solidEntities = [];
        for (const e of this.enemies) {
            if (e.isSolid && !e.markedForDeletion) this.solidEntities.push(e);
        }
        for (const e of this.entities) {
            if (e.isSolid && !e.markedForDeletion) this.solidEntities.push(e);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("Starting Game Initialization...");
        const game = new Game();
        console.log("Game Initialized Successfully.");
    } catch (e) {
        console.error("Game Initialization Failed:", e);
    }
});

window.addEventListener('error', (e) => {
    console.error("Runtime Error:", e.message);
});
