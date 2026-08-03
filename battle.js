/**
 * battle.js - キャラ計算 & ロジック
 * 役職パッシブ / 前衛・後衛 / 連携攻撃(CROSS ATTACK) / トラッパー / ダメージ計算整数化
 */

if (typeof window.appState === 'undefined') {
  window.appState = {};
}
if (!appState.p1Team) appState.p1Team = [];
if (!appState.p2Team) appState.p2Team = [];
if (!appState.characters) appState.characters = [];
if (!appState.localCharacters) appState.localCharacters = [];

const MAX_TOTAL_POINTS = 200;
const MAX_EVA_POINTS = 150;

/* ===================================================
   役職（ジョブ）パッシブ定義
   =================================================== */
const ROLES = {
  'melee': {
    label: '近接物理',
    icon: '⚔️',
    desc: 'HP・攻撃力 1.2倍。最前線で戦う物理アタッカー。',
    passive: 'HP・攻撃力1.2倍'
  },
  'ranged': {
    label: '遠距離物理',
    icon: '🏹',
    desc: '必殺ダメージ倍率2.0倍。狙われにくいが、攻撃成功率70%。',
    passive: '必殺2.0倍 / 狙われにくい / 攻撃成功率70%'
  },
  'mage': {
    label: '魔術師',
    icon: '🔮',
    desc: '相手の防御力を50%無視（貫通）してダメージ計算。',
    passive: '防御50%貫通'
  },
  'healer': {
    label: 'ヒーラー',
    icon: '💚',
    desc: '通常攻撃不可。攻撃ステータスを回復力とし、回復量1.2倍。4ターンに1回自動回復。',
    passive: '回復量1.2倍 / 4Tに1回自動回復'
  },
  'tank': {
    label: 'タンク',
    icon: '🛡️',
    desc: 'HP・防御力 1.2倍。狙われやすさ大幅上昇。',
    passive: 'HP・防御力1.2倍 / 狙われやすい'
  },
  'trapper': {
    label: 'トラッパー',
    icon: '🪤',
    desc: '必殺発動なし。攻撃選択でトラップ設置、3T後に40%確率で発動(攻撃力×2.5倍)。',
    passive: 'トラップ設置 / 3T後40%発動 / 攻撃力×2.5倍'
  }
};

const ROLE_KEYS = Object.keys(ROLES);

function getRoleLabel(roleKey) {
  const r = ROLES[roleKey];
  return r ? `${r.icon} ${r.label}` : '⚔️ 近接物理';
}

/* ===================================================
   初期化・ステータス入力
   =================================================== */
