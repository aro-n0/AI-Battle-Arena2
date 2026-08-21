/**
 * profile.js - 複数アカウント（プロファイル）切り替え管理
 * localStorage のデータ構造を multi-account 対応に移行する
 */

const ProfileManager = {
  STORAGE_KEY: 'ai_arena_profiles',
  ACTIVE_KEY: 'ai_arena_active_profile',
  LEGACY_NAME_KEY: 'ai_arena_player_name',
  LEGACY_CHAR_KEY: 'my_local_characters',

  init() {
    this.migrateLegacyData();
  },

  migrateLegacyData() {
    let profiles = this.getAllProfiles();
    if (profiles.length > 0) return;

    const legacyName = localStorage.getItem(this.LEGACY_NAME_KEY);
    const legacyCharsRaw = localStorage.getItem(this.LEGACY_CHAR_KEY);
    let legacyChars = [];
    try { legacyChars = legacyCharsRaw ? JSON.parse(legacyCharsRaw) : []; } catch (e) { legacyChars = []; }

    if (legacyName) {
      profiles = [{
        id: 'profile_' + Date.now(),
        name: legacyName,
        characters: legacyChars,
        createdAt: Date.now()
      }];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profiles));
      localStorage.setItem(this.ACTIVE_KEY, profiles[0].id);
    }
  },

  getAllProfiles() {
    try {
      return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  },

  saveProfiles(profiles) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(profiles));
  },

  getActiveProfileId() {
    return localStorage.getItem(this.ACTIVE_KEY);
  },

  getActiveProfile() {
    const id = this.getActiveProfileId();
    const profiles = this.getAllProfiles();
    return profiles.find(p => p.id === id) || null;
  },

  setActiveProfile(id) {
    localStorage.setItem(this.ACTIVE_KEY, id);
  },

  createProfile(name) {
    if (!name || !name.trim()) return null;
    name = name.trim();
    const profiles = this.getAllProfiles();
    if (profiles.find(p => p.name === name)) {
      return null;
    }
    const profile = {
      id: 'profile_' + Date.now(),
      name: name,
      characters: [],
      createdAt: Date.now()
    };
    profiles.push(profile);
    this.saveProfiles(profiles);
    return profile;
  },

  switchProfile(id) {
    const profiles = this.getAllProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) return false;
    this.setActiveProfile(id);
    return true;
  },

  renameProfile(id, newName) {
    if (!newName || !newName.trim()) return false;
    newName = newName.trim();
    const profiles = this.getAllProfiles();
    const p = profiles.find(p => p.id === id);
    if (!p) return false;
    if (profiles.find(x => x.name === newName && x.id !== id)) return false;
    p.name = newName;
    this.saveProfiles(profiles);
    return true;
  },

  deleteProfile(id) {
    const profiles = this.getAllProfiles();
    if (profiles.length <= 1) return false;
    const filtered = profiles.filter(p => p.id !== id);
    this.saveProfiles(filtered);
    if (this.getActiveProfileId() === id) {
      this.setActiveProfile(filtered[0].id);
    }
    return true;
  },

  getCharacters() {
    const p = this.getActiveProfile();
    return p ? p.characters : [];
  },

  saveCharacters(characters) {
    const id = this.getActiveProfileId();
    const profiles = this.getAllProfiles();
    const p = profiles.find(p => p.id === id);
    if (p) {
      p.characters = characters;
      this.saveProfiles(profiles);
    }
  },

  createQuickTestProfile() {
    const existing = this.getAllProfiles();
    let counter = existing.length + 1;
    let testName = `テストユーザー${counter}`;
    while (existing.find(p => p.name === testName)) {
      counter++;
      testName = `テストユーザー${counter}`;
    }
    const profile = this.createProfile(testName);
    if (profile) {
      this.switchProfile(profile.id);
    }
    return profile;
  },

  renderProfileList() {
    const containers = [
      document.getElementById('profile-list'),
      document.getElementById('settings-profile-list')
    ].filter(Boolean);

    if (containers.length === 0) return;

    const profiles = this.getAllProfiles();
    const activeId = this.getActiveProfileId();

    const html = profiles.map(p => {
      const isActive = p.id === activeId;
      return `
        <div class="profile-item${isActive ? ' profile-item-active' : ''}">
          <div class="profile-item-info">
            <span class="profile-item-name">${escapeHtml(p.name)}</span>
            <span class="profile-item-meta">${p.characters.length}体のキャラクター</span>
          </div>
          <div class="profile-item-actions">
            ${isActive ? '<span class="profile-active-badge">使用中</span>' : `<button class="btn-sm" onclick="switchToProfile('${p.id}')">切り替え</button>`}
            <button class="btn-sm" onclick="renameProfilePrompt('${p.id}')">改名</button>
            ${profiles.length > 1 ? `<button class="btn-sm btn-sm-danger" onclick="deleteProfileConfirm('${p.id}')">削除</button>` : ''}
          </div>
        </div>
      `;
    }).join('');

    containers.forEach(container => {
      container.innerHTML = html;
    });
  }
};

