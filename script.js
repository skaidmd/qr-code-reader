// 定数
const FEEDBACK_DURATION = 1500;
const FEEDBACK_SUPPRESSION_TIME = 3000; // ms
const SCAN_AREA = { left: 0.2, top: 0.35, width: 0.6, height: 0.3 };
const SNAPSHOT_SCALE = 0.5;

// LIFF 初期化状況のフラグ
let isLiffInitialized = false;

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
      const LIFF_ID = 'YOUR_LIFF_ID'; // 必ず実際のLIFF IDに置き換えてください
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

// --- カメラ制御（Scratch QR 用） ---
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    document.getElementById('result').textContent = 'お使いのブラウザはカメラ機能に対応していません。';
    return;
  }
  try {
    const constraints = { 
      video: { 
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('video');
    video.srcObject = stream;
    video.play();
    // スキャン処理を開始（既存機能は requestAnimationFrame を用いたループでQRコードを検出）
    scanning = true;
    scanQR();
    document.getElementById('toggleCamera').textContent = "📴 カメラ オフ";
  } catch (error) {
    console.error('カメラのアクセスに失敗しました:', error);
    document.getElementById('result').textContent = 'カメラのアクセスに失敗しました。パーミッションなどをご確認ください。';
  }
}

function stopCamera() {
  const video = document.getElementById('video');
  if (video.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  scanning = false;
  document.getElementById('toggleCamera').textContent = "📷 カメラ オン";
}

// --- スキャン領域の寸法を計算 ---
function getScanAreaDimensions() {
  const video = document.getElementById('video');
  return {
    x: Math.floor(video.videoWidth * SCAN_AREA.left),
    y: Math.floor(video.videoHeight * SCAN_AREA.top),
    width: Math.floor(video.videoWidth * SCAN_AREA.width),
    height: Math.floor(video.videoHeight * SCAN_AREA.height)
  };
}

// --- キャプチャ画像をスキャン領域から縮小して取得 ---
function getSnapshot() {
  const { x, y, width, height } = getScanAreaDimensions();
  const snapshotCanvas = document.createElement("canvas");
  snapshotCanvas.width = Math.floor(width * SNAPSHOT_SCALE);
  snapshotCanvas.height = Math.floor(height * SNAPSHOT_SCALE);
  const snapshotCtx = snapshotCanvas.getContext("2d");
  const video = document.getElementById('video');
  snapshotCtx.drawImage(video, x, y, width, height, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
  return snapshotCanvas.toDataURL("image/png");
}

// --- QRコードスキャン（Scratch QR 用） ---
function scanQR() {
  if (!scanning) return;
  requestAnimationFrame(scanQR);
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
    if (!scannedResults.has(code.data)) {
      scannedResults.add(code.data);
      document.getElementById('result').textContent = `直近の読み取り内容: ${code.data}`;
      addToHistory(code.data);
      showFeedback("QRコード検出！");
      lastFeedbackTimes[code.data] = now;
    } else {
      if (!lastFeedbackTimes[code.data] || now - lastFeedbackTimes[code.data] > FEEDBACK_SUPPRESSION_TIME) {
        showFeedback("重複したQRコードが読み込まれました");
        lastFeedbackTimes[code.data] = now;
      }
    }
  }
}

// --- 履歴管理 ---
function addToHistory(data) {
  const timestamp = new Date().toLocaleString();
  const no = scannedResults.size;
  const safeData = sanitizeHTML(data);
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
  noP.innerHTML = `<strong>No:</strong> ${no}`;
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
  document.getElementById('scanHistory').appendChild(card);
  updateCount();
}

function updateCount() {
  const count = document.querySelectorAll('.card').length;
  document.getElementById('scanCount').textContent = count;
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

// --- イベントリスナー ---
document.getElementById('toggleCamera')?.addEventListener('click', () => {
  if (scanning) {
    stopCamera();
  } else {
    startCamera();
  }
});

document.getElementById('resetResult')?.addEventListener('click', () => {
  document.getElementById('result').textContent = "読み取り中...";
  document.getElementById('scanHistory').innerHTML = "";
  scannedResults = new Set();
  updateCount();
});

// 共通：クリックイベントの委譲（削除・コピーボタン用）
document.getElementById('scanHistory')?.addEventListener('click', (event) => {
  if (event.target.classList.contains('delete-icon')) {
    event.target.parentElement.remove();
    updateCount();
  } else if (event.target.classList.contains('copy-icon')) {
    const textToCopy = event.target.dataset.text;
    copyText(textToCopy);
  }
});