function initStatSliders(prefix = '') {
  const isEdit = prefix === 'edit';
  if (typeof setupStatSync === 'function') {
    setupStatSync(isEdit ? 'edit-' : '', isEdit);
  } else {
    updateStatValues(prefix);
  }
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

document.addEventListener('DOMContentLoaded', () => {
  initStatSliders('create');
  initStatSliders('edit');
  loadLocalCharacters();
  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
});

/* ===================================================
   キャラクター作成・編集・削除
   =================================================== */
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

  const roleEl = document.getElementById('char-role');
  const roleKey = roleEl ? roleEl.value : 'melee';

  const newChar = {
    id: 'char_' + Date.now(),
    name: document.getElementById('char-name').value.trim(),
    job: document.getElementById('char-job')?.value.trim() || '冒険者',
    attackType: document.getElementById('char-attack-type')?.value || '物理',
    role: roleKey,
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

  const editRoleEl = document.getElementById('edit-char-role');
  if (editRoleEl) editRoleEl.value = char.role || 'melee';

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

  if (typeof renderRoleSelector === 'function') renderRoleSelector('edit-');

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

/* ===================================================
   役職パッシブ適用
   =================================================== */
function applyRolePassive(fighter) {
  const role = fighter.role || 'melee';

  switch (role) {
    case 'melee':
      fighter.stats.maxHp = Math.floor(fighter.stats.maxHp * 1.2);
      fighter.stats.hp = fighter.stats.maxHp;
      fighter.currentHp = fighter.stats.maxHp;
      fighter.stats.atk = Math.floor(fighter.stats.atk * 1.2);
      break;
    case 'ranged':
      fighter.specialMultiplier = 2.0;
      fighter.targetWeight = 0.5;
      fighter.attackSuccessRate = 70;
      break;
    case 'mage':
      fighter.defPenetration = 0.5;
      break;
    case 'healer':
      fighter.isHealer = true;
      fighter.healMultiplier = 1.2;
      fighter.attackSuccessRate = 100;
      fighter.targetWeight = 0.5;
      break;
    case 'tank':
      fighter.stats.maxHp = Math.floor(fighter.stats.maxHp * 1.2);
      fighter.stats.hp = fighter.stats.maxHp;
      fighter.currentHp = fighter.stats.maxHp;
      fighter.stats.def = Math.floor(fighter.stats.def * 1.2);
      fighter.targetWeight = 3.0;
      break;
    case 'trapper':
      fighter.isTrapper = true;
      fighter.attackSuccessRate = 100;
      break;
    default:
      break;
  }

  fighter.formation = fighter.formation || 'front';
  if (fighter.formation === 'front') {
    fighter.physicalDamageReduction = 0.10;
    fighter.stats.def = Math.floor(fighter.stats.def * 1.1);
  } else {
    fighter.targetWeight = (fighter.targetWeight || 1) * 0.5;
  }
}

/* ===================================================
   ダメージ計算（整数化・役職・前衛後衛対応）
   =================================================== */
function calculateDamage(attacker, target, isSpecial) {
  let atk = attacker.stats.atk || 0;
  let def = target.stats.def || 0;

  // 魔術師の防御貫通
  if (attacker.defPenetration) {
    def = Math.floor(def * (1 - attacker.defPenetration));
  }

  // 必殺技倍率
  const specialMult = attacker.specialMultiplier || 1.5;
  atk = Math.floor(atk * (isSpecial ? specialMult : 1.0));

  let damage;
  if (def >= atk) {
    damage = Math.floor(atk * 0.1);
  } else {
    damage = Math.floor(def * 0.1 + (atk - def));
  }

  // 前衛の被物理ダメージ軽減（特殊技は魔法扱いで軽減外）
  if (target.physicalDamageReduction && !isSpecial) {
    damage = Math.floor(damage * (1 - target.physicalDamageReduction));
  }

  // 被ダメージ上昇デバフ（最終ダメージに乗算）
  if (target.damageUpMultiplier && target.damageUpMultiplier > 1) {
    damage = Math.floor(damage * target.damageUpMultiplier);
  }

  return Math.max(1, Math.floor(damage));
}

/* ===================================================
   カスタムスキル条件判定
   =================================================== */
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
    return hpPercent <= parseInt(hpBelowMatch[1]);
  }

  const hpAboveMatch = condition.match(/HP\s*(\d+)\s*%?\s*以上/);
  if (hpAboveMatch) {
    return hpPercent >= parseInt(hpAboveMatch[1]);
  }

  const turnMatch = condition.match(/(\d+)\s*ターン(?:以降|経過後|以上)/);
  if (turnMatch) {
    return (currentTurn || 0) >= parseInt(turnMatch[1]);
  }

  const turnBeforeMatch = condition.match(/(\d+)\s*ターン(?:以内|未満)/);
  if (turnBeforeMatch) {
    return (currentTurn || 0) < parseInt(turnBeforeMatch[1]);
  }

  const firstTurnMatch = condition.match(/先制|第1ターン|1ターン目/);
  if (firstTurnMatch) {
    return (currentTurn || 0) === 0;
  }

  return true;
}

/* ===================================================
   カスタムスキル実行
   =================================================== */
