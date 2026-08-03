// app.js の一番上
const appState = {
  characters: [],
  playerName: 'プレイヤー1',
  p1Team: [],
  p2Team: [],
  p1Formations: {},
  p2Formations: {},
  p1Name: '1P チーム',
  p2Name: '2P チーム',
  roomId: null,
  isHost: false
};

let localPlayerName = localStorage.getItem('ai_arena_player_name') || '';
let globalSharedCharacters = [];
let selectedSkillData = null;
let selectedEditSkillData = null;
let _teamSelectTarget = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!localPlayerName) {
    document.getElementById('start-modal').style.display = 'flex';
  } else {
    document.getElementById('start-modal').style.display = 'none';
    updatePlayerNameUI(localPlayerName);
  }

  document.getElementById('start-game-btn').addEventListener('click', saveInitialName);

  setupStatSync('', false);
  setupStatSync('edit-', true);

  loadApiKey();

  if (typeof renderTeamSlots === 'function') renderTeamSlots();
});

function saveInitialName() {
  const input = document.getElementById('start-player-name').value.trim();
  if (!input) return alert('名前を入力してください！');
  localPlayerName = input;
  localStorage.setItem('ai_arena_player_name', localPlayerName);
  updatePlayerNameUI(localPlayerName);
  document.getElementById('start-modal').style.display = 'none';
}

function updatePlayerNameUI(name) {
  appState.playerName = name;
  localPlayerName = name;
  const badge = document.getElementById('header-user-display');
  if (badge) badge.textContent = `👤 ${name}`;
}

/* ===================================================
   タブ切り替え（サイドバー廃止・設定タブ独立）
   =================================================== */
function switchTab(tabId, event) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(`tab-${tabId}`).classList.add('active');
  if (event) event.target.classList.add('active');

  if (typeof playSE === 'function') playSE('click');

  if (tabId === 'create' && typeof renderRoleSelector === 'function') renderRoleSelector('');
  if (tabId === 'create' && typeof renderTagChips === 'function') renderTagChips();
  if (tabId === 'gallery' && typeof renderTagChips === 'function') renderTagChips();
  if (tabId === 'battle' && typeof renderTeamSlots === 'function') renderTeamSlots();
  if (tabId === 'settings') {
    if (typeof ProfileManager !== 'undefined' && ProfileManager.renderProfileList) {
      ProfileManager.renderProfileList();
    }
    if (typeof loadApiKeySettings === 'function') loadApiKeySettings();
    if (typeof initSoundSettings === 'function') initSoundSettings();
    if (typeof renderMyRoomList === 'function') renderMyRoomList();
  }
}

/* ===================================================
   ステータス配分連動
   =================================================== */
