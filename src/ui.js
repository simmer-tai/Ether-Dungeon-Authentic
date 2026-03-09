import { SaveManager } from './SaveManager.js';
import { SkillSelectionUI } from './ui/SkillSelectionUI.js';
import { LabUI } from './ui/LabUI.js';

let skillSlots = null;

export const getFormattedEffect = (chip, propName = 'nodeScaling', forcedValue = null) => {
    const value = forcedValue !== null ? forcedValue : chip.getScaledValue(propName);
    const type = chip.data.effectType;
    let text = '';
    const isPositive = value > 0;

    const isPercentage = type.endsWith('_mult') ||
        type === 'crit_rate_add' ||
        type === 'on_hit_damage_buff' ||
        type === 'training_kill_buff' ||
        type === 'berserker' ||
        type === 'inertia_scaling' ||
        type === 'ukemi_chance' ||
        type === 'crit_damage_add' ||
        type === 'acceleration_scaling' ||
        type === 'damage_random_range' ||
        propName === 'takenDamageScaling';

    if (isPercentage) {
        const percent = parseFloat((Math.abs(value * 100)).toFixed(2));
        const prefix = type === 'damage_random_range' ? '±' : (isPositive ? '+' : '-');
        text = `${prefix}${percent}%`;
    } else {
        const formattedValue = parseFloat(Math.abs(value).toFixed(2));
        text = `${isPositive ? '+' : '-'}${formattedValue}`;
    }

    // Determine color: Normally positive is good, negative is bad.
    // For specific properties like 'takenDamageScaling', positive is BAD (minus).
    let isGoodEffect = isPositive;
    if (propName === 'takenDamageScaling') {
        isGoodEffect = !isPositive; // Increase in damage taken is BAD.
    }

    const colorClass = isGoodEffect ? 'stat-plus' : 'stat-minus';
    return ` <span class="${colorClass}">${text}</span>`;
};


function initSkillSlots() {
    skillSlots = {
        normal: {
            el: document.getElementById('skill-normal'),
            icon: document.querySelector('#skill-normal .skill-icon'),
            fallback: document.querySelector('#skill-normal .skill-fallback-text'),
            overlay: document.querySelector('#skill-normal .cooldown-overlay'),
            text: document.querySelector('#skill-normal .cooldown-text'),
            stack: document.querySelector('#skill-normal .stack-count')
        },
        primary1: {
            el: document.getElementById('skill-primary1'),
            icon: document.querySelector('#skill-primary1 .skill-icon'),
            fallback: document.querySelector('#skill-primary1 .skill-fallback-text'),
            overlay: document.querySelector('#skill-primary1 .cooldown-overlay'),
            text: document.querySelector('#skill-primary1 .cooldown-text'),
            stack: document.querySelector('#skill-primary1 .stack-count')
        },
        primary2: {
            el: document.getElementById('skill-primary2'),
            icon: document.querySelector('#skill-primary2 .skill-icon'),
            fallback: document.querySelector('#skill-primary2 .skill-fallback-text'),
            overlay: document.querySelector('#skill-primary2 .cooldown-overlay'),
            text: document.querySelector('#skill-primary2 .cooldown-text'),
            stack: document.querySelector('#skill-primary2 .stack-count')
        },
        secondary: {
            el: document.getElementById('skill-secondary'),
            icon: document.querySelector('#skill-secondary .skill-icon'),
            fallback: document.querySelector('#skill-secondary .skill-fallback-text'),
            overlay: document.querySelector('#skill-secondary .cooldown-overlay'),
            text: document.querySelector('#skill-secondary .cooldown-text'),
            stack: document.querySelector('#skill-secondary .stack-count')
        },
        ultimate: {
            el: document.getElementById('skill-ultimate'),
            icon: document.querySelector('#skill-ultimate .skill-icon'),
            fallback: document.querySelector('#skill-ultimate .skill-fallback-text'),
            overlay: document.querySelector('#skill-ultimate .cooldown-overlay'),
            text: document.querySelector('#skill-ultimate .cooldown-text'),
            stack: document.querySelector('#skill-ultimate .stack-count')
        }
    };

    // Add click listeners to skill slots
    const keys = Object.keys(skillSlots);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const slot = skillSlots[key];
        if (slot && slot.el) {
            slot.el.style.cursor = 'pointer';
            slot.el.style.transition = 'transform 0.1s';

            // Add hover effect dynamically if CSS isn't present
            slot.el.addEventListener('mouseenter', () => slot.el.style.transform = 'scale(1.05)');
            slot.el.addEventListener('mouseleave', () => slot.el.style.transform = 'scale(1)');

            slot.el.addEventListener('click', () => {
                const game = window._gameInstance;
                if (game && !game.isGameOver && game.gameState === 'PLAYING') {
                    import('./ui/InventoryUI.js').then(({ InventoryUI }) => {
                        InventoryUI.openForSlot(key);
                    }).catch(err => console.error("Failed to load InventoryUI", err));
                }
            });
        }
    }
}

