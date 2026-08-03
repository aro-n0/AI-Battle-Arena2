/**
 * battle.js - キャラ計算 & ロジック (ランダム性排除・元設定尊重版)
 */

// appState の安全な初期化
if (typeof window.appState === 'undefined') {
  window.appState = {};
}
if (!appState.p1Team) appState.p1Team = [];
if (!appState.p2Team) appState.p2Team = [];
if (!appState.characters) appState.characters = [];
if (!appState.localCharacters) appState.localCharacters = [];

const MAX_TOTAL_POINTS = 200;
const MAX_EVA_POINTS = 150; // 素早さ・回避率は最大150pt (50%) まで

// 初期化時にスライダーと数値入力ボックスの両方にイベントを設定
function initStatSliders(prefix = '') {
  const isEdit = prefix === 'edit';
  const p = isEdit ? 'edit-' : '';

  ['hp', 'atk', 'def', 'eva'].forEach(stat => {
    const slider = document.getElementById(`${p}stat-${stat}`);
    const numInput = document.getElementById(`${p}num-stat-${stat}`);

    if (slider && numInput) {
      slider.addEventListener('input', () => {
        numInput.value = slider.value;
        updateStatValues(prefix);
      });

      numInput.addEventListener('input', () => {
        slider.value = numInput.value;
        updateStatValues(prefix);
      });
    }
  });

  updateStatValues(prefix);
}

function updateStatValues(prefix = '') {
  const isEdit = prefix === 'edit';
  const p = isEdit ? 'edit-' : '';

  let hp = parseInt(document.getElementById(`${p}stat-hp`)?.value) || 0;
  let atk = parseInt(document.getElementById(`${p}stat-atk`)?.value) || 0;
  let def = parseInt(document.getElementById(`${p}stat-def`)?.value) || 0;
  let eva = parseInt(document.getElementById(`${p}stat-eva`)?.value) || 0;

  if (eva > MAX_EVA_POINTS) {
    eva = MAX_EVA_POINTS;
    const slider = document.getElementById(`${p}stat-eva`);
    const numInput = document.getElementById(`${p}num-stat-eva`);
    if (slider) slider.value = MAX_EVA_POINTS;
    if (numInput) numInput.value = MAX_EVA_POINTS;
  }

  const currentTotal = hp + atk + def + eva;
  const remaining = MAX_TOTAL_POINTS - currentTotal;

  const remainingEl = document.getElementById(`${p}remaining-points`);
  if (remainingEl) {
    remainingEl.textContent = remaining;
    remainingEl.style.color = remaining < 0 ? '#ef4444' : '#34d399';
  }

  const valHp = document.getElementById(`${p}val-hp`);
  const valAtk = document.getElementById(`${p}val-atk`);
  const valDef = document.getElementById(`${p}val-def`);
  const valEva = document.getElementById(`${p}val-eva`);

  if (valHp) valHp.textContent = `${hp * 5} HP (${hp} pt)`;
  if (valAtk) valAtk.textContent = `${atk} pt`;
  if (valDef) valDef.textContent = `${def} pt`;
  if (valEva) valEva.textContent = `SPD:${eva}pt / 回避:${Math.floor(eva / 3)}%`;
}

// ページ読み込み完了時にスライダーイベントを発火準備
document.addEventListener('DOMContentLoaded', () => {
  initStatSliders('create');
  initStatSliders('edit');
  loadLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
});