function setupStatSync(prefix = '', isEdit = false) {
  const stats = ['hp', 'atk', 'def', 'eva'];
  const baseTotal = 200;

  const getSkillCost = () => {
    if (isEdit && selectedEditSkillData) return selectedEditSkillData.cost || 0;
    if (!isEdit && selectedSkillData) return selectedSkillData.cost || 0;
    return 0;
  };

  const update = (changedStat) => {
    const maxTotal = baseTotal - getSkillCost();
    let currentValues = {};
    let currentSum = 0;

    stats.forEach(s => {
      const numInput = document.getElementById(`${prefix}num-stat-${s}`);
      let val = parseInt(numInput?.value) || 0;
      if (val < 0) val = 0;
      currentValues[s] = val;
      currentSum += val;
    });

    if (currentSum > maxTotal && changedStat) {
      const over = currentSum - maxTotal;
      currentValues[changedStat] = Math.max(0, currentValues[changedStat] - over);
      currentSum = maxTotal;
    }

    stats.forEach(s => {
      const slider = document.getElementById(`${prefix}stat-${s}`);
      const numInput = document.getElementById(`${prefix}num-stat-${s}`);
      if (slider) { slider.value = currentValues[s]; slider.max = maxTotal; }
      if (numInput) numInput.value = currentValues[s];
    });

    const remaining = maxTotal - currentSum;
    const remEl = document.getElementById(`${prefix}remaining-points`);
    if (remEl) {
      remEl.textContent = remaining;
      remEl.style.color = remaining < 0 ? '#ef4444' : '#34d399';
    }

    const hpVal = currentValues['hp'] * 5;
    const hpEl = document.getElementById(`${prefix}val-hp`);
    const atkEl = document.getElementById(`${prefix}val-atk`);
    const defEl = document.getElementById(`${prefix}val-def`);
    const evaEl = document.getElementById(`${prefix}val-eva`);

    if (hpEl) hpEl.textContent = `${hpVal} HP (${currentValues['hp']} pt)`;

    const roleEl = document.getElementById(`${prefix}char-role`);
    const roleKey = roleEl ? roleEl.value : 'melee';
    if (atkEl) atkEl.textContent = roleKey === 'healer' ? `${currentValues['atk']} pt (回復力)` : `${currentValues['atk']} pt`;
    if (defEl) defEl.textContent = `${currentValues['def']} pt`;

    const spdPt = currentValues['eva'];
    const evaRate = Math.min(30, Math.floor(spdPt * 0.2));
    if (evaEl) evaEl.textContent = `SPD:${spdPt}pt / 回避:${evaRate}%`;
  };

  stats.forEach(s => {
    const slider = document.getElementById(`${prefix}stat-${s}`);
    const numInput = document.getElementById(`${prefix}num-stat-${s}`);

    if (slider) {
      slider.addEventListener('input', () => {
        if (numInput) numInput.value = slider.value;
        update(s);
      });
    }
    if (numInput) {
      numInput.addEventListener('input', () => {
        if (slider) slider.value = numInput.value;
        update(s);
      });
    }
  });

  update();
}

/* ===================================================
   キャラ作成・編集処理
   =================================================== */
function handleUpdateCharacter(e) {
  if (e && e.preventDefault) e.preventDefault();

  const characterId = document.getElementById('edit-char-id')?.value;
  if (!characterId) { alert('編集対象のキャラIDが見つかりませんでした'); return; }

  const charData = getCharFormData('edit-');
  if (!charData) return;

  const charList = appState.characters || appState.localCharacters || [];
  const index = charList.findIndex(c => c.id === characterId);
  if (index === -1) { alert('編集対象のキャラクターが見つかりませんでした'); return; }

  charData.id = characterId;
  charData.author = charList[index].author || appState.playerName || 'プレイヤー';
  charData.createdBy = charList[index].createdBy || charData.author;

  charList[index] = charData;

  if (appState.localCharacters) {
    const localIdx = appState.localCharacters.findIndex(c => c.id === characterId);
    if (localIdx !== -1) appState.localCharacters[localIdx] = charData;
  }
  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof updateCharacterInFirestore === 'function') updateCharacterInFirestore(charData);
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamSlots === 'function') renderTeamSlots();

  alert(`「${charData.name}」の再編集を保存しました！`);
  if (typeof closeEditModal === 'function') closeEditModal();
}

function selectSkillCandidate(index, prefix) {
  const isEdit = prefix === 'edit-';
  const candidates = isEdit ? window._editSkillCandidates : window._skillCandidates;
  if (!candidates || !candidates[index]) return;
  const skill = candidates[index];
  if (isEdit) selectedEditSkillData = skill;
  else selectedSkillData = skill;
  renderSkillCandidates(candidates, prefix, index);
  updateSkillStatusDisplay(prefix, skill);
  showSkillNameEditSection(prefix, skill);
  setupStatSync(prefix, isEdit);
}

function showSkillNameEditSection(prefix, skill) {
  const section = document.getElementById(`${prefix}skill-name-edit-section`);
  const input = document.getElementById(`${prefix}char-skill-name-custom`);
  if (!section || !input) return;
  if (skill) {
    section.style.display = 'block';
    input.value = skill.name || '';
  } else {
    section.style.display = 'none';
    input.value = '';
  }
}

