// Firebase リアルタイム通信モジュール
// デバイスBAN・部屋削除・マイ部屋一覧 機能追加

let roomUnsubscribe = null;

/* ===================================================
   デバイスBAN管理
   =================================================== */
function getDeviceId() {
  let deviceId = localStorage.getItem('ai_arena_device_id');
  if (!deviceId) {
    deviceId = 'dev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('ai_arena_device_id', deviceId);
  }
  return deviceId;
}

function getBannedRooms() {
  try {
    return JSON.parse(localStorage.getItem('banned_rooms') || '{}');
  } catch (e) {
    return {};
  }
}

function isDeviceBanned(roomId) {
  const banned = getBannedRooms();
  return !!(banned[roomId] && banned[roomId].isBanned);
}

function setDeviceBanned(roomId, bannerName) {
  const banned = getBannedRooms();
  banned[roomId] = { isBanned: true, bannerName: bannerName, bannedAt: Date.now() };
  localStorage.setItem('banned_rooms', JSON.stringify(banned));
}

/* ===================================================
   ルーム作成・参加
   =================================================== */
function createOrJoinRoom(isHost) {
  const roomId = document.getElementById('room-id-input').value.trim();
  const pass = document.getElementById('room-pass-input').value.trim();

  if (!roomId || !pass) {
    return alert('部屋IDと合言葉を入力してください');
  }

  // デバイスBAN判定
  if (isDeviceBanned(roomId)) {
    const bannedInfo = getBannedRooms()[roomId];
    return alert(`あなたの端末は部屋「${roomId}」からBANされています。\n(BAN実行者: ${bannedInfo.bannerName})\nアカウント名を変更しても入室できません。`);
  }

  appState.roomId = roomId;
  appState.isHost = isHost;

  const roomRef = db.collection('rooms').doc(roomId);
  const deviceId = getDeviceId();

  roomRef.get().then(doc => {
    if (isHost) {
      if (doc.exists) {
        return alert('その部屋IDは既に使われています。別のIDを指定してください。');
      }
      const bannedList = {};
      bannedList[deviceId] = { isBanned: false };
      roomRef.set({
        password: pass,
        hostName: appState.playerName || 'プレイヤー１',
        hostDeviceId: deviceId,
        members: [{ name: appState.playerName || 'プレイヤー１', deviceId: deviceId }],
        characters: [],
        chats: [],
        bannedDevices: bannedList,
        createdAt: Date.now()
      }).then(() => {
        saveMyRoom(roomId);
        listenToRoom(roomId);
      });
    } else {
      if (!doc.exists) {
        return alert('部屋が見つかりません。部屋IDを確認してください。');
      }
      const data = doc.data();

      if (data.password !== pass) {
        return alert('合言葉（パスワード）が違います。');
      }

      // BAN判定（DB側）
      const bannedDevices = data.bannedDevices || {};
      if (bannedDevices[deviceId] && bannedDevices[deviceId].isBanned) {
        setDeviceBanned(roomId, data.hostName || 'ホスト');
        return alert('この部屋からBANされています。入室できません。');
      }

      const members = data.members || [];
      if (!members.find(m => m.deviceId === deviceId)) {
        members.push({ name: appState.playerName, deviceId: deviceId });
      }
      roomRef.update({ members }).then(() => {
        listenToRoom(roomId);
      });
    }
  }).catch(err => alert('ルーム接続エラー: ' + err.message));
}

/* ===================================================
   ルームリアルタイム監視
   =================================================== */