// 新規作成
async function handleCreateCharacter(e) {
  e.preventDefault();

  const hp = parseInt(document.getElementById('stat-hp').value) || 0;
  const atk = parseInt(document.getElementById('stat-atk').value) || 0;
  const def = parseInt(document.getElementById('stat-def').value) || 0;
  let eva = parseInt(document.getElementById('stat-eva').value) || 0;

  if (eva > MAX_EVA_POINTS) eva = MAX_EVA_POINTS;

  if (hp + atk + def + eva > MAX_TOTAL_POINTS) {
    return alert(`ステータスポイントの合計が ${MAX_TOTAL_POINTS}pt を超えています！`);
  }

  const tagsInput = document.getElementById('char-tags')?.value || '';
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];

  const customSkill = (typeof selectedSkillData !== 'undefined' && selectedSkillData) ? selectedSkillData : null;

  const newChar = {
    id: 'char_' + Date.now(),
    name: document.getElementById('char-name').value.trim(),
    job: document.getElementById('char-job')?.value.trim() || '冒険者',
    attackType: document.getElementById('char-attack-type')?.value || '物理',
    tags: tags,
    bio: document.getElementById('char-bio')?.value.trim() || '',
    appearance: document.getElementById('char-appearance')?.value.trim() || '',
    normalSkill: document.getElementById('char-normal-skill')?.value.trim() || '通常攻撃',
    specialSkill: document.getElementById('char-special-skill')?.value.trim() || '奥義',
    quote: document.getElementById('char-quote')?.value.trim() || '……',
    stats: { 
      hp: hp * 5, 
      maxHp: hp * 5, 
      atk: atk, 
      def: def, 
      eva: eva,
      spd: eva
    },
    customSkill: customSkill,
    createdBy: appState.playerName
  };

  if (appState.roomId) {
    if (typeof saveCharacterToFirestore === 'function') {
      await saveCharacterToFirestore(newChar);
      alert(`キャラクター「${newChar.name}」をルームに作成・共有しました！`);
    }
  } else {
    if (!appState.localCharacters) appState.localCharacters = [];
    if (!appState.characters) appState.characters = [];

    appState.localCharacters.push(newChar);

    if (typeof saveLocalCharacters === 'function') saveLocalCharacters();

    appState.characters = [...appState.localCharacters];
    if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
    if (typeof renderTeamChecklists === 'function') renderTeamChecklists();

    alert(`キャラクター「${newChar.name}」をローカルに保存しました！`);
  }

  document.getElementById('create-form').reset();
  updateStatValues('create');
  if (typeof clearSkillSelection === 'function') clearSkillSelection('');
}

// 編集モーダル表示時の数値セット
window.openEditModal = function(id) {
  const charList = appState.characters || appState.localCharacters || [];
  const char = charList.find(c => c.id === id);
  if (!char) return;

  document.getElementById('edit-char-id').value = char.id;
  document.getElementById('edit-char-name').value = char.name;
  document.getElementById('edit-char-job').value = char.job || '冒険者';
  document.getElementById('edit-char-attack-type').value = char.attackType || '物理';
  document.getElementById('edit-char-tags').value = Array.isArray(char.tags) ? char.tags.join(', ') : '';
  document.getElementById('edit-char-bio').value = char.bio || '';
  document.getElementById('edit-char-appearance').value = char.appearance || '';
  document.getElementById('edit-char-normal-skill').value = char.normalSkill || '';
  document.getElementById('edit-char-special-skill').value = char.specialSkill || '';
  document.getElementById('edit-char-quote').value = char.quote || '';

  if (char.customSkill) {
    selectedEditSkillData = char.customSkill;
    window._editSkillCandidates = [char.customSkill];
    if (typeof renderSkillCandidates === 'function') renderSkillCandidates([char.customSkill], 'edit-', 0);
    if (typeof updateSkillStatusDisplay === 'function') updateSkillStatusDisplay('edit-', char.customSkill);
    if (typeof showSkillNameEditSection === 'function') showSkillNameEditSection('edit-', char.customSkill);
  } else {
    selectedEditSkillData = null;
    window._editSkillCandidates = null;
    if (typeof updateSkillStatusDisplay === 'function') updateSkillStatusDisplay('edit-', null);
    if (typeof showSkillNameEditSection === 'function') showSkillNameEditSection('edit-', null);
  }

  const hpPt = char.stats.hp ? Math.floor(char.stats.hp / 5) : 0;
  const atkPt = char.stats.atk || 0;
  const defPt = char.stats.def || 0;
  const evaPt = char.stats.eva || char.stats.spd || 0;

  const statMap = { hp: hpPt, atk: atkPt, def: defPt, eva: evaPt };
  ['hp', 'atk', 'def', 'eva'].forEach(stat => {
    const val = statMap[stat];
    const slider = document.getElementById(`edit-stat-${stat}`);
    const numInput = document.getElementById(`edit-num-stat-${stat}`);
    if (slider) slider.value = val;
    if (numInput) numInput.value = val;
  });

  updateStatValues('edit');
  document.getElementById('edit-modal').style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('edit-modal').style.display = 'none';
};

