// Firebase リアルタイム通信モジュール

let roomUnsubscribe = null;

function createOrJoinRoom(isHost) {
  const roomId = document.getElementById('room-id-input').value.trim();
  const pass = document.getElementById('room-pass-input').value.trim();

  if (!roomId || !pass) {
    return alert('部屋IDと合言葉を入力してください');
  }

  appState.roomId = roomId;
  appState.isHost = isHost;

  const roomRef = db.collection('rooms').doc(roomId);

  roomRef.get().then(doc => {
    if (isHost) {
      if (doc.exists) {
        return alert('その部屋IDは既に使われています。別のIDを指定してください。');
      }
      roomRef.set({
        password: pass,
        members: [appState.playerName || 'プレイヤー１'],
        characters: [],
        chats: []
      }).then(() => {
        listenToRoom(roomId);
      });
    } else {
      if (!doc.exists) {
        return alert('部屋が見つかりません。部屋IDを確認してください。');
      }
      if (doc.data().password !== pass) {
        return alert('合言葉（パスワード）が違います。');
      }
      
      const members = doc.data().members || [];
      if (!members.includes(appState.playerName)) {
        members.push(appState.playerName);
      }
      roomRef.update({ members }).then(() => {
        listenToRoom(roomId);
      });
    }
  }).catch(err => alert('ルーム接続エラー: ' + err.message));
}

function listenToRoom(roomId) {
  document.getElementById('room-status-badge').textContent = `接続中: 部屋 [${roomId}]`;
  document.getElementById('room-status-badge').style.backgroundColor = '#10b981';
  document.getElementById('leave-room-btn').style.display = 'block';

  roomUnsubscribe = db.collection('rooms').doc(roomId).onSnapshot(doc => {
    if (!doc.exists) return;
    const data = doc.data();

    // メンバーリスト更新
    const membersList = document.getElementById('online-members-list');
    membersList.innerHTML = (data.members || []).map(m => `<li>👤 ${m}</li>`).join('');

    // キャラクターリスト更新
    appState.characters = data.characters || [];
    if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
    if (typeof renderTeamChecklists === 'function') renderTeamChecklists();

    // チャットログ更新
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = (data.chats || []).map(c => `<div><strong>${c.sender}:</strong> ${c.text}</div>`).join('');
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

function leaveRoom() {
  if (roomUnsubscribe) roomUnsubscribe();
  appState.roomId = null;
  appState.characters = appState.localCharacters || [];
  
  document.getElementById('room-status-badge').textContent = '未接続（ソロモード中）';
  document.getElementById('room-status-badge').style.backgroundColor = '#64748b';
  document.getElementById('leave-room-btn').style.display = 'none';
  document.getElementById('online-members-list').innerHTML = '<li>(未接続)</li>';

  if (typeof renderCharacterGallery === 'function') renderCharacterGallery();
  if (typeof renderTeamChecklists === 'function') renderTeamChecklists();
}

function saveCharacterToFirestore(newChar) {
  if (!appState.roomId) return;
  const roomRef = db.collection('rooms').doc(appState.roomId);

  db.runTransaction(transaction => {
    return transaction.get(roomRef).then(doc => {
      if (!doc.exists) return;
      const chars = doc.data().characters || [];
      chars.push(newChar);
      transaction.update(roomRef, { characters: chars });
    });
  }).then(() => {
    alert('キャラクターを共有ルームに保存しました！');
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
      chats.push({ sender: appState.playerName || '名無し', text });
      transaction.update(roomRef, { chats });
    });
  }).then(() => {
    input.value = '';
  }).catch(err => console.error(err));
}