function updateCustomSkillName(prefix) {
  const input = document.getElementById(`${prefix}char-skill-name-custom`);
  if (!input) return;
  const newName = input.value.trim();
  const skill = prefix === 'edit-' ? selectedEditSkillData : selectedSkillData;
  if (!skill) return;
  skill.name = newName || skill.name;
  if (typeof renderSkillCandidates === 'function') {
    const candidates = prefix === 'edit-' ? window._editSkillCandidates : window._skillCandidates;
    const selectedIndex = candidates ? candidates.indexOf(skill) : -1;
    renderSkillCandidates(candidates, prefix, selectedIndex);
  }
  updateSkillStatusDisplay(prefix, skill);
}

function renderSkillCandidates(candidates, prefix, selectedIndex) {
  const box = document.getElementById(`${prefix}skill-candidates-box`);
  if (!box) return;
  box.innerHTML = '';
  candidates.forEach((skill, i) => {
    const card = document.createElement('div');
    card.className = 'skill-candidate-card' + (i === selectedIndex ? ' selected' : '');
    card.onclick = () => { if (typeof playSE === 'function') playSE('click'); selectSkillCandidate(i, prefix); };
    const valueTypeLabel = skill.valueType === 'percent' ? '%' : '';
    const tags = [
      `対象: ${skill.target || '単体'}`,
      `確率: ${skill.probability || 100}%`,
      `効果: ${skill.effectType || 'ダメージ'}`,
      `効果量: ${skill.effectValue || 0}${valueTypeLabel}`,
      `タイプ: ${skill.valueType === 'percent' ? '割合' : '固定'}`,
      skill.duration ? `持続: ${skill.duration}T` : null,
      `条件: ${skill.condition || '常時'}`
    ].filter(t => t);
    card.innerHTML = `
      <div class="skill-candidate-header">
        <span class="skill-candidate-name">${escapeHtml(skill.name)}</span>
        <span class="skill-candidate-cost">消費 ${skill.cost}pt</span>
      </div>
      <div class="skill-candidate-desc">${escapeHtml(skill.description || '')}</div>
      <div class="skill-candidate-meta">
        ${tags.map(t => `<span class="skill-candidate-tag">${escapeHtml(t)}</span>`).join('')}
      </div>
    `;
    box.appendChild(card);
  });
}

function updateSkillStatusDisplay(prefix, skill) {
  const el = document.getElementById(`${prefix}skill-status-display`);
  if (!el) return;
  if (!skill) { el.textContent = 'まだスキルが選択されていません'; return; }
  el.innerHTML = `✅ 選択中: <span class="skill-selected-name">${escapeHtml(skill.name)}</span> (消費 ${skill.cost}pt) → ステータス振り分け上限: ${200 - skill.cost}pt`;
}

function clearSkillSelection(prefix) {
  if (prefix === 'edit-') {
    selectedEditSkillData = null;
    window._editSkillCandidates = null;
  } else {
    selectedSkillData = null;
    window._skillCandidates = null;
  }
  const box = document.getElementById(`${prefix}skill-candidates-box`);
  if (box) box.innerHTML = '';
  updateSkillStatusDisplay(prefix, null);
  showSkillNameEditSection(prefix, null);
  setupStatSync(prefix, prefix === 'edit-');
}

