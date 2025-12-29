// 存储视频检测状态
let hasVideo = false;

// 检测页面是否有视频元素
async function checkForVideos(tabId) {
  try {
    // 在目标标签页执行内容脚本
    const [result] = await chrome.scripting.executeScript({
      target: {tabId},
      func: () => {
        // 查找所有视频元素
        const videos = document.querySelectorAll('video');
        
        // 检查是否有正在播放的视频
        const playingVideos = Array.from(videos).filter(video => 
          !video.paused && !video.ended && video.readyState > 2
        );
        
        return {
          totalVideos: videos.length,
          playingVideos: playingVideos.length,
          hasVideo: videos.length > 0
        };
      }
    });
    
    return result.result;
  } catch (error) {
    console.error('视频检测失败:', error);
    return {hasVideo: false};
  }
}
// 存储当前活动的流ID，以便正确管理
let activeStreamId = null;

// 主功能：获取视频流ID
async function getVideoStreamId(tab) {
  try {
    // 1. 检测视频状态
    const videoInfo = await checkForVideos(tab.id);
    hasVideo = videoInfo.hasVideo;
    
    if (!hasVideo) {
      console.log('当前页面没有检测到视频元素');
      // 更新扩展图标状态
      chrome.action.setIcon({
        path: {
          16: "icons/16-gray.png",
          32: "icons/32-gray.png",
          48: "icons/48-gray.png"
        },
        tabId: tab.id
      });
      return;
    }
    
    console.log(`检测到视频: ${videoInfo.totalVideos}个，正在播放: ${videoInfo.playingVideos}个`);
    
    // 2. 如果已有活动流，先尝试关闭
    if (activeStreamId) {
      try {
        // 尝试关闭offscreen document
        await chrome.offscreen.closeDocument();
      } catch (e) {
        console.log("关闭offscreen document时出错:", e);
      }
    }
    
    // 3. 获取视频流ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id
    });
    
    // 更新活动流ID
    activeStreamId = streamId;
    
    console.log("✅ 成功获取视频流ID:", streamId);
    
    // 4. 验证视频流 - 创建一个offscreen document来处理媒体流
    try {
      // 先关闭可能存在的offscreen document
      try {
        await chrome.offscreen.closeDocument();
      } catch (e) {
        // 如果没有offscreen document，则忽略错误
      }
      
      // 创建offscreen document来处理视频流
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        reasons: ['USER_MEDIA'],
        justification: '验证视频流'
      });
      
      // 发送消息到offscreen document以处理视频流
      setTimeout(() => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          action: 'process-stream',
          streamId: streamId
        });
      }, 100);
    } catch (offscreenError) {
      console.warn("无法创建offscreen document进行验证:", offscreenError);
    }
    
    // 5. 更新扩展图标状态
    chrome.action.setIcon({
      path: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png"
      },
      tabId: tab.id
    });
    
  } catch (error) {
    console.error("❌ 获取视频流ID失败:", error);
    
    // 恢复默认图标
    chrome.action.setIcon({
      path: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png"
      },
      tabId: tab.id
    });
  }
}

// 监听扩展图标点击
chrome.action.onClicked.addListener(getVideoStreamId);

// 监听标签页更新（检测视频状态变化）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const videoInfo = await checkForVideos(tabId);
    hasVideo = videoInfo.hasVideo;
    
    // 根据视频状态更新图标
    chrome.action.setIcon({
      path: {
        16: hasVideo ? "icons/16.png" : "icons/16-gray.png",
        32: hasVideo ? "icons/32.png" : "icons/32-gray.png",
        48: hasVideo ? "icons/48.png" : "icons/48-gray.png"
      },
      tabId
    });
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "get-video-stream-id") {
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (tabs.length > 0) {
        try {
          console.log("📥 收到获取视频流ID的请求");
          
          // 如果已有活动流，先尝试清理
          if (activeStreamId) {
            console.log("⚠️ 已存在活动流，尝试清理...");
            try {
              await chrome.offscreen.closeDocument();
            } catch (e) {
              console.log("关闭offscreen document时出错:", e);
            }
          }
          
          const streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: tabs[0].id
          });
          
          // 更新活动流ID
          activeStreamId = streamId;
          
          console.log("📤 返回视频流ID:", streamId);
          sendResponse({success: true, streamId: streamId});
        } catch (error) {
          console.error("❌ 获取视频流ID失败:", error);
          sendResponse({success: false, error: error.message});
        }
      } else {
        console.log("❌ 未找到活动标签页");
        sendResponse({success: false, error: "No active tab found"});
      }
    });
    return true; // 保持消息通道开放以进行异步响应
  }
  
  // 停止捕获
  if (message.action === "stop-capture") {
    // 清理活动流ID
    activeStreamId = null;
    
    // 关闭offscreen页面
    chrome.offscreen.closeDocument()
      .then(() => {
        console.log("✅ 已关闭offscreen页面");
      })
      .catch((e) => {
        console.log("⚠️ 关闭offscreen页面时出错:", e);
      });
    
    sendResponse({ success: true });
    return true;
  }
  
  // 处理从popup发来的捕获帧消息
  if (message.action === "captureFrameFromStream") {
    // 发送消息到offscreen页面处理视频流
    chrome.runtime.sendMessage({
      target: 'offscreen',
      action: 'capture-frame',
      streamId: message.streamId
    }).then(response => {
      sendResponse(response);
    }).catch(error => {
      console.error("捕获帧失败:", error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // 保持消息通道开放
  }
  
  // 处理offscreen页面的响应（如果需要）
  if (message.target === 'background' && message.source === 'offscreen') {
    console.log('收到offscreen页面的消息:', message);
  }
  
  return true; // 保持消息通道开放
});

// 当扩展卸载或关闭时清理资源
chrome.runtime.onSuspend.addListener(() => {
  if (activeStreamId) {
    chrome.offscreen.closeDocument().catch(e => {
      console.log("关闭offscreen document时出错:", e);
    });
    activeStreamId = null;
  }
});