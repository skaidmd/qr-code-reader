// 定数
const FEEDBACK_DURATION = 1500;
const FEEDBACK_SUPPRESSION_TIME = 3000; // ms

// --- Utility: シンプルなサニタイズ処理 ---
function sanitizeHTML(str) {
  return str.replace(/[&<>"']/g, match => {
    const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escape[match];
  });
}

// --- 要素取得とグローバル変数 ---
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const resultElement = document.getElementById('result');
const toggleCameraButton = document.getElementById('toggleCamera');
const resetResultButton = document.getElementById('resetResult');
const scanHistoryContainer = document.getElementById('scanHistory');
const scanCountElement = document.getElementById('scanCount');
const feedbackElement = document.getElementById('feedback');

let stream = null;
let scanning = false;
let scannedResults = new Set();
let lastFeedbackTimes = {};

// --- スキャン領域の寸法を計算（動画の20%左、35%上、60%幅、30%高さ） ---
function getScanAreaDimensions() {
  return {
    x: Math.floor(video.videoWidth * 0.2),
    y: Math.floor(video.videoHeight * 0.35),
    width: Math.floor(video.videoWidth * 0.6),
    height: Math.floor(video.videoHeight * 0.3)
  };
}

// --- キャプチャ画像をスキャン領域から縮小して取得 ---
function getSnapshot() {
  const { x, y, width, height } = getScanAreaDimensions();
  const snapshotCanvas = document.createElement("canvas");
  // スキャン領域の50%サイズに縮小
  snapshotCanvas.width = Math.floor(width / 2);
  snapshotCanvas.height = Math.floor(height / 2);
  const snapshotCtx = snapshotCanvas.getContext("2d");
  snapshotCtx.drawImage(video, x, y, width, height, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
  return snapshotCanvas.toDataURL("image/png");
}

// --- カメラ制御 ---
async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    resultElement.textContent = 'お使いのブラウザはカメラ機能に対応していません。';
    return;
  }
  try {
    // 小さいQRコード検出向上のため高解像度指定
    const constraints = { 
      video: { 
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.play();
    scanning = true;
    scanQR();
    toggleCameraButton.textContent = "📴 カメラ オフ";
  } catch (error) {
    console.error('カメラのアクセスに失敗しました:', error);
    resultElement.textContent = 'カメラのアクセスに失敗しました。パーミッションやブラウザの対応状況をご確認ください。';
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    scanning = false;
    toggleCameraButton.textContent = "📷 カメラ オン";
  }
}

// --- フィードバック表示 ---
function showFeedback(message) {
  feedbackElement.textContent = message;
  feedbackElement.classList.add('show');
  setTimeout(() => {
    feedbackElement.classList.remove('show');
  }, FEEDBACK_DURATION);
}

// --- QRコードスキャン ---
function scanQR() {
  if (!scanning) return;
  requestAnimationFrame(scanQR);

  if (video.videoWidth === 0 || video.videoHeight === 0) return;

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
      resultElement.textContent = `QRコードの内容: ${code.data}`;
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
  strongLabel.textContent = "QRコード: ";
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

  scanHistoryContainer.appendChild(card);
  updateCount();
}

function updateCount() {
  scanCountElement.textContent = document.querySelectorAll('.card').length;
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
toggleCameraButton.addEventListener('click', () => {
  scanning ? stopCamera() : startCamera();
});

resetResultButton.addEventListener('click', () => {
  resultElement.textContent = "読み取り中...";
  scanHistoryContainer.innerHTML = "";
  scannedResults.clear();
  updateCount();
});

scanHistoryContainer.addEventListener('click', (event) => {
  if (event.target.classList.contains('delete-icon')) {
    event.target.parentElement.remove();
    updateCount();
  } else if (event.target.classList.contains('copy-icon')) {
    const textToCopy = event.target.dataset.text;
    copyText(textToCopy);
  }
});

// ページ読み込み時にカメラ開始
startCamera();