function executeCustomSkill(attacker, target, skill, currentTurn) {
  const result = {
    activated: false,
    skillName: skill.name || 'カスタム技',
    bonusDamage: 0,
    heal: 0,
    buffAtk: 0,
    buffDef: 0,
    debuffDef: 0,
    damageUp: 0,
    stun: false,
    duration: skill.duration || 0
  };

  if (!checkSkillCondition(skill, attacker, target, currentTurn)) {
    return result;
  }

  const probability = Math.min(100, Math.max(0, skill.probability || 100));
  if (Math.random() * 100 > probability) {
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
      result.heal = Math.floor(effectValue * (attacker.healMultiplier || 1));
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
    case 'damage_up':
      result.damageUp = Math.min(2.0, effectValue / 100);
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

function escapeHtmlBattle(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ===================================================
   ターゲット選択（狙われやすさ・前衛後衛・役職考慮）
   =================================================== */
function selectTarget(enemies) {
  const candidates = enemies.filter(f => f.currentHp > 0);
  if (candidates.length === 0) return null;

  // 前衛を優先ターゲット、タンクは重み大、後衛・遠距離は狙われにくい
  const weighted = [];
  candidates.forEach(f => {
    let weight = f.targetWeight || 1;
    if (f.formation === 'front') weight *= 1.5;
    else weight *= 0.5;
    const intWeight = Math.max(1, Math.floor(weight * 10));
    for (let i = 0; i < intWeight; i++) weighted.push(f);
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
}

/* ===================================================
   CROSS ATTACK 連携攻撃確率
   =================================================== */
function getCrossAttackProbability(n) {
  if (n < 2) return 0;
  // 2体: 10%, 3体: 5%, 4体: 2.5%, ... 減衰
  return 10 / Math.pow(2, n - 2);
}

function tryCrossAttack(attackers, target, attackerTeam, turn, logs) {
  const n = attackers.length;
  if (n < 2) return null;

  const prob = getCrossAttackProbability(n);
  if (Math.random() * 100 >= prob) return null;

  // カットインログ
  logs.push(`✨✨ [CROSS ATTACK×${n}!!] ✨✨`);
  const names = attackers.map(a => a.name).join('と');
  logs.push(`🔥 ${names}による同時攻撃!!`);

  let totalDamage = 0;
  attackers.forEach(attacker => {
    const isSpecial = Math.random() < 0.10 && !attacker.isTrapper && !attacker.isHealer;
    const dmg = calculateDamage(attacker, target, isSpecial);
    totalDamage += dmg;
  });

  totalDamage = Math.floor(totalDamage);
  target.currentHp = Math.max(0, target.currentHp - totalDamage);

  logs.push(`💥 合計 ${totalDamage} ダメージ！ (残HP: ${target.currentHp})`);

  if (target.currentHp <= 0) {
    logs.push(`💥 ${target.name} は力尽き倒れた！`);
  }

  return totalDamage;
}

/* ===================================================
   トラッパー処理
   =================================================== */
function processTraps(fighter, enemies, turn, logs) {
  if (!fighter.traps) fighter.traps = [];

  for (let i = fighter.traps.length - 1; i >= 0; i--) {
    const trap = fighter.traps[i];
    if (turn < trap.triggerTurn) continue;

    const target = enemies.find(e => e.id === trap.targetId && e.currentHp > 0);
    if (!target) {
      fighter.traps.splice(i, 1);
      continue;
    }

    const disarmRoll = Math.random() * 100;
    if (disarmRoll < 60) {
      logs.push(`🪤 [${fighter.team}] ${fighter.name} のトラップを ${target.name} は感知！ トラップの解除に成功した！`);
      fighter.traps.splice(i, 1);
    } else {
      logs.push(`🪤 [${fighter.team}] ${fighter.name} のトラップを ${target.name} は感知！ しかしトラップの解除に失敗した！`);
      const trapDamage = Math.floor((fighter.stats.atk || 0) * 2.5);
      target.currentHp = Math.max(0, target.currentHp - trapDamage);
      logs.push(`💥 ${target.name} にトラップが発動！ ${trapDamage} ダメージ！ (残HP: ${target.currentHp})`);
      if (target.currentHp <= 0) {
        logs.push(`💥 ${target.name} は力尽き倒れた！`);
      }
      fighter.traps.splice(i, 1);
    }
  }
}

/* ===================================================
   ヒーラー自動回復
   =================================================== */
function healerAutoHeal(fighter, allies, turn, logs) {
  if (!fighter.isHealer || fighter.currentHp <= 0) return;
  if (turn % 4 !== 0) return;

  const wounded = allies.filter(a => a.currentHp > 0 && a.currentHp < (a.stats.maxHp || a.stats.hp));
  if (wounded.length === 0) return;

  const target = wounded[Math.floor(Math.random() * wounded.length)];
  const healAmount = Math.floor((fighter.stats.atk || 0) * (fighter.healMultiplier || 1.2));
  target.currentHp = Math.min(target.stats.maxHp || target.stats.hp, target.currentHp + healAmount);

  logs.push(`💚 [${fighter.team}] ${fighter.name} のパッシブ回復！ ${target.name} のHPを ${healAmount} 回復！ (残HP: ${target.currentHp})`);
}

/* ===================================================
   チーム選択連動
   =================================================== */
function syncSelectedTeams() {
  appState.p1Team = Array.from(document.querySelectorAll('#p1-checklist input:checked')).map(cb => cb.value);
  appState.p2Team = Array.from(document.querySelectorAll('#p2-checklist input:checked')).map(cb => cb.value);
}

/* ===================================================
   バトルシミュレーション本体
   =================================================== */
function runBattleSimulation() {
  syncSelectedTeams();

  if (appState.p1Team.length === 0 || appState.p2Team.length === 0) {
    return alert('1P・2Pの両方のチームに1体以上選択してください！');
  }

  const p1Name = appState.p1Name || document.getElementById('p1-team-name-input')?.value || '1Pチーム';
  const p2Name = appState.p2Name || document.getElementById('p2-team-name-input')?.value || '2Pチーム';

  const logBox = document.getElementById('battle-log');
  let logs = [`⚔️ 【${p1Name}】 VS 【${p2Name}】 バトル開始！\n`];

  const charList = appState.characters || appState.localCharacters || [];

  const buildFighters = (teamIds, teamLabel) => {
    return teamIds.map((id, index) => {
      const c = charList.find(char => char.id === id);
      if (!c) return null;
      const formationEl = document.getElementById(`formation-${teamLabel}-${id}`);
      const formation = formationEl ? formationEl.value : 'front';
      const hpVal = c.stats.maxHp || c.stats.hp || 0;
      const fighter = {
        ...JSON.parse(JSON.stringify(c)),
        team: teamLabel === 'p1' ? '1P' : '2P',
        teamIndex: index,
        currentHp: hpVal,
        formation: formation,
        traps: [],
        targetWeight: 1,
        specialMultiplier: 1.5,
        attackSuccessRate: 100
      };
      applyRolePassive(fighter);
      return fighter;
    }).filter(f => f !== null);
  };

  const p1Fighters = buildFighters(appState.p1Team, 'p1');
  const p2Fighters = buildFighters(appState.p2Team, 'p2');

  logs.push(`--- 📜 選手入場 ---`);
  p1Fighters.forEach(c => logs.push(`[${p1Name}] ${c.name} (${c.job || '冒険者'}) [${getRoleLabel(c.role)}] [${c.formation === 'front' ? '前衛' : '後衛'}] / 「${c.quote || '……'}」`));
  p2Fighters.forEach(c => logs.push(`[${p2Name}] ${c.name} (${c.job || '冒険者'}) [${getRoleLabel(c.role)}] [${c.formation === 'front' ? '前衛' : '後衛'}] / 「${c.quote || '……'}」`));
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

    // ターン開始時: トラップ処理
    [...activeP1, ...activeP2].forEach(f => {
      if (f.isTrapper) {
        const enemyTeam = f.team === '1P' ? p2Fighters : p1Fighters;
        processTraps(f, enemyTeam, turn, logs);
      }
    });

    // ヒーラー自動回復
    activeP1.forEach(f => healerAutoHeal(f, p1Fighters, turn, logs));
    activeP2.forEach(f => healerAutoHeal(f, p2Fighters, turn, logs));

    // 行動順ソート
    const actionQueue = [...activeP1, ...activeP2].sort((a, b) => {
      const spdA = a.stats.spd || a.stats.eva || 0;
      const spdB = b.stats.spd || b.stats.eva || 0;
      if (spdB !== spdA) return spdB - spdA;
      if (a.team !== b.team) return a.team === '1P' ? -1 : 1;
      return a.teamIndex - b.teamIndex;
    });

    // CROSS ATTACK判定用: 各チームの行動可能メンバー
    const p1Active = actionQueue.filter(f => f.team === '1P' && f.currentHp > 0 && !f.isHealer);
    const p2Active = actionQueue.filter(f => f.team === '2P' && f.currentHp > 0 && !f.isHealer);

    let crossAttackUsed = false;

    for (const attacker of actionQueue) {
      if (attacker.currentHp <= 0) continue;
      if (crossAttackUsed) {
        // クロス攻撃後は同チームの残り行動をスキップ
        if (attacker.team === (p1Active.includes(attacker) ? '1P' : '2P')) continue;
      }

      const enemyTeam = attacker.team === '1P'
        ? p2Fighters.filter(f => f.currentHp > 0)
        : p1Fighters.filter(f => f.currentHp > 0);

      if (enemyTeam.length === 0) break;

      // ヒーラーは通常攻撃しない
      if (attacker.isHealer) {
        const allies = attacker.team === '1P' ? p1Fighters : p2Fighters;
        const wounded = allies.filter(a => a.currentHp > 0 && a.currentHp < (a.stats.maxHp || a.stats.hp));
        if (wounded.length > 0) {
          const target = wounded[Math.floor(Math.random() * wounded.length)];
          const healAmount = Math.floor((attacker.stats.atk || 0) * (attacker.healMultiplier || 1.2));
          target.currentHp = Math.min(target.stats.maxHp || target.stats.hp, target.currentHp + healAmount);
          logs.push(`💚 [${attacker.team}] ${attacker.name} の回復魔法！ ${target.name} のHPを ${healAmount} 回復！ (残HP: ${target.currentHp})`);
        } else {
          logs.push(`💚 [${attacker.team}] ${attacker.name} は回復の準備をしている...`);
        }
        continue;
      }

      // トラッパー: トラップ設置
      if (attacker.isTrapper) {
        const target = selectTarget(enemyTeam);
        if (!target) continue;
        attacker.traps.push({
          targetId: target.id,
          triggerTurn: turn + 3
        });
        logs.push(`🪤 [${attacker.team}] ${attacker.name} は ${target.name} にトラップを設置した！ (3ターン後に発動)`);
        continue;
      }

      // CROSS ATTACK判定
      if (!crossAttackUsed) {
        const sameTeamActives = attacker.team === '1P' ? p1Active : p2Active;
        if (sameTeamActives.length >= 2) {
          // 確率減衰: 2体=10%, 3体=5%, 4体=2.5%...
          const maxPossible = Math.min(sameTeamActives.length, 4);
          for (let n = maxPossible; n >= 2; n--) {
            const prob = getCrossAttackProbability(n);
            if (Math.random() * 100 < prob) {
              const crossAttackers = sameTeamActives.slice(0, n).filter(a => a.currentHp > 0);
              if (crossAttackers.length === n) {
                const target = selectTarget(enemyTeam);
                if (target) {
                  tryCrossAttack(crossAttackers, target, attacker.team, turn, logs);
                  crossAttackUsed = true;
                  break;
                }
              }
            }
          }
          if (crossAttackUsed) continue;
        }
      }

      // 通常攻撃
      const target = selectTarget(enemyTeam);
      if (!target) continue;

      // 回避判定
      const evaVal = target.stats.eva || target.stats.spd || 0;
      const evaPercent = Math.min(50, Math.floor(evaVal / 3));
      if ((Math.random() * 100) < evaPercent) {
        logs.push(`💨 [${attacker.team}] ${attacker.name} の攻撃！ しかし ${target.name} は素早く身をかわした！(MISS)`);
        continue;
      }

      // 遠距離物理の攻撃成功率
      if (attacker.attackSuccessRate && attacker.attackSuccessRate < 100) {
        if (Math.random() * 100 > attacker.attackSuccessRate) {
          logs.push(`💨 [${attacker.team}] ${attacker.name} の攻撃は外れた！(命中率${attacker.attackSuccessRate}%)`);
          continue;
        }
      }

      const isSpecial = Math.random() < 0.10;
      let skillName = isSpecial ? (attacker.specialSkill || '奥義') : (attacker.normalSkill || '通常攻撃');
      let damage = calculateDamage(attacker, target, isSpecial);
      let skillLog = '';

      if (isSpecial) {
        logs.push(`🔥 [${attacker.team}] ${attacker.name} の決めゼリフ「${attacker.quote || '……'}」！`);
      }

      if (isSpecial && attacker.customSkill) {
        const skillResult = executeCustomSkill(attacker, target, attacker.customSkill, turn);
        if (skillResult.activated) {
          skillName = skillResult.skillName;
          damage += skillResult.bonusDamage;
          damage = Math.floor(damage);

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
          if (skillResult.damageUp > 0) {
            target.damageUpMultiplier = 1 + skillResult.damageUp;
            logs.push(`🔻 [${target.team}] ${target.name} は被ダメージ ${Math.floor(skillResult.damageUp * 100)}% 上昇の弱体を受けた！ (持続${skillResult.duration}T)`);
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

/* ===================================================
   ローカルストレージ
   =================================================== */
function saveLocalCharacters() {
  if (typeof ProfileManager !== 'undefined' && ProfileManager.getActiveProfile()) {
    ProfileManager.saveCharacters(appState.localCharacters || []);
  } else if (appState.localCharacters) {
    localStorage.setItem('my_local_characters', JSON.stringify(appState.localCharacters));
  }
}

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
   編集保存・削除
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

  const editRoleEl = document.getElementById('edit-char-role');
  if (editRoleEl) char.role = editRoleEl.value;

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
