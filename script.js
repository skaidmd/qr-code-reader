// 定数
const FEEDBACK_DURATION = 1500;
const FEEDBACK_SUPPRESSION_TIME = 3000; // ms
const SCAN_AREA = { left: 0.2, top: 0.35, width: 0.6, height: 0.3 };
const SNAPSHOT_SCALE = 0.5;
const LIFF_ID = '2006845142-pmbYDnKB'; // 実際のLIFF ID

// LIFF初期化状況のフラグ
let isLiffInitialized = false;

// 各種グローバル変数
let scanning = false;
let scratchScanResults = new Set();
let scratchLastFeedbackTimes = {};

// --- Utility: シンプルなサニタイズ処理 ---
function sanitizeHTML(str) {
  return str.replace(/[&<>"']/g, match => {
    const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escape[match];
  });
}

// --- 共通の LIFF 初期化処理 ---
function initLIFF() {
  return new Promise((resolve, reject) => {
    if (window.liff) {
      liff.init({ liffId: LIFF_ID })
        .then(() => {
          console.log('LIFF 初期化成功');
          isLiffInitialized = true;
          resolve();
        })
        .catch(err => {
          console.error('LIFF init failed:', err);
          reject(err);
        });
    } else {
      reject('LIFF SDK が利用できません。');
    }
  });
}

// =========================
// Scratch QR (既存機能) 用の処理
// =========================
function startScratchQR() {
  // カメラとQRコード検出の処理を開始する
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('scratchResult').textContent = 'お使いのブラウザはカメラ機能に対応していません。';
    return;
  }
  const constraints = { 
    video: { 
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      const video = document.getElementById('video');
      video.srcObject = stream;
      video.play();
      scanning = true;
      scanScratchQR(); // スキャンループ開始
      document.getElementById('toggleCamera').textContent = "📴 カメラ オフ";
    })
    .catch(error => {
      console.error('カメラのアクセスに失敗しました:', error);
      document.getElementById('scratchResult').textContent = 'カメラのアクセスに失敗しました。パーミッションなどをご確認ください。';
    });
}

function stopScratchQR() {
  const video = document.getElementById('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  scanning = false;
  document.getElementById('toggleCamera').textContent = "📷 カメラ オン";
}

function scanScratchQR() {
  if (!scanning) return;
  requestAnimationFrame(scanScratchQR);
  const video = document.getElementById('video');
  if (video.videoWidth === 0 || video.videoHeight === 0) return;
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch (err) {
    console.error('キャンバス描画エラー:', err);
    return;
  }
  const { x, y, width, height } = getScanAreaDimensions();
  let imageData;
  try {
    imageData = ctx.getImageData(x, y, width, height);
  } catch (err) {
    console.error('ImageData取得エラー:', err);
    return;
  }
  const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
  if (code) {
    const now = Date.now();
    if (!scratchScanResults.has(code.data)) {
      scratchScanResults.add(code.data);
      document.getElementById('scratchResult').textContent = `直近の読み取り内容: ${code.data}`;
      addToHistory(code.data, 'scratch');
      showFeedback("QRコード検出！", 'scratchFeedback');
      scratchLastFeedbackTimes[code.data] = now;
    } else {
      if (!scratchLastFeedbackTimes[code.data] || now - scratchLastFeedbackTimes[code.data] > FEEDBACK_SUPPRESSION_TIME) {
        showFeedback("重複したQRコードが読み込まれました", 'scratchFeedback');
        scratchLastFeedbackTimes[code.data] = now;
      }
    }
  }
}

// =========================
// Scan QR (LIFF scanCode 使用) 用の処理
// =========================
function enableScanButton() {
  document.getElementById('scanButton').disabled = false;
}

function handleScanButtonClick() {
  if (window.liff && isLiffInitialized && liff.scanCode) {
    liff.scanCode()
      .then(result => {
        const codeData = result.value; // 読み取り結果
        document.getElementById('scanResult').textContent = `直近の読み取り内容: ${codeData}`;
        addToHistory(codeData, 'scan');
      })
      .catch(err => {
        console.error('scanCode error:', err);
        alert('QRコードのスキャンに失敗しました。');
      });
  } else {
    alert('この機能はLINEミニアプリ内でのみ利用可能です。');
  }
}

// =========================
// 履歴管理（共通） 
// =========================
function addToHistory(data, type) {
  // type: 'scratch' または 'scan' で履歴の配置先を決定
  const timestamp = new Date().toLocaleString();
  let safeData = sanitizeHTML(data);
  let qrContentElement;
  if (data.startsWith("http")) {
    qrContentElement = document.createElement('a');
    qrContentElement.href = data;
    qrContentElement.target = '_blank';
    qrContentElement.textContent = safeData;
  } else {
    qrContentElement = document.createElement('span');
    qrContentElement.textContent = safeData;
  }
  const card = document.createElement("div");
  card.classList.add("card");
  const deleteButton = document.createElement("button");
  deleteButton.classList.add("delete-icon");
  deleteButton.setAttribute("aria-label", "この項目を削除");
  deleteButton.textContent = "❌";
  card.appendChild(deleteButton);
  const noP = document.createElement("p");
  // 履歴の番号は単純にカード数をカウント
  noP.innerHTML = `<strong>No:</strong> ${document.querySelectorAll('.card').length + 1}`;
  card.appendChild(noP);
  const captureImage = document.createElement("img");
  captureImage.classList.add("capture-image");
  captureImage.src = getSnapshot();
  captureImage.alt = "QRコードキャプチャ";
  card.appendChild(captureImage);
  const qrContentP = document.createElement("p");
  qrContentP.classList.add("qr-content");
  const strongLabel = document.createElement("strong");
  strongLabel.textContent = "直近の読み取り内容: ";
  qrContentP.appendChild(strongLabel);
  qrContentP.appendChild(qrContentElement);
  const copyButton = document.createElement("button");
  copyButton.classList.add("copy-icon");
  copyButton.setAttribute("aria-label", "QRコードの内容をコピー");
  copyButton.textContent = "📋";
  copyButton.dataset.text = data;
  qrContentP.appendChild(copyButton);
  card.appendChild(qrContentP);
  const timeP = document.createElement("p");
  timeP.innerHTML = `<strong>読み取り日時:</strong> ${timestamp}`;
  card.appendChild(timeP);
  // 履歴配置先を選択
  if (type === 'scan') {
    document.getElementById('scanHistory').appendChild(card);
  } else {
    document.getElementById('scratchHistory').appendChild(card);
  }
  updateCount(type);
}

function updateCount(type) {
  if (type === 'scan') {
    const count = document.querySelectorAll('#scanHistory .card').length;
    document.getElementById('scanCount').textContent = count;
  } else {
    const count = document.querySelectorAll('#scratchHistory .card').length;
    document.getElementById('scratchScanCount').textContent = count;
  }
}

function showFeedback(message, feedbackElementId) {
  const fbElement = document.getElementById(feedbackElementId);
  fbElement.textContent = message;
  fbElement.classList.add('show');
  setTimeout(() => {
    fbElement.classList.remove('show');
  }, FEEDBACK_DURATION);
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => { alert("コピーしました: " + text); })
      .catch(err => { console.error("コピーに失敗しました:", err); });
  } else {
    const tempInput = document.createElement("input");
    document.body.appendChild(tempInput);
    tempInput.value = text;
    tempInput.select();
    try {
      document.execCommand("copy");
      alert("コピーしました: " + text);
    } catch (err) {
      console.error("コピーに失敗しました:", err);
    }
    document.body.removeChild(tempInput);
  }
}