export function drawUI(ctx, game, width, height) {
    // ... (Game Over logic unchanged)
    if (game.isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.fillRect(0, 0, width, height);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 48px "Press Start 2P", cursive';
        ctx.fillText("GAME OVER", width / 2, height / 2 - 60);

        // Final Score
        ctx.fillStyle = 'white';
        ctx.font = '20px "Press Start 2P", cursive';
        ctx.fillText(`SCORE: ${Math.floor(game.score)}`, width / 2, height / 2 + 10);

        // New Record Highlight
        if (game.score >= game.highScore && game.score > 0) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 24px "Press Start 2P", cursive';
            ctx.fillText("NEW RECORD!", width / 2, height / 2 + 60);

            // Subtle pulsing glow
            const pulse = (Math.sin(Date.now() / 200) + 1) / 2;
            ctx.shadowBlur = 10 * pulse;
            ctx.shadowColor = '#ffd700';
        } else {
            ctx.fillStyle = '#aaa';
            ctx.font = '14px "Press Start 2P", cursive';
            ctx.fillText(`BEST: ${Math.floor(game.highScore)}`, width / 2, height / 2 + 50);
        }
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px "Press Start 2P", cursive';
        ctx.fillText("Press [SPACE] to Return to Title", width / 2, height / 2 + 120);

        ctx.textAlign = 'left'; // Reset for other UI elements
        return;
    }


    // Update Currency (Dungeon Coins and Persistent Shards/Fragments)
    updateResources(game.player.dungeonCoins, game.player.aetherShards, game.player.aetherFragments);

    // Update Aether Gauge
    updateAetherGauge(game.player.aetherGauge, game.player.maxAetherGauge);

    ctx.fillStyle = 'white';
    ctx.font = '16px sans-serif';
    // ctx.fillText(`Enemies: ${game.enemies.length}`, 10, 20);

    // Draw Version
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText("Last Push: 2026/03/09 18:05 (v1.2.4)", width - 10, height - 10);
    ctx.restore();


    if (!skillSlots) initSkillSlots();

    // --- HUD Visibility Management ---
    const uiLayerEl = document.getElementById('ui-layer');
    const skillBarEl = document.getElementById('skill-bar');
    const healthBarEl = document.getElementById('health-bar-container');
    const currencyDisplayEl = document.getElementById('currency-display');
    const scoreDisplayEl = document.getElementById('score-display');
    const floorDisplayEl = document.getElementById('floor-display');
    const settingsBtnEl = document.getElementById('settings-btn');

    if (!game.isHUDVisible) {
        if (uiLayerEl) {
            // We want to keep the UI layer for things like level up, but hide specific HUD elements
            if (skillBarEl) skillBarEl.style.display = 'none';
            if (healthBarEl) healthBarEl.style.display = 'none';
            if (currencyDisplayEl) currencyDisplayEl.style.display = 'none';
            if (scoreDisplayEl) scoreDisplayEl.style.display = 'none';
            if (floorDisplayEl) floorDisplayEl.style.display = 'none';
            if (settingsBtnEl) settingsBtnEl.style.display = 'none';
        }
        return; // Skip Canvas HUD drawing (Mini-map, etc)
    } else {
        if (skillBarEl) skillBarEl.style.display = 'flex';
        if (healthBarEl) healthBarEl.style.display = 'flex';
        if (currencyDisplayEl) currencyDisplayEl.style.display = 'flex';
        if (scoreDisplayEl) scoreDisplayEl.style.display = 'flex';
        if (floorDisplayEl) floorDisplayEl.style.display = 'flex';
        if (settingsBtnEl) settingsBtnEl.style.display = 'flex';
    }

    // Update Skill DOM UI
    for (let key in game.player.equippedSkills) {
        const skill = game.player.equippedSkills[key];
        const slot = skillSlots[key];

        if (slot) {
            if (!slot.icon) console.warn("UI Warning: Icon element missing for slot", key);

            if (skill) {
                // Update Icon
                // Update Icon with Fallback
                if (skill.icon) {
                    if (slot.lastIcon !== skill.icon) {
                        slot.lastIcon = skill.icon;
                        slot.icon.src = skill.icon;

                        // Reset handlers
                        slot.icon.onload = () => {
                            slot.icon.style.display = 'block';
                            slot.fallback.style.display = 'none';
                        };
                        slot.icon.onerror = () => {
                            slot.icon.style.display = 'none';
                            slot.fallback.textContent = skill.name;
                            slot.fallback.style.display = 'block';
                        };
                    }
                    // Note: If icon matches lastIcon, we assume state is managed by handlers
                } else {
                    if (slot.icon.style.display !== 'none') slot.icon.style.display = 'none';
                    if (slot.fallback.style.display !== 'block') {
                        slot.fallback.textContent = skill.name;
                        slot.fallback.style.display = 'block';
                    }
                }

                // Update Cooldown
                if (skill.currentCooldown > 0) {
                    const ratio = skill.currentCooldown / skill.cooldown;
                    slot.overlay.style.height = `${ratio * 100}%`;
                    slot.text.style.display = 'block';
                    slot.text.textContent = skill.currentCooldown.toFixed(1);
                    slot.el.classList.remove('active');
                } else {
                    slot.overlay.style.height = '0%';
                    slot.text.style.display = 'none';
                    slot.el.classList.add('active');
                }

                // Update Stacks
                if (skill.maxStacks > 1) {
                    slot.stack.textContent = skill.stacks;
                    slot.stack.style.display = 'block';
                } else {
                    slot.stack.style.display = 'none';
                }

                // Aether Rush Visuals for Ultimate
                if (key === 'ultimate') {
                    if (game.player.isAetherRush) {
                        slot.el.classList.add('aether-rush');
                    } else {
                        slot.el.classList.remove('aether-rush');
                    }
                }

            } else {
                slot.icon.style.display = 'none';
                slot.overlay.style.height = '0%';
                slot.text.style.display = 'none';
                slot.el.classList.remove('active');
                slot.stack.style.display = 'none';
            }
        }
    }

    // Update HP Bar
    const hpFill = document.getElementById('health-bar-fill');
    const hpText = document.getElementById('health-bar-text');
    const hpValue = document.getElementById('hp-value');
    const hpMax = document.getElementById('hp-max');
    if (hpFill && hpText && hpValue && hpMax) {
        const ratio = Math.min(1, Math.max(0, game.player.hp / game.player.maxHp));
        hpFill.style.width = `${ratio * 100}%`;
        hpValue.textContent = Math.ceil(game.player.hp);
        hpMax.textContent = Math.ceil(game.player.maxHp);
    }

    // Update Chip Cooldowns
    updateChipStatus(game);

    // Draw Mini-map
    drawMiniMap(ctx, game, width, height);
}