function getCharFormData(prefix = '') {
  const nameEl = document.getElementById(`${prefix}char-name`);
  if (!nameEl) return null;

  const name = nameEl.value.trim();
  if (!name) { alert('名前は必須です'); return null; }

  const hpPt = parseInt(document.getElementById(`${prefix}num-stat-hp`)?.value) || 0;
  const atkPt = parseInt(document.getElementById(`${prefix}num-stat-atk`)?.value) || 0;
  const defPt = parseInt(document.getElementById(`${prefix}num-stat-def`)?.value) || 0;
  const spdPt = parseInt(document.getElementById(`${prefix}num-stat-eva`)?.value) || 0;

  const tagsRaw = document.getElementById(`${prefix}char-tags`)?.value || '';
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(t => t) : [];
  const skill = prefix === 'edit-' ? selectedEditSkillData : selectedSkillData;
  const roleEl = document.getElementById(`${prefix}char-role`);
  const roleKey = roleEl ? roleEl.value : 'melee';
  const roleDef = (typeof ROLES !== 'undefined') ? ROLES[roleKey] : null;

  let normalSkill = document.getElementById(`${prefix}char-normal-skill`)?.value.trim() || '通常攻撃';
  let specialSkill = document.getElementById(`${prefix}char-special-skill`)?.value.trim() || '渾身の一撃';
  let finalSpd = spdPt;

  if (roleDef && roleDef.lockSkillNames) {
    normalSkill = '回復魔法';
    specialSkill = '大回復魔法';
  }
  if (roleDef && roleDef.fixedSpd !== undefined) {
    finalSpd = roleDef.fixedSpd;
  }

  return {
    name: name,
    job: document.getElementById(`${prefix}char-job`)?.value.trim() || '冒険者',
    role: roleKey,
    tags: tags,
    appearance: document.getElementById(`${prefix}char-appearance`)?.value.trim() || '標準的な姿',
    bio: document.getElementById(`${prefix}char-bio`)?.value.trim() || '特筆なし',
    normalSkill: normalSkill,
    specialSkill: specialSkill,
    quote: document.getElementById(`${prefix}char-quote`)?.value.trim() || '覚悟しろ！',
    stats: {
      hp: hpPt * 5,
      maxHp: hpPt * 5,
      atk: atkPt,
      def: defPt,
      spd: finalSpd,
      eva: finalSpd,
      evaRate: Math.min(30, Math.floor(finalSpd * 0.2))
    },
    customSkill: skill || null,
    author: localPlayerName
  };

  if (skill && !skill.valueType) {
    skill.valueType = 'flat';
  }
}

/* ===================================================
   キャラクター一覧・検索
   =================================================== */
function getCharList() {
  return appState.characters?.length > 0
    ? appState.characters
    : (appState.localCharacters?.length > 0 ? appState.localCharacters : globalSharedCharacters);
}

function filterCharacters(query) {
  const charList = getCharList();
  if (!query) return charList;
  const q = query.toLowerCase().trim();
  return charList.filter(c => {
    const name = (c.name || '').toLowerCase();
    const job = (c.job || '').toLowerCase();
    const tags = Array.isArray(c.tags) ? c.tags.join(' ').toLowerCase() : '';
    return name.includes(q) || job.includes(q) || tags.includes(q);
});
}

function filterCharactersWithFav(query, favOnly) {
  let list = filterCharacters(query);
  if (favOnly) list = list.filter(c => isFavorite(c.id));
  return getSortedCharList(list);
}

function resetGalleryFilter() {
  const galleryInput = document.getElementById('gallery-tag-search');
  if (galleryInput) galleryInput.value = '';
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
}

function filterGallery() {
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
}

function updateTeamNameDisplays() {
  const p1Input = document.getElementById('p1-team-name-input');
  const p2Input = document.getElementById('p2-team-name-input');
  if (p1Input) appState.p1Name = p1Input.value;
  if (p2Input) appState.p2Name = p2Input.value;
}

/* ===================================================
   チーム編成: 10スロット・モーダル選択式
   =================================================== */
const MAX_TEAM_SIZE = 10;

function getTeamArray(teamLabel) {
  return teamLabel === 'p1' ? appState.p1Team : appState.p2Team;
}

function getFormationMap(teamLabel) {
  return teamLabel === 'p1' ? appState.p1Formations : appState.p2Formations;
}