// 確定的なダメージ計算
function calculateDamage(attackerAtk, defenderDef, isSpecial) {
  let atk = attackerAtk * (isSpecial ? 1.5 : 1.0);
  let def = defenderDef;

  let damage = 0;
  if (def >= atk) {
    damage = Math.floor(atk * 0.1);
  } else {
    damage = Math.floor((def * 0.1) + (atk - def));
  }

  return Math.max(1, damage);
}

// 【★ここに追加（3番の処理）】チェックボックスで選ばれたキャラをチーム配列表に連動させる関数
function syncSelectedTeams() {
  appState.p1Team = Array.from(document.querySelectorAll('#p1-checklist input:checked')).map(cb => cb.value);
  appState.p2Team = Array.from(document.querySelectorAll('#p2-checklist input:checked')).map(cb => cb.value);
}

// 確定的なバトルシミュレーション実行
function runBattleSimulation() {
  syncSelectedTeams(); // 【★ここに追加（3番の呼び出し）】選ばれたチーム情報をセット

  if (appState.p1Team.length === 0 || appState.p2Team.length === 0) {
    return alert('1P・2Pの両方のチームに1体以上選択してください！');
  }

  const p1Name = appState.p1Name || document.getElementById('p1-team-name-input')?.value || '1Pチーム';
  const p2Name = appState.p2Name || document.getElementById('p2-team-name-input')?.value || '2Pチーム';

  const logBox = document.getElementById('battle-log');
  let logs = [`⚔️ 【${p1Name}】 VS 【${p2Name}】 バトル開始！\n`];

  const charList = appState.characters || appState.localCharacters || [];

  const p1Fighters = appState.p1Team.map((id, index) => {
    const c = charList.find(char => char.id === id);
    const hpVal = c.stats.maxHp || c.stats.hp || 0;
    return { ...JSON.parse(JSON.stringify(c)), team: '1P', teamIndex: index, currentHp: hpVal };
  });

  const p2Fighters = appState.p2Team.map((id, index) => {
    const c = charList.find(char => char.id === id);
    const hpVal = c.stats.maxHp || c.stats.hp || 0;
    return { ...JSON.parse(JSON.stringify(c)), team: '2P', teamIndex: index, currentHp: hpVal };
  });

  logs.push(`--- 📜 選手入場 ---`);
  p1Fighters.forEach(c => logs.push(`[${p1Name}] ${c.name} (${c.job || '冒険者'}) / 「${c.quote || '……'}」`));
  p2Fighters.forEach(c => logs.push(`[${p2Name}] ${c.name} (${c.job || '冒険者'}) / 「${c.quote || '……'}」`));
  logs.push(`-------------------\n`);

  p1Fighters.filter(f => f.currentHp <= 0).forEach(c => logs.push(`💀 ${c.name} はHPが0のため戦闘開始時に力尽き倒れた！`));
  p2Fighters.filter(f => f.currentHp <= 0).forEach(c => logs.push(`💀 ${c.name} はHPが0のため戦闘開始時に力尽き倒れた！`));

  let turn = 1;
  const maxTurns = 50;

  while (turn <= maxTurns) {
    const activeP1 = p1Fighters.filter(f => f.currentHp > 0);
    const activeP2 = p2Fighters.filter(f => f.currentHp > 0);

    if (activeP1.length === 0 || activeP2.length === 0) break;

    logs.push(`--- Turn ${turn} ---`);

    const actionQueue = [...activeP1, ...activeP2].sort((a, b) => {
      const spdA = a.stats.spd || a.stats.eva || 0;
      const spdB = b.stats.spd || b.stats.eva || 0;
      if (spdB !== spdA) return spdB - spdA;
      if (a.team !== b.team) return a.team === '1P' ? -1 : 1;
      return a.teamIndex - b.teamIndex;
    });

    for (const attacker of actionQueue) {
      if (attacker.currentHp <= 0) continue;

      const enemyTeam = attacker.team === '1P' 
        ? p2Fighters.filter(f => f.currentHp > 0)
        : p1Fighters.filter(f => f.currentHp > 0);

      if (enemyTeam.length === 0) break;

      const target = enemyTeam[0];

      const evaVal = target.stats.eva || target.stats.spd || 0;
      const evaPercent = Math.min(50, Math.floor(evaVal / 3));
      const isEvaded = (Math.random() * 100) < evaPercent;

      if (isEvaded) {
        logs.push(`💨 [${attacker.team}] ${attacker.name} の攻撃！ しかし ${target.name} は素早く身をかわした！(MISS)`);
        continue;
      }

      const isSpecial = Math.random() < 0.10;
      let skillName = isSpecial ? (attacker.specialSkill || '奥義') : (attacker.normalSkill || '通常攻撃');
      let damage = calculateDamage(attacker.stats.atk || 0, target.stats.def || 0, isSpecial);
      let skillLog = '';

      if (isSpecial) {
        logs.push(`🔥 [${attacker.team}] ${attacker.name} の決めゼリフ「${attacker.quote || '……'}」！`);
      }

      if (isSpecial && attacker.customSkill) {
        const skillResult = executeCustomSkill(attacker, target, attacker.customSkill, turn);
        if (skillResult.activated) {
          skillName = skillResult.skillName;
          damage += skillResult.bonusDamage;
          if (skillResult.heal > 0) {
            attacker.currentHp = Math.min(attacker.stats.maxHp || attacker.stats.hp, attacker.currentHp + skillResult.heal);
            logs.push(`💚 [${attacker.team}] ${attacker.name} の「${skillResult.skillName}」！ HPを ${skillResult.heal} 回復！ (残HP: ${attacker.currentHp})`);
          }
          if (skillResult.buffAtk > 0) {
            attacker.stats.atk = (attacker.stats.atk || 0) + skillResult.buffAtk;
            logs.push(`⚡ [${attacker.team}] ${attacker.name} の「${skillResult.skillName}」！ 攻撃力 +${skillResult.buffAtk} (持続${skillResult.duration}T)`);
          }
          if (skillResult.buffDef > 0) {
            attacker.stats.def = (attacker.stats.def || 0) + skillResult.buffDef;
            logs.push(`🛡️ [${attacker.team}] ${attacker.name} の「${skillResult.skillName}」！ 防御力 +${skillResult.buffDef} (持続${skillResult.duration}T)`);
          }
          if (skillResult.debuffDef > 0) {
            target.stats.def = Math.max(0, (target.stats.def || 0) - skillResult.debuffDef);
            logs.push(`🔻 [${target.team}] ${target.name} は防御力 -${skillResult.debuffDef} の弱体を受けた！ (持続${skillResult.duration}T)`);
          }
          if (skillResult.stun) {
            logs.push(`💫 [${target.team}] ${target.name} はスタン状態になった！ (持続${skillResult.duration}T)`);
          }
          skillLog = ` [カスタム技発動]`;
        }
      }

      target.currentHp = Math.max(0, target.currentHp - damage);

      const specialTag = isSpecial ? '🔥【必殺技】' : '⚔️';
      logs.push(`${specialTag} [${attacker.team}] ${attacker.name} の「${skillName}」${skillLog}！ ${target.name} に ${damage} ダメージ！ (残HP: ${target.currentHp})`);

      if (target.currentHp <= 0) {
        logs.push(`💥 ${target.name} は力尽き倒れた！`);
      }
    }

    turn++;
  }

  const p1DeadCount = p1Fighters.filter(f => f.currentHp <= 0).length;
  const p2DeadCount = p2Fighters.filter(f => f.currentHp <= 0).length;

  const p1Survivors = p1Fighters.length - p1DeadCount;
  const p2Survivors = p2Fighters.length - p2DeadCount;

  logs.push('\n===========================');

  if (p1Survivors > 0 && p2Survivors === 0) {
    logs.push(`🏆 勝者: 【${p1Name}】！ (敵チーム全滅)`);
  } else if (p2Survivors > 0 && p1Survivors === 0) {
    logs.push(`🏆 勝者: 【${p2Name}】！ (敵チーム全滅)`);
  } else {
    logs.push(`⏱ ${maxTurns}ターン経過！ 死亡判定を行います。`);
    logs.push(`【${p1Name}】 死亡者数: ${p1DeadCount}名`);
    logs.push(`【${p2Name}】 死亡者数: ${p2DeadCount}名`);

    if (p1DeadCount < p2DeadCount) {
      logs.push(`🏆 死亡者数が少ない【${p1Name}】の判定勝ち！`);
    } else if (p2DeadCount < p1DeadCount) {
      logs.push(`🏆 死亡者数が少ない【${p2Name}】の判定勝ち！`);
    } else {
      logs.push(`🤝 死亡者数が同数のため、引き分け！`);
    }
  }

  if (logBox) {
    logBox.textContent = logs.join('\n');
    logBox.scrollTop = logBox.scrollHeight;
  }
}

