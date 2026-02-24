
let selectedSkill = null;
let activeTab = 'all';
let _inventoryInitialized = false; // Guard against duplicate listener registration

export function resetInventorySelection() {
    selectedSkill = null;
}

export function initInventory(game) {
    // Prevent duplicate event listener registration on floor transitions
    if (_inventoryInitialized) return;
    _inventoryInitialized = true;

    const invScreen = document.getElementById('inventory-screen');
    const closeBtn = document.getElementById('close-inventory');

    closeBtn.addEventListener('click', () => {
        game.showInventory = false;
        invScreen.style.display = 'none';
    });

    // Equipped Slot Clicks
    document.querySelectorAll('.equip-slot').forEach(slot => {
        slot.addEventListener('click', () => {
            const type = slot.dataset.type;
            if (selectedSkill) {
                // Check if type matches
                // Special case for Primary: selectedSkill.type 'primary' can go into 'primary1' or 'primary2'
                let allowed = false;
                if (type === 'primary1' || type === 'primary2') {
                    if (selectedSkill.type === 'primary') allowed = true;
                } else {
                    if (selectedSkill.type === type) allowed = true;
                }

                if (allowed) {
                    // Equip logic via player method
                    game.player.equipSkill(selectedSkill, type);
                    renderInventory(game); // Re-render to show updates
                    selectedSkill = null; // Deselect
                } else {
                    // Feedback for mismatch
                    slot.classList.add('error');
                    setTimeout(() => slot.classList.remove('error'), 400);
                }
            } else {
                // Determine if we want to unequip? Or just select equipped?
                // For now, do nothing if nothing selected.
            }
        });
    });
    // --- Settings UI Injection ---
    // Settings Button
    let settingsBtn = document.getElementById('settings-btn');
    if (!settingsBtn) {
        settingsBtn = document.createElement('button');
        settingsBtn.id = 'settings-btn';
        settingsBtn.textContent = '⚙️';
        settingsBtn.style.cssText = `
            position: absolute;
            top: 15px;
            right: 15px;
            background: none;
            border: none;
            color: #666;
            font-size: 24px;
            cursor: pointer;
            z-index: 1002;
        `;
        settingsBtn.onmouseover = () => settingsBtn.style.color = '#fff';
        settingsBtn.onmouseout = () => settingsBtn.style.color = '#666';
        invScreen.querySelector('.inventory-container').appendChild(settingsBtn);

        settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.style.display = 'flex';
        });
    }

    // Settings Modal
    let settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) {
        settingsModal = document.createElement('div');
        settingsModal.id = 'settings-modal';
        settingsModal.style.cssText = `
            display: none;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            justify-content: center;
            align-items: center;
            z-index: 2000;
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: #2a2a2a;
            padding: 20px;
            border-radius: 8px;
            border: 2px solid #444;
            width: 300px;
            color: white;
            font-family: sans-serif;
        `;
        content.innerHTML = `
            <h3 style="margin-top:0; border-bottom:1px solid #444; padding-bottom:10px;">設定</h3>
            <div style="margin: 20px 0; display:flex; align-items:center; justify-content:space-between;">
                <span>デバッグ情報の表示</span>
                <input type="checkbox" id="debug-toggle">
            </div>
            <div style="text-align:right; margin-top:20px;">
                <button id="close-settings" style="
                    background: #444; border:none; color:white; 
                    padding: 8px 16px; border-radius:4px; cursor:pointer;
                ">閉じる</button>
            </div>
        `;
        settingsModal.appendChild(content);
        document.body.appendChild(settingsModal);

        // Bind Events
        const closeSettings = content.querySelector('#close-settings');
        closeSettings.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });

        const debugToggle = content.querySelector('#debug-toggle');

        // Sync Initial State (needs game ref, handled below in render? or just check global if available, but passing 'game' is safer)
        // Since init is run once, we need to bind event to update 'game'.
        // BUT 'game' is passed to initInventory!

        debugToggle.addEventListener('change', (e) => {
            game.debugMode = e.target.checked;
        });

        // Expose update function to sync checkbox when opening
        settingsBtn.addEventListener('click', () => {
            debugToggle.checked = game.debugMode;
        });
    }

    // Bind Tab Events (once)
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        // Remove old listeners? No easy way, but init is called once.
        // Assuming initInventory is called only once per game load.
        tab.addEventListener('click', () => {
            activeTab = tab.dataset.filter;
            renderInventory(game);
        });
    });
}