// =========================
// ルーティング（SPAとしての実装）
// =========================
function route() {
  // デフォルトはスクラッチ機能（#scratch）
  const hash = window.location.hash || "#scratch";
  if (hash === "#scratch") {
    // Scratch QR ビューを表示、Scan QR ビューを非表示
    document.getElementById('scratchView').style.display = "block";
    document.getElementById('scanView').style.display = "none";
    // スクラッチ機能を開始
    startScratchQR();
  } else if (hash === "#scan") {
    // Scan QR ビューを表示、Scratch QR ビューを非表示
    document.getElementById('scratchView').style.display = "none";
    document.getElementById('scanView').style.display = "block";
    // スクラッチ機能が動作していれば停止
    stopScratchQR();
    // LIFF 初期化後、スキャンボタンを有効化
    initLIFF()
      .then(() => {
        enableScanButton();
      })
      .catch(err => {
        console.error('LIFF 初期化失敗:', err);
        alert('LIFF 初期化に失敗しました。エラー: ' + err);
      });
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);

// =========================
// イベントリスナー（共通）
// =========================
document.getElementById('toggleCamera')?.addEventListener('click', () => {
  if (scanning) {
    stopScratchQR();
  } else {
    startScratchQR();
  }
});

document.getElementById('resetScratch')?.addEventListener('click', () => {
  document.getElementById('scratchResult').textContent = "読み取り中...";
  document.getElementById('scratchHistory').innerHTML = "";
  scratchScanResults = new Set();
  updateCount('scratch');
});

// 共通：クリックイベントの委譲（削除・コピーボタン用）
document.getElementById('scratchHistory')?.addEventListener('click', (event) => {
  if (event.target.classList.contains('delete-icon')) {
    event.target.parentElement.remove();
    updateCount('scratch');
  } else if (event.target.classList.contains('copy-icon')) {
    const textToCopy = event.target.dataset.text;
    copyText(textToCopy);
  }
});

document.getElementById('scanHistory')?.addEventListener('click', (event) => {
  if (event.target.classList.contains('delete-icon')) {
    event.target.parentElement.remove();
    updateCount('scan');
  } else if (event.target.classList.contains('copy-icon')) {
    const textToCopy = event.target.dataset.text;
    copyText(textToCopy);
  }
});

// Scan QR ボタンのイベント
document.getElementById('scanButton')?.addEventListener('click', handleScanButtonClick);