function renderTeamSlots() {
  ['p1', 'p2'].forEach(team => {
    const container = document.getElementById(`${team}-slots`);
    if (!container) return;
    container.innerHTML = '';
    const teamArr = getTeamArray(team);

    for (let i = 0; i < MAX_TEAM_SIZE; i++) {
      const charId = teamArr[i];
      const slot = document.createElement('div');
      slot.className = 'team-slot';
      const autoFormation = i < 5 ? '前衛' : '後衛';

      if (charId) {
        const charList = getCharList();
        const char = charList.find(c => c.id === charId);
        if (char) {
          slot.classList.add('team-slot-filled');
          const roleLabel = (typeof getRoleLabel === 'function') ? getRoleLabel(char.role) : '';
          slot.innerHTML = `
            <div class="team-slot-info">
              <span class="team-slot-name">${escapeHtml(char.name)}</span>
              <span class="team-slot-role">${escapeHtml(roleLabel)} / ${autoFormation}</span>
            </div>
            <button class="team-slot-remove" onclick="removeFromTeam('${team}', ${i})">✖</button>
          `;
        } else {
          slot.classList.add('team-slot-empty');
          slot.innerHTML = `<button class="team-slot-add" onclick="openCharSelectModal('${team}', ${i})">＋ 追加</button>`;
          teamArr[i] = undefined;
        }
      } else {
        slot.classList.add('team-slot-empty');
        slot.innerHTML = `<button class="team-slot-add" onclick="openCharSelectModal('${team}', ${i})">＋ 追加</button>`;
      }

      container.appendChild(slot);
    }
  });

  updateTeamSlotCounts();
}

function updateTeamSlotCounts() {
  const p1Count = appState.p1Team.filter(id => id).length;
  const p2Count = appState.p2Team.filter(id => id).length;
  const p1El = document.getElementById('p1-count');
  const p2El = document.getElementById('p2-count');
  if (p1El) p1El.textContent = p1Count;
  if (p2El) p2El.textContent = p2Count;
}