function updateChipStatus(game) {
    const bar = document.getElementById('chip-status-bar');
    if (!bar) return;

    const player = game.player;
    const activeChips = [];

    if (player.circuit) {
        const bonuses = player.circuit.getBonuses();

        // Enrage Chip
        if (bonuses.onHitDamageBuff > 0) {
            activeChips.push({
                id: 'enrage',
                icon: 'assets/ui/chips/icon_enrage.png',
                current: player.enrageCooldownTimer,
                max: bonuses.onHitDamageBuffCooldown,
                isActive: player.enrageTimer > 0,
                color: '#ff4400'
            });
        }

        // Training Chip
        if (bonuses.trainingKillBuff > 0) {
            const stacks = Math.min(100, player.killCount || 0);
            const totalBonus = bonuses.trainingKillBuff * stacks;
            activeChips.push({
                id: 'training',
                icon: 'assets/ui/chips/icon_combat_mastery.png',
                current: 0,
                max: 1,
                isActive: true, // Always show active state
                color: '#ffd700', // Gold color
                textOverride: `+${parseFloat((totalBonus * 100).toFixed(2))}%`
            });
        }

        // Inertia Chip
        if (bonuses.inertiaScaling > 0) {
            const speedBonus = bonuses.speedMult || 0;
            const speedPercent = speedBonus * 100;
            const totalBonus = speedPercent * bonuses.inertiaScaling;
            activeChips.push({
                id: 'inertia',
                icon: 'assets/ui/chips/icon_inertia.png',
                current: 0,
                max: 1,
                isActive: true,
                color: '#00ccff', // Cyan color
                textOverride: `+${parseFloat((totalBonus * 100).toFixed(2))}%`
            });
        }

        // Acceleration Chip
        if (bonuses.accelerationScaling > 0) {
            const currentBonus = player.currentAccelerationBonus || 0;
            activeChips.push({
                id: 'acceleration',
                icon: 'assets/ui/chips/icon_acceleration.png',
                current: 0,
                max: 1,
                isActive: currentBonus > 0,
                color: '#00ffff', // Bright cyan/aqua for speed
                textOverride: `+${parseFloat((currentBonus * 100).toFixed(2))}%`
            });
        }

        // Gambler Chip
        if (bonuses.damageRandomRange > 0) {
            activeChips.push({
                id: 'gambler',
                icon: 'assets/ui/chips/icon_gambler_dice.png',
                current: 0,
                max: 1,
                isActive: true, // Always show active range
                color: '#ff00ff', // Purple for unique
                textOverride: `±${(bonuses.damageRandomRange * 100).toFixed(0)}%`
            });
        }
    }

    // Sync DOM
    const currentIds = new Set(activeChips.map(c => c.id));
    const existingItems = bar.querySelectorAll('.chip-status-item');

    // Remove old ones
    existingItems.forEach(item => {
        if (!currentIds.has(item.dataset.id)) item.remove();
    });

    // Add/Update
    activeChips.forEach(data => {
        let item = bar.querySelector(`.chip-status-item[data-id="${data.id}"]`);
        if (!item) {
            item = document.createElement('div');
            item.className = 'chip-status-item';
            item.dataset.id = data.id;
            item.innerHTML = `
                <img src="${data.icon}" class="chip-status-icon">
                <div class="chip-status-cooldown"></div>
                <div class="chip-status-text"></div>
            `;
            item.onmouseenter = () => {
                const rect = item.getBoundingClientRect();
                let title = '';
                let desc = '';
                if (data.id === 'enrage') {
                    title = '逆上チップ';
                    desc = 'ダメージを受けた際、一定時間攻撃力が15%上昇する。';
                } else if (data.id === 'training') {
                    title = '鍛錬チップ';
                    desc = `敵を倒すたびに攻撃力が0.2%上昇する(最大100スタック)。\n現在の合計上昇量: ${data.textOverride || '0%'}`;
                } else if (data.id === 'inertia') {
                    title = '慣性チップ';
                    desc = `移動速度の上昇量に応じて、スキルダメージが上昇する。\n現在の合計上昇量: ${data.textOverride || '0%'}`;
                } else if (data.id === 'acceleration') {
                    title = '加速チップ';
                    desc = `移動を続けることで移動速度が上昇する。\n現在のボーナス: ${data.textOverride || '0%'}`;
                } else if (data.id === 'gambler') {
                    title = '一発逆転チップ';
                    desc = `与えるダメージがランダムに大幅に変動する。\n現在の変動幅: ${data.textOverride || '±0%'}`;
                }
                LabUI.showTooltip(null, rect.left + rect.width / 2, rect.top, title, desc);
            };
            item.onmouseleave = () => LabUI.hideTooltip();

            bar.appendChild(item);
        }

        const cdBar = item.querySelector('.chip-status-cooldown');
        const cdText = item.querySelector('.chip-status-text');

        // Reset text styling
        cdText.style.fontSize = '';
        cdText.style.color = '#ffffff'; // Always white as requested
        cdText.style.bottom = '';
        cdText.style.width = '';
        cdText.style.left = '';
        cdText.style.textAlign = '';
        cdText.style.textShadow = '';
        cdText.style.top = '';
        cdText.style.transform = '';

        if (data.isActive) {
            const color = '#ffffff';
            item.style.borderColor = color;
            item.style.boxShadow = `0 0 5px ${color}`;
            cdBar.style.height = '0%';

            if (data.textOverride) {
                cdText.textContent = data.textOverride;
                cdText.style.fontSize = '8px'; // Smaller text for percentages
                cdText.style.color = color;
                cdText.style.top = '50%';
                cdText.style.bottom = '';
                cdText.style.width = '200%';
                cdText.style.left = '50%';
                cdText.style.transform = 'translate(-50%, -50%)'; // Center perfectly over icon
                cdText.style.textAlign = 'center';
                cdText.style.textShadow = '2px 2px 2px black, -2px -2px 2px black, 2px -2px 2px black, -2px 2px 2px black';
            } else {
                cdText.textContent = '';
            }
            item.style.opacity = '1.0';
        } else if (data.current > 0) {
            item.style.borderColor = '#ffffff'; // White border (was #444)
            item.style.boxShadow = 'none';
            const ratio = data.current / data.max;
            cdBar.style.height = `${ratio * 100}%`;
            cdText.textContent = Math.ceil(data.current);
            item.style.opacity = '1.0';
        } else {
            // READY STATE
            item.style.borderColor = '#ffffff'; // White border (was #00ff00)
            item.style.boxShadow = '0 0 3px #ffffff';
            cdBar.style.height = '0%';
            cdText.textContent = '';
            item.style.opacity = '0.6'; // Slightly dim when waiting for trigger
        }
    });
}