function switchToProfile(id) {
  ProfileManager.switchProfile(id);
  applyActiveProfile();
  ProfileManager.renderProfileList();
  alert(`アカウントを切り替えました: ${ProfileManager.getActiveProfile().name}`);
}

function createNewProfilePrompt() {
  const name = prompt('新しいアカウント名を入力してください');
  if (!name) return;
  const profile = ProfileManager.createProfile(name);
  if (!profile) {
    alert('その名前はすでに使われています');
    return;
  }
  ProfileManager.switchProfile(profile.id);
  applyActiveProfile();
  ProfileManager.renderProfileList();
  alert(`アカウント「${profile.name}」を作成し、切り替えました`);
}

function createQuickTestProfileUI() {
  const profile = ProfileManager.createQuickTestProfile();
  if (!profile) {
    alert('テストアカウントの作成に失敗しました');
    return;
  }
  applyActiveProfile();
  ProfileManager.renderProfileList();
  alert(`テストアカウント「${profile.name}」に切り替えました（既存データは保持されています）`);
}

function renameProfilePrompt(id) {
  const profiles = ProfileManager.getAllProfiles();
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  const newName = prompt('新しいアカウント名を入力', p.name);
  if (!newName) return;
  if (ProfileManager.renameProfile(id, newName)) {
    applyActiveProfile();
    ProfileManager.renderProfileList();
    alert('アカウント名を変更しました');
  } else {
    alert('その名前はすでに使われています');
  }
}

function deleteProfileConfirm(id) {
  const profiles = ProfileManager.getAllProfiles();
  const p = profiles.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`アカウント「${p.name}」を削除しますか？\nこのアカウントのキャラクター ${p.characters.length} 体も削除されます。`)) return;
  ProfileManager.deleteProfile(id);
  applyActiveProfile();
  ProfileManager.renderProfileList();
  alert('アカウントを削除しました');
}

function applyActiveProfile() {
  const profile = ProfileManager.getActiveProfile();
  if (!profile) {
    document.getElementById('start-modal').style.display = 'flex';
    return;
  }
  localPlayerName = profile.name;
  appState.playerName = profile.name;
  appState.localCharacters = profile.characters.slice();
  appState.characters = appState.localCharacters.slice();
  if (typeof saveLocalCharacters === 'function') {
    appState.localCharacters = profile.characters;
  }
  updatePlayerNameUI(profile.name);
  document.getElementById('start-modal').style.display = 'none';
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
}

document.addEventListener('DOMContentLoaded', () => {
  ProfileManager.init();

  const activeProfile = ProfileManager.getActiveProfile();
  if (activeProfile) {
    applyActiveProfile();
  } else {
    const profiles = ProfileManager.getAllProfiles();
    if (profiles.length === 0) {
      document.getElementById('start-modal').style.display = 'flex';
    } else {
      ProfileManager.switchProfile(profiles[0].id);
      applyActiveProfile();
    }
  }
  ProfileManager.renderProfileList();
});