// ローカルストレージにキャラクターを保存する
function saveLocalCharacters() {
  if (typeof ProfileManager !== 'undefined' && ProfileManager.getActiveProfile()) {
    ProfileManager.saveCharacters(appState.localCharacters || []);
  } else if (appState.localCharacters) {
    localStorage.setItem('my_local_characters', JSON.stringify(appState.localCharacters));
  }
}

// ページ読み込み時にローカルからキャラクターを復元する
function loadLocalCharacters() {
  if (typeof ProfileManager !== 'undefined' && ProfileManager.getActiveProfile()) {
    const chars = ProfileManager.getCharacters();
    appState.localCharacters = chars || [];
    appState.characters = [...appState.localCharacters];
    return;
  }
  const saved = localStorage.getItem('my_local_characters');
  if (saved) {
    try {
      appState.localCharacters = JSON.parse(saved);
      appState.characters = [...appState.localCharacters];
    } catch (e) {
      console.error(e);
    }
  }
}

/* ===================================================
   キャラクターの編集保存 ＆ 削除処理
   =================================================== */

window.saveEditCharacter = function(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('edit-char-id').value;
  
  const charList = appState.characters || appState.localCharacters || [];
  const char = charList.find(c => c.id === id);
  if (!char) return alert('キャラクターが見つかりませんでした');

  char.name = document.getElementById('edit-char-name').value.trim();
  char.job = document.getElementById('edit-char-job').value.trim();
  char.attackType = document.getElementById('edit-char-attack-type').value;
  
  const tagsInput = document.getElementById('edit-char-tags').value;
  char.tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
  
  char.bio = document.getElementById('edit-char-bio').value.trim();
  char.normalSkill = document.getElementById('edit-char-normal-skill').value.trim();
  char.specialSkill = document.getElementById('edit-char-special-skill').value.trim();
  char.quote = document.getElementById('edit-char-quote').value.trim();

  const hpPt = parseInt(document.getElementById('edit-num-stat-hp')?.value) || 0;
  const atkPt = parseInt(document.getElementById('edit-num-stat-atk')?.value) || 0;
  const defPt = parseInt(document.getElementById('edit-num-stat-def')?.value) || 0;
  const spdPt = parseInt(document.getElementById('edit-num-stat-eva')?.value) || 0;

  char.stats = {
    hp: hpPt * 5,
    maxHp: hpPt * 5,
    atk: atkPt,
    def: defPt,
    spd: spdPt,
    eva: spdPt,
    evaRate: Math.min(30, Math.floor(spdPt * 0.2))
  };
  char.customSkill = (typeof selectedEditSkillData !== 'undefined' && selectedEditSkillData) ? selectedEditSkillData : null;

  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();

  if (typeof closeEditModal === 'function') closeEditModal();
  alert(`「${char.name}」の変更を保存しました！`);
};