export function renderInventory(game) {
    const invScreen = document.getElementById('inventory-screen');
    if (!game.showInventory) {
        invScreen.style.display = 'none';
        return;
    }
    invScreen.style.display = 'flex';

    // Update Equipped
    for (let key in game.player.equippedSkills) {
        const skill = game.player.equippedSkills[key];
        const el = document.getElementById(`equip-${key}`);
        if (!el) continue; // Safety
        const slot = el.parentElement; // .equip-slot
        const icon = slot.querySelector('.skill-icon');

        if (skill) {
            el.textContent = skill.name;
            el.style.color = '#fff';
            if (skill.icon) {
                icon.src = skill.icon;
                icon.style.display = 'inline-block';
            } else {
                icon.style.display = 'none';
            }
        } else {
            el.textContent = "空き";
            el.style.color = '#888';
            if (icon) icon.style.display = 'none';
        }
    }

    // Update Backpack
    const grid = document.getElementById('backpack-grid');
    grid.innerHTML = '';

    // Update Tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.filter === activeTab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update Detail Panel
    updateDetailPanel(selectedSkill);

    game.player.inventory.forEach(skill => {
        // Filter by Tab
        if (activeTab !== 'all' && skill.type !== activeTab) return;

        const item = document.createElement('div');
        item.className = 'inventory-item';

        const img = document.createElement('img');
        img.className = 'skill-icon';

        const fallback = document.createElement('div');
        fallback.className = 'skill-fallback-text';
        fallback.textContent = skill.name;
        fallback.style.display = 'none';

        if (skill.icon) {
            img.src = skill.icon;
            img.onerror = () => {
                img.style.display = 'none';
                fallback.style.display = 'block';
            };
            img.onload = () => {
                img.style.display = 'block';
                fallback.style.display = 'none';
            };
        } else {
            img.style.display = 'none';
            fallback.style.display = 'block';
        }

        item.appendChild(img);
        item.appendChild(fallback);

        if (selectedSkill === skill) {
            item.classList.add('selected');
        }

        item.addEventListener('click', () => {
            selectedSkill = skill;
            renderInventory(game); // Re-render to show selection
        });

        grid.appendChild(item);
    });

    // Highlight equippable slots based on selected skill
    highlightEquippableSlots(selectedSkill);
}

function highlightEquippableSlots(skill) {
    document.querySelectorAll('.equip-slot').forEach(slot => {
        slot.classList.remove('can-equip');
    });
    if (!skill) return;

    document.querySelectorAll('.equip-slot').forEach(slot => {
        const type = slot.dataset.type;
        const isPrimary = type === 'primary1' || type === 'primary2';
        const matches = isPrimary ? skill.type === 'primary' : skill.type === type;
        if (matches) slot.classList.add('can-equip');
    });
}

function updateDetailPanel(skill) {
    const nameEl = document.getElementById('detail-name');
    const infoEl = document.getElementById('detail-info');
    const descEl = document.getElementById('detail-desc');

    if (!skill) {
        nameEl.textContent = 'スキルを選択してください';
        infoEl.innerHTML = '';
        descEl.textContent = '';
        return;
    }

    nameEl.textContent = skill.name;

    const typeMap = {
        'normal': '通常',
        'primary': 'メイン',
        'secondary': 'サブ',
        'ultimate': '必殺技'
    };

    let infoHtml = `タイプ: ${typeMap[skill.type] || skill.type}<br>`;
    infoHtml += `クールダウン: ${skill.cooldown}秒<br>`;

    const p = skill.params;
    if (p) {
        if (p.damage != null)
            infoHtml += `基礎ダメージ: <b>${p.damage}</b><br>`;
        if (p.critChance != null)
            infoHtml += `クリティカル率: <b>${Math.round(p.critChance * 100)}%</b><br>`;
        if (p.critMultiplier != null)
            infoHtml += `クリティカル倍率: <b>×${p.critMultiplier.toFixed(1)}</b><br>`;
        if (p.statusEffect != null) {
            const chance = p.statusChance != null ? ` (${Math.round(p.statusChance * 100)}%)` : '';
            const effectMap = { burn: '燃焼', bleed: '出血', slow: '鈍足' };
            infoHtml += `状態異常: <b>${effectMap[p.statusEffect] || p.statusEffect}${chance}</b><br>`;
        }
    }

    infoEl.innerHTML = infoHtml;
    descEl.textContent = skill.description || '説明がありません。';

    // Aether Rush description (ultimates only)
    let rushEl = document.getElementById('detail-aether-rush');
    if (!rushEl) {
        rushEl = document.createElement('div');
        rushEl.id = 'detail-aether-rush';
        rushEl.style.cssText = 'margin-top:8px;font-size:13px;color:#a0e8ff;line-height:1.5;';
        document.getElementById('skill-detail-panel').appendChild(rushEl);
    }
    if (skill.type === 'ultimate' && skill.aetherRushDesc) {
        rushEl.innerHTML = `<span style="color:#00ccff;font-weight:bold;">エーテルラッシュ時</span><br>${skill.aetherRushDesc}`;
        rushEl.style.display = 'block';
    } else {
        rushEl.style.display = 'none';
    }
}