function drawMiniMap(ctx, game, screenWidth, screenHeight) {
    const map = game.map;
    const player = game.player;

    // Mini-map configuration
    const mapSize = 280; // Doubled from 140
    const timerSize = 4; // Tile size in pixels (if fitted)

    // Calculate scale to fit in mapSize
    const scaleX = mapSize / map.width;
    const scaleY = mapSize / map.height;
    const scale = Math.min(scaleX, scaleY); // Maintain aspect ratio

    const mmW = map.width * scale;
    const mmH = map.height * scale;

    const mmX = screenWidth - mmW - 20; // 20px padding from right
    const mmY = 20; // 20px padding from top

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(mmX - 5, mmY - 5, mmW + 10, mmH + 10);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(mmX - 5, mmY - 5, mmW + 10, mmH + 10);

    // Draw Map Tiles
    for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
            const tile = map.tiles[y][x];

            // Check for Staircase
            let isStaircase = false;
            let isShop = false;
            let isBoss = false;
            // Check room grid for staircase type
            if (map.roomGrid && map.roomGrid[y] && map.roomGrid[y][x] !== -1) {
                const roomId = map.roomGrid[y][x];
                const room = map.rooms[roomId];
                if (room && room.type === 'staircase') {
                    const centerX = room.x + Math.floor(room.w / 2);
                    const centerY = room.y + Math.floor(room.h / 2);
                    // Highlight center 2x2
                    if ((x === centerX || x === centerX - 1) && (y === centerY || y === centerY - 1)) {
                        isStaircase = true;
                    }
                }
                if (room && room.type === 'shop') {
                    isShop = true;
                }
                if (room && room.type === 'boss') {
                    isBoss = true;
                }
            }

            if (isStaircase) {
                if (game.debugMode || map.exploredTiles[y][x]) {
                    ctx.fillStyle = '#00ffff'; // Cyan for stairs
                    ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                }
            } else if (isBoss && tile === 0) {
                if (game.debugMode || map.exploredTiles[y][x]) {
                    ctx.fillStyle = 'rgba(255, 0, 0, 0.4)'; // Red tint for boss room
                    ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                }
            } else if (isShop && tile === 0) {
                if (game.debugMode || map.exploredTiles[y][x]) {
                    ctx.fillStyle = 'rgba(255, 200, 0, 0.35)'; // Gold tint for shop floor
                    ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                }
            } else if (tile === 1) {
                // Wall
                if (game.debugMode || map.exploredTiles[y][x]) {
                    ctx.fillStyle = '#888';
                    ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                }
                // Floor - Do nothing (Transparent/Background)
            } else if (tile === 0) {
                // Floor
                if (game.debugMode || map.exploredTiles[y][x]) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; // Very subtle floor highlight?
                    ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                }
            }
        }
    }

    // Draw Statues
    if (game.statues) {
        ctx.fillStyle = '#ffffff'; // White for statues
        game.statues.forEach(statue => {
            const tx = Math.floor(statue.x / map.tileSize);
            const ty = Math.floor(statue.y / map.tileSize);
            if (!statue.used && (game.debugMode || map.exploredTiles[ty][tx])) {
                const sX = (statue.x / map.tileSize) * scale;
                const sY = (statue.y / map.tileSize) * scale;
                // Draw a small rect or circle
                ctx.fillRect(mmX + sX, mmY + sY, Math.max(2, scale), Math.max(2, scale));
            }
        });
    }

    // Draw Shop NPCs
    if (game.shopNPCs) {
        game.shopNPCs.forEach(npc => {
            const tx = Math.floor(npc.x / map.tileSize);
            const ty = Math.floor(npc.y / map.tileSize);
            if (game.debugMode || map.exploredTiles[ty][tx]) {
                const sX = (npc.x / map.tileSize) * scale;
                const sY = (npc.y / map.tileSize) * scale;
                ctx.fillStyle = '#ffd700';
                ctx.beginPath();
                ctx.arc(mmX + sX + scale / 2, mmY + sY + scale / 2, Math.max(3, scale * 1.5), 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    // Draw Player
    const pX = (player.x / map.tileSize) * scale;
    const pY = (player.y / map.tileSize) * scale;

    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(mmX + pX + (player.width / map.tileSize * scale) / 2, mmY + pY + (player.height / map.tileSize * scale) / 2, Math.max(2, scale), 0, Math.PI * 2);
    ctx.fill();
}

import { SkillRewardUI } from './ui/SkillRewardUI.js';

export function showSkillSelection(skills, onSelectCallback) {
    SkillRewardUI.show(skills, onSelectCallback);
}

export function hideSkillSelection() {
    SkillRewardUI.hide();
}

// --- Blessing Selection UI ---
const blessingModal = document.getElementById('blessing-selection-modal');
const blessingCardsContainer = document.getElementById('blessing-selection-cards');

export function showBlessingSelection(options, onSelectCallback, source = 'default') {
    if (!blessingModal || !blessingCardsContainer) return;

    // Set or Update Title
    const title = blessingModal.querySelector('h2');
    if (title) title.textContent = 'バフを選択';

    // Clear previous
    blessingCardsContainer.innerHTML = '';

    options.forEach(opt => {
        const card = document.createElement('div');
        let cardClass = 'blessing-card';
        if (source === 'angel') cardClass += ' angel-card';
        if (source === 'blood') cardClass += ' blood-card';
        card.className = cardClass;
        card.dataset.id = opt.id;

        // Description Only (Centered via CSS)
        const desc = document.createElement('div');
        desc.className = 'blessing-card-desc';
        desc.textContent = opt.description || opt.desc || '';
        card.appendChild(desc);

        // Click Handler
        card.addEventListener('click', () => {
            hideBlessingSelection();
            if (onSelectCallback) onSelectCallback(opt);
        });

        blessingCardsContainer.appendChild(card);
    });

    blessingModal.style.display = 'flex';
}

export function showAcquiredBlessing(blessing, onConfirmCallback, source = 'blood') {
    if (!blessingModal || !blessingCardsContainer) return;

    // Clear previous
    blessingCardsContainer.innerHTML = '';

    // Also remove any existing standalone acquire btn (from previous calls)
    const container = blessingModal.querySelector('.skill-selection-container');
    const existingBtn = container.querySelector('.acquire-btn-wrapper');
    if (existingBtn) existingBtn.remove();

    // Change Title temporarily
    const title = blessingModal.querySelector('h2');
    const originalTitle = title ? title.textContent : '女神の祝福';
    if (title) title.textContent = source === 'angel' ? '天使の加護を獲得！' : '血の祝福を獲得！';

    // Wrapper to stack name above card
    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';
    wrapper.style.gap = '20px';

    const card = document.createElement('div');
    card.className = source === 'angel'
        ? 'blessing-card acquired angel-card'
        : 'blessing-card acquired';
    card.style.cursor = 'default';

    // Name (Now placed OUTSIDE/ABOVE the card)
    const name = document.createElement('div');
    name.className = 'blessing-card-name acquired-title';
    name.textContent = blessing.name;
    name.style.color = source === 'angel' ? '#ffe066' : '#ff4444';
    name.style.fontSize = '32px';
    name.style.marginBottom = '0';
    wrapper.appendChild(name);

    // Description (Inside card, will be centered via CSS)
    const desc = document.createElement('div');
    desc.className = 'blessing-card-desc';
    desc.textContent = blessing.description || blessing.desc || '';
    card.appendChild(desc);

    wrapper.appendChild(card);
    blessingCardsContainer.appendChild(wrapper);

    // Acquire Button Wrapper (placed outside cards container)
    const btnWrapper = document.createElement('div');
    btnWrapper.className = 'acquire-btn-wrapper';
    btnWrapper.style.marginTop = '30px';
    btnWrapper.style.width = '100%';
    btnWrapper.style.display = 'flex';
    btnWrapper.style.justifyContent = 'center';

    const btn = document.createElement('button');
    btn.className = 'acquire-btn';
    btn.textContent = '獲得';
    btn.style.width = '200px'; // Fixed width when outside
    btn.addEventListener('click', () => {
        if (title) title.textContent = originalTitle;
        btnWrapper.remove();
        hideBlessingSelection();
        if (onConfirmCallback) onConfirmCallback();
    });
    btnWrapper.appendChild(btn);
    container.appendChild(btnWrapper);

    blessingModal.style.display = 'flex';
}

export function hideBlessingSelection() {
    if (blessingModal) {
        blessingModal.style.display = 'none';
        blessingCardsContainer.innerHTML = '';
    }
}

export function updateResources(coins, shards, fragments) {
    const goldEl = document.getElementById('gold-value');
    const shardEl = document.getElementById('shard-value');
    const fragmentEl = document.getElementById('fragment-value');
    if (goldEl) goldEl.textContent = Math.floor(coins);
    if (shardEl) shardEl.textContent = Math.floor(shards);
    if (fragmentEl) fragmentEl.textContent = Math.floor(fragments);
}


const dialogueOverlay = document.getElementById('dialogue-overlay');
const dialogueTextEl = document.getElementById('dialogue-text');

export function drawDialogue(game, text) {
    const overlay = document.getElementById('dialogue-overlay');
    const textEl = document.getElementById('dialogue-text');
    if (!overlay || !textEl) return;

    // Show Overlay
    if (overlay.style.display !== 'flex') {
        overlay.style.display = 'flex';
    }

    // Update Text (Avoid redundant updates to prevent flicker/cursor reset if any)
    const safeText = text || "";
    if (textEl.textContent !== safeText) {
        textEl.textContent = safeText;
    }
}

export function hideDialogue() {
    if (dialogueOverlay && dialogueOverlay.style.display !== 'none') {
        dialogueOverlay.style.display = 'none';
        hideChoices(); // Ensure choices are hidden too

        const prompt = document.getElementById('dialogue-prompt');
        if (prompt) prompt.style.display = 'block';
    }
}

const choicesContainer = document.getElementById('dialogue-choices-container');

export function showChoices(options, onSelectCallback) {
    if (!choicesContainer) return;

    const prompt = document.getElementById('dialogue-prompt');
    if (prompt) prompt.style.display = 'none';

    choicesContainer.innerHTML = ''; // Clear previous
    choicesContainer.style.display = 'flex';

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'dialogue-choice-btn';
        btn.textContent = opt.name;
        btn.addEventListener('click', () => {
            hideChoices();
            if (onSelectCallback) onSelectCallback(opt);
        });
        choicesContainer.appendChild(btn);
    });
}

export function hideChoices() {
    if (choicesContainer) {
        choicesContainer.innerHTML = '';
        choicesContainer.style.display = 'none';
    }
}

// --- Settings UI ---
let _settingsInitialized = false;

export function initSettingsUI(game) {
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnTraining = document.getElementById('btn-training');
    const cheatContainer = document.getElementById('cheat-menu-container');

    if (cheatContainer) {
        cheatContainer.style.display = game.debugMode ? 'block' : 'none';
    }

    const btnReset = document.getElementById('btn-reset-data');
    if (btnReset) {
        btnReset.onclick = () => {
            if (confirm('全てのセーブデータ（所持チップ、強化状況、ハイスコアなど）を完全に消去しますか？\nこの操作は取り消せません。')) {
                if (confirm('本当に初期化してもよろしいですか？')) {
                    SaveManager.clearData();
                    window.location.reload();
                }
            }
        };
    }

    if (!_settingsInitialized) {
        _settingsInitialized = true;

        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'flex';
                    game.isPaused = true;

                    // Refresh cheat menu visibility
                    if (cheatContainer) {
                        cheatContainer.style.display = game.debugMode ? 'block' : 'none';
                    }

                    // Update invincible button text when opening
                    const invBtn = document.getElementById('btn-cheat-invincible');
                    if (invBtn && game.player) {
                        invBtn.textContent = `無敵: ${game.player.isCheatInvincible ? 'ON' : 'OFF'}`;
                    }
                }
            });
        }

        if (btnCloseSettings) {
            btnCloseSettings.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            });
        }

        if (btnTraining) {
            btnTraining.addEventListener('click', () => {
                if (settingsModal) {
                    settingsModal.style.display = 'none';
                    game.isPaused = false;
                    game.enterTrainingMode();
                }
            });
        }

        // Cheat Button Listeners
        const btnTeleportGolem = document.getElementById('btn-cheat-teleport-golem');
        if (btnTeleportGolem) {
            btnTeleportGolem.onclick = () => {
                const bossRoom = game.map.rooms.find(r => r.type === 'boss');
                if (bossRoom && game.player) {
                    game.bossOverride = 'golem';
                    game.player.x = (bossRoom.x + bossRoom.w / 2) * game.map.tileSize;
                    game.player.y = (bossRoom.y + bossRoom.h / 2) * game.map.tileSize;
                    if (settingsModal) settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            };
        }

        const btnTeleportPrime = document.getElementById('btn-cheat-teleport-prime');
        if (btnTeleportPrime) {
            btnTeleportPrime.onclick = () => {
                const bossRoom = game.map.rooms.find(r => r.type === 'boss');
                if (bossRoom && game.player) {
                    game.bossOverride = 'prime';
                    game.player.x = (bossRoom.x + bossRoom.w / 2) * game.map.tileSize;
                    game.player.y = (bossRoom.y + bossRoom.h / 2) * game.map.tileSize;
                    if (settingsModal) settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            };
        }

        const btnTeleportPortal = document.getElementById('btn-cheat-teleport-portal');
        if (btnTeleportPortal) {
            btnTeleportPortal.onclick = () => {
                const portalRoom = game.map.rooms.find(r => r.type === 'staircase');
                if (portalRoom && game.player) {
                    game.player.x = (portalRoom.x + portalRoom.w / 2) * game.map.tileSize;
                    game.player.y = (portalRoom.y + portalRoom.h / 2) * game.map.tileSize;
                    if (settingsModal) settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            };
        }

        const btnTeleportStatue = document.getElementById('btn-cheat-teleport-statue');
        if (btnTeleportStatue) {
            btnTeleportStatue.onclick = () => {
                const room = game.map.rooms.find(r => r.type === 'statue');
                if (room && game.player) {
                    game.player.x = (room.x + room.w / 2) * game.map.tileSize;
                    game.player.y = (room.y + room.h / 2) * game.map.tileSize;
                    if (settingsModal) settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            };
        }

        const btnTeleportAltar = document.getElementById('btn-cheat-teleport-altar');
        if (btnTeleportAltar) {
            btnTeleportAltar.onclick = () => {
                const room = game.map.rooms.find(r => r.type === 'altar');
                if (room && game.player) {
                    game.player.x = (room.x + room.w / 2) * game.map.tileSize;
                    game.player.y = (room.y + room.h / 2) * game.map.tileSize;
                    if (settingsModal) settingsModal.style.display = 'none';
                    game.isPaused = false;
                }
            };
        }

        const btnInvincible = document.getElementById('btn-cheat-invincible');
        if (btnInvincible) {
            btnInvincible.onclick = () => {
                if (game.player) {
                    game.player.isCheatInvincible = !game.player.isCheatInvincible;
                    btnInvincible.textContent = `無敵: ${game.player.isCheatInvincible ? 'ON' : 'OFF'}`;
                }
            };
        }

        const btnForcedChest = document.getElementById('btn-cheat-forced-chest');
        if (btnForcedChest) {
            btnForcedChest.onclick = () => {
                game.cheatForcedChest();
                if (settingsModal) settingsModal.style.display = 'none';
            };
        }
    }
}

// --- Ranking UI ---
const rankingModal = document.getElementById('ranking-modal');
const rankingList = document.getElementById('ranking-list');
const btnOpenRanking = document.getElementById('btn-open-ranking');
const btnCloseRanking = document.getElementById('btn-close-ranking');

const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input');
const btnSubmitNickname = document.getElementById('btn-submit-nickname');
const btnCancelNickname = document.getElementById('btn-cancel-nickname');

let _rankingInitialized = false;

export function initRankingUI(game) {
    if (!_rankingInitialized) {
        _rankingInitialized = true;

        if (btnOpenRanking) {
            btnOpenRanking.addEventListener('click', () => {
                showRanking();
            });
        }

        if (btnCloseRanking) {
            btnCloseRanking.addEventListener('click', () => {
                hideRanking();
            });
        }
    }
}

export async function showRanking() {
    if (!rankingModal || !rankingList) return;

    rankingModal.style.display = 'flex';
    rankingList.innerHTML = '<div class="loading-spinner">通信中...</div>';

    try {
        const rankings = await fetchTopRankings(10);
        rankingList.innerHTML = '';

        if (rankings.length === 0) {
            rankingList.innerHTML = '<div class="loading-spinner">データがありません</div>';
            return;
        }

        rankings.forEach((data, index) => {
            const item = document.createElement('div');
            item.className = 'ranking-item';
            item.innerHTML = `
                <span class="rank-num">#${index + 1}</span>
                <span class="rank-name">${data.name || 'ななし'}</span>
                <span class="rank-score">${Math.floor(data.score).toLocaleString()}</span>
            `;
            rankingList.appendChild(item);
        });
    } catch (error) {
        rankingList.innerHTML = '<div class="loading-spinner">読み込みに失敗しました</div>';
    }
}

export function hideRanking() {
    if (rankingModal) rankingModal.style.display = 'none';
}

export function showNicknameInput(onSubmit, onCancel) {
    if (!nicknameModal || !nicknameInput) return;

    nicknameModal.style.display = 'flex';
    nicknameInput.value = localStorage.getItem('last_nickname') || '';
    nicknameInput.focus();

    // Reset listeners
    btnSubmitNickname.onclick = () => {
        const name = nicknameInput.value.trim();
        if (name) {
            localStorage.setItem('last_nickname', name);
            hideNicknameInput();
            if (onSubmit) onSubmit(name);
        } else {
            nicknameInput.style.borderColor = 'red';
        }
    };

    btnCancelNickname.onclick = () => {
        hideNicknameInput();
        if (onCancel) onCancel();
    };
}

export function hideNicknameInput() {
    if (nicknameModal) nicknameModal.style.display = 'none';
}

let aetherFill = null;
function updateAetherGauge(current, max) {
    if (!aetherFill) aetherFill = document.getElementById('aether-gauge-fill');
    if (aetherFill) {
        const pct = Math.min(100, Math.max(0, (current / max) * 100));
        aetherFill.style.width = `${pct}%`;

        // Optional: Change color if full? (CSS handles gradient)
        if (pct >= 100) {
            aetherFill.style.boxShadow = "0 0 15px #00ffff";
        } else {
            aetherFill.style.boxShadow = "0 0 5px #00aaff";
        }
    }
}



// --- Stage Settings UI ---
export function showStageSettings(game, skills, onStartCallback, onBackCallback) {
    SkillSelectionUI.show(game, skills, onStartCallback, onBackCallback);
}

export function hideStageSettings() {
    SkillSelectionUI.hide();
}
