import { InputHandler, Camera, Entity, getCachedImage } from './utils.js';
import { Map } from './map.js';
import { Player } from './player.js';
import { Enemy, Slime, Bat, Goblin, SkeletonArcher, Chest, Statue, BloodAltar, ShopNPC, WoodCrate, SpikeTrap } from './entities.js';
import { createSkill } from './skills/index.js';
import { drawUI, showSkillSelection, hideSkillSelection, showBlessingSelection, hideBlessingSelection, drawDialogue, hideDialogue, initSettingsUI } from './ui.js';
import { initInventory, renderInventory, resetInventorySelection } from './inventory.js';
import { skillsDB } from '../data/skills_db.js';

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
        this.zoom = 1.2;
        this.debugMode = false;
        this.gameState = 'TITLE'; // TITLE, PLAYING, REWARD_SELECT, GAME_OVER
        this.rewardOptions = null; // Array of 3 options
        this.images = {}; // Asset Check
        this.currentFloor = 1;

        // Transition State
        this.isTransitioning = false;
        this.transitionType = 'none'; // 'fade-out', 'fade-in'
        this.transitionTimer = 0;
        this.transitionDuration = 0.5; // 0.5s fade
        this.transitionTimer = 0;
        this.transitionDuration = 0.5; // 0.5s fade
        this.transitionAlpha = 0;

        // Time Scale (Slow Motion)
        this.timeScale = 1.0;
        this.targetTimeScale = 1.0;
        this.slowMotionTimer = 0; // In Real Time
        this.slowMotionDuration = 0;
        this.slowMotionStartScale = 1.0;

        this.input = new InputHandler();

        // Global Click Handler for UI Overlay (Removed Canvas-based Reward Click)
        this.canvas.addEventListener('mousedown', (e) => {
            // ...
        });

        try {
            // Initial setup but don't spawn player yet
            // (Unless we want title screen to show the map in background)
            this.prepareTitleScreen();
        } catch (e) {
            _debugLog("Init Error: " + e.message);
            console.error(e);
        }

        this.loop = this.loop.bind(this);

        // Expose game instance for UI access
        window._gameInstance = this;

        // Shop close button
        const shopCloseBtn = document.getElementById('shop-close-btn');
        if (shopCloseBtn) {
            shopCloseBtn.addEventListener('click', () => {
                import('./ui.js').then(ui => ui.hideShopUI());
                this.gameState = 'PLAYING';
            });
        }

        // Responsive Resizing
        window.addEventListener('resize', () => this.handleResize());
        this.handleResize(); // Initial call

        this.initTitleListeners();

        requestAnimationFrame(this.loop);
        _debugLog("Game Loop Started");
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
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            uiLayer.style.transform = `scale(${this.zoom})`;
        }

        console.log(`Resized to fit 16:9: ${this.width.toFixed(0)}x${this.height.toFixed(0)}, Zoom: ${this.zoom.toFixed(2)}`);
    }

    prepareTitleScreen() {
        // Hide UI Layer during title
        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) {
            uiLayer.style.display = 'none';
        }
    }

    initTitleListeners() {
        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) {
            startBtn.onclick = () => this.startGame();
        }
    }

    showLoading() {
        const screen = document.getElementById('loading-screen');
        const fill = document.querySelector('.loading-bar-fill');
        if (screen) {
            screen.style.display = 'flex';
            if (fill) fill.style.width = '0%';
        }
    }

    updateLoadingProgress(progress) {
        const fill = document.querySelector('.loading-bar-fill');
        if (fill) {
            fill.style.width = `${progress}%`;
        }
    }

    hideLoading() {
        const screen = document.getElementById('loading-screen');
        const fill = document.querySelector('.loading-bar-fill');
        if (fill) fill.style.width = '100%';

        setTimeout(() => {
            if (screen) {
                screen.style.animation = 'fadeOutTitle 0.3s forwards';
                setTimeout(() => {
                    screen.style.display = 'none';
                    screen.style.animation = '';
                }, 300);
            }
        }, 300);
    }

    async preloadAllAssets() {
        console.log("Preloading started...");
        const assets = [
            'assets/player_sprites.png',
            'assets/floor.png',
            'assets/portal_stairs.png',
            'assets/aether_shard.png',
            'assets/chest_closed.png',
            'assets/chest_open.png',
            'assets/bg_angel_blessing.png',
            'assets/bg_blood_blessing.png',
            'assets/slime.png',
            'assets/bat.png',
            'assets/goblin.png',
            'assets/skeleton_archer.png',
            'assets/icon_bleed.png',
            'assets/icon_ice.png',
            'assets/icon_burn.png',
            'assets/icon_crimson_cross.png',
            'assets/icon_dash.png',
            'assets/flame_fan.png',
            'assets/icon_flame_fan.png',
            'assets/icon_slash.png',
            'assets/icon_blood_scythe.png',
            'assets/ice_spike.png',
            'assets/icon_needle.png',
            'assets/icon_fireball.png',
            'assets/fireball_sheet.png',
            'assets/icon_thunder_burst.png',
            'assets/thunder_burst.png',
            'assets/icon_bounce.png',
            'assets/icon_ember_strike.png',
            'assets/blood_scythe.png',
            'assets/icon_ice_spike.png',
            'assets/icon_ice_garden.png',
            'assets/icon_wind.png',
            'assets/icon_chain.png',
            'assets/icon_thunder_fall.png',
            'assets/icon_thunder_god.png',
            'assets/icon_glacial_lotus.png',
            'assets/phoenix_aura.png',
            'assets/icon_magma_spear.png',
            'assets/magma_spear.png',
            'assets/magma_core.png',
            'assets/tornado.png',
            'assets/trap_spike.png',
            'assets/wood_crate.png',
            'assets/shop_npc.png',
            'assets/statue_angel.png',
            'assets/blood_altar.png'
        ];

        // Also add any icons/spriteSheets from skillsDB that aren't manually listed
        skillsDB.forEach(s => {
            if (s.icon && !assets.includes(s.icon)) assets.push(s.icon);
            if (s.params?.spriteSheet && !assets.includes(s.params.spriteSheet)) assets.push(s.params.spriteSheet);
        });

        let loadedCount = 0;
        const total = assets.length;

        const promises = assets.map(src => {
            return new Promise((resolve) => {
                const img = getCachedImage(src);
                if (img.complete && img.naturalWidth !== 0) {
                    loadedCount++;
                    this.updateLoadingProgress((loadedCount / total) * 100);
                    resolve();
                } else {
                    img.onload = () => {
                        loadedCount++;
                        this.updateLoadingProgress((loadedCount / total) * 100);
                        resolve();
                    };
                    img.onerror = () => {
                        console.error("Asset preload failed:", src);
                        loadedCount++; // Still resolve to avoid hanging
                        resolve();
                    };
                }
            });
        });

        await Promise.all(promises);
        console.log("Preloading complete.");
    }

    startGame() {
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
                setTimeout(() => {
                    // Show core game UI
                    const uiLayer = document.getElementById('ui-layer');
                    if (uiLayer) uiLayer.style.display = 'block';

                    // Initialize game session
                    this.init();

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
            this.shopNPCs.some(n => n.showPrompt);
    }

    init(isNextFloor = false) {
        if (!isNextFloor) {
            this.currentFloor = 1;
        } else {
            // Clear stale inventory selection from the previous floor
            resetInventorySelection();
        }

        // Larger Map: 100x80 tiles (4000x3200 pixels)
        this.map = new Map(100, 80, 40);
        this.map.generate();
        _debugLog("Map Generated");

        this.traps = [];

        this.camera = new Camera(this.width / this.zoom, this.height / this.zoom, this.map.pixelWidth, this.map.pixelHeight);

        const startRoom = this.map.rooms.find(r => r.type === 'start') || this.map.rooms[0];
        console.log("Start Room:", startRoom);

        // Persistence Logic
        const oldPlayer = this.player;
        if (startRoom) {
            this.player = new Player(this, (startRoom.x + startRoom.w / 2) * 40, (startRoom.y + startRoom.h / 2) * 40);
            if (isNextFloor && oldPlayer) {
                // Restore skills and inventory
                this.player.inventory = oldPlayer.inventory || [];
                this.player.equippedSkills = oldPlayer.equippedSkills || {};
                // Restore currency/shards if needed (Player constructor might reset them)
                this.player.currency = oldPlayer.currency || 0;
                this.player.hp = oldPlayer.hp;
                this.player.maxHp = oldPlayer.maxHp;
                this.player.aether = 0; // Reset aether rush on floor change
                this.player.bloodBlessings = []; // Clear temporary blessings
            }
            console.log("Player Spawned at:", this.player.x, this.player.y);
        } else {
            console.error("CRITICAL: No rooms found to spawn player!");
            this.player = new Player(this, 100, 100); // Emergency fallback
        }
        this.camera.follow(this.player);

        // --- Load Skills from DB only on fresh start ---
        if (!isNextFloor) {
            skillsDB.forEach(skillData => {
                const skill = createSkill(skillData);
                if (skill) {
                    this.player.acquireSkill(skill);
                    // Auto equip for now based on type (simple logic)
                    if (!this.player.equippedSkills[skill.type]) {
                        this.player.equipSkill(skill);
                    }
                }
            });
        }
        this.enemies = [];
        this.enemyProjectiles = [];
        this.chests = [];
        this.statues = [];
        this.bloodAltars = [];
        this.shopNPCs = [];
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
            }


        }

        this.lastTime = 0;
        this.accumulator = 0;
        this.step = 1 / 60;

        this.uiHp = document.getElementById('hp-value');
        this.uiHpMax = document.getElementById('hp-max');
        this.uiHpBar = document.getElementById('health-bar-fill');
        this.uiFloorValue = document.getElementById('floor-value');
        this.lastHp = null;
        this.lastMaxHp = null;
        this.showInventory = false;
        if (this.player) {
            this.player.scale = 1.0;
            this.player.alpha = 1.0;
        }
        initInventory(this);
        initSettingsUI(this);
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
            p.addCurrency(50);
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
                        p.addCurrency(20); // Small compensation for duplicate
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
        if (this.gameState === 'TITLE') return;
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
                        this.init(true);
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
                }
                if (a.update) a.update(dt);
            });
            this.animations = this.animations.filter(a => a.life > 0);

            return; // Pause other game updates (enemies, player input, etc)
        }

        // Toggle Inventory
        if (this.input.isDown('KeyB')) {
            if (!this.input.bPressed) {
                this.showInventory = !this.showInventory;
                this.input.bPressed = true;
                renderInventory(this);
            }
        } else {
            this.input.bPressed = false;
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

        // Shop Pause
        if (this.gameState === 'SHOP') {
            return;
        }

        if (this.showInventory || this.isPaused) return; // Pause game when inventory or modal is open

        if (this.isGameOver) {
            if (this.input.isDown('Space')) {
                this.showLoading();
                setTimeout(() => {
                    this.init();
                    this.hideLoading();
                }, 100);
            }
            return;
        }

        this.player.update(dt);
        if (this.player.markedForDeletion) {
            this.isGameOver = true;
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

        if (currentRoom) {
            // Trigger Encounter
            if (!currentRoom.cleared && !currentRoom.active) {
                currentRoom.active = true;
                this.map.closeRoom(currentRoom);

                // Only spawn enemies in normal combat rooms
                if (currentRoom.type !== 'normal') {
                    // Non-combat room — clear immediately (safety net; should already be cleared)
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
                    { type: 'skeleton', cost: 3, ew: 40, eh: 48, Class: SkeletonArcher }
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

                            if (!hitsWall) {
                                validSpawn = true;
                            }
                        }
                    }

                    if (validSpawn) {
                        this.enemies.push(new monster.Class(this, ex, ey));
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
                        const cx = (currentRoom.x + Math.floor(currentRoom.w / 2)) * this.map.tileSize;
                        const cy = (currentRoom.y + Math.floor(currentRoom.h / 2)) * this.map.tileSize;
                        this.chests.push(new Chest(this, cx, cy));
                    }
                }
            }
        }

        // --- Update Traps ---
        this.traps.forEach(trap => trap.update(dt));

        // Staircase Interaction
        if (currentRoom && currentRoom.type === 'staircase') {
            const cx = (currentRoom.x + currentRoom.w / 2) * this.map.tileSize;
            const cy = (currentRoom.y + currentRoom.h / 2) * this.map.tileSize;
            const dist = Math.sqrt((this.player.x - cx) ** 2 + (this.player.y - cy) ** 2);

            if (dist < 60) {
                this.showStairPrompt = true;
                this.stairPromptX = cx;
                this.stairPromptY = cy;

                if (this.input.isDown('Space')) {
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

        this.camera.follow(this.player, dt);

        this.enemies.forEach(enemy => enemy.update(dt));
        this.enemies = this.enemies.filter(e => !e.markedForDeletion);

        // --- Update Enemy Projectiles (Global) ---
        this.enemyProjectiles.forEach(p => p.update(dt, this));
        this.enemyProjectiles = this.enemyProjectiles.filter(p => p.life > 0);

        // Update Chests (Interaction)
        this.chests.forEach(chest => {
            chest.update(dt);
            // Check proximity
            const dist = Math.sqrt((this.player.x - chest.x) ** 2 + (this.player.y - chest.y) ** 2);
            if (dist < 50 && !chest.opened) {
                // Show Prompt (Logic moved to draw)
                chest.showPrompt = true;

                if (this.input.isDown('Space')) {
                    chest.open();
                }
            } else {
                chest.showPrompt = false;
            }
        });

        // Update Statues (Interaction)
        this.statues.forEach(statue => {
            statue.update(dt);
            // Check proximity (Center to Center)
            const pcx = this.player.x + this.player.width / 2;
            const pcy = this.player.y + this.player.height / 2;
            const scx = statue.x + statue.width / 2;
            const scy = statue.y + statue.height / 2;

            const dist = Math.sqrt((pcx - scx) ** 2 + (pcy - scy) ** 2);
            // Threshold = Player Radius (~20) + Statue Radius (60) + Margin (40) = ~120
            if (dist < 120 && !statue.used) {
                statue.showPrompt = true;
                if (this.input.isDown('Space')) {
                    statue.use();
                }
            } else {
                statue.showPrompt = false;
            }
        });

        // Update Blood Altars (Interaction)
        this.bloodAltars.forEach(altar => {
            altar.update(dt);
            const dist = Math.sqrt((this.player.x - altar.x) ** 2 + (this.player.y - altar.y) ** 2);
            if (dist < 60 && !altar.used) {
                altar.showPrompt = true;
                if (this.input.isDown('Space')) {
                    altar.use();
                }
            } else {
                altar.showPrompt = false;
            }
        });

        // Update Shop NPCs (Interaction)
        this.shopNPCs.forEach(npc => {
            npc.update(dt);
            const pcx = this.player.x + this.player.width / 2;
            const pcy = this.player.y + this.player.height / 2;
            const ncx = npc.x + npc.width / 2;
            const ncy = npc.y + npc.height / 2;
            const dist = Math.sqrt((pcx - ncx) ** 2 + (pcy - ncy) ** 2);
            if (dist < 80) {
                npc.showPrompt = true;
                if (this.input.isDown('Space') && !this.input.spacePressed) {
                    this.input.spacePressed = true;
                    npc.use();
                }
            } else {
                npc.showPrompt = false;
            }
        });
        if (!this.input.isDown('Space')) this.input.spacePressed = false;

        // Portal Particles (Stairs)
        const stairRoom = this.map.rooms.find(r => r.type === 'staircase');
        if (stairRoom) {
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
        this.entities = this.entities.filter(e => !e.markedForDeletion);

        // Update Animations
        this.animations.forEach(a => {
            a.life -= dt;
            if (a.type === 'particle' || a.type === 'text') {
                a.x += a.vx * dt;
                a.y += a.vy * dt;
            }
            if (a.update) a.update(dt);
        });
        this.animations = this.animations.filter(a => a.life > 0);

        // Update Projectiles
        this.projectiles.forEach(p => {
            if (p.startDelay > 0) {
                p.startDelay -= dt;
                return;
            }

            p.update(dt);
            // Check collision with enemies
            this.enemies.forEach(e => {
                if (p.x < e.x + e.width && p.x + p.w > e.x &&
                    p.y < e.y + e.height && p.y + p.h > e.y) {

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
                        // Critical hit roll
                        const isCrit = p.critChance > 0 && Math.random() < p.critChance;
                        const finalDamage = isCrit ? p.damage * (p.critMultiplier || 2.0) : p.damage;

                        e.takeDamage(finalDamage, p.damageColor, p.aetherCharge, isCrit);

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
        this.projectiles = this.projectiles.filter(p => p.life > 0);


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
    }

    drawProjectile(p) {
        if (p.draw) {
            this.ctx.save();
            p.draw(this.ctx);
            this.ctx.restore();
            return;
        }

        let drawn = false;

        this.ctx.save();
        // Fade out in the last 30% of life, or if no maxLife, standard
        let alpha = 1;
        if (p.maxLife) {
            // Fade out when life < 30% of maxLife
            const fadeThreshold = p.maxLife * 0.3;
            if (p.life < fadeThreshold) {
                alpha = p.life / fadeThreshold;
            }
        }
        this.ctx.globalAlpha = alpha;

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
                    this.ctx.beginPath();
                    if (p.w > p.h) {
                        if (p.vx > 0) { // Right
                            this.ctx.moveTo(Math.floor(p.x) + j(), Math.floor(p.y) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w) + j(), Math.floor(p.y + p.h / 2) + j());
                            this.ctx.lineTo(Math.floor(p.x) + j(), Math.floor(p.y + p.h) + j());
                        } else { // Left
                            this.ctx.moveTo(Math.floor(p.x) + j(), Math.floor(p.y + p.h / 2) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w) + j(), Math.floor(p.y) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w) + j(), Math.floor(p.y + p.h) + j());
                        }
                    } else {
                        if (p.vy > 0) { // Down
                            this.ctx.moveTo(Math.floor(p.x) + j(), Math.floor(p.y) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w / 2) + j(), Math.floor(p.y + p.h) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w) + j(), Math.floor(p.y) + j());
                        } else { // Up
                            this.ctx.moveTo(Math.floor(p.x) + j(), Math.floor(p.y + p.h) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w / 2) + j(), Math.floor(p.y) + j());
                            this.ctx.lineTo(Math.floor(p.x + p.w) + j(), Math.floor(p.y + p.h) + j());
                        }
                    }
                    this.ctx.fill();
                    this.ctx.restore();

                } else if (p.shape === 'slash') {
                    // Slash (Procedural Crescent/Wind Blade with Swipe Animation)
                    const cx = p.x + p.w / 2;
                    const cy = p.y + p.h / 2;
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
                    const cx = p.x + p.w / 2;
                    const cy = p.y + p.h / 2;
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
                    this.ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
                    this.ctx.rotate((p.rotation || 0) * Math.PI / 180);
                    if (p.alpha !== undefined) this.ctx.globalAlpha = p.alpha;
                    this.ctx.fillStyle = p.color;
                    this.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                    this.ctx.restore();
                }
            }
        }
        this.ctx.restore();
    }

    draw() {
        if (this.gameState === 'TITLE') {
            // Draw title background or just clear
            this.ctx.fillStyle = '#0d0d0d';
            this.ctx.fillRect(0, 0, this.width, this.height);
            return;
        }
        // Clear screen
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // --- Camera Space ---
        this.ctx.save();
        this.ctx.scale(this.zoom, this.zoom);
        this.ctx.translate(-Math.floor(this.camera.x), -Math.floor(this.camera.y));

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
                if (!this.camera.isVisible(p.x, p.y, p.w || 10, p.h || 10)) return;
                this.drawProjectile(p);
            }
        });

        // Create Render List for Depth Sorting
        const renderList = [];

        // 1. Chests
        this.chests.forEach(chest => {
            if (this.camera.isVisible(chest.x, chest.y, chest.width, chest.height)) {
                renderList.push({
                    z: chest.y + chest.height, // Sort by bottom
                    draw: () => {
                        chest.draw(this.ctx);
                        if (chest.showPrompt) {
                            this.ctx.fillStyle = 'white';
                            this.ctx.font = '14px sans-serif';
                            this.ctx.textAlign = 'center';
                            this.ctx.fillText("[SPACE] 開く", chest.x + chest.width / 2, chest.y - 10);
                        }
                    }
                });
            }
        });

        // 1.5 Statues
        this.statues.forEach(statue => {
            if (this.camera.isVisible(statue.x, statue.y, statue.width, statue.height)) {
                renderList.push({
                    z: statue.y + statue.height,
                    draw: () => statue.draw(this.ctx)
                });
            }
        });

        // 1.6 Blood Altars
        this.bloodAltars.forEach(altar => {
            if (this.camera.isVisible(altar.x, altar.y, altar.width, altar.height)) {
                renderList.push({
                    z: altar.y + altar.height,
                    draw: () => altar.draw(this.ctx)
                });
            }
        });

        // 1.7 Shop NPCs
        this.shopNPCs.forEach(npc => {
            if (this.camera.isVisible(npc.x, npc.y, npc.width, npc.height)) {
                renderList.push({
                    z: npc.y + npc.height,
                    draw: () => npc.draw(this.ctx)
                });
            }
        });

        // 2. Player
        renderList.push({
            z: this.player.y + this.player.height,
            draw: () => this.player.draw(this.ctx)
        });

        // 3. Enemies
        this.enemies.forEach(enemy => {
            if (this.camera.isVisible(enemy.x, enemy.y, enemy.width, enemy.height)) {
                renderList.push({
                    z: enemy.y + enemy.height,
                    draw: () => enemy.draw(this.ctx)
                });
            }
        });

        // 3.5 Generic Entities (Drops)
        this.entities.forEach(entity => {
            if (this.camera.isVisible(entity.x, entity.y, entity.width, entity.height)) {
                renderList.push({
                    z: entity.y + entity.height,
                    draw: () => entity.draw(this.ctx)
                });
            }
        });

        // 4. Projectiles (Foreground/Standard)
        this.projectiles.forEach(p => {
            if (p.startDelay > 0 || p.layer === 'bottom') return; // Skip bottom layer
            // Culling (using p.w/p.h or defaults)
            if (!this.camera.isVisible(p.x, p.y, p.w || 10, p.h || 10)) return;

            renderList.push({
                z: p.y + (p.h || 10),
                draw: () => this.drawProjectile(p)
            });
        });

        // 5. Enemy Projectiles
        this.enemyProjectiles.forEach(p => {
            if (!this.camera.isVisible(p.x, p.y, 10, 10)) return;
            renderList.push({
                z: p.y,
                draw: () => p.draw(this.ctx)
            });
        });

        // Sort by Z (Lower Y value [Top of screen] -> Lower Z -> Drawn First -> Behind)
        // User said "Lower Y comes to front", which suggests Inverted Sort?
        // Let's assume Standard Sort (Higher Y [Bottom] -> Front) is what makes sense for depth.
        // If they REALLY meant Inverted, I just flip a.z - b.z to b.z - a.z
        // Standard Depth Sort:
        renderList.sort((a, b) => a.z - b.z);

        // Draw All
        renderList.forEach(item => item.draw());

        // Draw Stair Prompt (Always on top of entities?)
        if (this.showStairPrompt) {
            this.ctx.fillStyle = 'white';
            this.ctx.font = '14px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("[SPACE] 進む", this.stairPromptX, this.stairPromptY - 20);
        }

        // Draw Animations (Foreground)
        this.animations.forEach(a => {
            if (a.layer === 'bottom' || a.type === 'ghost') return; // Already drawn

            if (a.draw) {
                // If draw is defined, let it handle culling internally or just draw (since custom draw usually handles transforms)
                // But we should cull if possible.
                // Assuming custom draw objects manage their own state or are simple.
                // Let's assume they might need camera transform, which is already applied here.
                a.draw(this.ctx);
                return;
            }

            // Culling: Animations (Particles, Text, etc)
            // Text may not have w/h, assume small size
            let aw = a.w || 20;
            let ah = a.h || 20;
            if (!this.camera.isVisible(a.x, a.y, aw, ah)) return;

            this.ctx.save();
            let alpha = a.life / a.maxLife; // Linear 0 to 1

            // For slash, stay opaque longer
            if (a.type === 'slash') {
                // Fade out only in the last 30% of life
                alpha = Math.min(1, alpha * 3);
            }

            this.ctx.globalAlpha = Math.max(0, alpha);

            if (a.type === 'slash') {
                const progress = 1 - (a.life / a.maxLife);
                // Sweep logic
                const currentAngle = a.startAngle + (a.endAngle - a.startAngle) * progress;

                // Draw trails/blur
                const trailLength = Math.PI / 3;
                let trailStart = currentAngle - trailLength; // Default for one direction? 
                let trailEnd = currentAngle;

                // Direction fix:
                // If end < start (CCW), trail should be ahead of current? Or current is leading edge?
                // Let's stick to the visual logic we established.
                if (a.endAngle < a.startAngle) {
                    trailStart = currentAngle;
                    trailEnd = currentAngle + trailLength;
                }

                const color = a.color || '#ffffff';
                const isHex = color.startsWith('#');
                const transparentColor = isHex ? color + '00' : 'rgba(255,255,255,0)';

                // Calculate gradient points
                const startX = a.x + Math.cos(trailStart) * a.radius;
                const startY = a.y + Math.sin(trailStart) * a.radius;
                const endX = a.x + Math.cos(trailEnd) * a.radius;
                const endY = a.y + Math.sin(trailEnd) * a.radius;

                const grad = this.ctx.createLinearGradient(startX, startY, endX, endY);
                grad.addColorStop(0, transparentColor);
                grad.addColorStop(1, color);

                // Main Blade
                this.ctx.strokeStyle = grad;
                this.ctx.lineWidth = 4;
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, a.radius, trailStart, trailEnd);
                this.ctx.stroke();

                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Universal highlight
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(a.x, a.y, a.radius - 5, trailStart + 0.1, trailEnd - 0.1);
                this.ctx.stroke();

            } else if (a.type === 'particle') {
                this.ctx.fillStyle = a.color || 'white';

                let currentW = a.w;
                let currentH = a.h;

                if (a.shrink) {
                    const progress = a.life / a.maxLife; // 1 to 0
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
                this.ctx.globalAlpha = a.life / a.maxLife; // Fade out

                // Handle Rotation
                const cx = a.x + a.w / 2;
                const cy = a.y + a.h / 2;
                this.ctx.translate(cx, cy);
                if (a.rotation) {
                    this.ctx.rotate(a.rotation);
                }

                // Draw Image Centered at (0,0)
                if (a.image) {
                    let sx = 0, sy = 0, sw = a.image.width, sh = a.image.height;

                    // Sprite Sheet Logic
                    if (a.spriteData) {
                        const frameIndex = (a.frameY || 0) * 4 + (a.frameX || 0);
                        if (a.spriteData.frames && a.spriteData.frames[frameIndex]) {
                            const frameData = a.spriteData.frames[frameIndex].frame;
                            sx = frameData.x;
                            sy = frameData.y;
                            sw = frameData.w;
                            sh = frameData.h;
                        }
                    } else if (a.frames > 1) {
                        // Simple grid fallback for projectiles
                        sw = a.image.width / a.frames;
                        sh = a.image.height;
                        sx = (a.frameX || 0) * sw;
                    }

                    this.ctx.drawImage(
                        a.image,
                        sx, sy, sw, sh,
                        -a.w / 2, -a.h / 2, a.w, a.h
                    );
                } else {
                    // Fallback Shape
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
                this.ctx.font = a.font || '16px sans-serif';
                this.ctx.fillStyle = a.color || 'white';
                this.ctx.strokeStyle = 'black';
                this.ctx.lineWidth = 2;
                this.ctx.strokeText(a.text, a.x, a.y);
                this.ctx.fillText(a.text, a.x, a.y);
            } else if (a.type === 'visual_projectile') {
                this.ctx.fillStyle = a.color;
                if (a.image && a.image.complete && a.image.naturalWidth !== 0) {
                    // Draw Sprite Projectile (Visual)
                    let sx, sy, sw, sh;
                    if (a.spriteFrames && a.spriteFrames.length > 0) {
                        const frameData = a.spriteFrames[a.frameX % a.spriteFrames.length];
                        sx = frameData.x;
                        sy = frameData.y;
                        sw = frameData.w;
                        sh = frameData.h;
                    } else {
                        sw = a.image.width / a.frames;
                        sh = a.image.height;
                        sx = a.frameX * sw;
                        sy = 0;
                    }

                    this.ctx.save();
                    if (a.blendMode) {
                        this.ctx.globalCompositeOperation = a.blendMode;
                    }
                    this.ctx.translate(a.x + a.w / 2, a.y + a.h / 2);
                    if (a.rotation) this.ctx.rotate(a.rotation);

                    if (a.filter) {
                        this.ctx.filter = a.filter;
                    }

                    // Maintain Aspect Ratio logic
                    let destW = a.w;
                    let destH = a.h;

                    if (a.scale) {
                        destW = sw * a.scale;
                        destH = sh * a.scale;
                    } else if (sw > 0 && sh > 0) {
                        const ratio = sw / sh;
                        // Attempt to fit width first
                        destW = a.w;
                        destH = destW / ratio;

                        // If height exceeds bounds, fit height
                        if (destH > a.h) {
                            destH = a.h;
                            destW = destH * ratio;
                        }
                    } else {
                        // Fallback logic
                        destW = Math.max(a.w, a.h);
                        destH = Math.min(a.w, a.h);
                    }

                    this.ctx.drawImage(
                        a.image,
                        sx, sy, sw, sh,
                        -destW / 2, -destH / 2, destW, destH
                    );
                    this.ctx.restore();
                }
                // Removed Fallback: Don't draw yellow square if loading or invalid.
            } else if (!a.type) {
                this.ctx.fillStyle = a.color || 'white';
                this.ctx.fillRect(Math.floor(a.x), Math.floor(a.y), a.w, a.h);
            }

            this.ctx.restore();
        });

        this.ctx.restore();

        // --- UI Space ---
        drawUI(this.ctx, this, this.width, this.height);
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

    triggerSkillSelection(skills) {
        this.isPaused = true;
        showSkillSelection(skills, (selectedSkill) => {
            this.handleSkillSelected(selectedSkill);
        });
    }

    handleSkillSelected(skillData) {
        this.isPaused = false;
        // Create the actual skill instance
        const skill = createSkill(skillData);
        if (skill) {
            const success = this.player.acquireSkill(skill);

            if (success) {
                console.log(`Selected skill: ${skill.name}`);

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
                    font: 'bold 16px sans-serif'
                });

                this.spawnParticles(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, 20, '#ffff00');
            } else {
                this.logToScreen(`${skill.name} は既に所持しています。`);
                this.player.addCurrency(50); // Refund/Compensation
            }
        }
    }

    loop(timestamp) {
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
                        // Exponential curve from 0.2 to 1.0: y = 0.2 * (5^x)
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
            while (this.accumulator >= activeStep) {
                this.update(activeStep);
                this.accumulator -= activeStep;
            }
        } else {
            // Time is stopped (0.0 scale)
            // Accumulator just holds pending time until scale increases
        }

        this.draw();
        this.input.update();
        requestAnimationFrame(this.loop);
    }
}

window.onload = () => {
    try {
        console.log("Starting Game Initialization...");
        const game = new Game();
        console.log("Game Initialized Successfully.");
    } catch (e) {
        console.error("Game Initialization Failed:", e);
    }
};

window.addEventListener('error', (e) => {
    console.error("Runtime Error:", e.message);
});
