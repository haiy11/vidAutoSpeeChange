// popup.js
let currentStream = null;
let captureInterval = null;
let isCapturing = false;

// 添加图表相关变量
let changeHistory = [];
const MAX_HISTORY_POINTS = 40; // 最多保存40个历史点
const CHART_MAX_VALUE = 100; // 图表最大值

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  // 获取DOM元素
  const statusDiv = document.getElementById('status');
  const videoElement = document.getElementById('capturedVideo');
  const startBtn = document.getElementById('startCapture');
  const stopBtn = document.getElementById('stopCapture');
  const currentChangeDiv = document.getElementById('currentChange');
  const currentSpeedDiv = document.getElementById('currentSpeed');
  const chartCanvas = document.getElementById('chartCanvas');
  const videoTab = document.getElementById('videoTab');
  const chartTab = document.getElementById('chartTab');
  const videoContent = document.getElementById('videoContent');
  const chartContent = document.getElementById('chartContent');
  const settingsLink = document.getElementById('settingsLink');

  if (currentChangeDiv) {
    currentChangeDiv.textContent = t('currentChangeEmpty');
  }
  if (currentSpeedDiv) {
    currentSpeedDiv.textContent = t('currentSpeedEmpty');
  }

  // 检查必需的DOM元素是否存在
  if (!startBtn || !stopBtn) {
    console.error('必需的DOM元素未找到，请确保popup.html包含所有必需的元素');
    return;
  }

  // 标签页切换功能
  function setupTabs() {
    chartTab.addEventListener('click', () => {
      chartTab.classList.add('active');
      videoTab.classList.remove('active');
      chartContent.classList.add('active');
      videoContent.classList.remove('active');
    });

    videoTab.addEventListener('click', () => {
      videoTab.classList.add('active');
      chartTab.classList.remove('active');
      videoContent.classList.add('active');
      chartContent.classList.remove('active');
    });
  }

  // 设置canvas尺寸（如果canvas存在）
  function setupChart() {
    if (!chartCanvas) return;
    drawChart();
  }

  // 绘制图表（如果canvas存在）
  function drawChart() {
    if (!chartCanvas) return;
    const ctx = chartCanvas.getContext('2d');
    if (!ctx) return;
    const width = chartCanvas.width;
    const height = chartCanvas.height;
    
    // 清空canvas
    ctx.clearRect(0, 0, width, height);
    
    if (changeHistory.length < 2) return;
    
    // 固定最大值为50，最小值为0
    const maxValue = CHART_MAX_VALUE;
    
    // 绘制网格线
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 1;
    
    // 水平网格线 (5条 - 0, 20, 40, 60, 80, 100)
    for (let i = 0; i <= 5; i++) {
      const y = height - (i * maxValue / 5) * (height / maxValue);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    
    // 绘制折线图
    ctx.beginPath();
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    
    const pointSpacing = width / (changeHistory.length - 1);
    
    for (let i = 0; i < changeHistory.length; i++) {
      const x = i * pointSpacing;
      // 将值映射到canvas高度 (从上到下)，固定范围0-100
      const y = height - (changeHistory[i].value / maxValue) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // 绘制数据点 - 使用和线一样的蓝色
    ctx.fillStyle = '#007bff';
    for (let i = 0; i < changeHistory.length; i++) {
      const x = i * pointSpacing;
      const y = height - (changeHistory[i].value / maxValue) * height;
      
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2); // 减小点的大小
      ctx.fill();
    }
  }

  // 添加新的变化值到历史记录
  function addChangeValue(value) {
    const timestamp = Date.now();
    changeHistory.push({ value: value, timestamp: timestamp });
    
    // 保持历史记录在最大限制内
    if (changeHistory.length > MAX_HISTORY_POINTS) {
      changeHistory.shift();
    }
    
    // 更新当前变化显示（如果元素存在）
    if (currentChangeDiv) {
      currentChangeDiv.textContent = t('currentChange', value.toFixed(2));
    }
    
    // 更新图表
    drawChart();
  }

  // 更新状态显示
  function updateStatus(message, type = 'info') {
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.className = type;
    }
  }

