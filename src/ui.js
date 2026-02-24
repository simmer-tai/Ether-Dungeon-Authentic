let skillSlots = null;

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
}

export function drawUI(ctx, game, width, height) {
    // ... (Game Over logic unchanged)
    if (game.isGameOver) {
        // ...
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = 'red';
        ctx.font = '40px Arial';
        ctx.fillText("ゲームオーバー", width / 2 - 100, height / 2);
        ctx.fillStyle = 'white';
        ctx.font = '20px Arial';
        ctx.fillText("スペースキーでリスタート", width / 2 - 140, height / 2 + 40);
        return;
    }

    // Update Currency
    updateCurrency(game.player.currency);

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
    ctx.fillText("v0.6.0 (Pro)", width - 10, height - 10);
    ctx.restore();


    if (!skillSlots) initSkillSlots();

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

    // Draw Mini-map
    drawMiniMap(ctx, game, width, height);
}

function drawMiniMap(ctx, game, screenWidth, screenHeight) {
    const map = game.map;
    const player = game.player;

    // Mini-map configuration
    const mapSize = 200; // Max width/height in pixels
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
            }

            if (isStaircase) {
                ctx.fillStyle = '#00ffff'; // Cyan for stairs
                ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
            } else if (isShop && tile === 0) {
                ctx.fillStyle = 'rgba(255, 200, 0, 0.35)'; // Gold tint for shop floor
                ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
            } else if (tile === 1) {
                // Wall
                ctx.fillStyle = '#888';
                ctx.fillRect(mmX + x * scale, mmY + y * scale, scale, scale);
                // Floor - Do nothing (Transparent/Background)
            }
        }
    }

    // Draw Statues
    if (game.statues) {
        ctx.fillStyle = '#ffffff'; // White for statues
        game.statues.forEach(statue => {
            if (!statue.used) {
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
            const sX = (npc.x / map.tileSize) * scale;
            const sY = (npc.y / map.tileSize) * scale;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(mmX + sX + scale / 2, mmY + sY + scale / 2, Math.max(3, scale * 1.5), 0, Math.PI * 2);
            ctx.fill();
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

// --- Skill Selection UI ---
const skillModal = document.getElementById('skill-selection-modal');
const skillCardsContainer = document.getElementById('skill-selection-cards');

export function showSkillSelection(skills, onSelectCallback) {
    if (!skillModal || !skillCardsContainer) return;

    // Clear previous
    skillCardsContainer.innerHTML = '';

    skills.forEach(skill => {
        const card = document.createElement('div');
        card.className = 'skill-card';
        card.dataset.type = skill.type; // for styling

        // Icon
        const icon = document.createElement('img');
        icon.className = 'skill-card-icon';
        icon.src = skill.icon || 'assets/icon_unknown.png'; // Fallback? based on type?
        icon.onerror = () => { icon.style.display = 'none'; }; // Hide if missing
        card.appendChild(icon);

        // Name
        const name = document.createElement('div');
        name.className = 'skill-card-name';
        name.textContent = skill.name;
        card.appendChild(name);

        // Type
        const type = document.createElement('div');
        type.className = 'skill-card-type';
        // Translate type or capitalize
        const typeMap = {
            normal: '通常スキル',
            primary: 'メインスキル',
            secondary: 'サブスキル',
            ultimate: 'アルティメット'
        };
        type.textContent = typeMap[skill.type] || skill.type.toUpperCase();
        card.appendChild(type);

        // Description
        const desc = document.createElement('div');
        desc.className = 'skill-card-desc';
        desc.textContent = skill.description || '説明がありません。';
        card.appendChild(desc);

        // Click Handler
        card.addEventListener('click', () => {
            hideSkillSelection();
            if (onSelectCallback) onSelectCallback(skill);
        });

        skillCardsContainer.appendChild(card);
    });

    skillModal.style.display = 'flex';
}

export function hideSkillSelection() {
    if (skillModal) {
        skillModal.style.display = 'none';
        skillCardsContainer.innerHTML = ''; // Cleanup
    }
}

// --- Blessing Selection UI ---
const blessingModal = document.getElementById('blessing-selection-modal');
const blessingCardsContainer = document.getElementById('blessing-selection-cards');

export function showBlessingSelection(options, onSelectCallback, source = 'default') {
    if (!blessingModal || !blessingCardsContainer) return;

    // Clear previous
    blessingCardsContainer.innerHTML = '';

    options.forEach(opt => {
        const card = document.createElement('div');
        card.className = source === 'angel' ? 'blessing-card angel-card' : 'blessing-card';
        card.dataset.id = opt.id;

        // Name
        const name = document.createElement('div');
        name.className = 'blessing-card-name';
        name.textContent = opt.name;
        // Center the name explicitly since icon is gone
        name.style.marginTop = '20px';
        card.appendChild(name);

        // Description
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

export function updateCurrency(amount) {
    const el = document.getElementById('currency-value');
    if (el) {
        el.textContent = amount;
    }
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
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const btnTraining = document.getElementById('btn-training');

export function initSettingsUI(game) {
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            game.isPaused = true;
        });
    }

    if (btnCloseSettings) {
        btnCloseSettings.addEventListener('click', () => {
            settingsModal.style.display = 'none';
            game.isPaused = false;
        });
    }

    if (btnTraining) {
        btnTraining.addEventListener('click', () => {
            settingsModal.style.display = 'none';
            game.isPaused = false;
            game.enterTrainingMode();
        });
    }
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

// --- Shop UI ---
const RARITY_BADGE = {
    common: { label: 'コモン', color: '#aaaaaa' },
    rare: { label: 'レア', color: '#4488ff' },
    epic: { label: 'エピック', color: '#cc44ff' }
};

export function showShopUI(items, onBuyCallback, onCloseCallback) {
    const modal = document.getElementById('shop-modal');
    const cardsEl = document.getElementById('shop-cards');
    if (!modal || !cardsEl) return;

    const game = window._gameInstance;
    const currency = game ? game.player.currency : 0;

    cardsEl.innerHTML = '';

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'shop-card' + (item.sold ? ' shop-card-sold' : '');

        // Rarity badge
        const badge = document.createElement('div');
        badge.className = 'shop-rarity-badge';
        const r = RARITY_BADGE[item.rarity] || RARITY_BADGE.common;
        badge.textContent = r.label;
        badge.style.background = r.color;
        card.appendChild(badge);

        // Name
        const name = document.createElement('div');
        name.className = 'shop-item-name';
        name.textContent = item.name;
        card.appendChild(name);

        // Description
        const desc = document.createElement('div');
        desc.className = 'shop-item-desc';
        desc.textContent = item.description || '';
        card.appendChild(desc);

        // Price
        const priceRow = document.createElement('div');
        priceRow.className = 'shop-price-row';
        priceRow.innerHTML = `<span class="shop-price-icon">◈</span><span class="shop-price-value">${item.price}</span>`;
        card.appendChild(priceRow);

        // Buy button
        const btn = document.createElement('button');
        btn.className = 'shop-buy-btn';
        if (item.sold) {
            btn.textContent = '売り切れ';
            btn.disabled = true;
            btn.classList.add('shop-buy-btn-disabled');
        } else if (currency < item.price) {
            btn.textContent = 'シャード不足';
            btn.disabled = true;
            btn.classList.add('shop-buy-btn-disabled');
        } else {
            btn.textContent = '購入';
            btn.addEventListener('click', () => {
                if (onBuyCallback) onBuyCallback(item);
            });
        }
        card.appendChild(btn);

        cardsEl.appendChild(card);
    });

    modal.style.display = 'flex';
}

export function hideShopUI() {
    const modal = document.getElementById('shop-modal');
    if (modal) modal.style.display = 'none';
}

