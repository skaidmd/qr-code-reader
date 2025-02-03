// Constants
const FEEDBACK_DURATION = 1500;
const FEEDBACK_SUPPRESSION_TIME = 3000; // ms
const SCAN_AREA = { left: 0.2, top: 0.35, width: 0.6, height: 0.3 };
const SNAPSHOT_SCALE = 0.5;
const LIFF_ID = '2006845142-pmbYDnKB'; // 実際のLIFF ID

// Global variables
let isLiffInitialized = false;
let scanning = false;
let scratchScanResults = new Set();
let scratchLastFeedbackTimes = {};

// Utility: sanitize HTML
function sanitizeHTML(str) {
  return str.replace(/[&<>"']/g, match => {
    const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return escape[match];
  });
}

// --- Common LIFF Initialization ---
function initLIFF() {
  return new Promise((resolve, reject) => {
    if (window.liff) {
      liff.init({ liffId: LIFF_ID })
        .then(() => {
          console.log('LIFF initialization successful');
          isLiffInitialized = true;
          resolve();
        })
        .catch(err => {
          console.error('LIFF init failed:', err);
          reject(err);
        });
    } else {
      reject('LIFF SDK is not available.');
    }
  });
}

// ==========================
// Scratch QR Functions (Existing)
// ==========================
function startScratchQR() {
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
      scanScratchQR();
      document.getElementById('toggleCamera').textContent = "📴 カメラ オフ";
    })
    .catch(error => {
      console.error('Camera access failed:', error);
      document.getElementById('scratchResult').textContent = 'カメラのアクセスに失敗しました。';
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
    console.error('Error drawing video on canvas:', err);
    return;
  }
  const { x, y, width, height } = getScanAreaDimensions();
  let imageData;
  try {
    imageData = ctx.getImageData(x, y, width, height);
  } catch (err) {
    console.error('Error getting image data:', err);
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

function getScanAreaDimensions() {
  const video = document.getElementById('video');
  return {
    x: Math.floor(video.videoWidth * SCAN_AREA.left),
    y: Math.floor(video.videoHeight * SCAN_AREA.top),
    width: Math.floor(video.videoWidth * SCAN_AREA.width),
    height: Math.floor(video.videoHeight * SCAN_AREA.height)
  };
}

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

// ==========================
// Scan QR Functions (Using LIFF scanCode)
// ==========================
function enableScanButton() {
  document.getElementById('scanButton').disabled = false;
}

function handleScanButtonClick() {
  if (window.liff && isLiffInitialized && liff.scanCode) {
    liff.scanCode()
      .then(result => {
        const codeData = result.value;
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

// ==========================
// History Management (Common)
// ==========================
function addToHistory(data, type) {
  const timestamp = new Date().toLocaleString();
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

function showFeedback(message, elementId) {
  const fbElement = document.getElementById(elementId);
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

// ==========================
// Routing (SPA)
// ==========================
function route() {
  let hash = window.location.hash;
  if (!hash) {
    window.location.hash = "#scratch";
    return;
  }
  if (hash === "#scratch") {
    document.getElementById('scratchView').style.display = "block";
    document.getElementById('scanView').style.display = "none";
    startScratchQR();
  } else if (hash === "#scan") {
    document.getElementById('scratchView').style.display = "none";
    document.getElementById('scanView').style.display = "block";
    stopScratchQR();
    initLIFF()
      .then(() => {
        enableScanButton();
      })
      .catch(err => {
        console.error('LIFF initialization failed:', err);
        alert('LIFF 初期化に失敗しました。エラー: ' + err);
      });
  }
}

window.addEventListener("hashchange", route);
window.addEventListener("load", route);

// ==========================
// Event Listeners
// ==========================
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

// Event listener for Scan QR button
document.getElementById('scanButton')?.addEventListener('click', handleScanButtonClick);

function handleScanButtonClick() {
  if (window.liff && isLiffInitialized && liff.scanCode) {
    liff.scanCode()
      .then(result => {
        const codeData = result.value;
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