// 显示捕获的画面
function displayCapture(data) {
  // 获取图片元素（注意：id保持capturedVideo不变，但实际上是img元素）
  const imgElement = document.getElementById('capturedVideo');
  if (!imgElement) return;
  
  if (data.imageDataUrl) {
    // 直接设置图片的src属性
    imgElement.src = data.imageDataUrl;
    const width = data.width || 'unknown';
    const height = data.height || 'unknown';
    imgElement.alt = t('captureAlt', width, height);
    updateStatus(t('captureSuccess', width, height), 'success');
  } else {
    // 如果没有图片数据，清空src
    imgElement.src = '';
    imgElement.alt = t('captureAltEmpty');
  }
}

  // 从background获取当前状态
  async function getCurrentStatus() {
    try {
      const response = await chrome.runtime.sendMessage({action: "getStatus"});
      isCapturing = response.captureStatus;
      changeHistory = response.changeHistory || [];
      const currentChange = response.currentChange || 0;
      
      // 更新UI状态
      if (isCapturing) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(t('statusCapturing'), 'success');
      } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        updateStatus(t('statusStopped'), 'info');
      }
      
      // 更新当前变化显示
      if (currentChangeDiv) {
        currentChangeDiv.textContent = t('currentChange', currentChange.toFixed(2));
      }
      
      // 重绘图表
      drawChart();
    } catch (error) {
      console.error('获取状态失败:', error);
      updateStatus(t('statusGetFailed'), 'error');
    }
  }

  // 从background获取当前捕获画面
  async function getCurrentCapture() {
    try {
      const response = await chrome.runtime.sendMessage({action: "getCurrentCapture"});
      if (response.imageDataUrl) {
        displayCapture({
          imageDataUrl: response.imageDataUrl,
          width: response.width,
          height: response.height
        });
      }
    } catch (error) {
      console.error('获取当前捕获失败:', error);
    }
  }

  // 开始捕获
  startBtn.addEventListener('click', async () => {
    try {
      updateStatus(t('statusStarting'), 'info');
      const response = await chrome.runtime.sendMessage({action: "startCapture"});
      if (response.success) {
        isCapturing = true;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        updateStatus(t('statusStartSuccess'), 'success');
      } else {
        updateStatus(t('statusStartFailed'), 'error');
      }
    } catch (error) {
      console.error('启动捕获失败:', error);
      updateStatus(t('statusStartFailedDetail', error.message), 'error');
    }
  });

  // 停止捕获
  stopBtn.addEventListener('click', async () => {
    try {
      updateStatus(t('statusStopping'), 'info');
      const response = await chrome.runtime.sendMessage({action: "stopCapture"});
      if (response.success) {
        isCapturing = false;
        startBtn.disabled = false;
        stopBtn.disabled = true;
        updateStatus(t('statusStopped'), 'info');
      } else {
        updateStatus(t('statusStopFailed'), 'error');
      }
    } catch (error) {
      console.error('停止捕获失败:', error);
      updateStatus(t('statusStopFailedDetail', error.message), 'error');
    }
  });

  // 监听来自background的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateCaptureImage') {
      // 更新捕获的画面
      displayCapture(message);
    } else if (message.action === 'updateChangeData') {
      // 更新变化数据
      if (message.changeHistory) {
        changeHistory = message.changeHistory;
        drawChart();
      }
      if (message.currentChange !== undefined) {
        if (currentChangeDiv) {
          currentChangeDiv.textContent = t('currentChange', message.currentChange.toFixed(2));
        }
      }
    } else if (message.action === 'updateCurrentSpeed') {
      // 更新当前播放速度
      if (currentSpeedDiv) {
        currentSpeedDiv.textContent = t('currentSpeed', message.currentSpeed.toFixed(1));
      }
    }
  });

  // 设置链接点击事件
  settingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // 初始化状态
  updateStatus(t('statusLoading'), 'info');
  getCurrentStatus().then(() => {
    // 获取当前捕获画面
    getCurrentCapture();
  });
  
  // 初始化标签页
  setupTabs();
  
  // 初始化图表
  setupChart();
  
  // 监听窗口大小变化以重新调整图表
  window.addEventListener('resize', setupChart);
});