function listenToRoom(roomId) {
  document.getElementById('room-status-badge').textContent = `接続中: 部屋 [${roomId}]`;
  document.getElementById('room-status-badge').style.backgroundColor = '#10b981';
  document.getElementById('leave-room-btn').style.display = 'block';

  if (appState.isHost) {
    document.getElementById('host-controls').style.display = 'block';
  } else {
    document.getElementById('host-controls').style.display = 'none';
  }

  roomUnsubscribe = db.collection('rooms').doc(roomId).onSnapshot(doc => {
    if (!doc.exists) {
      // 部屋が削除された
      alert('部屋が削除されました。');
      forceLeaveRoom();
      return;
    }
    const data = doc.data();

    // デバイスBAN判定（リアルタイム）
    const deviceId = getDeviceId();
    const bannedDevices = data.bannedDevices || {};
    if (bannedDevices[deviceId] && bannedDevices[deviceId].isBanned) {
      setDeviceBanned(roomId, data.hostName || 'ホスト');
      alert('ホストによってBANされました。部屋から退出させられました。');
      forceLeaveRoom();
      return;
    }

    // メンバーリスト更新
    const membersList = document.getElementById('online-members-list');
    const members = data.members || [];
    membersList.innerHTML = members.map(m => {
      const isSelf = m.deviceId === deviceId;
      const banBtn = (appState.isHost && !isSelf)
        ? `<button class="btn-sm btn-sm-danger" onclick="banMember('${m.deviceId}', '${escapeHtml(m.name)}')" style="margin-left:8px;">BAN</button>`
        : '';
      return `<li>👤 ${escapeHtml(m.name)}${isSelf ? ' (あなた)' : ''}${banBtn}</li>`;
    }).join('');

    // キャラクターリスト更新
    appState.characters = data.characters || [];
    if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
    if (typeof renderTeamSlots === 'function') renderTeamSlots();

    // チャットログ更新
    const chatBox = document.getElementById('chat-box');
    const chats = data.chats || [];
    chatBox.innerHTML = chats.slice(-50).map(c => `<div><strong>${escapeHtml(c.sender)}:</strong> ${escapeHtml(c.text)}</div>`).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

/* ===================================================
   BAN実行（ホスト専用）
   =================================================== */
function banMember(targetDeviceId, targetName) {
  if (!appState.isHost || !appState.roomId) return;
  if (!confirm(`メンバー「${targetName}」をBANしますか？\nこの端末はアカウント名を変更しても再入室できなくなります。`)) return;

  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      const data = doc.data();
      const bannedDevices = data.bannedDevices || {};
      bannedDevices[targetDeviceId] = { isBanned: true, bannerName: appState.playerName, bannedAt: Date.now() };

      // メンバーリストからも除外
      const members = (data.members || []).filter(m => m.deviceId !== targetDeviceId);

      transaction.update(roomRef, { bannedDevices, members });
    });
  }).then(() => {
    alert(`${targetName} をBANし、メンバーリストから削除しました。`);
  }).catch(err => alert('BAN処理エラー: ' + err.message));
}

/* ===================================================
   部屋削除（ホスト専用・二重確認）
   =================================================== */
function deleteRoom() {
  if (!appState.isHost || !appState.roomId) return;
  const roomId = appState.roomId;

  const confirm1 = confirm(`部屋「${roomId}」を完全に削除しますか？\n全ゲストが退出し、チャット・キャラクターデータも消去されます。`);
  if (!confirm1) return;

  const confirmText = prompt(`確認のため、部屋ID「${roomId}」を正確に入力してください:`);
  if (confirmText !== roomId) {
    return alert('部屋IDが一致しません。削除をキャンセルしました。');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  roomRef.delete().then(() => {
    removeMyRoom(roomId);
    forceLeaveRoom();
    alert(`部屋「${roomId}」を完全に削除しました。`);
  }).catch(err => alert('部屋削除エラー: ' + err.message));
}

/* ===================================================
   退室
   =================================================== */
function leaveRoom() {
  if (!appState.roomId) return;

  const deviceId = getDeviceId();
  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      const members = (doc.data().members || []).filter(m => m.deviceId !== deviceId);
      transaction.update(roomRef, { members });
    });
  }).catch(err => console.error(err));

  forceLeaveRoom();
}

function forceLeaveRoom() {
  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = null;
  appState.roomId = null;
  appState.isHost = false;
  appState.characters = appState.localCharacters || [];

  document.getElementById('room-status-badge').textContent = '未接続（ソロモード中）';
  document.getElementById('room-status-badge').style.backgroundColor = '#64748b';
  document.getElementById('leave-room-btn').style.display = 'none';
  const hostControls = document.getElementById('host-controls');
  if (hostControls) hostControls.style.display = 'none';
  document.getElementById('online-members-list').innerHTML = '<li>(未接続)</li>';

  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamSlots === 'function') renderTeamSlots();
}