window.deleteCharacter = function(id) {
  if (!confirm('本当にこのキャラクターを削除しますか？')) return;

  if (appState.localCharacters) {
    appState.localCharacters = appState.localCharacters.filter(c => c.id !== id);
  }
  if (appState.characters) {
    appState.characters = appState.characters.filter(c => c.id !== id);
  }

  if (typeof saveLocalCharacters === 'function') saveLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
};

function checkSkillCondition(skill, attacker, target, currentTurn) {
  if (!skill) return true;
  const condition = (skill.condition || '常時').trim();
  if (!condition || condition === '常時' || condition === 'なし' || condition === '無条件') {
    return true;
  }

  const maxHp = attacker.stats.maxHp || attacker.stats.hp || 1;
  const hpPercent = (attacker.currentHp / maxHp) * 100;

  const hpBelowMatch = condition.match(/HP\s*(\d+)\s*%?\s*以下/);
  if (hpBelowMatch) {
    const threshold = parseInt(hpBelowMatch[1]);
    return hpPercent <= threshold;
  }

  const hpAboveMatch = condition.match(/HP\s*(\d+)\s*%?\s*以上/);
  if (hpAboveMatch) {
    const threshold = parseInt(hpAboveMatch[1]);
    return hpPercent >= threshold;
  }

  const turnMatch = condition.match(/(\d+)\s*ターン(?:以降|経過後|以上)/);
  if (turnMatch) {
    const requiredTurn = parseInt(turnMatch[1]);
    return (currentTurn || 0) >= requiredTurn;
  }

  const turnBeforeMatch = condition.match(/(\d+)\s*ターン(?:以内|未満)/);
  if (turnBeforeMatch) {
    const maxTurn = parseInt(turnBeforeMatch[1]);
    return (currentTurn || 0) < maxTurn;
  }

  const firstTurnMatch = condition.match(/先制|第1ターン|1ターン目/);
  if (firstTurnMatch) {
    return (currentTurn || 0) === 0;
  }

  return true;
}