function openCharSelectModal(team, slotIndex) {
  _teamSelectTarget = { team, slotIndex };
  const modal = document.getElementById('char-select-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  renderCharSelectList('');
  if (typeof playSE === 'function') playSE('click');
}

function closeCharSelectModal() {
  const modal = document.getElementById('char-select-modal');
  if (modal) modal.style.display = 'none';
  _teamSelectTarget = null;
}

function renderCharSelectList(query) {
  const list = document.getElementById('char-select-list');
  if (!list) return;
  const filtered = filterCharacters(query);
  const teamArr = _teamSelectTarget ? getTeamArray(_teamSelectTarget.team) : [];
  const otherTeam = _teamSelectTarget && _teamSelectTarget.team === 'p1' ? appState.p2Team : appState.p1Team;

  list.innerHTML = '';
  if (filtered.length === 0) {
    list.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:20px;">該当するキャラがいません</p>';
    return;
  }

  filtered.forEach(c => {
    const inThisTeam = teamArr.includes(c.id);
    const inOtherTeam = otherTeam.includes(c.id);
    const roleLabel = (typeof getRoleLabel === 'function') ? getRoleLabel(c.role) : '';

    const card = document.createElement('div');
    card.className = 'char-select-card';
    if (inThisTeam) card.classList.add('char-select-card-selected');
    if (inOtherTeam && !inThisTeam) card.classList.add('char-select-card-disabled');

    card.innerHTML = `
      <div class="char-select-card-name">${escapeHtml(c.name)}</div>
      <div class="char-select-card-meta">${escapeHtml(c.job || '冒険者')} [${escapeHtml(roleLabel)}] HP:${c.stats.hp} ATK:${c.stats.atk}</div>
    `;

    if (!inOtherTeam || inThisTeam) {
      card.onclick = () => selectCharForSlot(c.id);
    }

    list.appendChild(card);
  });
}

function selectCharForSlot(charId) {
  if (!_teamSelectTarget) return;
  const { team, slotIndex } = _teamSelectTarget;
  const teamArr = getTeamArray(team);

  // 既に同じチームの別枠にいる場合は入れ替え
  const existingIdx = teamArr.indexOf(charId);
  if (existingIdx !== -1 && existingIdx !== slotIndex) {
    teamArr[existingIdx] = teamArr[slotIndex];
  }

  teamArr[slotIndex] = charId;
  if (typeof playSE === 'function') playSE('click');
  closeCharSelectModal();
  renderTeamSlots();
}

function removeFromTeam(team, slotIndex) {
  const teamArr = getTeamArray(team);
  teamArr[slotIndex] = undefined;
  if (typeof playSE === 'function') playSE('click');
  renderTeamSlots();
}

/* ===================================================
   お気に入り・タグチップ・ソート
   =================================================== */
function getFavoriteIds() {
  try { return JSON.parse(localStorage.getItem('char_favorites') || '[]'); } catch (e) { return []; }
}

function toggleFavorite(charId) {
  let favs = getFavoriteIds();
  if (favs.includes(charId)) {
    favs = favs.filter(id => id !== charId);
  } else {
    favs.push(charId);
  }
  localStorage.setItem('char_favorites', JSON.stringify(favs));
  renderCharacterGallery();
  if (typeof playSE === 'function') playSE('click');
}

function isFavorite(charId) {
  return getFavoriteIds().includes(charId);
}

function getAllExistingTags() {
  const charList = getCharList();
  const tagSet = new Set();
  charList.forEach(c => {
    if (Array.isArray(c.tags)) c.tags.forEach(t => tagSet.add(t));
  });
  return Array.from(tagSet).sort();
}

function renderTagChips() {
  const containers = [document.getElementById('tag-chips-create'), document.getElementById('tag-chips-gallery')];
  const tags = getAllExistingTags();
  containers.forEach(container => {
    if (!container) return;
    if (tags.length === 0) { container.innerHTML = '<span class="tag-chip-empty">まだタグがありません</span>'; return; }
    container.innerHTML = tags.map(t => `<button class="tag-chip" onclick="applyTagToSearch('${escapeHtml(t)}')">${escapeHtml(t)}</button>`).join('');
  });
}

function applyTagToSearch(tag) {
  const searchInput = document.getElementById('gallery-tag-search');
  if (searchInput) {
    const current = searchInput.value.trim();
    if (current && !current.endsWith(',')) {
      searchInput.value = current + ' ' + tag;
    } else {
      searchInput.value = (current ? current + ' ' : '') + tag;
    }
    filterGallery();
  }
  if (typeof playSE === 'function') playSE('click');
}

let _gallerySortKey = 'created';

function setGallerySort(key) {
  _gallerySortKey = key;
  renderCharacterGallery();
  if (typeof playSE === 'function') playSE('click');
}

function getSortedCharList(list) {
  const arr = [...list];
  switch (_gallerySortKey) {
    case 'atk': return arr.sort((a, b) => (b.stats.atk || 0) - (a.stats.atk || 0));
    case 'def': return arr.sort((a, b) => (b.stats.def || 0) - (a.stats.def || 0));
    case 'hp': return arr.sort((a, b) => (b.stats.maxHp || b.stats.hp || 0) - (a.stats.maxHp || a.stats.hp || 0));
    case 'spd': return arr.sort((a, b) => (b.stats.spd || b.stats.eva || 0) - (a.stats.spd || a.stats.eva || 0));
    case 'fav': return arr.sort((a, b) => (isFavorite(b.id) ? 1 : 0) - (isFavorite(a.id) ? 1 : 0));
    case 'created':
    default: return arr.sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  }
}

function filterGalleryFavoritesOnly() {
  const favs = getFavoriteIds();
  const all = getCharList();
  return all.filter(c => favs.includes(c.id));
}

function syncTeamSlots() {
  appState.p1Team = appState.p1Team.filter(id => id);
  appState.p2Team = appState.p2Team.filter(id => id);
}

/* ===================================================
   ルール・計算仕様タブ
   =================================================== */
function switchRulesTab(tabId, event) {
  document.querySelectorAll('.rules-tab-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.rules-tab-panel').forEach(el => el.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  const panel = document.getElementById(`rules-panel-${tabId}`);
  if (panel) panel.classList.add('active');
  if (typeof playSE === 'function') playSE('click');
}

function toggleAccordion(bodyId) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.style.display = body.style.display === 'none' ? 'block' : 'none';
}

/* ===================================================
   役職カードセレクター
   =================================================== */
function renderRoleSelector(prefix = '') {
  const container = document.getElementById(`${prefix}role-card-grid`);
  if (!container) return;
  const hiddenInput = document.getElementById(`${prefix}char-role`);
  const currentRole = hiddenInput ? hiddenInput.value : 'melee';

  container.innerHTML = '';
  Object.entries(ROLES).forEach(([key, role]) => {
    const card = document.createElement('div');
    card.className = 'role-card' + (key === currentRole ? ' role-card-selected' : '');
    card.onclick = () => selectRole(key, prefix);
    card.innerHTML = `
      <div class="role-card-icon">${role.icon}</div>
      <div class="role-card-body">
        <div class="role-card-name">${escapeHtml(role.label)}</div>
        <div class="role-card-desc">${escapeHtml(role.desc)}</div>
        <div class="role-card-passive">${escapeHtml(role.passive)}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function skillViolatesRole(skill, roleKey) {
  if (!skill) return false;
  const effect = (skill.effectType || '').toLowerCase();
  // ヒーラーは攻撃系スキル(damage, combo, lifesteal, stun)を持てない
  if (roleKey === 'healer') {
    return ['damage', 'combo', 'lifesteal', 'stun'].includes(effect);
  }
  return false;
}

function selectRole(roleKey, prefix = '') {
  const hiddenInput = document.getElementById(`${prefix}char-role`);
  if (hiddenInput) hiddenInput.value = roleKey;
  renderRoleSelector(prefix);
  if (typeof applyRoleFormRestrictions === 'function') applyRoleFormRestrictions(prefix);

  // 役職変更時、既に設定済みの特殊能力が新しい役職の制約に違反していないか自動再検証。
  // 違反があれば特殊能力をリセットし、再設定を要求する。
  const currentSkill = prefix === 'edit-' ? selectedEditSkillData : selectedSkillData;
  if (skillViolatesRole(currentSkill, roleKey)) {
    if (typeof clearSkillSelection === 'function') clearSkillSelection(prefix);
    const roleName = (typeof getRoleLabel === 'function') ? getRoleLabel(roleKey) : roleKey;
    alert(`設定中の特殊能力は「${roleName}」の役職制約に違反するため、リセットしました。\n特殊能力を再設定してください。`);
  }

  if (typeof playSE === 'function') playSE('click');
}

function resetAllData() {
  if (!confirm('すべてのローカルデータ（キャラクター・アカウント・APIキー・サウンド設定）を削除しますか？\nこの操作は取り消せません。')) return;
  localStorage.removeItem('ai_arena_profiles');
  localStorage.removeItem('ai_arena_active_profile');
  localStorage.removeItem('my_local_characters');
  localStorage.removeItem('gemini_api_key');
  localStorage.removeItem('ai_arena_player_name');
  localStorage.removeItem('sound_bgm_enabled');
  localStorage.removeItem('sound_se_enabled');
  localStorage.removeItem('sound_bgm_volume');
  localStorage.removeItem('sound_se_volume');
  localStorage.removeItem('banned_rooms');
  alert('すべてのデータをリセットしました。ページを再読み込みしてください。');
  location.reload();
}

function setTeamPreset(p1Name, p2Name) {
  const p1Input = document.getElementById('p1-team-name-input');
  const p2Input = document.getElementById('p2-team-name-input');
  if (p1Input) { p1Input.value = p1Name; appState.p1Name = p1Name; }
  if (p2Input) { p2Input.value = p2Name; appState.p2Name = p2Name; }
  if (typeof playSE === 'function') playSE('click');
}

/* ===================================================
   AI小説 シチュエーションタグ
   =================================================== */
function appendNovelContext(text) {
  const input = document.getElementById('novel-context-input');
  if (input.value.trim() === '') input.value = text;
  else input.value += ' ' + text;
}

function setNovelStyle(text) {
  const input = document.getElementById('novel-style-input');
  if (input) input.value = text;
}

function syncStat(sliderId, inputId) {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (slider && input) input.value = slider.value;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCharacterGallery() {
  const gallery = document.getElementById('character-gallery') || document.getElementById('character-list');
  if (!gallery) return;

  gallery.innerHTML = '';
  const query = document.getElementById('gallery-tag-search')?.value || '';
  const favOnly = document.getElementById('fav-only-checkbox')?.checked || false;
  const charList = filterCharactersWithFav(query, favOnly);

  renderTagChips();

  if (!charList || charList.length === 0) {
    gallery.innerHTML = '<p style="color:var(--text-sub); text-align:center; padding:30px;">該当するキャラクターがいません。</p>';
    return;
  }

  charList.forEach(c => {
    const displayHp = c.stats.maxHp || c.stats.hp || 0;
    const displaySpd = c.stats.spd || c.stats.eva || 0;
    const displayAtk = c.stats.atk || 0;
    const displayDef = c.stats.def || 0;
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const tagBadges = tags.map(t => `<span class="tag-badge">${escapeHtml(t)}</span>`).join('');
    const totalPoints = Math.floor(displayHp / 5) + displayAtk + displayDef + displaySpd;
    const hpPct = Math.min(100, Math.floor(displayHp / 10));
    const atkPct = Math.min(100, displayAtk);
    const defPct = Math.min(100, displayDef);
    const spdPct = Math.min(100, Math.floor(displaySpd / 1.5));

    const roleLabel = (typeof getRoleLabel === 'function') ? getRoleLabel(c.role) : '';
    const favStar = isFavorite(c.id) ? '★' : '☆';
    const card = document.createElement('div');
    card.className = 'char-card';
    card.innerHTML = `
      <div class="char-card-header">
        <div class="char-card-name-row">
          <h3 class="char-card-name">${escapeHtml(c.name)}</h3>
          <span class="char-card-job">${escapeHtml(c.job || '冒険者')}</span>
        </div>
        <span class="char-card-fav" onclick="event.stopPropagation(); toggleFavorite('${c.id}')">${favStar}</span>
      </div>
      <div class="char-card-tags">${tagBadges || '<span class="tag-empty">タグなし</span>'} <span class="char-card-type-badge">${escapeHtml(roleLabel)}</span></div>
      <div class="char-card-stats">
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">❤️ HP</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-hp" style="width:${hpPct}%"></div></div>
          <span class="stat-bar-num">${displayHp}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">⚔️ ATK</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-atk" style="width:${atkPct}%"></div></div>
          <span class="stat-bar-num">${displayAtk}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">🛡️ DEF</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-def" style="width:${defPct}%"></div></div>
          <span class="stat-bar-num">${displayDef}</span>
        </div>
        <div class="stat-bar-wrap">
          <span class="stat-bar-label">💨 SPD</span>
          <div class="stat-bar-track"><div class="stat-bar-fill stat-bar-spd" style="width:${spdPct}%"></div></div>
          <span class="stat-bar-num">${displaySpd}</span>
        </div>
      </div>
      <div class="char-card-skills">
        <div class="char-card-skill"><span class="skill-label">通常</span><span class="skill-name">${escapeHtml(c.normalSkill || '通常攻撃')}</span></div>
        <div class="char-card-skill char-card-skill-special"><span class="skill-label">必殺</span><span class="skill-name">${escapeHtml(c.specialSkill || '奥義')}</span></div>
      </div>
      <div class="char-card-quote">「${escapeHtml(c.quote || '……')}」</div>
      <div class="char-card-footer">
        <span class="char-card-points">合計 ${totalPoints}pt</span>
        <div class="char-card-actions">
          <button class="btn-sm" onclick="openEditModal('${c.id}')">編集</button>
          <button class="btn-sm btn-sm-danger" onclick="deleteCharacter('${c.id}')">削除</button>
        </div>
      </div>
    `;
    gallery.appendChild(card);
  });
}