/* ===================================================
   キャラクター共有（Firestore）
   =================================================== */
function saveCharacterToFirestore(newChar) {
  if (!appState.roomId) return;
  const roomRef = db.collection('rooms').doc(appState.roomId);

  return db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      const chars = doc.data().characters || [];
      chars.push(newChar);
      transaction.update(roomRef, { characters: chars });
    });
  }).then(() => {
    if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  }).catch(err => console.error(err));
}

function updateCharacterInFirestore(updatedChar) {
  if (!appState.roomId) return;
  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      let chars = doc.data().characters || [];
      const idx = chars.findIndex(c => c.id === updatedChar.id);
      if (idx !== -1) {
        chars[idx] = updatedChar;
        transaction.update(roomRef, { characters: chars });
      }
    });
  }).catch(err => console.error(err));
}

function deleteCharacterFromFirestore(charId) {
  if (!appState.roomId) return;
  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      let chars = doc.data().characters || [];
      chars = chars.filter(c => c.id !== charId);
      transaction.update(roomRef, { characters: chars });
    });
  }).catch(err => console.error(err));
}

function sendChatMessage() {
  const input = document.getElementById('chat-message-input');
  const text = input.value.trim();
  if (!text || !appState.roomId) return;

  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      const chats = doc.data().chats || [];
      chats.push({ sender: appState.playerName || '名無し', text, timestamp: Date.now() });
      if (chats.length > 200) chats.shift();
      transaction.update(roomRef, { chats });
    });
  }).then(() => {
    input.value = '';
  }).catch(err => console.error(err));
}

/* ===================================================
   マイ部屋一覧（ホスト専用）
   =================================================== */
function saveMyRoom(roomId) {
  let myRooms = [];
  try {
    myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
  } catch (e) { myRooms = []; }
  if (!myRooms.includes(roomId)) {
    myRooms.push(roomId);
    localStorage.setItem('my_created_rooms', JSON.stringify(myRooms));
  }
}

function removeMyRoom(roomId) {
  let myRooms = [];
  try {
    myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
  } catch (e) { myRooms = []; }
  myRooms = myRooms.filter(r => r !== roomId);
  localStorage.setItem('my_created_rooms', JSON.stringify(myRooms));
}

function renderMyRoomList() {
  const container = document.getElementById('my-room-list');
  if (!container) return;

  let myRooms = [];
  try {
    myRooms = JSON.parse(localStorage.getItem('my_created_rooms') || '[]');
  } catch (e) { myRooms = []; }

  if (myRooms.length === 0) {
    container.innerHTML = '<p style="color:var(--text-sub); font-size:0.85rem;">作成した部屋はありません。</p>';
    return;
  }

  container.innerHTML = myRooms.map(roomId => `
    <div class="my-room-item">
      <span class="my-room-name">部屋ID: ${escapeHtml(roomId)}</span>
      <button class="btn-sm btn-sm-danger" onclick="deleteMyRoom('${escapeHtml(roomId)}')">削除</button>
    </div>
  `).join('');
}

function deleteMyRoom(roomId) {
  const confirm1 = confirm(`部屋「${roomId}」を完全に削除しますか？\n全ゲストが退出し、データも消去されます。`);
  if (!confirm1) return;

  const confirmText = prompt(`確認のため、部屋ID「${roomId}」を正確に入力してください:`);
  if (confirmText !== roomId) {
    return alert('部屋IDが一致しません。削除をキャンセルしました。');
  }

  const roomRef = db.collection('rooms').doc(roomId);
  roomRef.delete().then(() => {
    removeMyRoom(roomId);
    renderMyRoomList();
    alert(`部屋「${roomId}」を削除しました。`);
  }).catch(err => alert('部屋削除エラー: ' + err.message));
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