function escapeHtmlBattle(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function executeCustomSkill(attacker, target, skill, currentTurn) {
  const result = {
    activated: false,
    skillName: skill.name || 'カスタム技',
    bonusDamage: 0,
    heal: 0,
    buffAtk: 0,
    buffDef: 0,
    debuffDef: 0,
    stun: false,
    duration: skill.duration || 0
  };

  if (!checkSkillCondition(skill, attacker, target, currentTurn)) {
    return result;
  }

  const probability = Math.min(100, Math.max(0, skill.probability || 100));
  const roll = Math.random() * 100;
  if (roll > probability) {
    return result;
  }
  result.activated = true;

  const effectType = (skill.effectType || 'damage').toLowerCase();
  const effectValue = Math.max(0, skill.effectValue || 0);
  const atkVal = attacker.stats.atk || 0;

  switch (effectType) {
    case 'damage':
      result.bonusDamage = Math.floor(effectValue * (atkVal / 100 + 1));
      break;
    case 'heal':
      result.heal = effectValue;
      break;
    case 'buff_atk':
      result.buffAtk = effectValue;
      break;
    case 'buff_def':
      result.buffDef = effectValue;
      break;
    case 'debuff_def':
      result.debuffDef = effectValue;
      break;
    case 'stun':
      result.stun = true;
      result.bonusDamage = Math.floor(effectValue * 0.5);
      break;
    case 'combo':
      result.bonusDamage = Math.floor(effectValue * 2 * (atkVal / 100 + 1));
      break;
    case 'lifesteal':
      result.bonusDamage = Math.floor(effectValue * (atkVal / 100 + 1));
      result.heal = Math.floor(result.bonusDamage * 0.5);
      break;
    default:
      result.bonusDamage = Math.floor(effectValue * (atkVal / 100 + 1));
  }

  return result;
}
